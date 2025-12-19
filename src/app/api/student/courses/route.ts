import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../lib/logger';
import { parsePaginationParams, createPaginationResponse, PaginationLimits, parseCursorParams, createCursorResponse, parseCursor } from '../../../../lib/pagination';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';
import { getOrSetCache, CacheKeys, CacheTTL } from '../../../../lib/cache';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET - Get courses available to the authenticated student based on their school and grade
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
        },
        { 
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult)
        }
      );
    }
    // Get the authenticated user from the request
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'No authentication token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify the token and get user
    let user;
    try {
      const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !authUser) {
        logger.warn('Authentication failed', {
          endpoint: '/api/student/courses',
          hasError: !!authError,
          errorMessage: authError?.message,
        });
        return NextResponse.json(
          { error: 'Unauthorized', details: 'Invalid authentication token' },
          { status: 401 }
        );
      }
      
      user = authUser;
    } catch (authException) {
      logger.error('Exception during authentication', {
        endpoint: '/api/student/courses',
      }, authException instanceof Error ? authException : new Error(String(authException)));
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Get student's school and grade from student_schools table (primary source of truth)
    let studentSchool: any = null;
    let studentSchoolError: any = null;
    
    try {
      const result = await supabaseAdmin
        .from('student_schools')
        .select('school_id, grade, is_active')
        .eq('student_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      
      studentSchool = result.data;
      studentSchoolError = result.error;
    } catch (queryException) {
      logger.error('Exception fetching student school', {
        endpoint: '/api/student/courses',
        userId: user.id,
      }, queryException instanceof Error ? queryException : new Error(String(queryException)));
      studentSchoolError = queryException;
    }
    
    // Log error if query failed (but don't throw - we'll handle empty result below)
    if (studentSchoolError) {
      logger.warn('Error fetching student school', {
        endpoint: '/api/student/courses',
        userId: user.id,
      }, studentSchoolError instanceof Error ? studentSchoolError : new Error(String(studentSchoolError)));
    }

    // Use student_schools data (triggers ensure profiles.school_id is synced)
    const schoolId: string | null = studentSchool?.school_id || null;
    const grade: string | null = studentSchool?.grade || null;

    if (!schoolId || !grade) {
      logger.warn('Student has no school assignment or grade', {
        endpoint: '/api/student/courses',
        userId: user.id,
        hasSchoolId: !!schoolId,
        hasGrade: !!grade,
      });
      
      const emptyData = { 
        courses: [],
        pagination: {
          nextCursor: undefined,
          prevCursor: undefined,
          hasMore: false
        },
        message: 'Student not assigned to a school or grade',
      };
      
      const emptyResponse = NextResponse.json(emptyData);
      
      // Add HTTP caching headers even for empty responses
      addCacheHeaders(emptyResponse, { courses: [] }, {
        ...CachePresets.USER_DASHBOARD,
        maxAge: 120,
        staleWhileRevalidate: 300,
        lastModified: new Date()
      });
      
      return emptyResponse;
    }

    // Normalize grade format (e.g., "grade4" -> "Grade 4", "4" -> "Grade 4")
    const normalizeGrade = (g: string): string => {
      if (!g) return '';
      const trimmed = g.trim();
      
      // If already in "Grade X" format, return as-is
      if (/^Grade\s+\d+$/i.test(trimmed)) {
        return trimmed;
      }
      
      // Remove "grade" prefix if present (case-insensitive)
      const normalized = trimmed.replace(/^grade\s*/i, '').trim();
      
      // Extract number and format as "Grade X"
      const numMatch = normalized.match(/(\d{1,2})/);
      if (numMatch) {
        return `Grade ${numMatch[1]}`;
      }
      
      return trimmed;
    };

    // Normalize grade for comparison (matches database trigger logic)
    // This removes "Grade " and "grade" prefixes and compares the core value
    const normalizeGradeForComparison = (g: string): string => {
      if (!g) return '';
      const trimmed = g.trim();
      // Remove "Grade " prefix (case-sensitive)
      let normalized = trimmed.replace(/^Grade\s+/, '');
      // Remove "grade" prefix (case-insensitive)
      normalized = normalized.replace(/^grade\s*/i, '');
      // Return lowercase for comparison
      return normalized.trim().toLowerCase();
    };

    const normalizedGrade = normalizeGrade(grade);
    const studentGradeForComparison = normalizeGradeForComparison(grade);
    
    console.log(`📚 Fetching courses for student ${user.id}: school=${schoolId || 'undefined'}, grade=${normalizedGrade} (original: ${grade}, comparison: ${studentGradeForComparison})`);

    // Support both cursor and offset pagination for backward compatibility
    const { searchParams } = new URL(request.url);
    const useCursor = searchParams.get('use_cursor') === 'true' || searchParams.has('cursor');
    const cursorParams = parseCursorParams(request);
    const pagination = parsePaginationParams(request, PaginationLimits.MEDIUM, PaginationLimits.MAX);

    // OPTIMIZATION: Use caching to improve performance (reduces 500-1000ms to < 100ms)
    const cacheKey = `${CacheKeys.studentCourses(user.id, schoolId, normalizedGrade)}:${useCursor ? 'cursor' : 'offset'}:${useCursor ? cursorParams.cursor || 'none' : `${pagination.offset}:${pagination.limit}`}`;
    
    const result = await getOrSetCache(
      cacheKey,
      async () => {

    // Get courses from course_access that match student's school and grade
    // Only include published courses
    // Strategy: Try exact match first, then case-insensitive, then fetch all and filter with normalized matching
    
    let courseAccess: any[] = [];
    
    // Step 1: Try exact match with normalized grade
    // Fetch course_access and courses separately to avoid foreign key relationship issues
    const { data: exactMatchAccess, error: exactError } = await supabaseAdmin
      .from('course_access')
      .select('course_id, grade, school_id')
      .eq('school_id', schoolId)
      .eq('grade', normalizedGrade);

    if (exactError) {
      console.error('❌ Error fetching course_access (exact match):', exactError);
    } else if (exactMatchAccess && exactMatchAccess.length > 0) {
      // Fetch course details separately
      const courseIds = exactMatchAccess.map((ca: any) => ca.course_id).filter(Boolean);
      const { data: coursesData } = await supabaseAdmin
        .from('courses')
        .select('id, course_name, name, description, status, is_published, num_chapters, content_summary, created_at, updated_at')
        .in('id', courseIds);
      
      // Combine the data
      courseAccess = exactMatchAccess.map((ca: any) => ({
        course_id: ca.course_id,
        grade: ca.grade,
        courses: coursesData?.find((c: any) => c.id === ca.course_id)
      })).filter((ca: any) => ca.courses); // Only include entries with valid courses
      
      console.log(`✅ Found ${courseAccess.length} course_access entries (exact match) for school ${schoolId || 'undefined'}, grade ${normalizedGrade}`);
    }

    // Step 2: If no results, try case-insensitive match
    if (courseAccess.length === 0) {
      const { data: caseInsensitiveAccess, error: caseError } = await supabaseAdmin
        .from('course_access')
        .select('course_id, grade, school_id')
        .eq('school_id', schoolId)
        .ilike('grade', normalizedGrade);
      
      if (caseError) {
        console.error('❌ Error fetching course_access (case-insensitive match):', caseError);
      } else if (caseInsensitiveAccess && caseInsensitiveAccess.length > 0) {
        // Fetch course details separately
        const courseIds = caseInsensitiveAccess.map((ca: any) => ca.course_id).filter(Boolean);
        const { data: coursesData } = await supabaseAdmin
          .from('courses')
          .select('id, course_name, name, description, status, is_published, num_chapters, content_summary, created_at, updated_at')
          .in('id', courseIds);
        
        // Combine the data
        courseAccess = caseInsensitiveAccess.map((ca: any) => ({
          course_id: ca.course_id,
          grade: ca.grade,
          courses: coursesData?.find((c: any) => c.id === ca.course_id)
        })).filter((ca: any) => ca.courses); // Only include entries with valid courses
        
        console.log(`✅ Found ${courseAccess.length} course_access entries (case-insensitive match)`);
      }
    }

    // Step 3: If still no results, fetch all course_access entries for the school and filter with normalized matching
    // This handles format variations like "Grade 6" vs "grade6" vs "6"
    if (courseAccess.length === 0) {
      console.log(`⚠️ No matches found with exact/case-insensitive match, trying normalized matching fallback...`);
      
      // First, let's get diagnostic info about what's in the database
      // Fetch course_access and courses separately to avoid foreign key relationship issues
      const { data: allAccessEntriesForSchoolRaw, error: allAccessError } = await supabaseAdmin
        .from('course_access')
        .select('course_id, grade, school_id')
        .eq('school_id', schoolId) as any;
      
      // Fetch course details separately
      let allAccessEntriesForSchool: any[] = [];
      if (allAccessEntriesForSchoolRaw && allAccessEntriesForSchoolRaw.length > 0) {
        const courseIds = allAccessEntriesForSchoolRaw.map((ca: any) => ca.course_id).filter(Boolean);
        const { data: coursesData } = await supabaseAdmin
          .from('courses')
          .select('id, course_name, name, description, status, is_published, num_chapters, content_summary, created_at, updated_at')
          .in('id', courseIds);
        
        // Combine the data
        allAccessEntriesForSchool = allAccessEntriesForSchoolRaw.map((ca: any) => ({
          ...ca,
          courses: coursesData?.find((c: any) => c.id === ca.course_id)
        }));
      }
      
      // Also get all course_access entries for debugging (not just this school)
      // Fetch separately to avoid foreign key relationship issues
      const { data: allCoursesAccessRaw, error: allCoursesError } = await supabaseAdmin
        .from('course_access')
        .select('course_id, school_id, grade')
        .limit(100) as any;
      
      // Fetch course details separately if needed
      let allCoursesAccess: any[] = [];
      if (allCoursesAccessRaw && allCoursesAccessRaw.length > 0) {
        const courseIds = allCoursesAccessRaw.map((ca: any) => ca.course_id).filter(Boolean);
        const { data: coursesData } = await supabaseAdmin
          .from('courses')
          .select('id, name, course_name, status, is_published')
          .in('id', courseIds);
        
        // Combine the data
        allCoursesAccess = allCoursesAccessRaw.map((ca: any) => ({
          ...ca,
          courses: coursesData?.find((c: any) => c.id === ca.course_id)
        }));
      }
      
      console.log(`🔍 DIAGNOSTIC INFO:`);
      console.log(`   Student ID: ${user.id}`);
      console.log(`   Student School ID: ${schoolId || 'undefined'}`);
      console.log(`   Student Grade: "${grade}" (normalized: ${normalizedGrade}, comparison: ${studentGradeForComparison})`);
      console.log(`   Course access entries for this school: ${allAccessEntriesForSchool?.length || 0}`);
      
      if (allAccessEntriesForSchool && allAccessEntriesForSchool.length > 0) {
        console.log(`   Available grades in course_access for school ${schoolId || 'undefined'}:`);
        allAccessEntriesForSchool.forEach((entry: any) => {
          const course = entry.courses;
          const isPublished = course?.is_published === true || course?.status === 'Published';
          console.log(`     - Grade: "${entry.grade}" (normalized: ${normalizeGradeForComparison(entry.grade || '')}), Course: ${course?.name || course?.course_name || 'N/A'}, Published: ${isPublished}`);
        });
      } else {
        console.log(`   ⚠️ No course_access entries found for school ${schoolId || 'undefined'}`);
        
        // Check if there are any course_access entries at all
        if (allCoursesAccess && allCoursesAccess.length > 0) {
          console.log(`   📋 Found ${allCoursesAccess.length} total course_access entries in database (across all schools)`);
          const publishedCourses = allCoursesAccess.filter((e: any) => {
            const course = e.courses;
            return course?.is_published === true || course?.status === 'Published';
          });
          console.log(`   📋 ${publishedCourses.length} of them are for published courses`);
          
          // Show a sample of what's available
          const sampleEntries = allCoursesAccess.slice(0, 5);
          console.log(`   Sample course_access entries:`);
          sampleEntries.forEach((entry: any) => {
            const course = entry.courses;
            console.log(`     - School: ${entry.school_id}, Grade: "${entry.grade}", Course: ${course?.name || course?.course_name || 'N/A'}`);
          });
        }
      }
      
      if (allAccessError) {
        console.error('❌ Error fetching all course_access entries:', allAccessError);
      } else if (allAccessEntriesForSchool && allAccessEntriesForSchool.length > 0) {
        // Filter entries where normalized grades match
        const matchedEntries = allAccessEntriesForSchool.filter((entry: any) => {
          const entryGradeForComparison = normalizeGradeForComparison(entry.grade || '');
          const matches = entryGradeForComparison === studentGradeForComparison;
          
          if (matches) {
            console.log(`✅ Grade match found: student grade "${grade}" (normalized: ${studentGradeForComparison}) matches course_access grade "${entry.grade}" (normalized: ${entryGradeForComparison})`);
          }
          
          return matches;
        });
        
        if (matchedEntries.length > 0) {
          courseAccess = matchedEntries;
          console.log(`✅ Found ${courseAccess.length} course_access entries (normalized matching fallback)`);
        } else {
          console.log(`⚠️ No grade matches found after normalized comparison.`);
          console.log(`   Student grade: "${grade}" (comparison value: "${studentGradeForComparison}")`);
          console.log(`   Available grades in course_access: ${allAccessEntriesForSchool.map((e: any) => `"${e.grade}" (comparison: "${normalizeGradeForComparison(e.grade || '')}")`).join(', ')}`);
        }
      } else {
        console.log(`⚠️ No course_access entries found for school ${schoolId || 'undefined'}`);
      }
    }

    // Step 4: If still no results from course_access, check enrollments table directly as fallback
    // This ensures students see their enrolled courses even if course_access entries don't match
    if (courseAccess.length === 0) {
      console.log(`⚠️ No course_access matches found (found ${courseAccess.length} entries), checking enrollments table as fallback...`);
      console.log(`   Student ID: ${user.id}, School ID: ${schoolId || 'undefined'}, Grade: "${grade}"`);
      
      // Query enrollments table directly for active enrollments
      const { data: studentEnrollments, error: enrollmentsError } = await supabaseAdmin
        .from('enrollments')
        .select('course_id, progress_percentage, last_accessed, status, enrolled_on')
        .eq('student_id', user.id)
        .eq('status', 'active');
      
      if (enrollmentsError) {
        console.error('❌ Error fetching enrollments:', enrollmentsError);
        console.error('❌ Enrollment error details:', JSON.stringify(enrollmentsError, null, 2));
      } else {
        console.log(`📋 Enrollment query result: ${studentEnrollments?.length || 0} enrollments found`);
        if (studentEnrollments && studentEnrollments.length > 0) {
          console.log(`✅ Found ${studentEnrollments.length} active enrollments for student ${user.id}`);
          studentEnrollments.forEach((e: any, idx: number) => {
            console.log(`   ${idx + 1}. Course ID: ${e.course_id}, Status: ${e.status}, Progress: ${e.progress_percentage}%`);
          });
          
          // Get course IDs from enrollments
        const enrolledCourseIds = studentEnrollments.map((e: any) => e.course_id).filter(Boolean);
        
        if (enrolledCourseIds.length > 0) {
          // Fetch course details for enrolled courses
          const { data: enrolledCourses, error: coursesError } = await supabaseAdmin
            .from('courses')
            .select(`
              id,
              course_name,
              name,
              description,
              status,
              is_published,
              num_chapters,
              content_summary,
              created_at,
              updated_at
            `)
            .in('id', enrolledCourseIds);
          
          if (coursesError) {
            console.error('❌ Error fetching enrolled courses:', coursesError);
          } else if (enrolledCourses && enrolledCourses.length > 0) {
            // Filter to only published courses
            const publishedEnrolledCourses = enrolledCourses.filter((course: any) => 
              course.is_published === true || course.status === 'Published'
            );
            
            console.log(`✅ Found ${publishedEnrolledCourses.length} published courses from enrollments (out of ${enrolledCourses.length} total enrolled)`);
            
            // Get grades from course_access for all enrolled courses at once (optimization)
            const enrolledCourseIdsForAccess = publishedEnrolledCourses.map((c: any) => c.id);
            const { data: accessEntries } = await supabaseAdmin
              .from('course_access')
              .select('course_id, grade')
              .in('course_id', enrolledCourseIdsForAccess)
              .eq('school_id', schoolId);
            
            // Create a map of course_id -> grade for quick lookup
            const gradeMap = new Map<string, string>();
            if (accessEntries) {
              accessEntries.forEach((entry: any) => {
                if (!gradeMap.has(entry.course_id)) {
                  gradeMap.set(entry.course_id, entry.grade);
                }
              });
            }
            
            // Format as course_access entries so they can be processed by existing logic
            for (const course of publishedEnrolledCourses) {
              // Get grade from course_access if available, otherwise use student's grade
              const gradeForCourse = gradeMap.get(course.id) || grade || 'N/A';
              
              // Create a course_access-like entry
              courseAccess.push({
                course_id: course.id,
                grade: gradeForCourse,
                courses: course
              });
              
              console.log(`✅ Added enrolled course ${course.course_name || course.name || course.id} (grade: ${gradeForCourse}) via enrollment fallback`);
            }
          }
        }
        } else {
          console.log(`⚠️ No active enrollments found for student ${user.id}`);
        }
      }
    }

    // Filter to only published courses
    const allAvailableCourses = (courseAccess || [])
      .filter((ca: any) => {
        const course = ca.courses;
        const isPublished = course && (
          course.is_published === true || 
          course.status === 'Published'
        );
        
        if (!isPublished && course) {
          console.log(`⚠️ Course ${course.id} (${course.course_name || course.name || 'N/A'}) is not published. Status: ${course.status}, is_published: ${course.is_published}`);
        }
        
        return isPublished;
      })
      .map((ca: any) => {
        const course = ca.courses;
        return {
          id: course.id,
          name: course.course_name || course.name || '',
          title: course.course_name || course.name || '',
          description: course.description || '',
          grade: ca.grade,
          status: course.is_published ? 'Published' : (course.status || 'Draft'),
          total_chapters: course.num_chapters || 0,
          content_summary: course.content_summary || {},
          created_at: course.created_at,
          updated_at: course.updated_at
        };
      });
    
    console.log(`📊 Final results: ${courseAccess.length} course_access entries found, ${allAvailableCourses.length} published courses available`);

    // Sort courses by created_at for cursor pagination
    allAvailableCourses.sort((a: any, b: any) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA; // Descending order (newest first)
    });

    // Apply pagination
    const totalCourses = allAvailableCourses.length;
    let coursesToEnrich: any[];

    if (useCursor) {
      // For cursor pagination, filter by cursor if provided
      let filteredCourses = allAvailableCourses;
      if (cursorParams.cursor) {
        const parsed = parseCursor(cursorParams.cursor);
        if (parsed) {
          const cursorDate = new Date(parsed.timestamp).getTime();
          if (cursorParams.direction === 'next') {
            filteredCourses = allAvailableCourses.filter((c: any) => {
              const courseDate = new Date(c.created_at || 0).getTime();
              return courseDate < cursorDate;
            });
          } else {
            filteredCourses = allAvailableCourses.filter((c: any) => {
              const courseDate = new Date(c.created_at || 0).getTime();
              return courseDate > cursorDate;
            });
          }
        }
      }

      // Take limit + 1 to check if there's more
      const limit = cursorParams.limit || 50;
      coursesToEnrich = filteredCourses.slice(0, limit + 1);
    } else {
      // Offset pagination (backward compatible)
      coursesToEnrich = allAvailableCourses.slice(
        pagination.offset,
        pagination.offset + pagination.limit
      );
    }

    console.log(`✅ Found ${totalCourses} published courses for student ${user.id} (showing ${coursesToEnrich.length} with pagination)`);

    // Get course IDs for parallel queries (use paginated courses for data fetching)
    const courseIds = coursesToEnrich.map((c: any) => c.id);

    // Verify and log enrollment status for each course (if schoolId and grade are available)
    // Wrap in try-catch to prevent errors from blocking the response
    if (schoolId && grade && courseIds.length > 0) {
      try {
        console.log(`🔍 Verifying enrollment status for ${courseIds.length} courses...`);
        const enrollmentStatusChecks = await Promise.all(
          courseIds.map(async (courseId) => {
            try {
              const [enrollmentCheck, courseAccessCheck] = await Promise.all([
                supabaseAdmin
                  .from('enrollments')
                  .select('id, status')
                  .eq('student_id', user.id)
                  .eq('course_id', courseId)
                  .eq('status', 'active')
                  .maybeSingle(),
                supabaseAdmin
                  .from('course_access')
                  .select('id')
                  .eq('course_id', courseId)
                  .eq('school_id', schoolId)
                  .eq('grade', grade)
                  .maybeSingle()
              ]);

              const hasEnrollment = !!enrollmentCheck.data;
              const hasCourseAccess = !!courseAccessCheck.data;

              if (!hasEnrollment && hasCourseAccess) {
                console.warn(`⚠️ Course ${courseId}: Has course_access but missing enrollment. Auto-enrollment should create this.`);
              } else if (!hasEnrollment && !hasCourseAccess) {
                console.warn(`⚠️ Course ${courseId}: Missing both enrollment and course_access.`);
              } else if (hasEnrollment) {
                console.log(`✅ Course ${courseId}: Has active enrollment.`);
              }

              return {
                courseId,
                hasEnrollment,
                hasCourseAccess,
                enrollmentId: enrollmentCheck.data?.id
              };
            } catch (checkError) {
              console.warn(`⚠️ Error checking enrollment status for course ${courseId}:`, checkError);
              return {
                courseId,
                hasEnrollment: false,
                hasCourseAccess: false,
                enrollmentId: undefined
              };
            }
          })
        );

        // Log summary
        const coursesWithEnrollment = enrollmentStatusChecks.filter((c: any) => c.hasEnrollment).length;
        const coursesWithoutEnrollment = enrollmentStatusChecks.filter((c: any) => !c.hasEnrollment && c.hasCourseAccess).length;
        console.log(`📊 Enrollment status: ${coursesWithEnrollment} courses with enrollment, ${coursesWithoutEnrollment} courses with course_access but no enrollment`);
      } catch (enrollmentCheckError) {
        console.warn('⚠️ Error during enrollment status verification (non-blocking):', enrollmentCheckError);
        // Continue execution - this is just for logging, not critical for the response
      }
    }

    // Parallelize all independent queries
    // Wrap all queries in try-catch to prevent 500 errors from blocking the response
    const [
      enrollmentsResult,
      chaptersResult,
      progressResult,
      assignmentsResult
    ] = await Promise.all([
      (async () => {
        try {
          const result = await supabaseAdmin
            .from('enrollments')
            .select('course_id, progress_percentage, last_accessed, status')
            .eq('student_id', user.id)
            .eq('status', 'active');
          if (result.error) {
            console.warn('⚠️ [API] enrollments query failed (non-blocking):', result.error);
            return { data: [], error: result.error };
          }
          return result;
        } catch (err) {
          console.warn('⚠️ [API] enrollments query exception (non-blocking):', err);
          return { data: [], error: err };
        }
      })(),
      courseIds.length > 0
        ? (async () => {
            try {
              const result = await supabaseAdmin
                .from('chapters')
                .select('id, course_id, is_published')
                .in('course_id', courseIds)
                .eq('is_published', true);
              if (result.error) {
                console.warn('⚠️ [API] chapters query failed (non-blocking):', result.error);
                return { data: [], error: result.error };
              }
              return result;
            } catch (err) {
              console.warn('⚠️ [API] chapters query exception (non-blocking):', err);
              return { data: [], error: err };
            }
          })()
        : Promise.resolve({ data: [] }),
      (async () => {
        try {
          const result = await supabaseAdmin
            .from('course_progress')
            .select('chapter_id, completed')
            .eq('student_id', user.id);
          if (result.error) {
            console.warn('⚠️ [API] course_progress query failed (non-blocking):', result.error);
            return { data: null, error: result.error };
          }
          return result;
        } catch (err) {
          console.warn('⚠️ [API] course_progress query exception (non-blocking):', err);
          return { data: null, error: err };
        }
      })(),
      courseIds.length > 0
        ? (async () => {
            try {
              const result = await supabaseAdmin
                .from('assignments')
                .select('id, course_id, is_published')
                .in('course_id', courseIds)
                .eq('is_published', true);
              if (result.error) {
                console.warn('⚠️ [API] assignments query failed (non-blocking):', result.error);
                return { data: [], error: result.error };
              }
              return result;
            } catch (err) {
              console.warn('⚠️ [API] assignments query exception (non-blocking):', err);
              return { data: [], error: err };
            }
          })()
        : Promise.resolve({ data: [] })
    ]);

    // Extract data safely from results
    const enrollments = enrollmentsResult?.data || [];
    const chapters = chaptersResult?.data || [];
    const assignments = assignmentsResult?.data || [];

    // Extract progress data safely
    const progress = progressResult?.data || null;

    const chaptersData = chapters || [];
    const assignmentsData = assignments || [];

    // Get assignment submissions (depends on assignmentIds)
    const assignmentIds = assignmentsData.map((a: any) => a.id);
    let submissions: any[] | null = null;
    
    if (assignmentIds.length > 0) {
      try {
        const submissionsResult = await supabaseAdmin
          .from('submissions')
          .select('assignment_id, grade, status')
          .eq('student_id', user.id)
          .in('assignment_id', assignmentIds);
        
        if (submissionsResult.error) {
          console.warn('⚠️ [API] submissions query failed (non-blocking):', submissionsResult.error);
          submissions = [];
        } else {
          submissions = submissionsResult.data || [];
        }
      } catch (err) {
        console.warn('⚠️ [API] submissions query exception (non-blocking):', err);
        submissions = [];
      }
    }

    // Enrich courses with progress data
    const enrichedCourses = coursesToEnrich.map((course: any) => {
       
      const enrollmentsData = enrollments as any[] | null;
       
      const enrollment = enrollmentsData?.find((e: any) => e.course_id === course.id);
      
      // Get chapters for this course
       
      const courseChapters = (chaptersData as any[]).filter((ch: any) => ch.course_id === course.id);
      const totalChapters = courseChapters.length;
      
      // Get progress for this course's chapters
       
      const chapterIds = courseChapters.map((ch: any) => ch.id);
       
      const progressData = progress as any[] | null;
       
      const courseProgress = progressData?.filter((p: any) => chapterIds.includes(p.chapter_id)) || [];
       
      // Calculate actual completed chapters from student progress
      const completedChapters = courseProgress.filter((p: any) => p.completed === true).length;
      
      // Debug logging for progress calculation
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 [Course Progress] Course: ${course.id}, Total Chapters: ${totalChapters}, Completed Chapters: ${completedChapters}, Progress Records: ${courseProgress.length}`);
      }
      
      // Get assignments for this course
       
      const courseAssignments = (assignmentsData as any[]).filter((a: any) => a.course_id === course.id);
      const totalAssignments = courseAssignments.length;
       
      const assignmentIdsForCourse = courseAssignments.map((a: any) => a.id);
       
      const submissionsData = submissions as any[] | null;
       
      const courseSubmissions = submissionsData?.filter((s: any) => assignmentIdsForCourse.includes(s.assignment_id)) || [];
       
      const completedAssignments = courseSubmissions.filter((s: any) => s.status === 'submitted').length;
      
      // Calculate average grade
       
      const gradedSubmissions = courseSubmissions.filter((s: any) => s.grade !== null);
      const averageGrade = gradedSubmissions.length > 0
         
        ? gradedSubmissions.reduce((sum: number, s: any) => sum + (s.grade || 0), 0) / gradedSubmissions.length
        : 0;

      // Calculate progress percentage based on actual completed chapters
      // Always calculate from actual progress data to ensure accuracy (source of truth)
      let progressPercentage = 0;
      if (totalChapters > 0) {
        // Calculate from actual completed chapters - this is the source of truth
        progressPercentage = Math.round((completedChapters / totalChapters) * 100);
      } else if (enrollment?.progress_percentage !== null && enrollment?.progress_percentage !== undefined) {
        // Only fallback to enrollment progress if no chapters exist
        // But ensure it's not incorrectly set to 100% for new students
        const enrollmentProgress = Number(enrollment.progress_percentage) || 0;
        // Safety check: if enrollment shows 100% but there are no progress records, reset to 0
        if (enrollmentProgress >= 100 && courseProgress.length === 0) {
          progressPercentage = 0;
        } else {
          progressPercentage = Math.min(100, Math.max(0, enrollmentProgress));
        }
      }
      
      // Final safety check: if no progress records exist, ensure progress is 0
      if (courseProgress.length === 0 && progressPercentage > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️ [Course Progress] Course ${course.id} has no progress records but shows ${progressPercentage}% - resetting to 0%`);
        }
        progressPercentage = 0;
      }

      return {
        ...course,
        progress_percentage: progressPercentage,
        total_chapters: totalChapters,
        completed_chapters: completedChapters,
        total_assignments: totalAssignments,
        completed_assignments: completedAssignments,
        average_grade: averageGrade,
        last_accessed: enrollment?.last_accessed || new Date().toISOString(), // Show as recently accessed
        status: progressPercentage === 100 ? 'completed' : 
                progressPercentage > 0 ? 'active' : 'not_started'
      };
    });

    // Create paginated response
    let responseData: any;
    if (useCursor) {
      const limit = cursorParams.limit || 50;
      const cursorResponse = createCursorResponse(
        enrichedCourses as Array<{ created_at: string; id: string }>,
        limit
      );

      responseData = {
        courses: cursorResponse.data,
        pagination: {
          nextCursor: cursorResponse.nextCursor,
          prevCursor: cursorResponse.prevCursor,
          hasMore: cursorResponse.hasMore
        }
      };
    } else {
      logger.info('Courses fetched successfully for student', {
        endpoint: '/api/student/courses',
        userId: user.id,
        schoolId,
        grade: normalizedGrade,
        totalCourses,
        paginatedCount: enrichedCourses.length,
        limit: pagination.limit,
        offset: pagination.offset,
      });

      // For backward compatibility, wrap in courses property
      const paginationResponse = createPaginationResponse(
        enrichedCourses,
        totalCourses,
        pagination
      );
      
      responseData = {
        courses: paginationResponse.data,
        pagination: paginationResponse.pagination
      };
    }

        return responseData;
      },
      CacheTTL.SHORT // 2 minutes - same as other student endpoints for consistency
    );

    logger.info('Student courses fetched successfully', {
      endpoint: '/api/student/courses',
      userId: user.id,
      count: result.courses?.length || 0,
      cached: true // Indicates data may be from cache
    });

    const requestStartTime = Date.now();
    const response = NextResponse.json(result);

    // Add rate limit headers
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Add HTTP caching headers (shorter cache for list data)
    addCacheHeaders(response, result, {
      ...CachePresets.USER_DASHBOARD,
      maxAge: 120, // 2 minutes for student courses
      staleWhileRevalidate: 300,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      try {
        const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
        recordHttpCacheOperation({
          endpoint: '/api/student/courses',
          statusCode: 304,
          is304: true,
          hasETag: true,
          cacheControl: response.headers.get('Cache-Control') || undefined,
          responseSize: 0,
          duration: Date.now() - requestStartTime
        });
      } catch (monitorError) {
        // Non-critical - log but don't fail the request
        console.warn('Failed to record cache operation (non-critical):', monitorError);
      }
      return new NextResponse(null, { status: 304 });
    }

    // Track 200 response
    try {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/student/courses',
        statusCode: 200,
        is304: false,
        hasETag: !!etag,
        cacheControl: response.headers.get('Cache-Control') || undefined,
        responseSize: JSON.stringify(result).length,
        duration: Date.now() - requestStartTime
      });
    } catch (monitorError) {
      // Non-critical - log but don't fail the request
      console.warn('Failed to record cache operation (non-critical):', monitorError);
    }

    return response;
  } catch (error) {
    // Enhanced error logging to help debug
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('❌ [API] Error in GET /api/student/courses:', {
      message: errorMessage,
      stack: errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      endpoint: '/api/student/courses',
    });
    
    logger.error('Unexpected error in GET /api/student/courses', {
      endpoint: '/api/student/courses',
      errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    }, error instanceof Error ? error : new Error(String(error)));
    
    try {
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/student/courses' },
        'Failed to fetch student courses'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    } catch (handleErrorError) {
      // If handleApiError itself fails, return a basic error response
      console.error('❌ [API] Error in handleApiError:', handleErrorError);
      return NextResponse.json(
        { 
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while processing your request',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        { status: 500 }
      );
    }
  }
}


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { frontendLogger, handleApiErrorResponse } from '../lib/frontend-logger'

import { fetchWithCsrf } from '../lib/csrf-client';
import { useCourseRealtimeSync } from './useCourseRealtimeSync';
import { getCacheConfig } from '../lib/cache-config';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Type definitions
// Note: These types are used implicitly through Supabase queries
// They're kept here for reference but may not be directly referenced in code

interface Course {
  id: string;
  name?: string;
  title?: string;
  course_name?: string;
  is_published?: boolean;
  status?: string;
  progress_percentage?: number;
}

interface Attendance {
  status: string;
}

interface Submission {
  assignment_id: string;
  grade: number | null;
}

interface Assignment {
  id: string;
  due_date: string;
  course_id: string;
  title: string;
  assignment_type?: string;
}

interface Schedule {
  id: string;
  day_of_week: string;
  start_time?: string;
  end_time?: string;
  classes?: {
    class_name: string;
    subject: string;
    grade: string;
  };
  periods?: {
    start_time: string;
    end_time: string;
  };
}

interface CourseAccess {
  id: string;
  course_id: string;
  school_id: string;
  grade: string;
}

interface ErrorResponse {
  error?: string;
  details?: string;
  code?: string;
  status?: number;
  message?: string;
}

// Student Profile Hooks
export function useStudentProfile() {
  return useQuery({
    queryKey: ['studentProfile'],
    queryFn: async () => {
      try {
        frontendLogger.debug('Fetching student profile', { component: 'useStudentProfile' });
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
          frontendLogger.error('Failed to get authenticated user', {
            component: 'useStudentProfile',
          }, authError);
          throw new Error('Authentication failed');
        }

        if (!user) {
          frontendLogger.warn('No user found', { component: 'useStudentProfile' });
          throw new Error('No user found');
        }

        // Get profile first
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, role, school_id, parent_name, parent_phone, created_at, updated_at')
          .eq('id', user.id)
          .single();

        if (profileError) {
          frontendLogger.error('Failed to fetch profile', {
            component: 'useStudentProfile',
            userId: user.id,
          }, profileError);
          throw profileError;
        }

        if (!profile) {
          frontendLogger.warn('Profile not found', {
            component: 'useStudentProfile',
            userId: user.id,
          });
          return null;
        }

        // Get student school data from student_schools table (primary source of truth)
        // No fallback to profiles.school_id - must have student_schools record
        const { data: studentSchools, error: studentSchoolsError } = await supabase
          .from('student_schools')
          .select(`
            id,
            school_id,
            grade,
            joining_code,
            enrolled_at,
            is_active,
            schools!inner(name, address)
          `)
          .eq('student_id', user.id)
          .eq('is_active', true)
          .limit(1);

        if (studentSchoolsError) {
          frontendLogger.error('Failed to fetch student school assignment', {
            component: 'useStudentProfile',
            userId: user.id,
          }, studentSchoolsError);
          throw studentSchoolsError;
        }

        if (!studentSchools || studentSchools.length === 0) {
          frontendLogger.warn('Student has no school assignment', {
            component: 'useStudentProfile',
            userId: user.id,
          });
          // Return profile but indicate no school assignment
          return {
            ...profile,
            students: [],
            student_schools: [],
            hasSchoolAssignment: false,
          };
        }

        // Use student_schools data (deprecated students table is no longer used)
        const studentData = studentSchools[0];

        frontendLogger.info('Student profile fetched successfully', {
          component: 'useStudentProfile',
          userId: user.id,
          schoolId: studentData.school_id,
        });

        return {
          ...profile,
          students: [studentData],
          student_schools: studentSchools,
          hasSchoolAssignment: true,
        };
      } catch (error) {
        handleApiErrorResponse(
          error,
          { component: 'useStudentProfile' },
          'Failed to fetch student profile'
        );
        frontendLogger.error('Error in useStudentProfile', {
          component: 'useStudentProfile',
        }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    },
    enabled: true,
    retry: 1,
  });
}

// Student Courses Hooks
export function useStudentCourses() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['studentCourses'],
    retry: 2,
    retryDelay: 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Get session token for API call
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No session token available')
      }

      // Use API endpoint that filters by course_access (school and grade)
      console.log('🔄 Fetching student courses from API...')
      const response = await fetchWithCsrf('/api/student/courses', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ API error:', error)
        throw new Error(error.error || 'Failed to fetch courses')
      }

      const result = await response.json()
      console.log('📦 API response:', {
        hasCourses: !!result.courses,
        coursesCount: result.courses?.length || 0,
        courses: result.courses,
        fullResult: result
      })
      return result.courses || []
    },
  })

  // Set up realtime subscription for course updates
  useEffect(() => {
    const channel = supabase
      .channel('courses-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'courses',
        },
        (payload) => {
          console.log('🔄 Course updated via realtime:', payload)
          // Invalidate and refetch courses
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
          // Also invalidate specific course if it's an update
          if (payload.new && 'id' in payload.new) {
            queryClient.invalidateQueries({ queryKey: ['studentCourse', payload.new.id] })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapters',
        },
        (payload) => {
          console.log('🔄 Chapter updated via realtime:', payload)
          // Invalidate courses to refresh chapter counts
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
          // Invalidate course chapters
          if (payload.new && 'course_id' in payload.new) {
            queryClient.invalidateQueries({ queryKey: ['courseChapters', payload.new.course_id] })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'course_access',
        },
        (payload) => {
          console.log('🔄 Course access updated via realtime:', payload)
          // Invalidate courses when access changes
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}

export function useStudentCourse(courseId: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['studentCourse', courseId],
    queryFn: async () => {
      // Guard against invalid courseId
      if (!courseId) {
        return null;
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // First try to get from student_progress_view
      // This is optional - if it fails, we'll fall back to direct course query
      console.log(`🔍 [useStudentCourse] Trying student_progress_view first...`)
      const { data: viewData, error: viewError } = await supabase
        .from('student_progress_view')
        .select('*') // View may have computed columns, keep * for views
        .eq('student_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle() // Use maybeSingle to avoid errors if view doesn't exist or has no data

      if (viewError) {
        // View might not exist or have RLS issues - that's okay, we'll use fallback
        console.log(`ℹ️ [useStudentCourse] student_progress_view query failed (will use fallback):`, {
          error: viewError.message,
          code: viewError.code,
        })
      } else if (viewData) {
        console.log(`✅ [useStudentCourse] Found course in student_progress_view`)
        return viewData
      } else {
        console.log(`ℹ️ [useStudentCourse] Course not in student_progress_view, fetching directly...`)
      }

      // If not found in view, use API endpoint to bypass RLS
      // The API endpoint uses supabaseAdmin which bypasses RLS policies
      console.log(`🔍 [useStudentCourse] Fetching course ${courseId} via API (bypasses RLS)`)
      
      // Verify session is valid
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        console.error(`❌ [useStudentCourse] No valid session:`, sessionError)
        throw new Error('No valid session. Please log in again.')
      }
      if (!session.access_token) {
        throw new Error('No session token available')
      }
      console.log(`✅ [useStudentCourse] Session valid, user ID: ${user.id}`)
      
      // Use API endpoint to bypass RLS - it uses supabaseAdmin
      try {
        console.log(`🔄 [useStudentCourse] Fetching course from API...`)
        const response = await fetchWithCsrf('/api/student/courses', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (!response.ok) {
          const error = await response.json()
          console.error(`❌ [useStudentCourse] API error:`, error)
          
          if (response.status === 403 || error.code === 'NO_ACCESS') {
            console.warn(`⚠️ [useStudentCourse] No access to course ${courseId}`)
            return null
          }
          
          throw new Error(error.error || error.details || 'Failed to fetch course')
        }

        const result = await response.json()
        const courses: Course[] = result.courses || []
        
        // Find the specific course by ID
        const course = courses.find((c: Course) => c.id === courseId)
        
        if (course) {
          console.log(`✅ [useStudentCourse] Course found via API:`, {
            id: course.id,
            name: course.name || course.title || course.course_name,
            is_published: course.is_published,
            status: course.status,
          })
          
          // Return course with all the data from API (already includes progress, etc.)
          return course
        } else {
          console.warn(`⚠️ [useStudentCourse] Course ${courseId} not found in API response`)
          console.warn(`   Available course IDs:`, courses.map((c: Course) => c.id))
          return null
        }
      } catch (apiError) {
        console.error(`❌ [useStudentCourse] API fetch error:`, apiError)
        // Fall back to null - the UI will handle it with fallback course data
        return null
      }
    },
    enabled: !!courseId,
  })

  // Set up realtime subscription for this specific course
  useEffect(() => {
    if (!courseId) return

    const channel = supabase
      .channel(`course-${courseId}-changes`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courses',
          filter: `id=eq.${courseId}`,
        },
        (payload) => {
          console.log('🔄 Course updated via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['studentCourse', courseId] })
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapters',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          console.log('🔄 Chapter updated for course via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['studentCourse', courseId] })
          queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapter_contents',
        },
        async (payload) => {
          // Check if this content belongs to a chapter in this course
          if (payload.new && 'chapter_id' in payload.new) {
            const { data: chapter } = await supabase
              .from('chapters')
              .select('course_id')
              .eq('id', payload.new.chapter_id)
              .single()
            
            if (chapter && chapter.course_id === courseId) {
              console.log('🔄 Chapter content updated via realtime:', payload)
              queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          console.log('🔄 Assignment updated for course via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['studentCourse', courseId] })
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [courseId, queryClient])

  return query
}

// Utility function to normalize grade for comparison (matches database logic)
function normalizeGradeForComparison(grade: string | null | undefined): string {
  if (!grade) return ''
  const trimmed = grade.trim()
  // Remove "Grade " prefix (case-sensitive)
  let normalized = trimmed.replace(/^Grade\s+/, '')
  // Remove "grade" prefix (case-insensitive)
  normalized = normalized.replace(/^grade\s*/i, '')
  // Return lowercase for comparison
  return normalized.trim().toLowerCase()
}

// Utility function to check student enrollment and course access
async function checkStudentCourseAccess(courseId: string, userId: string): Promise<{
  hasEnrollment: boolean
  hasCourseAccess: boolean
  errorMessage?: string
}> {
  const startTime = performance.now()
  console.log(`🔍 [checkStudentCourseAccess] Checking access for student ${userId} to course ${courseId}`)
  
  // Check enrollment
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, course_id, status')
    .eq('student_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .maybeSingle()

  if (enrollmentError) {
    console.error('[checkStudentCourseAccess] Error checking enrollment:', {
      error: enrollmentError,
      code: enrollmentError.code,
      message: enrollmentError.message,
      details: enrollmentError.details,
      hint: enrollmentError.hint,
      courseId,
      userId,
    })
  } else {
    console.log(`📋 [checkStudentCourseAccess] Enrollment check: ${enrollment ? 'FOUND' : 'NOT FOUND'}`, {
      enrollmentId: enrollment?.id,
      status: enrollment?.status,
    })
  }

  // Check course_access with normalized grade matching
  const { data: studentSchools, error: schoolError } = await supabase
    .from('student_schools')
    .select('school_id, grade')
    .eq('student_id', userId)
    .eq('is_active', true)
    .limit(1)

  const studentSchool = studentSchools && studentSchools.length > 0 ? studentSchools[0] : null

  if (schoolError) {
    console.error('[checkStudentCourseAccess] Error checking student school:', {
      error: schoolError,
      code: schoolError.code,
      message: schoolError.message,
      details: schoolError.details,
      hint: schoolError.hint,
      userId,
    })
  } else {
    console.log(`🏫 [checkStudentCourseAccess] Student school: ${studentSchool ? 'FOUND' : 'NOT FOUND'}`, {
      schoolId: studentSchool?.school_id,
      grade: studentSchool?.grade,
    })
  }

  let hasCourseAccess = false
  if (studentSchool) {
    // Get all course_access entries for this course and school
    const { data: courseAccessList, error: courseAccessError } = await supabase
      .from('course_access')
      .select('id, course_id, school_id, grade')
      .eq('course_id', courseId)
      .eq('school_id', studentSchool.school_id)
    
    if (courseAccessError) {
      console.error('[checkStudentCourseAccess] Error checking course_access:', {
        error: courseAccessError,
        code: courseAccessError.code,
        message: courseAccessError.message,
        details: courseAccessError.details,
        hint: courseAccessError.hint,
        courseId,
        schoolId: studentSchool.school_id,
      })
    } else if (courseAccessList && courseAccessList.length > 0) {
      console.log(`📋 [checkStudentCourseAccess] Found ${courseAccessList.length} course_access entries`)
      // Use normalized grade matching (same logic as database function)
      const studentGradeNormalized = normalizeGradeForComparison(studentSchool.grade)
      hasCourseAccess = courseAccessList.some((ca: CourseAccess) => {
        const accessGradeNormalized = normalizeGradeForComparison(ca.grade)
        const matches = (
          ca.grade === studentSchool.grade || // Exact match
          accessGradeNormalized === studentGradeNormalized || // Normalized match
          // Additional normalized matching (handles "Grade 4" vs "grade4")
          normalizeGradeForComparison(ca.grade.replace(/^Grade\s+/, '')) === 
          normalizeGradeForComparison(studentSchool.grade.replace(/^Grade\s+/, ''))
        )
        if (matches) {
          console.log(`✅ [checkStudentCourseAccess] Grade match found:`, {
            studentGrade: studentSchool.grade,
            accessGrade: ca.grade,
            normalizedStudent: studentGradeNormalized,
            normalizedAccess: accessGradeNormalized,
          })
        }
        return matches
      })
    } else {
      console.log(`📋 [checkStudentCourseAccess] No course_access entries found`)
    }
  }

  const hasEnrollment = !!enrollment
  const duration = performance.now() - startTime

  let errorMessage: string | undefined
  // Only return error if student has NO access at all (neither enrollment nor course_access)
  // If course_access exists, allow RLS policies to handle access control
  if (!hasEnrollment && !hasCourseAccess) {
    errorMessage = 'You do not have access to this course. Please contact your administrator to enroll you.'
  }
  // If course_access exists but enrollment doesn't, don't block - RLS will handle it
  // Enrollment may be pending or will be created automatically

  console.log(`✅ [checkStudentCourseAccess] Access check complete (${duration.toFixed(2)}ms):`, {
    hasEnrollment,
    hasCourseAccess,
    hasAccess: hasEnrollment || hasCourseAccess,
    errorMessage,
  })

  return { hasEnrollment, hasCourseAccess, errorMessage }
}

export function useCourseChapters(courseId: string) {
  const queryClient = useQueryClient()

  // Invalidate cache on mount to ensure fresh data (especially after fixes)
  useEffect(() => {
    if (courseId) {
      queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
    }
  }, [courseId, queryClient])

  const cacheConfig = getCacheConfig('chapterContent')
  const query = useQuery({
    queryKey: ['courseChapters', courseId],
    queryFn: async () => {
      // Force fresh fetch - don't use stale cache
      console.log(`🔄 [useCourseChapters] Executing query for course ${courseId} (cache key: courseChapters-${courseId})`)
      // Guard against invalid courseId
      if (!courseId) {
        return [];
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Check enrollment and course access first (for logging/debugging)
      // But don't block if course_access exists - let RLS handle access control
      console.log(`🔍 [useCourseChapters] Checking access for course ${courseId}...`)
      const accessCheck = await checkStudentCourseAccess(courseId, user.id)
      console.log(`🔍 [useCourseChapters] Access check result:`, {
        hasEnrollment: accessCheck.hasEnrollment,
        hasCourseAccess: accessCheck.hasCourseAccess,
        errorMessage: accessCheck.errorMessage
      })
      
      // Only throw error if we're CERTAIN there's no access at all
      // If course_access exists, allow RLS policies to handle access control
      if (!accessCheck.hasEnrollment && !accessCheck.hasCourseAccess && accessCheck.errorMessage) {
        console.error(`❌ [useCourseChapters] No access to course ${courseId}`)
        const error = new Error(accessCheck.errorMessage)
        ;(error as Error & { code?: string }).code = 'NO_ACCESS'
        throw error
      }
      
      // If course_access exists but enrollment doesn't, log but don't block
      // RLS policies will handle access, and enrollment may be created automatically
      if (!accessCheck.hasEnrollment && accessCheck.hasCourseAccess) {
        console.log(`ℹ️ [useCourseChapters] Course access exists but enrollment pending - allowing RLS to handle access`)
      }

      // Get session token for API call
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        console.error(`❌ [useCourseChapters] No valid session:`, sessionError)
        throw new Error('No valid session. Please log in again.')
      }
      if (!session.access_token) {
        throw new Error('No session token available')
      }

      // Use API endpoint to bypass RLS and avoid timeouts
      console.log(`🔄 [useCourseChapters] Fetching chapters from API (bypassing RLS)...`)
      const response = await fetchWithCsrf(`/api/student/courses/${courseId}/chapters`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ [useCourseChapters] API error:', error)
        
        // If access denied, throw specific error
        if (response.status === 403 || error.code === 'NO_ACCESS') {
          throw new Error(error.details || error.error || 'You do not have access to this course')
        }
        
        throw new Error(error.error || error.details || 'Failed to fetch chapters')
      }

      const result = await response.json()
      console.log(`✅ [useCourseChapters] API response:`, {
        chaptersCount: result.chapters?.length || 0,
        totalChapters: result.total_chapters
      })
      
      // Return chapters from API (they already have progress info)
      return result.chapters || []
    },
    enabled: !!courseId,
    staleTime: 0, // Don't use stale cache - always fetch fresh to debug the issue
    gcTime: cacheConfig.cacheTime,
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
    retry: 1, // Retry once on failure
    retryOnMount: true, // Retry when component mounts if query failed
  })

  // Set up realtime subscription for chapter updates and custom events
  useEffect(() => {
    if (!courseId) return

    // Listen for custom refresh events from CoursePlayer
    const handleRefreshChapters = () => {
      console.log('🔄 [useCourseChapters] Refreshing chapters due to custom event')
      queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
      queryClient.invalidateQueries({ queryKey: ['studentCourse', courseId] })
      queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
    }

    const handleRefreshCourseProgress = () => {
      console.log('🔄 [useCourseChapters] Refreshing course progress due to custom event')
      queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
      queryClient.invalidateQueries({ queryKey: ['studentCourse', courseId] })
      queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
      // Also refresh progress-related queries for dashboards
      queryClient.invalidateQueries({ queryKey: ['teacher', 'student-progress'] })
      queryClient.invalidateQueries({ queryKey: ['school-admin', 'student-progress'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'student-progress'] })
    }

    // Add event listeners
    window.addEventListener('refreshChapters', handleRefreshChapters)
    window.addEventListener('refreshCourseProgress', handleRefreshCourseProgress)

    const channel = supabase
      .channel(`chapters-${courseId}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapters',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          console.log('🔄 Chapter updated via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
          queryClient.invalidateQueries({ queryKey: ['studentCourse', courseId] })
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapter_contents',
        },
        async (payload) => {
          // Check if this content belongs to a chapter in this course
          if (payload.new && 'chapter_id' in payload.new) {
            const { data: chapter } = await supabase
              .from('chapters')
              .select('course_id')
              .eq('id', payload.new.chapter_id)
              .single()
            
            if (chapter && chapter.course_id === courseId) {
              console.log('🔄 Chapter content updated via realtime:', payload)
              queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'course_schedules',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          console.log('🔄 Course schedule updated via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'course_progress',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          console.log('🔄 Course progress updated via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['courseChapters', courseId] })
          queryClient.invalidateQueries({ queryKey: ['studentCourse', courseId] })
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
          // Also refresh progress-related queries for dashboards
          queryClient.invalidateQueries({ queryKey: ['teacher', 'student-progress'] })
          queryClient.invalidateQueries({ queryKey: ['school-admin', 'student-progress'] })
          queryClient.invalidateQueries({ queryKey: ['admin', 'student-progress'] })
        }
      )
      .subscribe()

    return () => {
      // Remove event listeners
      window.removeEventListener('refreshChapters', handleRefreshChapters)
      window.removeEventListener('refreshCourseProgress', handleRefreshCourseProgress)
      supabase.removeChannel(channel)
    }
  }, [courseId, queryClient])

  return query
}

// Student Assignments Hooks
export function useStudentAssignments() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['studentAssignments'],
    retry: 2, // Only retry twice
    retryDelay: 1000, // Wait 1 second between retries
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Get session token for API call
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No session token available')
      }

      // Use API endpoint to bypass RLS and avoid timeouts
      console.log('🔄 [useStudentAssignments] Fetching assignments from API (bypassing RLS)...')
      const response = await fetchWithCsrf('/api/student/assignments', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ [useStudentAssignments] API error:', error)
        
        // If access denied, throw specific error
        if (response.status === 403 || error.code === 'NO_ACCESS') {
          throw new Error(error.details || error.error || 'You do not have access to assignments')
        }
        
        throw new Error(error.error || error.details || 'Failed to fetch assignments')
      }

      const result = await response.json()
      console.log(`✅ [useStudentAssignments] API response:`, {
        assignmentsCount: result.assignments?.length || 0,
        total: result.total
      })
      
      return result.assignments || []
    },
  })

  // Set up realtime subscription for assignment updates
  useEffect(() => {
    const channel = supabase
      .channel('assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments',
        },
        (payload) => {
          console.log('🔄 Assignment updated via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['studentAssignments'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'submissions',
        },
        (payload) => {
          console.log('🔄 Submission updated via realtime:', payload)
          queryClient.invalidateQueries({ queryKey: ['studentAssignments'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}

export function useStudentAssignment(assignmentId: string) {
  return useQuery({
    queryKey: ['studentAssignment', assignmentId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Get session token for API call
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No session token available')
      }

      // Use API endpoint to bypass RLS and avoid timeouts
      console.log(`🔄 [useStudentAssignment] Fetching assignment ${assignmentId} from API (bypassing RLS)...`)
      const response = await fetchWithCsrf(`/api/student/assignments/${assignmentId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        // Read response body once
        let error: ErrorResponse = {}
        const contentType = response.headers.get('content-type')
        
        try {
          const responseText = await response.text()
          
          if (responseText) {
            if (contentType && contentType.includes('application/json')) {
              try {
                error = JSON.parse(responseText) as ErrorResponse
              } catch {
                // If JSON parsing fails, treat as plain text
                error = { 
                  error: responseText || `HTTP ${response.status}`,
                  details: responseText || 'Invalid JSON response'
                }
              }
            } else {
              // Not JSON, treat as plain text error
              error = { 
                error: responseText || `HTTP ${response.status}`,
                details: responseText || 'Unknown error'
              }
            }
          } else {
            // Empty response body
            error = {
              error: `HTTP ${response.status}`,
              details: response.statusText || 'Empty response from server',
              status: response.status
            }
          }
        } catch (readError) {
          // If reading response fails completely
          error = {
            error: `HTTP ${response.status}`,
            details: `Failed to read error response: ${readError instanceof Error ? readError.message : String(readError)}`,
            status: response.status
          }
        }
        
        console.error('❌ [useStudentAssignment] API error:', {
          status: response.status,
          statusText: response.statusText,
          statusCode: response.status,
          error,
          assignmentId,
          url: `/api/student/assignments/${assignmentId}`,
          contentType
        })
        
        // If access denied, throw specific error
        if (response.status === 403 || error.code === 'NO_ACCESS') {
          throw new Error(error.details || error.error || 'You do not have access to this assignment')
        }
        
        if (response.status === 404) {
          throw new Error(error.details || error.error || 'Assignment not found')
        }
        
        // Provide more detailed error message
        const errorMessage = error.details || error.error || error.message || `Failed to fetch assignment (HTTP ${response.status}: ${response.statusText})`
        throw new Error(errorMessage)
      }

      const result = await response.json()
      console.log(`✅ [useStudentAssignment] API response:`, {
        assignmentId: result.assignment?.id,
        title: result.assignment?.title,
        questionsCount: result.assignment?.questions?.length || 0,
        hasSubmission: !!result.submission,
        submissionId: result.submission?.id,
        submissionStatus: result.submission?.status,
        submissionStudentId: result.submission?.student_id,
        submissionAssignmentId: result.submission?.assignment_id,
        rawResult: result
      })

      return {
        assignment: result.assignment,
        submission: result.submission || null
      }
    },
    enabled: !!assignmentId,
  })
}

// Student Attendance Hooks
export function useStudentAttendance(month?: Date) {
  return useQuery({
    queryKey: ['studentAttendance', month?.toISOString()],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const startOfMonth = month ? new Date(month.getFullYear(), month.getMonth(), 1) : new Date()
      const endOfMonth = month ? new Date(month.getFullYear(), month.getMonth() + 1, 0) : new Date()

      const { data } = await supabase
        .from('attendance')
        .select(`
          id,
          date,
          status,
          recorded_at,
          remarks,
          classes!inner(class_name, grade, subject),
          profiles!attendance_recorded_by_fkey(full_name)
        `)
        .eq('user_id', user.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false })

      return data || []
    },
  })
}

// Get attendance statistics
export function useStudentAttendanceStats() {
  return useQuery({
    queryKey: ['studentAttendanceStats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Get current month attendance
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

      const { data } = await supabase
        .from('attendance')
        .select('status')
        .eq('user_id', user.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])

      const stats = {
        total: data?.length || 0,
        present: data?.filter((a: Attendance) => a.status === 'Present').length || 0,
        absent: data?.filter((a: Attendance) => a.status === 'Absent').length || 0,
        late: data?.filter((a: Attendance) => a.status === 'Late').length || 0,
        percentage: 0
      }

      stats.percentage = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0

      return stats
    },
  })
}

// Student Calendar Hooks
export function useStudentCalendar() {
  return useQuery({
    queryKey: ['studentCalendar'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Get student's school and grade from student_schools (primary source of truth)
      const { data: studentSchool } = await supabase
        .from('student_schools')
        .select('school_id, grade')
        .eq('student_id', user.id)
        .eq('is_active', true)
        .single()

      if (!studentSchool) return []
      
      const studentData = {
        school_id: studentSchool.school_id,
        grade: studentSchool.grade
      }

      // Get class schedules for student's classes
      const { data: schedules } = await supabase
        .from('class_schedules')
        .select(`
          *,
          classes!inner(class_name, grade, subject, school_id),
          periods(period_name, start_time, end_time)
        `)
        .eq('classes.school_id', studentData.school_id)
        .eq('classes.grade', studentData.grade)

      // Get assignment due dates - use student's enrolled courses
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      // Get student's enrolled courses from student_courses table
      const { data: studentCourses } = await supabase
        .from('student_courses')
        .select('course_id')
        .eq('student_id', authUser?.id || '')
        .eq('is_completed', false)

      // Also check enrollments table for compatibility
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', authUser?.id || '')
        .eq('status', 'active')

      // Combine course IDs from both tables
      const courseIds = new Set<string>()
      studentCourses?.forEach(sc => {
        if (sc.course_id) courseIds.add(sc.course_id)
      })
      enrollments?.forEach(e => {
        if (e.course_id) courseIds.add(e.course_id)
      })

      // Only fetch assignments for student's enrolled courses
       
      let assignments: Assignment[] = []
      if (courseIds.size > 0) {
        const { data: assignmentsData } = await supabase
          .from('assignments')
          .select('id, title, due_date, assignment_type')
          .in('course_id', Array.from(courseIds))
          .gte('due_date', new Date().toISOString())
          .eq('is_published', true)
          .order('due_date', { ascending: true })
          .limit(20)
        
        assignments = (assignmentsData as Assignment[]) || []
      }

      // Combine events
      interface CalendarEvent {
        id: string;
        type: 'class' | 'assignment';
        title: string;
        date: string | null;
        day_of_week?: string;
        start_time?: string;
        end_time?: string;
        subject?: string;
        grade?: string;
        assignment_type?: string;
      }
       
      const events: CalendarEvent[] = []

      // Add class schedule events
       
      schedules?.forEach((schedule: Schedule) => {
        events.push({
          id: schedule.id,
          type: 'class',
          title: schedule.classes?.class_name || 'Class',
          date: null, // Recurring based on day_of_week
          day_of_week: schedule.day_of_week,
          start_time: schedule.periods?.start_time || schedule.start_time,
          end_time: schedule.periods?.end_time || schedule.end_time,
          subject: schedule.classes?.subject,
          grade: schedule.classes?.grade
        })
      })

      // Add assignment due date events
       
      assignments?.forEach((assignment: Assignment) => {
        events.push({
          id: assignment.id,
          type: 'assignment',
          title: assignment.title,
          date: assignment.due_date,
          assignment_type: assignment.assignment_type
        })
      })

      return events
    },
  })
}

// Get dashboard statistics - uses same API endpoints as other hooks for consistency
export function useStudentDashboardStats() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['studentDashboardStats'],
    retry: 2,
    retryDelay: 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Get session token for API calls
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No session token available')
      }

      // Use same API endpoints as useStudentCourses and useStudentAssignments for consistency
      // This ensures we get data from enrollments, student_courses, AND course_access
      
      // 1. Get active courses count - use API endpoint (same as useStudentCourses)
      let activeCoursesCount = 0
      let completedCoursesCount = 0
      try {
        const coursesResponse = await fetchWithCsrf('/api/student/courses', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (coursesResponse.ok) {
          const coursesResult = await coursesResponse.json()
          const courses: Course[] = coursesResult.courses || []
          
          // Count courses that are not completed (progress < 100%)
          activeCoursesCount = courses.filter((c: Course) => {
            const progress = c.progress_percentage || 0
            return progress < 100
          }).length
          
          console.log('📊 [useStudentDashboardStats] Active courses count:', {
            totalCourses: courses.length,
            activeCourses: activeCoursesCount
          })
          
          // Calculate completed courses count (progress >= 100% or status === 'completed')
          completedCoursesCount = courses.filter((c: Course) => {
            const progress = c.progress_percentage || 0
            const status = c.status || ''
            return progress >= 100 || status === 'completed'
          }).length
          
          console.log('📊 [useStudentDashboardStats] Completed courses count:', completedCoursesCount)
        } else {
          console.warn('⚠️ [useStudentDashboardStats] Courses API call failed')
        }
      } catch (error) {
        console.error('❌ [useStudentDashboardStats] Error fetching courses:', error)
      }

      // 2. Get assignments - use API endpoint (same as useStudentAssignments)
      // This ensures we get ALL assignments the student has access to
      let pendingAssignmentsCount = 0
      let completedAssignmentsCount = 0
      
      try {
        const assignmentsResponse = await fetchWithCsrf('/api/student/assignments', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (assignmentsResponse.ok) {
          const assignmentsResult = await assignmentsResponse.json()
          const assignments = assignmentsResult.assignments || []
          
          // Count pending assignments (not_started or in_progress)
          pendingAssignmentsCount = assignments.filter((a: { status: string }) => {
            return a.status === 'not_started' || a.status === 'in_progress'
          }).length
          
          // Count completed assignments (submitted or graded)
          completedAssignmentsCount = assignments.filter((a: { status: string }) => {
            return a.status === 'submitted' || a.status === 'graded'
          }).length
          
          console.log('📊 [useStudentDashboardStats] Assignments stats:', {
            totalAssignments: assignments.length,
            pending: pendingAssignmentsCount,
            completed: completedAssignmentsCount
          })
        } else {
          console.warn('⚠️ [useStudentDashboardStats] Assignments API call failed')
        }
      } catch (error) {
        console.error('❌ [useStudentDashboardStats] Error fetching assignments:', error)
      }

      // 3. Get attendance stats
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      
      const { data: attendance } = await supabase
        .from('attendance')
        .select('status')
        .eq('user_id', user.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])

      const presentCount = attendance?.filter((a: Attendance) => a.status === 'Present').length || 0
      const totalCount = attendance?.length || 0

      // 4. Get average grade
      interface GradedSubmission {
        grade: number;
      }
      const { data: gradedSubmissions } = await supabase
        .from('submissions')
        .select('grade')
        .eq('student_id', user.id)
        .not('grade', 'is', null)

      const avgGrade = gradedSubmissions && gradedSubmissions.length > 0
        ? gradedSubmissions.reduce((sum: number, s: GradedSubmission) => sum + (s.grade || 0), 0) / gradedSubmissions.length
        : 0

      return {
        activeCourses: activeCoursesCount,
        pendingAssignments: pendingAssignmentsCount,
        attendancePercentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
        averageGrade: Math.round(avgGrade),
        completedAssignments: completedAssignmentsCount,
        completedCourses: completedCoursesCount
      }
    },
  })

  // Set up realtime subscriptions for automatic updates
  useEffect(() => {
    // Subscribe to course changes
    const coursesChannel = supabase
      .channel('dashboard-courses-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'courses',
        },
        () => {
          console.log('🔄 [Dashboard] Course updated, refreshing stats')
          queryClient.invalidateQueries({ queryKey: ['studentDashboardStats'] })
          queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'course_progress',
        },
        () => {
          console.log('🔄 [Dashboard] Course progress updated, refreshing stats')
          queryClient.invalidateQueries({ queryKey: ['studentDashboardStats'] })
        }
      )
      .subscribe()

    // Subscribe to assignment changes
    const assignmentsChannel = supabase
      .channel('dashboard-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments',
        },
        () => {
          console.log('🔄 [Dashboard] Assignment updated, refreshing stats')
          queryClient.invalidateQueries({ queryKey: ['studentDashboardStats'] })
          queryClient.invalidateQueries({ queryKey: ['studentAssignments'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'submissions',
        },
        () => {
          console.log('🔄 [Dashboard] Submission updated, refreshing stats')
          queryClient.invalidateQueries({ queryKey: ['studentDashboardStats'] })
          queryClient.invalidateQueries({ queryKey: ['studentAssignments'] })
        }
      )
      .subscribe()

    // Subscribe to grade changes
    const gradesChannel = supabase
      .channel('dashboard-grades-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'submissions',
          filter: 'grade=not.is.null',
        },
        () => {
          console.log('🔄 [Dashboard] Grade updated, refreshing stats')
          queryClient.invalidateQueries({ queryKey: ['studentDashboardStats'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(coursesChannel)
      supabase.removeChannel(assignmentsChannel)
      supabase.removeChannel(gradesChannel)
    }
  }, [queryClient])

  return query
}

// Student Notifications Hooks
export function useStudentNotifications() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['studentNotifications'],
    retry: 2,
    retryDelay: 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const { data } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, type, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      return data || []
    },
  })

  // Set up realtime subscription for notification updates
  useEffect(() => {
     
    let channel: RealtimeChannel | null = null

    const setupSubscription = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) return

      channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('🔄 Notification updated via realtime:', payload)
            queryClient.invalidateQueries({ queryKey: ['studentNotifications'] })
          }
        )
        .subscribe()
    }

    setupSubscription()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [queryClient])

  return query
}

// Student Certificates Hooks
export function useStudentCertificates() {
  return useQuery({
    queryKey: ['studentCertificates'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // First get certificates
      const { data: certificates, error: certError } = await supabase
        .from('certificates')
        .select(`
          id,
          certificate_name,
          certificate_url,
          issued_at,
          course_id,
          profiles!certificates_issued_by_fkey(full_name)
        `)
        .eq('student_id', user.id)
        .order('issued_at', { ascending: false })

      if (certError || !certificates) {
        console.error('Error fetching certificates:', certError)
        return []
      }

      // Then fetch course details for each certificate
      const courseIds = certificates
        .map(cert => cert.course_id)
        .filter((id): id is string => !!id)

      let coursesMap = new Map()
      if (courseIds.length > 0) {
        const { data: courses } = await supabase
          .from('courses')
          .select('id, name, title, grade, subject')
          .in('id', courseIds)

        if (courses) {
          coursesMap = new Map(courses.map(course => [course.id, course]))
        }
      }

      // Combine certificates with course data
      const data = certificates.map(cert => ({
        ...cert,
        courses: coursesMap.get(cert.course_id) || null,
      }))

      return data

      return data || []
    },
  })
}

// Mutations
export function useUpdateStudentProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contentId, isCompleted, timeSpent }: {
      contentId: string
      isCompleted: boolean
      timeSpent?: number
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const { data } = await supabase
        .from('student_progress')
        .upsert({
          student_id: user.id,
          content_id: contentId,
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          time_spent_minutes: timeSpent || 0
        })

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentCourses'] })
      queryClient.invalidateQueries({ queryKey: ['courseChapters'] })
    },
  })
}

export function useSubmitAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assignmentId, answers, fileUrl, textContent }: {
      assignmentId: string
      answers?: Record<string, unknown>
      fileUrl?: string
      textContent?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Get session token for API call
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No session token available')
      }

      // Use API endpoint for submission (includes auto-grading)
      const response = await fetchWithCsrf(`/api/student/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          answers,
          fileUrl,
          textContent
        })
      })

      if (!response.ok) {
        const error = await response.json() as ErrorResponse
        const errorMessage = error.details || error.error || 'Failed to submit assignment'
        const errorWithDetails = new Error(errorMessage) as Error & { details?: string; status?: number }
        if (error.details) errorWithDetails.details = error.details
        errorWithDetails.status = response.status
        throw errorWithDetails
      }

      const data = await response.json()
      return data
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['studentAssignments'] })
      queryClient.invalidateQueries({ queryKey: ['studentAssignment', variables.assignmentId] })
    },
  })
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { data } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentNotifications'] })
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: { full_name?: string; email?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const { data } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentProfile'] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
       
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw error;
      }

      // Update force_password_change to false
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ force_password_change: false })
        .eq('id', userData.user.id);

      if (profileError) {
        console.error('Error updating force_password_change:', profileError);
        // Don't throw - password was updated successfully
      }

      return data;
    },
  })
}

// Enhanced hooks with real-time synchronization
export function useCourseWithRealtime(courseId: string) {
  // Always call hooks (React rules), but guard inside
  const courseQuery = useStudentCourse(courseId || '');
  const { isConnected } = useCourseRealtimeSync({
    courseId: courseId || '',
    enabled: !!courseId,
  });

  // Return error state if courseId is invalid
  if (!courseId) {
    return {
      ...courseQuery,
      data: null,
      error: new Error('Course ID is required'),
      isSynced: false,
    };
  }

  return {
    ...courseQuery,
    isSynced: isConnected,
  };
}

export function useChapterContents(chapterId: string, courseId?: string) {
  const queryClient = useQueryClient();

  const cacheConfig = getCacheConfig('chapterContent')
  const query = useQuery({
    queryKey: ['chapterContents', chapterId, courseId],
    queryFn: async () => {
      if (!chapterId) {
        console.log('🔍 [useChapterContents] No chapterId provided, returning empty array')
        return [];
      }
      
      console.log(`🔍 [useChapterContents] Starting fetch for chapter ${chapterId}${courseId ? ` (courseId provided: ${courseId})` : ''}`)
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ [useChapterContents] No user found')
        throw new Error('No user found');
      }

      console.log(`✅ [useChapterContents] User authenticated: ${user.id}`)

      // Get session token for API call
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        console.error('❌ [useChapterContents] No session token available')
        throw new Error('No session token available')
      }

      console.log(`✅ [useChapterContents] Session token available`)

      // Use provided courseId if available, otherwise try to determine it
      let resolvedCourseId: string | null = courseId || null;
      
      // If courseId was provided, use it directly
      if (resolvedCourseId) {
        console.log(`✅ [useChapterContents] Using provided courseId: ${resolvedCourseId}`)
      } else {
        // First, try to get the chapter to find the course_id
        try {
          console.log(`🔍 [useChapterContents] Fetching chapter ${chapterId} to get course_id...`)
          const { data: chapter, error: chapterError } = await supabase
            .from('chapters')
            .select('id, course_id, name, title')
            .eq('id', chapterId)
            .maybeSingle();

          if (chapterError) {
            console.warn('⚠️ [useChapterContents] Error fetching chapter (will try to infer courseId):', chapterError);
          } else if (chapter?.course_id) {
            resolvedCourseId = chapter.course_id;
            console.log(`✅ [useChapterContents] Chapter found, course_id: ${resolvedCourseId}`)
          } else {
            console.warn('⚠️ [useChapterContents] Chapter not found or missing course_id')
          }
        } catch (error) {
          console.warn('⚠️ [useChapterContents] Exception fetching chapter:', error);
        }

        // If we couldn't get courseId from chapter, try to infer it from URL
        if (!resolvedCourseId && typeof window !== 'undefined') {
          // Try multiple URL patterns to match different route structures
          const urlPatterns = [
            /\/my-courses\/([^\/]+)/,  // /student/my-courses/[courseId]
            /\/courses\/([^\/]+)/,      // /student/courses/[courseId] (legacy)
            /\/student\/courses\/([^\/]+)/, // /student/courses/[courseId] (full path)
          ];
          
          for (const pattern of urlPatterns) {
            const pathMatch = window.location.pathname.match(pattern);
            if (pathMatch) {
              resolvedCourseId = pathMatch[1];
              console.log(`🔍 [useChapterContents] Inferred courseId from URL (pattern: ${pattern}): ${resolvedCourseId}`)
              break;
            }
          }
        }
      }

      if (!resolvedCourseId) {
        console.error('❌ [useChapterContents] Could not determine courseId')
        throw new Error('Could not determine course ID for this chapter');
      }

      // Use API endpoint to bypass RLS and avoid timeouts
      console.log(`🔄 [useChapterContents] Fetching contents from API: /api/student/courses/${resolvedCourseId}/chapters/${chapterId}/contents`)
      
      try {
        const response = await fetchWithCsrf(`/api/student/courses/${resolvedCourseId}/chapters/${chapterId}/contents`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        console.log(`📡 [useChapterContents] API response status: ${response.status}`)

        if (!response.ok) {
          const errorText = await response.text()
          let error: ErrorResponse
          try {
            error = JSON.parse(errorText) as ErrorResponse
          } catch {
            error = { error: 'Unknown error', details: errorText }
          }
          
          console.error('❌ [useChapterContents] API error:', {
            status: response.status,
            error,
            url: `/api/student/courses/${resolvedCourseId}/chapters/${chapterId}/contents`
          })
          
          // If access denied, throw specific error
          if (response.status === 403 || error.code === 'NO_ACCESS') {
            throw new Error(error.details || error.error || 'You do not have access to this content')
          }
          
          if (response.status === 404) {
            console.warn('⚠️ [useChapterContents] Chapter or course not found, returning empty array')
            return []
          }
          
          throw new Error(error.error || error.details || `API error: ${response.status}`)
        }

        const result = await response.json()
        console.log(`✅ [useChapterContents] API response:`, {
          contentsCount: result.contents?.length || 0,
          totalContents: result.total_contents,
          chapterId: result.chapter_id,
          courseId: result.course_id
        })
        
        // API endpoint returns all content types (chapter_contents, videos, materials, assignments)
        interface ContentItem {
          id: string;
          title: string;
          content_type: string;
          source?: string;
          order_index?: number;
          created_at?: string;
        }
        const allContents: ContentItem[] = [...(result.contents || [])]
        
        console.log(`✅ [useChapterContents] Total content items from API: ${allContents.length}`)
        
        if (allContents.length > 0) {
          console.log(`📋 [useChapterContents] Content types found:`, 
            allContents.map((c: ContentItem) => ({ id: c.id, title: c.title, type: c.content_type, source: c.source }))
          )
        }
        
        // Sort all contents by order_index (API should already sort, but ensure it)
        allContents.sort((a: ContentItem, b: ContentItem) => {
          const orderA = a.order_index || 0;
          const orderB = b.order_index || 0;
          if (orderA !== orderB) return orderA - orderB;
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateA - dateB;
        });

        return allContents;
      } catch (fetchError) {
        console.error('❌ [useChapterContents] Fetch error:', fetchError)
        throw fetchError
      }
    },
    enabled: !!chapterId,
    staleTime: cacheConfig.staleTime,
    gcTime: cacheConfig.cacheTime,
    retry: (failureCount, error) => {
      console.log(`🔄 [useChapterContents] Retry attempt ${failureCount} for chapter ${chapterId}:`, error)
      return failureCount < 2 // Retry up to 2 times
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Set up realtime subscription for chapter contents
  useEffect(() => {
    if (!chapterId) return;

    const channel = supabase
      .channel(`chapter-contents-${chapterId}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapter_contents',
          filter: `chapter_id=eq.${chapterId}`,
        },
        (payload) => {
          console.log('🔄 Chapter content updated via realtime:', payload);
          queryClient.invalidateQueries({ queryKey: ['chapterContents', chapterId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chapterId, queryClient]);

  return query;
}

export function useCourseMaterials(courseId: string) {
  const queryClient = useQueryClient();

  const cacheConfig = getCacheConfig('materials')
  const query = useQuery({
    queryKey: ['courseMaterials', courseId],
    queryFn: async () => {
      if (!courseId) {
        return [];
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      // Get all chapters for this course
      const { data: chapters } = await supabase
        .from('chapters')
        .select('id')
        .eq('course_id', courseId);

      if (!chapters || chapters.length === 0) {
        return [];
      }

      const chapterIds = chapters.map((c) => c.id);

      // Fetch materials for all chapters
      const { data: materials, error } = await supabase
        .from('materials')
        .select('*')
        .in('chapter_id', chapterIds)
        .eq('is_published', true)
        .order('order_index', { ascending: true });

      if (error) throw error;

      return materials || [];
    },
    enabled: !!courseId,
    staleTime: cacheConfig.staleTime,
    gcTime: cacheConfig.cacheTime,
  });

  // Set up realtime subscription for materials
  useEffect(() => {
    if (!courseId) return;

    const channel = supabase
      .channel(`course-materials-${courseId}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'materials',
        },
        async (payload) => {
          // Check if material belongs to this course
          if (payload.new && 'chapter_id' in payload.new) {
            const { data: chapter } = await supabase
              .from('chapters')
              .select('course_id')
              .eq('id', payload.new.chapter_id)
              .single();

            if (chapter && chapter.course_id === courseId) {
              console.log('🔄 Course material updated via realtime:', payload);
              queryClient.invalidateQueries({ queryKey: ['courseMaterials', courseId] });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId, queryClient]);

  return query;
}


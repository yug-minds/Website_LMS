import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTeacherUserId, validateTeacherSchoolAccess } from '../../../../lib/teacher-auth';
import { parsePaginationParams, createPaginationResponse, PaginationLimits } from '../../../../lib/pagination';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { teacherClassAssignmentSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
export async function GET(request: NextRequest) {
  
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

try {
    console.log('🔍 GET /api/teacher/classes - Starting request');
    
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      console.error('❌ No teacher ID found');
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    console.log('✅ Teacher ID:', teacherId);

    // Parse pagination parameters
    const pagination = parsePaginationParams(request, PaginationLimits.MEDIUM, PaginationLimits.MAX);

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id');
    const grade = searchParams.get('grade');
    const subject = searchParams.get('subject');

    console.log('📋 Query params:', { schoolId, grade, subject, limit: pagination.limit, offset: pagination.offset });

    // If school_id is provided, validate that teacher is assigned to that school
    // Use a more lenient check - check if teacher has schedules or teacher_schools entry
    // But don't block the request - we'll filter by school_id in the query anyway
    if (schoolId) {
      try {
        const hasAccess = await validateTeacherSchoolAccess(schoolId, request);
        console.log('🔐 School access validation result:', hasAccess);
        
        // If validation fails, check if teacher has schedules in this school (fallback)
        if (!hasAccess) {
          console.log('⚠️ Access validation failed, checking schedules...');
          const { data: schedules, error: scheduleError } = await supabaseAdmin
            .from('class_schedules')
            .select('id')
            .eq('teacher_id', teacherId)
            .eq('school_id', schoolId)
             
            .limit(1) as any;
          
          if (scheduleError) {
            console.error('❌ Error checking schedules:', scheduleError);
          }
          
          console.log('📅 Schedules found:', schedules?.length || 0);
          
          if (!schedules || schedules.length === 0) {
            // Check teacher_schools to verify teacher is assigned to this school
            console.log('⚠️ No schedules found, checking teacher_schools...');
            const { data: teacherSchool, error: teacherSchoolError } = await supabaseAdmin
              .from('teacher_schools')
              .select('school_id')
              .eq('teacher_id', teacherId)
              .eq('school_id', schoolId)
               
              .maybeSingle() as any;
            
            if (teacherSchoolError) {
              console.error('❌ Error checking teacher_schools:', teacherSchoolError);
            }
            
            // If teacher is not assigned to this school via teacher_schools, log a warning
            if (!teacherSchool) {
              console.warn(`⚠️ Teacher ${teacherId} may not be assigned to school ${schoolId} via teacher_schools, but continuing to fetch classes...`);
              // Don't return 403 - let the query handle it and return empty results if needed
            }
          }
        }
       
      } catch (validationError: any) {
        logger.warn('Error during school validation (non-critical)', {
          endpoint: '/api/teacher/classes',
        }, validationError instanceof Error ? validationError : new Error(String(validationError)));
        // Don't fail completely - continue and try to fetch classes anyway
      }
    }

    // Build query - filter by teacher_id and optionally by school_id
    let query = supabaseAdmin
      .from('teacher_classes')
      .select(`
        *,
        classes (
          id,
          class_name,
          grade,
          subject,
          max_students,
          created_at
        ),
        schools (
          id,
          name,
          school_code
        )
      `)
      .eq('teacher_id', teacherId)
      .order('assigned_at', { ascending: false });

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    // Build schedule query (independent of teacher_classes query)
    const scheduleQuery = supabaseAdmin
      .from('class_schedules')
      .select(`
        id,
        subject,
        grade,
        school_id,
        day_of_week,
        start_time,
        end_time,
        class:classes!class_id (
          id,
          class_name,
          grade,
          subject,
          max_students,
          academic_year,
          is_active
        )
      `)
      .eq('teacher_id', teacherId)
      .eq('is_active', true);

    if (schoolId) {
      scheduleQuery.eq('school_id', schoolId);
    }

    // Parallelize teacher_classes and schedules queries
    console.log('🔍 Executing teacher_classes and schedules queries in parallel...');
    const [
      { data: teacherClasses, error },
      { data: schedules, error: schedulesError }
    ] = await Promise.all([
      query,
      scheduleQuery
    ]);

     
    let teacherClassesData: any[] = [];

    if (error) {
      console.error('❌ Error fetching teacher classes:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      // Don't return immediately - try to fetch from schedules as fallback
      console.log('⚠️ teacher_classes query failed, will try fetching from schedules...');
      teacherClassesData = [];
    } else {
      teacherClassesData = teacherClasses || [];
      console.log('✅ Teacher classes fetched from teacher_classes:', teacherClassesData.length);
    }

    if (schedulesError) {
      console.error('❌ Error fetching schedules:', schedulesError);
      console.error('Schedule error details:', {
        message: schedulesError.message,
        details: schedulesError.details,
        hint: schedulesError.hint,
        code: schedulesError.code
      });
    }

    console.log('📅 Schedules found:', schedules?.length || 0);

     
    const classesFromSchedules: any[] = [];
    
    if (!schedulesError && schedules && schedules.length > 0) {
      // Create a class entry for each schedule (so each schedule shows as a separate class)
       
      schedules.forEach((schedule: any) => {
        const classData = schedule.class;
        const formatTime = (time: string) => {
          if (!time) return '';
          const [hours, minutes] = time.split(':');
          const hour = parseInt(hours);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour % 12 || 12;
          return `${displayHour}:${minutes} ${ampm}`;
        };
        
        const timeStr = schedule.start_time && schedule.end_time 
          ? `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`
          : '';
        
        if (classData && classData.id) {
          // If schedule has an associated class, create a unique entry per schedule
          classesFromSchedules.push({
            id: `${classData.id}-${schedule.id}`, // Unique ID per schedule
            schedule_id: schedule.id,
            class_id: classData.id,
            class_name: `${classData.class_name || `${schedule.subject} - ${schedule.grade}`} (${schedule.day_of_week}${timeStr ? ` ${timeStr}` : ''})`,
            grade: classData.grade || schedule.grade,
            subject: classData.subject || schedule.subject,
            max_students: classData.max_students || 30,
            description: classData.description || `Class for ${schedule.subject} - ${schedule.grade} on ${schedule.day_of_week}`,
            is_active: classData.is_active !== undefined ? classData.is_active : true,
            academic_year: classData.academic_year || '2024-25',
            school_id: schedule.school_id,
            day_of_week: schedule.day_of_week,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            from_schedule: true
          });
        } else {
          // If no class exists, create a virtual class from schedule data
          classesFromSchedules.push({
            id: `schedule-${schedule.id}`, // Unique ID per schedule
            schedule_id: schedule.id,
            class_id: null,
            class_name: `${schedule.subject} - ${schedule.grade} (${schedule.day_of_week}${timeStr ? ` ${timeStr}` : ''})`,
            grade: schedule.grade,
            subject: schedule.subject,
            max_students: 30,
            description: `Class for ${schedule.subject} - ${schedule.grade} on ${schedule.day_of_week}`,
            is_active: true,
            academic_year: '2024-25',
            school_id: schedule.school_id,
            day_of_week: schedule.day_of_week,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            from_schedule: true
          });
        }
      });

      console.log('✅ Classes derived from schedules:', classesFromSchedules.length);
      if (classesFromSchedules.length > 0) {
        console.log('📋 Sample schedule class:', classesFromSchedules[0]);
      }
    } else {
      console.log('⚠️ No schedules found or error occurred');
    }

    // Transform teacher_classes data first
     
    const transformedTeacherClasses = (teacherClassesData || []).map((tc: any) => {
      const classData = Array.isArray(tc.classes) ? tc.classes[0] : tc.classes;
      const schoolData = Array.isArray(tc.schools) ? tc.schools[0] : tc.schools;
      
      // Ensure we have valid class data
      if (!classData) {
        console.warn('Missing class data for teacher_class:', tc.id);
        return null;
      }
      
      return {
        id: classData.id || tc.class_id,
        class_id: tc.class_id,
        class_name: classData.class_name || 'Unnamed Class',
        grade: classData.grade || '',
        subject: classData.subject || '',
        max_students: classData.max_students || 0,
        description: classData.description || '',
        is_active: classData.is_active !== undefined ? classData.is_active : true,
        academic_year: classData.academic_year || '2024-25',
        school_id: tc.school_id || schoolData?.id,
        school: schoolData,
        assignment: {
          id: tc.id,
          assigned_at: tc.assigned_at,
          is_primary: tc.is_primary
        },
        from_schedule: false
      };
     
    }).filter((c: any) => c !== null);

    console.log('✅ Transformed teacher_classes:', transformedTeacherClasses.length);

    // Combine classes from both sources
    // For schedules, we want to show each schedule as a separate class entry
    // For teacher_classes, we'll add them but prioritize schedule-based classes
    const classMap = new Map();
    
    // First, add classes from schedules (each schedule is a separate class entry)
     
    classesFromSchedules.forEach((cls: any) => {
      // Use schedule_id as key to ensure each schedule is unique
      const key = cls.schedule_id || cls.id;
      if (!classMap.has(key)) {
        classMap.set(key, cls);
      }
    });
    
    // Then, add classes from teacher_classes (only if not already present from schedules)
     
    transformedTeacherClasses.forEach((cls: any) => {
      // Check if this class is already represented by a schedule
       
      const scheduleExists = classesFromSchedules.some((s: any) => 
        s.class_id === cls.class_id || 
        (s.class_id === null && s.subject === cls.subject && s.grade === cls.grade && s.school_id === cls.school_id)
      );
      
      // Only add if not already represented by a schedule
      if (!scheduleExists) {
        const key = cls.class_id || `${cls.subject}-${cls.grade}-${cls.school_id}`;
        if (!classMap.has(key)) {
          classMap.set(key, cls);
        }
      }
    });

    const allClasses = Array.from(classMap.values());
    console.log('✅ Combined and deduplicated classes:', allClasses.length);

    // Filter by grade and subject if provided
    let filteredClasses = allClasses;
    
    if (grade) {
       
      filteredClasses = filteredClasses.filter((cls: any) => cls.grade === grade);
    }
    
    if (subject) {
       
      filteredClasses = filteredClasses.filter((cls: any) => cls.subject === subject);
    }

    // Apply pagination
    const totalClasses = filteredClasses.length;
    const paginatedClasses = filteredClasses.slice(
      pagination.offset,
      pagination.offset + pagination.limit
    );

    console.log('✅ Transformed classes:', totalClasses, `(showing ${paginatedClasses.length} with pagination)`);
    if (paginatedClasses.length > 0) {
      console.log('📋 Sample class:', paginatedClasses[0]);
    }

    // Create paginated response
    const paginatedResponse = createPaginationResponse(
      paginatedClasses,
      totalClasses,
      pagination
    );

    return NextResponse.json(paginatedResponse);
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/classes', {
      endpoint: '/api/teacher/classes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/classes' },
      'Failed to fetch teacher classes'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function POST(request: NextRequest) {
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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

try {
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(teacherClassAssignmentSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for teacher class assignment', {
        endpoint: '/api/teacher/classes',
        errors: errorMessages,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const {
      school_id,
      class_id,
      assigned_at
    } = validation.data;

    // Validate that teacher is assigned to this school
    const hasAccess = await validateTeacherSchoolAccess(school_id, request);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Teacher is not assigned to this school' },
        { status: 403 }
      );
    }

    // Check if teacher is already assigned to this class
    const { data: existingAssignment } = await supabaseAdmin
      .from('teacher_classes')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('class_id', class_id)
       
      .single() as any;

    if (existingAssignment) {
      return NextResponse.json(
        { error: 'Teacher is already assigned to this class' },
        { status: 400 }
      );
    }

    // Assign teacher to class (using admin client to bypass RLS)
     
    const { data: assignment, error } = await ((supabaseAdmin as any)
      .from('teacher_classes')
      .insert({
        teacher_id: teacherId, // Use authenticated teacher_id
        school_id,
        class_id,
        assigned_at: assigned_at || new Date().toISOString()
      })
      .select()
       
      .single() as any) as any;

    if (error) {
      logger.error('Failed to assign teacher to class', {
        endpoint: '/api/teacher/classes',
        teacherId,
        schoolId: school_id,
        classId: class_id,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/classes', teacherId, schoolId: school_id, classId: class_id },
        'Failed to assign teacher to class'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Teacher assigned to class successfully', {
      endpoint: '/api/teacher/classes',
      teacherId,
      assignmentId: assignment?.id,
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    logger.error('Unexpected error in POST /api/teacher/classes', {
      endpoint: '/api/teacher/classes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/classes' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function DELETE(request: NextRequest) {
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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

try {
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignment_id');

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    // Verify the assignment belongs to this teacher before deleting
    const { data: assignment, error: fetchError } = await supabaseAdmin
      .from('teacher_classes')
      .select('teacher_id')
      .eq('id', assignmentId)
       
      .single() as any;

    if (fetchError || !assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      );
    }

    if (assignment.teacher_id !== teacherId) {
      return NextResponse.json(
        { error: 'Forbidden: You can only delete your own assignments' },
        { status: 403 }
      );
    }

    // Delete the assignment (using admin client to bypass RLS)
    const { error } = await supabaseAdmin
      .from('teacher_classes')
      .delete()
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId); // Double-check it's the teacher's assignment

    if (error) {
      console.error('Error removing teacher from class:', error);
      return NextResponse.json({ error: 'Failed to remove teacher from class' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Teacher removed from class successfully' });
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/teacher/classes', {
      endpoint: '/api/teacher/classes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/classes' },
      'Failed to delete class assignment'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
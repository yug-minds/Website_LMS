import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { logger } from '../../../../lib/logger';

export async function GET(request: NextRequest) {
  try {
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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id');
    const courseId = searchParams.get('course_id');
    const studentId = searchParams.get('student_id');

    // Verify teacher has access to the school
    const { data: teacherSchool, error: teacherError } = await supabaseAdmin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', user.id)
      .eq('school_id', schoolId)
      .maybeSingle();

    if (teacherError || !teacherSchool) {
      return NextResponse.json(
        { error: 'Forbidden', details: 'Teacher does not have access to this school' },
        { status: 403 }
      );
    }

    // Build the query for student progress
    let query = supabaseAdmin
      .from('student_schools')
      .select(`
        student_id,
        grade,
        profiles!inner(
          id,
          full_name,
          email
        )
      `)
      .eq('school_id', schoolId)
      .eq('is_active', true);

    // If specific student requested, filter by student
    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data: students, error: studentsError } = await query;

    if (studentsError) {
      logger.error('Error fetching students', { teacherId: user.id, schoolId: schoolId || undefined }, studentsError);
      return NextResponse.json(
        { error: 'Failed to fetch students' },
        { status: 500 }
      );
    }

    if (!students || students.length === 0) {
      return NextResponse.json({
        students: [],
        message: 'No students found for this school'
      });
    }

    // Get student IDs for progress queries
    const studentIds = students.map((s: any) => s.student_id);

    // Get enrollments for all students
    let enrollmentsQuery = supabaseAdmin
      .from('enrollments')
      .select(`
        student_id,
        course_id,
        progress_percentage,
        last_accessed,
        status,
        enrolled_on,
        courses!inner(
          id,
          course_name,
          name,
          num_chapters,
          status,
          is_published
        )
      `)
      .in('student_id', studentIds)
      .eq('status', 'active');

    // If specific course requested, filter by course
    if (courseId) {
      enrollmentsQuery = enrollmentsQuery.eq('course_id', courseId);
    }

    const { data: enrollments, error: enrollmentsError } = await enrollmentsQuery;

    if (enrollmentsError) {
      logger.error('Error fetching enrollments', { teacherId: user.id, schoolId: schoolId || undefined }, enrollmentsError);
      return NextResponse.json(
        { error: 'Failed to fetch student enrollments' },
        { status: 500 }
      );
    }

    // ALSO get course_access based courses for students who may not have explicit enrollments
    const grades = [...new Set(students.map((s: any) => s.grade))];

    const { data: courseAccessEntries } = await supabaseAdmin
      .from('course_access')
      .select(`
        course_id,
        school_id,
        grade,
        courses!inner(
          id,
          course_name,
          name,
          num_chapters,
          status,
          is_published
        )
      `)
      .eq('school_id', schoolId)
      .in('grade', grades)
      .eq('courses.is_published', true);

    // Create virtual enrollments for students with course_access but no explicit enrollment
    const virtualEnrollments: any[] = [];
    if (courseAccessEntries && courseAccessEntries.length > 0) {
      for (const student of students) {
        const studentEnrollmentCourseIds = enrollments
          ?.filter((e: any) => e.student_id === student.student_id)
          .map((e: any) => e.course_id) || [];

        // Find course_access entries matching this student's grade
        const matchingAccess = courseAccessEntries.filter((ca: any) => 
          ca.grade === student.grade || 
          ca.grade.toLowerCase().replace(/^grade\s*/i, '') === student.grade.toLowerCase().replace(/^grade\s*/i, '')
        );

        for (const access of matchingAccess) {
          if (!studentEnrollmentCourseIds.includes(access.course_id)) {
            virtualEnrollments.push({
              student_id: student.student_id,
              course_id: access.course_id,
              progress_percentage: 0,
              last_accessed: null,
              status: 'active',
              enrolled_on: null,
              courses: access.courses
            });
          }
        }
      }
    }

    // Combine real enrollments with virtual enrollments
    const allEnrollments = [...(enrollments || []), ...virtualEnrollments];

    // Get course IDs for chapter progress (from combined enrollments)
    const courseIds = [...new Set(allEnrollments?.map((e: any) => e.course_id) || [])];

    // Get chapters for progress calculation
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('id, course_id, is_published')
      .in('course_id', courseIds.length > 0 ? courseIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('is_published', true);

    // Get course progress for all students
    const { data: courseProgress } = await supabaseAdmin
      .from('course_progress')
      .select('student_id, chapter_id, completed, course_id')
      .in('student_id', studentIds);

    // Process and enrich student data with progress
    const studentsWithProgress = students.map((student: any) => {
      const studentEnrollments = allEnrollments?.filter((e: any) => e.student_id === student.student_id) || [];
      
      const coursesProgress = studentEnrollments.map((enrollment: any) => {
        const course = enrollment.courses;
        const courseChapters = chapters?.filter((ch: any) => ch.course_id === course.id) || [];
        const totalChapters = courseChapters.length;
        
        // Get completed chapters for this student and course
        const chapterIds = courseChapters.map((ch: any) => ch.id);
        const completedChapters = courseProgress?.filter((cp: any) => 
          cp.student_id === student.student_id && 
          chapterIds.includes(cp.chapter_id) && 
          cp.completed
        ).length || 0;

        // Calculate actual progress percentage
        const actualProgress = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

        return {
          course_id: course.id,
          course_name: course.course_name || course.name,
          total_chapters: totalChapters,
          completed_chapters: completedChapters,
          progress_percentage: actualProgress,
          last_accessed: enrollment.last_accessed,
          enrolled_on: enrollment.enrolled_on,
          status: actualProgress === 100 ? 'completed' : 
                  actualProgress > 0 ? 'in_progress' : 'not_started'
        };
      });

      // Calculate overall progress for the student
      const totalCourses = coursesProgress.length;
      const completedCourses = coursesProgress.filter((cp: any) => cp.status === 'completed').length;
      const inProgressCourses = coursesProgress.filter((cp: any) => cp.status === 'in_progress').length;
      const averageProgress = totalCourses > 0 
        ? Math.round(coursesProgress.reduce((sum: number, cp: any) => sum + cp.progress_percentage, 0) / totalCourses)
        : 0;

      return {
        student_id: student.student_id,
        full_name: student.profiles.full_name,
        email: student.profiles.email,
        grade: student.grade,
        total_courses: totalCourses,
        completed_courses: completedCourses,
        in_progress_courses: inProgressCourses,
        average_progress: averageProgress,
        courses: coursesProgress,
        last_activity: coursesProgress.length > 0 
          ? new Date(Math.max(...coursesProgress.map((cp: any) => new Date(cp.last_accessed || 0).getTime())))
          : null
      };
    });

    // Sort by average progress (highest first) then by name
    studentsWithProgress.sort((a: any, b: any) => {
      if (a.average_progress !== b.average_progress) {
        return b.average_progress - a.average_progress;
      }
      return a.full_name.localeCompare(b.full_name);
    });

    return NextResponse.json({
      students: studentsWithProgress,
      summary: {
        total_students: studentsWithProgress.length,
        students_with_progress: studentsWithProgress.filter((s: any) => s.average_progress > 0).length,
        students_completed: studentsWithProgress.filter((s: any) => s.average_progress === 100).length,
        average_class_progress: studentsWithProgress.length > 0 
          ? Math.round(studentsWithProgress.reduce((sum: number, s: any) => sum + s.average_progress, 0) / studentsWithProgress.length)
          : 0
      }
    });

  } catch (error) {
    logger.error('Error in teacher student progress API', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
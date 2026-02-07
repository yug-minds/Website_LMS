import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { logger } from '../../../../lib/logger';

type TeacherSchoolRow = { school_id?: string | null; grades_assigned?: string[] | null; grade_sections_assigned?: string | unknown[] | null };
type StudentSchoolRow = { student_id?: string; grade?: string | null; section?: string | null; profiles?: { id?: string; full_name?: string | null; email?: string | null } | null };
type CourseAccessRow = { course_id?: string; grade?: string | null; courses?: unknown };
type EnrollmentRow = { student_id?: string; course_id?: string; grade?: string | null };

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
    const section = searchParams.get('section');

    if (!schoolId) {
      return NextResponse.json(
        { error: 'Bad Request', details: 'school_id is required' },
        { status: 400 }
      );
    }

    // Verify teacher has access to the school and get assignments
    const { data: teacherSchoolData, error: teacherError } = await supabaseAdmin
      .from('teacher_schools')
      .select('school_id, grades_assigned, grade_sections_assigned')
      .eq('teacher_id', user.id)
      .eq('school_id', schoolId)
      .maybeSingle();

    const teacherSchool = teacherSchoolData as TeacherSchoolRow | null;
    if (teacherError || !teacherSchool) {
      return NextResponse.json(
        { error: 'Forbidden', details: 'Teacher does not have access to this school' },
        { status: 403 }
      );
    }

    // Parse grade_sections_assigned if it's a string
    const gradeSections = teacherSchool.grade_sections_assigned 
      ? (typeof teacherSchool.grade_sections_assigned === 'string' 
          ? JSON.parse(teacherSchool.grade_sections_assigned) 
          : teacherSchool.grade_sections_assigned)
      : [];

    // Build the query for student progress
    let query = supabaseAdmin
      .from('student_schools')
      .select(`
        student_id,
        grade,
        section,
        profiles!inner(
          id,
          full_name,
          email
        )
      `)
      .eq('school_id', schoolId as string)
      .eq('is_active', true);

    // Filter by grades first (from either grade_sections_assigned or grades_assigned)
    const assignedGrades: string[] = [];
    if (gradeSections.length > 0) {
      (gradeSections as GradeSection[]).forEach((gs: GradeSection) => {
        if (gs.grade && !assignedGrades.includes(gs.grade)) {
          assignedGrades.push(gs.grade);
        }
      });
    }
    
    if (assignedGrades.length === 0 && teacherSchool.grades_assigned && Array.isArray(teacherSchool.grades_assigned)) {
      assignedGrades.push(...(teacherSchool.grades_assigned as string[]));
    }

    if (assignedGrades.length > 0) {
      query = query.in('grade', assignedGrades);
    }

    // If specific student requested, filter by student
    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    // Filter by section if specified (additional filter on top of teacher assignments)
    if (section) {
      query = query.eq('section', section);
    }

    const { data: students, error: studentsError } = await query;

    if (studentsError) {
      logger.error('Error fetching students', { teacherId: user.id, schoolId: schoolId || undefined }, studentsError);
      return NextResponse.json(
        { error: 'Failed to fetch students' },
        { status: 500 }
      );
    }

    // Filter by teacher's grade-section assignments in JavaScript
    // This ensures students match both grade AND section
    let filteredStudents: StudentSchoolRow[] = (students || []) as StudentSchoolRow[];
    if (gradeSections.length > 0 && students && students.length > 0) {
      const gsList = gradeSections as GradeSection[];
      filteredStudents = filteredStudents.filter((student: StudentSchoolRow) => {
        return gsList.some((gs: GradeSection) => {
          if (gs.grade !== student.grade) return false;
          // If sections array is empty or not specified, include all sections for this grade
          if (!gs.sections || gs.sections.length === 0) return true;
          // Otherwise, section must be in the assigned sections
          return gs.sections.includes(student.section ?? '');
        });
      });
    }

    if (!filteredStudents || filteredStudents.length === 0) {
      return NextResponse.json({
        students: [],
        message: 'No students found matching teacher assignments'
      });
    }

    // Get student IDs for progress queries
    const studentIds = filteredStudents.map((s: StudentSchoolRow) => s.student_id).filter((id): id is string => id != null);

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
    const grades = [...new Set(filteredStudents.map((s: StudentSchoolRow) => s.grade ?? '').filter(Boolean))];

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
      .eq('school_id', schoolId as string)
      .in('grade', grades)
      .eq('courses.is_published', true);

    const studentsTyped = (students || []) as StudentSchoolRow[];
    const courseAccessTyped = (courseAccessEntries || []) as CourseAccessRow[];
    const enrollmentsTyped = (enrollments || []) as EnrollmentRow[];

    // Create virtual enrollments for students with course_access but no explicit enrollment
    const virtualEnrollments: VirtualEnrollment[] = [];
    if (courseAccessTyped.length > 0) {
      for (const student of studentsTyped) {
        const studentEnrollmentCourseIds = enrollmentsTyped
          .filter((e) => e.student_id === student.student_id)
          .map((e) => e.course_id) || [];

        const studentGrade = student.grade ?? '';
        // Find course_access entries matching this student's grade
        const matchingAccess = courseAccessTyped.filter((ca) => 
          (ca.grade ?? '') === studentGrade || 
          (ca.grade ?? '').toLowerCase().replace(/^grade\s*/i, '') === studentGrade.toLowerCase().replace(/^grade\s*/i, '')
        );

        for (const access of matchingAccess) {
          const accessCourseId = access.course_id;
          if (accessCourseId && !studentEnrollmentCourseIds.includes(accessCourseId)) {
            virtualEnrollments.push({
              student_id: student.student_id,
              course_id: accessCourseId,
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
    const courseIds = [...new Set((allEnrollments?.map((e: VirtualEnrollment | EnrollmentRow) => e.course_id).filter((id): id is string => id != null) || []))];

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

    const chaptersTyped = (chapters || []) as ChapterRow[];
    const courseProgressTyped = (courseProgress || []) as CourseProgressRow[];

    // Process and enrich student data with progress
    const studentsWithProgress = filteredStudents.map((student: StudentSchoolRow): StudentWithProgress => {
      const studentEnrollments = (allEnrollments?.filter((e: VirtualEnrollment | EnrollmentRow) => e.student_id === student.student_id) || []) as (VirtualEnrollment | EnrollmentRow)[];
      
      const coursesProgress: CourseProgressItem[] = studentEnrollments.map((enrollment: VirtualEnrollment | EnrollmentRow) => {
        const course = (enrollment as VirtualEnrollment).courses as { id: string; course_name?: string; name?: string } | undefined;
        if (!course?.id) {
          return {
            course_id: enrollment.course_id ?? '',
            course_name: undefined,
            total_chapters: 0,
            completed_chapters: 0,
            progress_percentage: 0,
            last_accessed: (enrollment as VirtualEnrollment).last_accessed,
            enrolled_on: (enrollment as VirtualEnrollment).enrolled_on,
            status: 'not_started'
          };
        }
        const courseChapters = chaptersTyped.filter((ch: ChapterRow) => ch.course_id === course.id);
        const totalChapters = courseChapters.length;
        
        // Get completed chapters for this student and course
        const chapterIds = courseChapters.map((ch: ChapterRow) => ch.id);
        const completedChapters = courseProgressTyped.filter((cp: CourseProgressRow) =>
          cp.student_id === student.student_id &&
          chapterIds.includes(cp.chapter_id) &&
          cp.completed
        ).length;

        // Calculate actual progress percentage
        const actualProgress = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

        return {
          course_id: course.id,
          course_name: course.course_name || course.name,
          total_chapters: totalChapters,
          completed_chapters: completedChapters,
          progress_percentage: actualProgress,
          last_accessed: (enrollment as VirtualEnrollment).last_accessed,
          enrolled_on: (enrollment as VirtualEnrollment).enrolled_on,
          status: actualProgress === 100 ? 'completed' :
                  actualProgress > 0 ? 'in_progress' : 'not_started'
        };
      });

      // Calculate overall progress for the student
      const totalCourses = coursesProgress.length;
      const completedCourses = coursesProgress.filter((cp: CourseProgressItem) => cp.status === 'completed').length;
      const inProgressCourses = coursesProgress.filter((cp: CourseProgressItem) => cp.status === 'in_progress').length;
      const averageProgress = totalCourses > 0
        ? Math.round(coursesProgress.reduce((sum: number, cp: CourseProgressItem) => sum + cp.progress_percentage, 0) / totalCourses)
        : 0;

      return {
        student_id: student.student_id,
        full_name: student.profiles?.full_name,
        email: student.profiles?.email,
        grade: student.grade,
        total_courses: totalCourses,
        completed_courses: completedCourses,
        in_progress_courses: inProgressCourses,
        average_progress: averageProgress,
        courses: coursesProgress,
        last_activity: coursesProgress.length > 0
          ? new Date(Math.max(...coursesProgress.map((cp: CourseProgressItem) => new Date(cp.last_accessed || 0).getTime())))
          : null
      };
    });

    // Sort by average progress (highest first) then by name
    studentsWithProgress.sort((a: StudentWithProgress, b: StudentWithProgress) => {
      if (a.average_progress !== b.average_progress) {
        return b.average_progress - a.average_progress;
      }
      return (a.full_name ?? '').localeCompare(b.full_name ?? '');
    });

    return NextResponse.json({
      students: studentsWithProgress,
      summary: {
        total_students: studentsWithProgress.length,
        students_with_progress: studentsWithProgress.filter((s: StudentWithProgress) => s.average_progress > 0).length,
        students_completed: studentsWithProgress.filter((s: StudentWithProgress) => s.average_progress === 100).length,
        average_class_progress: studentsWithProgress.length > 0
          ? Math.round(studentsWithProgress.reduce((sum: number, s: StudentWithProgress) => sum + s.average_progress, 0) / studentsWithProgress.length)
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
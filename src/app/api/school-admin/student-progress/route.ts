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
    const courseId = searchParams.get('course_id');
    const grade = searchParams.get('grade');
    const teacherId = searchParams.get('teacher_id');
    const section = searchParams.get('section');

    // Get school admin's school
    const { data: adminSchool, error: adminError } = await supabaseAdmin
      .from('school_admins')
      .select('school_id')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (adminError || !adminSchool) {
      return NextResponse.json(
        { error: 'Forbidden', details: 'User is not a school admin or school not found' },
        { status: 403 }
      );
    }

    type AdminSchoolRow = { school_id?: string | null };
    const schoolId = (adminSchool as AdminSchoolRow).school_id;
    if (schoolId == null || schoolId === '') {
      return NextResponse.json(
        { error: 'School not found or school_id missing' },
        { status: 404 }
      );
    }

    // Build the query for students in this school
    let studentsQuery = supabaseAdmin
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
      .eq('school_id', schoolId)
      .eq('is_active', true);

    // Filter by grade if specified
    if (grade) {
      studentsQuery = studentsQuery.eq('grade', grade);
    }

    // Filter by section if specified
    if (section) {
      studentsQuery = studentsQuery.eq('section', section);
    }

    const { data: students, error: studentsError } = await studentsQuery;

    if (studentsError) {
      logger.error('Error fetching students', { adminId: user.id, schoolId: schoolId || undefined }, studentsError);
      return NextResponse.json(
        { error: 'Failed to fetch students' },
        { status: 500 }
      );
    }

    if (!students || students.length === 0) {
      return NextResponse.json({
        students: [],
        teachers: [],
        courses: [],
        summary: {
          total_students: 0,
          students_with_progress: 0,
          students_completed: 0,
          average_school_progress: 0,
          total_courses: 0,
          total_teachers: 0
        }
      });
    }

    // Get student IDs for progress queries
    type Student = {
      student_id: string;
      grade?: string | null;
      section?: string | null;
      profiles?: {
        id: string;
        full_name?: string | null;
        email?: string | null;
      } | null;
    };
    const typedStudents = (students || []) as Student[];
    const studentIds = typedStudents.map((s) => s.student_id);

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
      logger.error('Error fetching enrollments', { adminId: user.id, schoolId: schoolId || undefined }, enrollmentsError);
      return NextResponse.json(
        { error: 'Failed to fetch student enrollments' },
        { status: 500 }
      );
    }

    // ALSO get course_access based courses for students who may not have explicit enrollments
    const grades = [...new Set(typedStudents.map((s) => s.grade).filter((g): g is string => g != null))];

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
    type EnrollmentWithCourse = {
      student_id: string;
      course_id: string;
      progress_percentage?: number | null;
      last_accessed?: string | null;
      status?: string | null;
      enrolled_on?: string | null;
      courses?: {
        id: string;
        course_name?: string | null;
        name?: string | null;
        num_chapters?: number | null;
        status?: string | null;
        is_published?: boolean | null;
      } | null;
    };
    type CourseAccessEntry = {
      course_id: string;
      school_id?: string | null;
      grade?: string | null;
      courses?: {
        id: string;
        course_name?: string | null;
        name?: string | null;
        num_chapters?: number | null;
        status?: string | null;
        is_published?: boolean | null;
      } | null;
    };
    type VirtualEnrollment = {
      student_id: string;
      course_id: string;
      progress_percentage: number;
      last_accessed: null;
      status: string;
      enrolled_on: null;
      courses?: {
        id: string;
        course_name?: string | null;
        name?: string | null;
        num_chapters?: number | null;
        status?: string | null;
        is_published?: boolean | null;
      } | null;
    };
    const typedEnrollments = (enrollments || []) as EnrollmentWithCourse[];
    const virtualEnrollments: VirtualEnrollment[] = [];
    if (courseAccessEntries && courseAccessEntries.length > 0) {
      const typedCourseAccessEntries = (courseAccessEntries || []) as CourseAccessEntry[];
      for (const student of typedStudents) {
        const studentEnrollmentCourseIds = typedEnrollments
          .filter((e) => e.student_id === student.student_id)
          .map((e) => e.course_id);

        // Find course_access entries matching this student's grade
        const matchingAccess = typedCourseAccessEntries.filter((ca) => {
          const studentGrade = student.grade || '';
          const accessGrade = ca.grade || '';
          return accessGrade === studentGrade || 
                 accessGrade.toLowerCase().replace(/^grade\s*/i, '') === studentGrade.toLowerCase().replace(/^grade\s*/i, '');
        });

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
    const allEnrollments: Array<EnrollmentWithCourse | VirtualEnrollment> = [...typedEnrollments, ...virtualEnrollments];

    // Get course IDs for chapter progress (from combined enrollments)
    const courseIds = [...new Set(allEnrollments.map((e) => e.course_id))];

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

    // Get teachers for this school
    let teachersQuery = supabaseAdmin
      .from('teacher_schools')
      .select(`
        teacher_id,
        profiles!teacher_schools_teacher_id_fkey(
          id,
          full_name,
          email
        )
      `)
      .eq('school_id', schoolId);

    // Filter by teacher if specified
    if (teacherId) {
      teachersQuery = teachersQuery.eq('teacher_id', teacherId);
    }

    const { data: teachers } = await teachersQuery;

    // Get courses available to this school (only published courses)
    const { data: schoolCourses } = await supabaseAdmin
      .from('course_access')
      .select(`
        course_id,
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
      .eq('courses.is_published', true);

    // Process and enrich student data with progress
    type Chapter = {
      id: string;
      course_id: string;
      is_published?: boolean | null;
    };
    type CourseProgressItem = {
      student_id: string;
      chapter_id: string;
      completed?: boolean | null;
      course_id?: string | null;
    };
    type CourseProgress = {
      course_id: string;
      course_name: string | null;
      total_chapters: number;
      completed_chapters: number;
      progress_percentage: number;
      last_accessed: string | null;
      enrolled_on: string | null;
      status: string;
    };
    type EnrollmentWithDates = { last_accessed?: string | null; enrolled_on?: string | null };
    const studentsWithProgress = typedStudents.map((student) => {
      const studentEnrollments = allEnrollments.filter((e) => e.student_id === student.student_id);
      
      const coursesProgress = studentEnrollments.map((enrollment): CourseProgress => {
        const course = enrollment.courses;
        if (!course) {
          throw new Error('Course data missing in enrollment');
        }
        const typedChapters = (chapters || []) as Chapter[];
        const courseChapters = typedChapters.filter((ch) => ch.course_id === course.id);
        const totalChapters = courseChapters.length;
        
        // Get completed chapters for this student and course
        const chapterIds = courseChapters.map((ch) => ch.id);
        const typedCourseProgress = (courseProgress || []) as CourseProgressItem[];
        const completedChapters = typedCourseProgress.filter((cp) => 
          cp.student_id === student.student_id && 
          chapterIds.includes(cp.chapter_id) && 
          cp.completed
        ).length;

        // Calculate actual progress percentage
        const actualProgress = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

        const enr = enrollment as EnrollmentWithDates;
        const lastAccessed: string | null = enr.last_accessed === undefined ? null : (enr.last_accessed ?? null);
        const enrolledOn: string | null = enr.enrolled_on === undefined ? null : (enr.enrolled_on ?? null);
        const courseName = (course as { course_name?: string; name?: string }).course_name || (course as { name?: string }).name;
        return {
          course_id: course.id ?? '',
          course_name: (courseName ?? null) as string | null,
          total_chapters: totalChapters,
          completed_chapters: completedChapters,
          progress_percentage: actualProgress,
          last_accessed: lastAccessed,
          enrolled_on: enrolledOn,
          status: actualProgress === 100 ? 'completed' : 
                  actualProgress > 0 ? 'in_progress' : 'not_started'
        };
      });

      // Calculate overall progress for the student
      const totalCourses = coursesProgress.length;
      const completedCourses = coursesProgress.filter((cp) => cp.status === 'completed').length;
      const inProgressCourses = coursesProgress.filter((cp) => cp.status === 'in_progress').length;
      const averageProgress = totalCourses > 0 
        ? Math.round(coursesProgress.reduce((sum: number, cp) => sum + cp.progress_percentage, 0) / totalCourses)
        : 0;

      const profile = student.profiles;
      return {
        student_id: student.student_id,
        full_name: profile?.full_name != null ? profile.full_name : null,
        email: profile?.email != null ? profile.email : null,
        grade: student.grade ?? null,
        total_courses: totalCourses,
        completed_courses: completedCourses,
        in_progress_courses: inProgressCourses,
        average_progress: averageProgress,
        courses: coursesProgress,
        last_activity: coursesProgress.length > 0 
          ? new Date(Math.max(...coursesProgress.map((cp: { last_accessed?: string | null }) => new Date(cp.last_accessed || 0).getTime())))
          : null
      };
    });

    // Sort by average progress (highest first) then by name
    type StudentWithProgressItem = {
      student_id: string;
      full_name: string | null;
      email: string | null;
      grade: string | null;
      total_courses: number;
      completed_courses: number;
      in_progress_courses: number;
      average_progress: number;
      courses: CourseProgress[];
      last_activity: Date | null;
    };
    studentsWithProgress.sort((a: StudentWithProgressItem, b: StudentWithProgressItem) => {
      const aAvg = a.average_progress;
      const bAvg = b.average_progress;
      if (aAvg !== bAvg) {
        return bAvg - aAvg;
      }
      return (a.full_name ?? '').localeCompare(b.full_name ?? '');
    });

    // Process courses data - deduplicate by course_id (same course can appear for different grades)
    const coursesMap = new Map<string, {
      course_id: string;
      course_name: string;
      grade: string;
      total_chapters: number;
      enrolled_students: number;
      completed_students: number;
      average_progress: number;
      completion_rate: number;
    }>();
    interface SchoolCourseRow {
      grade?: string | null;
      courses?: {
        id?: string;
        course_name?: string | null;
        name?: string | null;
        num_chapters?: number | null;
        is_published?: boolean | null;
      } | null;
    }
    
    (schoolCourses || []).forEach((sc: SchoolCourseRow) => {
      const course = sc.courses;
      if (!course || course.is_published !== true) return;
      
      const courseId = course.id;
      if (courseId && !coursesMap.has(courseId)) {
        type StudentWithCourses = StudentWithProgressItem & { courses?: CourseProgress[] };
        
        const studentsInCourse = studentsWithProgress.filter((s: StudentWithCourses) => 
          s.courses?.some((c: CourseProgress) => c.course_id === courseId)
        );
        
        const totalStudentsInCourse = studentsInCourse.length;
        const completedStudents = studentsInCourse.filter((s: StudentWithCourses) => 
          s.courses?.find((c: CourseProgress) => c.course_id === courseId)?.status === 'completed'
        ).length;
        
        const averageCourseProgress = totalStudentsInCourse > 0
          ? Math.round(studentsInCourse.reduce((sum: number, s: StudentWithCourses) => {
              const courseProgress = s.courses?.find((c: CourseProgress) => c.course_id === courseId);
              const pct = courseProgress?.progress_percentage ?? 0;
              return sum + Number(pct);
            }, 0) / totalStudentsInCourse)
          : 0;

        coursesMap.set(courseId as string, {
          course_id: courseId,
          course_name: course.course_name || course.name || '',
          grade: sc.grade ?? '',
          total_chapters: course.num_chapters ?? 0,
          enrolled_students: totalStudentsInCourse,
          completed_students: completedStudents,
          average_progress: averageCourseProgress,
          completion_rate: totalStudentsInCourse > 0 
            ? Math.round((completedStudents / totalStudentsInCourse) * 100)
            : 0
        });
      }
    });
    const coursesData = Array.from(coursesMap.values());

    // Process teachers data
    interface TeacherWithProfile {
      teacher_id?: string;
      profiles?: {
        full_name?: string;
        email?: string;
      };
    }
    
    const teachersData = (teachers || []).map((t: TeacherWithProfile) => ({
      teacher_id: t.teacher_id,
      full_name: t.profiles?.full_name ?? null,
      email: t.profiles?.email ?? null
    }));

    // Get accurate total student count from database (all active students in school)
    const { count: totalStudentsCount } = await supabaseAdmin
      .from('student_schools')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_active', true);

    // Filter students with enrollments for progress calculations
    const studentsWithEnrollments = studentsWithProgress.filter((s: StudentWithProgressItem) => s.total_courses > 0);

    // Calculate school average for all students with enrollments (includes those with 0% progress)
    const averageSchoolProgress = studentsWithEnrollments.length > 0
      ? Math.round(studentsWithEnrollments.reduce((sum: number, s: StudentWithProgressItem) => sum + s.average_progress, 0) / studentsWithEnrollments.length)
      : 0;

    return NextResponse.json({
      students: studentsWithProgress,
      teachers: teachersData,
      courses: coursesData,
      summary: {
        total_students: totalStudentsCount || students.length, // Use database count for accuracy
        students_with_progress: studentsWithEnrollments.filter((s: StudentWithProgressItem) => s.average_progress > 0).length,
        students_completed: studentsWithEnrollments.filter((s: StudentWithProgressItem) => s.average_progress === 100).length,
        average_school_progress: averageSchoolProgress,
        total_courses: coursesData.length,
        total_teachers: teachersData.length
      }
    });

  } catch (error) {
    logger.error('Error in school admin student progress API', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
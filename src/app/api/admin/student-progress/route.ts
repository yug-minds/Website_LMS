import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { logger } from '../../../../lib/logger';

// Type definitions
interface Student {
  student_id: string;
  school_id: string;
  grade: string;
  section?: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
  };
  schools: {
    id: string;
    name: string;
  };
}

interface Enrollment {
  student_id: string;
  course_id: string;
  last_accessed?: string;
  enrolled_on?: string;
  courses: {
    id: string;
    course_name?: string;
    name?: string;
  };
}

interface Chapter {
  id: string;
  course_id: string;
}

interface CourseProgress {
  student_id: string;
  chapter_id: string;
  completed: boolean;
}

interface CourseProgressData {
  course_id: string;
  course_name: string | undefined;
  total_chapters: number;
  completed_chapters: number;
  progress_percentage: number;
  last_accessed?: string;
  enrolled_on?: string;
  status: 'completed' | 'in_progress' | 'not_started';
}

interface StudentWithProgress {
  student_id: string;
  full_name: string;
  email: string;
  grade: string;
  school_id: string;
  school_name: string;
  total_courses: number;
  completed_courses: number;
  in_progress_courses: number;
  average_progress: number;
  courses: CourseProgressData[];
  last_activity: Date | null;
}

interface School {
  id: string;
  name: string;
}

interface Course {
  id: string;
  course_name?: string;
  name?: string;
  num_chapters?: number;
}

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
    const grade = searchParams.get('grade');
    const section = searchParams.get('section');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Verify user is admin (check if user exists in admin table or has admin role)
    const { data: adminCheck, error: adminError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (adminError || !adminCheck) {
      return NextResponse.json(
        { error: 'Forbidden', details: 'User is not a system admin' },
        { status: 403 }
      );
    }

    // Build the query for students across all schools (or specific school)
    let studentsQuery = supabaseAdmin
      .from('student_schools')
      .select(`
        student_id,
        school_id,
        grade,
        section,
        profiles!inner(
          id,
          full_name,
          email
        ),
        schools!inner(
          id,
          name
        )
      `)
      .eq('is_active', true);

    // Filter by school if specified
    if (schoolId) {
      studentsQuery = studentsQuery.eq('school_id', schoolId);
    }

    // Filter by grade if specified
    if (grade) {
      studentsQuery = studentsQuery.eq('grade', grade);
    }

    // Filter by section if specified
    if (section) {
      studentsQuery = studentsQuery.eq('section', section);
    }

    // Apply pagination
    studentsQuery = studentsQuery.range(offset, offset + limit - 1);

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
        schools: [],
        courses: [],
        summary: {
          total_students: 0,
          students_with_progress: 0,
          students_completed: 0,
          average_system_progress: 0,
          total_schools: 0,
          total_courses: 0
        },
        pagination: {
          limit,
          offset,
          total: 0,
          hasMore: false
        }
      });
    }

    // Get student IDs for progress queries
    type StudentData = { student_id: string; school_id: string | null; grade: string | null; section: string | null };
    const studentIds = (students as StudentData[]).map((s) => s.student_id);

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
      logger.error('Error fetching enrollments', { adminId: user.id }, enrollmentsError);
      return NextResponse.json(
        { error: 'Failed to fetch student enrollments' },
        { status: 500 }
      );
    }

    // ALSO get course_access based courses for students who may not have explicit enrollments
    // This ensures we capture progress for students accessing courses via school/grade access
    const typedStudents = students as StudentData[];
    const schoolIds = [...new Set(typedStudents.map((s) => s.school_id).filter((id): id is string => id !== null))];
    const grades = [...new Set(typedStudents.map((s) => s.grade).filter((grade): grade is string => grade !== null))];

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
      .in('school_id', schoolIds)
      .in('grade', grades)
      .eq('courses.is_published', true);

    // Create virtual enrollments for students with course_access but no explicit enrollment
    // IMPORTANT: Only create virtual enrollments when there's an explicit course_access entry
    // matching both school_id AND grade - this ensures only eligible students get enrolled
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
      school_id: string | null;
      grade: string | null;
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
    const virtualEnrollments: VirtualEnrollment[] = [];
    const typedEnrollments = (enrollments || []) as EnrollmentWithCourse[];
    if (courseAccessEntries && courseAccessEntries.length > 0) {
      const typedCourseAccessEntries = (courseAccessEntries || []) as CourseAccessEntry[];
      for (const student of typedStudents) {
        const studentEnrollmentCourseIds = typedEnrollments
          .filter((e) => e.student_id === student.student_id)
          .map((e) => e.course_id);

        // Normalize grade strings for comparison
        const normalizeGrade = (grade: string) => {
          if (!grade) return '';
          return grade.toLowerCase().replace(/^grade\s*/i, '').trim();
        };
        
        const studentGradeNormalized = normalizeGrade(student.grade || '');

        // Find course_access entries matching this student's school and grade EXACTLY
        const matchingAccess = typedCourseAccessEntries.filter((ca) => {
          const gradeMatch = ca.grade === student.grade || 
                           normalizeGrade(ca.grade || '') === studentGradeNormalized;
          const schoolMatch = ca.school_id === student.school_id;
          
          // Only match if BOTH school and grade match exactly
          return schoolMatch && gradeMatch && ca.courses?.is_published === true;
        });

        for (const access of matchingAccess) {
          // Only add if student doesn't already have an enrollment for this course
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
    
    logger.info('Virtual enrollments created', {
      totalStudents: typedStudents.length,
      courseAccessEntries: courseAccessEntries?.length || 0,
      virtualEnrollmentsCreated: virtualEnrollments.length,
      realEnrollments: enrollments?.length || 0
    });

    // Combine real enrollments with virtual enrollments
    const allEnrollments: Array<EnrollmentWithCourse | VirtualEnrollment> = [...(typedEnrollments || []), ...virtualEnrollments];

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

    // Get all schools for summary
    const { data: allSchools } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('is_active', true);

    // Get all courses for summary
    const { data: allCourses } = await supabaseAdmin
      .from('courses')
      .select('id, course_name, name, num_chapters, status, is_published')
      .eq('is_published', true);

    // Process and enrich student data with progress
    const studentsWithProgress = students.map((student: Student) => {
      const studentEnrollments = (allEnrollments as Enrollment[] | undefined)?.filter((e: Enrollment) => e.student_id === student.student_id) || [];
      
      const coursesProgress = studentEnrollments.map((enrollment: Enrollment) => {
        const course = enrollment.courses;
        const courseChapters = (chapters as Chapter[] | undefined)?.filter((ch: Chapter) => ch.course_id === course.id) || [];
        const totalChapters = courseChapters.length;
        
        // Get completed chapters for this student and course
        const chapterIds = courseChapters.map((ch: Chapter) => ch.id);
        const completedChapters = (courseProgress as CourseProgress[] | undefined)?.filter((cp: CourseProgress) => 
          cp.student_id === student.student_id && 
          chapterIds.includes(cp.chapter_id) && 
          cp.completed
        ).length || 0;

        // Calculate actual progress percentage
        const actualProgress = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

        const status: 'completed' | 'in_progress' | 'not_started' = 
          actualProgress === 100 ? 'completed' : 
          actualProgress > 0 ? 'in_progress' : 'not_started';
        
        return {
          course_id: course.id,
          course_name: course.course_name || course.name,
          total_chapters: totalChapters,
          completed_chapters: completedChapters,
          progress_percentage: actualProgress,
          last_accessed: enrollment.last_accessed,
          enrolled_on: enrollment.enrolled_on,
          status
        } as CourseProgressData;
      });

      // Calculate overall progress for the student
      const totalCourses = coursesProgress.length;
      const completedCourses = coursesProgress.filter((cp: CourseProgressData) => cp.status === 'completed').length;
      const inProgressCourses = coursesProgress.filter((cp: CourseProgressData) => cp.status === 'in_progress').length;
      const averageProgress = totalCourses > 0 
        ? Math.round(coursesProgress.reduce((sum: number, cp: CourseProgressData) => sum + cp.progress_percentage, 0) / totalCourses)
        : 0;

      return {
        student_id: student.student_id,
        full_name: student.profiles.full_name,
        email: student.profiles.email,
        grade: student.grade,
        school_id: student.school_id,
        school_name: student.schools.name,
        total_courses: totalCourses,
        completed_courses: completedCourses,
        in_progress_courses: inProgressCourses,
        average_progress: averageProgress,
        courses: coursesProgress,
        last_activity: coursesProgress.length > 0 
          ? new Date(Math.max(...coursesProgress.map((cp: CourseProgressData) => new Date(cp.last_accessed || 0).getTime())))
          : null
      };
    });

    // Filter out students with no enrollments (no courses) - only show students who are actually enrolled
    const studentsWithEnrollments = studentsWithProgress.filter((student: StudentWithProgress) => student.total_courses > 0);
    
    logger.info('Filtered students with enrollments', {
      totalStudents: studentsWithProgress.length,
      studentsWithEnrollments: studentsWithEnrollments.length,
      studentsWithoutEnrollments: studentsWithProgress.length - studentsWithEnrollments.length
    });

    // Sort by average progress (highest first) then by name
    studentsWithEnrollments.sort((a: StudentWithProgress, b: StudentWithProgress) => {
      if (a.average_progress !== b.average_progress) {
        return b.average_progress - a.average_progress;
      }
      return a.full_name.localeCompare(b.full_name);
    });

    // Get total count for pagination - count only students with enrollments
    // We need to count students who have enrollments or virtual enrollments
    const enrolledStudentIds = [...new Set((allEnrollments as Enrollment[] | undefined)?.map((e: Enrollment) => e.student_id) || [])];
    
    let totalStudents = studentsWithEnrollments.length;
    
    // If we have enrolled student IDs and need pagination, get accurate count from DB
    if (enrolledStudentIds.length > 0) {
      let countQuery = supabaseAdmin
        .from('student_schools')
        .select('student_id', { count: 'exact', head: true })
        .eq('is_active', true)
        .in('student_id', enrolledStudentIds);

      if (schoolId) {
        countQuery = countQuery.eq('school_id', schoolId);
      }
      if (grade) {
        countQuery = countQuery.eq('grade', grade);
      }

      const { count } = await countQuery;
      if (count !== null && count !== undefined) {
        totalStudents = count;
      }
    }

    // Process schools data - only count students with enrollments
    const schoolsData = (allSchools as School[] | undefined)?.map((school: School) => {
      const studentsInSchool = studentsWithEnrollments.filter((s: StudentWithProgress) => s.school_id === school.id);
      const totalStudentsInSchool = studentsInSchool.length;
      const averageSchoolProgress = totalStudentsInSchool > 0
        ? Math.round(studentsInSchool.reduce((sum: number, s: StudentWithProgress) => sum + s.average_progress, 0) / totalStudentsInSchool)
        : 0;

      return {
        school_id: school.id,
        school_name: school.name,
        total_students: totalStudentsInSchool,
        average_progress: averageSchoolProgress
      };
    }) || [];

    // Process courses data - only count students with enrollments
    const coursesData = (allCourses as Course[] | undefined)?.map((course: Course) => {
      const studentsInCourse = studentsWithEnrollments.filter((s: StudentWithProgress) => 
        s.courses.some((c: CourseProgressData) => c.course_id === course.id)
      );
      
      const totalStudentsInCourse = studentsInCourse.length;
      const completedStudents = studentsInCourse.filter((s: StudentWithProgress) => 
        s.courses.find((c: CourseProgressData) => c.course_id === course.id)?.status === 'completed'
      ).length;
      
      const averageCourseProgress = totalStudentsInCourse > 0
        ? Math.round(studentsInCourse.reduce((sum: number, s: StudentWithProgress) => {
            const courseProgress = s.courses.find((c: CourseProgressData) => c.course_id === course.id);
            return sum + (courseProgress?.progress_percentage || 0);
          }, 0) / totalStudentsInCourse)
        : 0;

      return {
        course_id: course.id,
        course_name: course.course_name || course.name,
        total_chapters: course.num_chapters || 0,
        enrolled_students: totalStudentsInCourse,
        completed_students: completedStudents,
        average_progress: averageCourseProgress,
        completion_rate: totalStudentsInCourse > 0 
          ? Math.round((completedStudents / totalStudentsInCourse) * 100)
          : 0
      };
    }) || [];

    return NextResponse.json({
      students: studentsWithEnrollments, // Only return students with enrollments
      schools: schoolsData,
      courses: coursesData,
      summary: {
        total_students: totalStudents || studentsWithEnrollments.length,
        students_with_progress: studentsWithEnrollments.filter((s: StudentWithProgress) => s.average_progress > 0).length,
        students_completed: studentsWithEnrollments.filter((s: StudentWithProgress) => s.average_progress === 100).length,
        average_system_progress: studentsWithEnrollments.length > 0 
          ? Math.round(studentsWithEnrollments.reduce((sum: number, s: StudentWithProgress) => sum + s.average_progress, 0) / studentsWithEnrollments.length)
          : 0,
        total_schools: schoolsData.length,
        total_courses: coursesData.length
      },
      pagination: {
        limit,
        offset,
        total: totalStudents || studentsWithEnrollments.length,
        hasMore: (offset + limit) < (totalStudents || studentsWithEnrollments.length)
      }
    });

  } catch (error) {
    logger.error('Error in admin student progress API', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
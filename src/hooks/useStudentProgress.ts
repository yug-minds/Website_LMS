/**
 * React Query hooks for Student Progress tracking across dashboards
 * Provides data fetching for teachers, school admins, and system admins
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWithCsrf } from '../lib/csrf-client';

// ==================== Types ====================

export interface StudentProgressData {
  student_id: string;
  full_name: string;
  email: string;
  grade: string;
  school_id?: string;
  school_name?: string;
  total_courses: number;
  completed_courses: number;
  in_progress_courses: number;
  average_progress: number;
  courses: CourseProgress[];
  last_activity: Date | null;
}

export interface CourseProgress {
  course_id: string;
  course_name: string;
  total_chapters: number;
  completed_chapters: number;
  progress_percentage: number;
  last_accessed: string;
  enrolled_on: string;
  status: 'completed' | 'in_progress' | 'not_started';
}

export interface ProgressSummary {
  total_students: number;
  students_with_progress: number;
  students_completed: number;
  average_school_progress?: number;
  average_system_progress?: number;
  total_courses: number;
  total_teachers?: number;
  total_schools?: number;
}

export interface TeacherProgressResponse {
  students: StudentProgressData[];
  summary: ProgressSummary;
}

export interface SchoolAdminProgressResponse {
  students: StudentProgressData[];
  teachers: Array<{
    teacher_id: string;
    full_name: string;
    email: string;
  }>;
  courses: Array<{
    course_id: string;
    course_name: string;
    grade: string;
    total_chapters: number;
    enrolled_students: number;
    completed_students: number;
    average_progress: number;
    completion_rate: number;
  }>;
  summary: ProgressSummary;
}

export interface AdminProgressResponse {
  students: StudentProgressData[];
  schools: Array<{
    school_id: string;
    school_name: string;
    total_students: number;
    average_progress: number;
  }>;
  courses: Array<{
    course_id: string;
    course_name: string;
    total_chapters: number;
    enrolled_students: number;
    completed_students: number;
    average_progress: number;
    completion_rate: number;
  }>;
  summary: ProgressSummary;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

// ==================== Teacher Hooks ====================

/**
 * Get student progress for teachers
 * Shows progress of students in teacher's assigned classes
 */
export function useTeacherStudentProgress(
  schoolId?: string,
  filters?: {
    courseId?: string;
    studentId?: string;
  }
) {
  const queryClient = useQueryClient();

  // Set up realtime subscription for progress updates
  useEffect(() => {
    if (!schoolId) return;

    const channel = supabase
      .channel(`teacher-progress-${schoolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'course_progress',
        },
        (payload) => {
          console.log('🔄 [useTeacherStudentProgress] Course progress updated via realtime:', payload);
          queryClient.invalidateQueries({ queryKey: ['teacher', 'student-progress', schoolId, filters] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_progress',
        },
        (payload) => {
          console.log('🔄 [useTeacherStudentProgress] Student progress updated via realtime:', payload);
          queryClient.invalidateQueries({ queryKey: ['teacher', 'student-progress', schoolId, filters] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, filters, queryClient]);

  return useQuery<TeacherProgressResponse>({
    queryKey: ['teacher', 'student-progress', schoolId, filters],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      if (filters?.courseId) params.append('course_id', filters.courseId);
      if (filters?.studentId) params.append('student_id', filters.studentId);

      const url = `/api/teacher/student-progress${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch student progress');
      }

      return await response.json();
    },
    enabled: !!schoolId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

// ==================== School Admin Hooks ====================

/**
 * Get student progress for school admins
 * Shows progress of all students in the admin's school
 */
export function useSchoolAdminStudentProgress(
  filters?: {
    courseId?: string;
    grade?: string;
    teacherId?: string;
  }
) {
  const queryClient = useQueryClient();

  // Set up realtime subscription for progress updates
  useEffect(() => {
    const channel = supabase
      .channel('school-admin-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'course_progress',
        },
        (payload) => {
          console.log('🔄 [useSchoolAdminStudentProgress] Course progress updated via realtime:', payload);
          queryClient.invalidateQueries({ queryKey: ['school-admin', 'student-progress', filters] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_progress',
        },
        (payload) => {
          console.log('🔄 [useSchoolAdminStudentProgress] Student progress updated via realtime:', payload);
          queryClient.invalidateQueries({ queryKey: ['school-admin', 'student-progress', filters] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters, queryClient]);

  return useQuery<SchoolAdminProgressResponse>({
    queryKey: ['school-admin', 'student-progress', filters],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (filters?.courseId) params.append('course_id', filters.courseId);
      if (filters?.grade) params.append('grade', filters.grade);
      if (filters?.teacherId) params.append('teacher_id', filters.teacherId);

      const url = `/api/school-admin/student-progress${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch student progress');
      }

      return await response.json();
    },
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: true,
  });
}

// ==================== System Admin Hooks ====================

/**
 * Get student progress for system admins
 * Shows progress of all students across all schools
 */
export function useAdminStudentProgress(
  filters?: {
    schoolId?: string;
    courseId?: string;
    grade?: string;
    limit?: number;
    offset?: number;
  }
) {
  const queryClient = useQueryClient();

  // Set up realtime subscription for progress updates
  useEffect(() => {
    const channel = supabase
      .channel('admin-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'course_progress',
        },
        (payload) => {
          console.log('🔄 [useAdminStudentProgress] Course progress updated via realtime:', payload);
          queryClient.invalidateQueries({ queryKey: ['admin', 'student-progress', filters] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_progress',
        },
        (payload) => {
          console.log('🔄 [useAdminStudentProgress] Student progress updated via realtime:', payload);
          queryClient.invalidateQueries({ queryKey: ['admin', 'student-progress', filters] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters, queryClient]);

  return useQuery<AdminProgressResponse>({
    queryKey: ['admin', 'student-progress', filters],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (filters?.schoolId) params.append('school_id', filters.schoolId);
      if (filters?.courseId) params.append('course_id', filters.courseId);
      if (filters?.grade) params.append('grade', filters.grade);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const url = `/api/admin/student-progress${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetchWithCsrf(url, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch student progress');
      }

      return await response.json();
    },
    staleTime: 120000, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

// ==================== Utility Hooks ====================

/**
 * Get progress statistics for a specific course
 */
export function useCourseProgressStats(courseId: string, userRole: 'teacher' | 'school-admin' | 'admin') {
  const teacherProgress = useTeacherStudentProgress(undefined, { courseId });
  const schoolAdminProgress = useSchoolAdminStudentProgress({ courseId });
  const adminProgress = useAdminStudentProgress({ courseId });

  const query = userRole === 'teacher' ? teacherProgress :
                userRole === 'school-admin' ? schoolAdminProgress :
                adminProgress;

  return {
    ...query,
    data: query.data ? {
      courseStats: userRole === 'admin' 
        ? (query.data as any).courses?.find((c: any) => c.course_id === courseId)
        : userRole === 'school-admin'
        ? (query.data as SchoolAdminProgressResponse).courses?.find((c: any) => c.course_id === courseId)
        : null,
      students: (query.data as any).students?.filter((s: any) => 
        s.courses?.some((c: any) => c.course_id === courseId)
      ) || []
    } : undefined
  };
}

/**
 * Get progress statistics for a specific grade
 */
export function useGradeProgressStats(grade: string, userRole: 'teacher' | 'school-admin' | 'admin') {
  const schoolAdminProgress = useSchoolAdminStudentProgress({ grade });
  const adminProgress = useAdminStudentProgress({ grade });

  const query = userRole === 'school-admin' ? schoolAdminProgress : adminProgress;

  return {
    ...query,
    data: query.data ? {
      gradeStats: {
        total_students: query.data.students.filter((s: any) => s.grade === grade).length,
        average_progress: query.data.students
          .filter((s: any) => s.grade === grade)
          .reduce((sum, s, _, arr) => sum + s.average_progress / arr.length, 0)
      },
      students: query.data.students.filter((s: any) => s.grade === grade)
    } : undefined
  };
}
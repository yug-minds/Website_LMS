/**
 * React Query hooks for Teacher Dashboard
 * Provides data fetching, caching, and mutations for teacher-related operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

import { fetchWithCsrf } from '../lib/csrf-client';

// ==================== Data Fetching Hooks ====================

/**
 * Get teacher's assigned schools
 * Uses API route to bypass RLS securely
 */
export function useTeacherSchools() {
  return useQuery({
    queryKey: ['teacher', 'schools'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetchWithCsrf('/api/teacher/schools', {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch schools');
      }

      const data = await response.json();
      return data.schools || [];
    },
  });
}

/**
 * Get teacher's assigned classes for a specific school
 * Uses API route to bypass RLS securely
 */
export function useTeacherClasses(schoolId?: string) {
  return useQuery({
    queryKey: ['teacher', 'classes', schoolId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const url = schoolId 
        ? `/api/teacher/classes?school_id=${schoolId || 'undefined'}`
        : '/api/teacher/classes';

      console.log('🔍 Fetching teacher classes from:', url);
      console.log('📋 School ID:', schoolId);

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ 
          error: 'Failed to fetch classes', 
          details: `HTTP ${response.status}` 
        }));
        console.error('❌ Error fetching classes:', error.error, error.details);
        console.error('Full error object:', error);
        throw new Error(error.error || error.details || 'Failed to fetch classes');
      }

      const data = await response.json();
      const classes = data?.classes ?? data?.data ?? [];
      console.log('✅ Classes loaded:', classes?.length || 0, 'classes');
      if (classes && classes.length > 0) {
        console.log('📋 Sample class:', classes[0]);
      } else {
        console.warn('⚠️ No classes returned from API');
      }
      // API now returns flat structure, so we can use it directly
      return classes;
    },
    enabled: true, // Always enabled - API will handle school filtering
    retry: 1,
  });
}

/**
 * Get teacher's reports (with optional filters)
 * Uses API route to bypass RLS securely
 */
export function useTeacherReports(schoolId?: string, filters?: { date?: string; classId?: string; limit?: number }) {
  return useQuery({
    queryKey: ['teacher', 'reports', schoolId, filters],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      if (filters?.date) params.append('date', filters.date);
      if (filters?.classId) params.append('class_id', filters.classId);
      if (filters?.limit) params.append('limit', filters.limit.toString());

      const url = `/api/teacher/reports${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch reports');
      }

      const data = await response.json();
      return data.reports || [];
    },
  });
}

/**
 * Get today's attendance status and report progress
 * Uses API route to bypass RLS securely
 */
export function useTodayAttendanceStatus(schoolId?: string, date?: string) {
  return useQuery({
    queryKey: ['teacher', 'today-attendance', schoolId, date],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      if (date) params.append('date', date);

      const url = `/api/teacher/attendance/today${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to fetch attendance status' }));
        throw new Error(error.error || 'Failed to fetch attendance status');
      }

      const data = await response.json();
      return data;
    },
    enabled: true,
    retry: 1,
  });
}

/**
 * Get teacher's monthly attendance data
 * Uses API route to bypass RLS securely
 */
export function useTeacherMonthlyAttendance(schoolId?: string, months?: number) {
  return useQuery({
    queryKey: ['teacher', 'monthly-attendance', schoolId, months],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      if (months) params.append('limit', months.toString());

      const url = `/api/teacher/analytics${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch monthly attendance');
      }

      const data = await response.json();
      // Return raw monthly attendance data from analytics response
      return data.analytics?.monthlyAttendanceRaw || [];
    },
  });
}

/**
 * Get teacher's leave requests
 * Uses API route to bypass RLS securely
 */
export function useTeacherLeaves(schoolId?: string) {
  return useQuery({
    queryKey: ['teacher', 'leaves', schoolId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const url = schoolId 
        ? `/api/teacher/leaves?school_id=${schoolId || 'undefined'}`
        : '/api/teacher/leaves';

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch leaves');
      }

      const data = await response.json();
      return data.leaves || [];
    },
  });
}

/**
 * Get teacher's attendance records (daily)
 * Uses API route to bypass RLS securely
 */
export function useTeacherAttendance(schoolId?: string, month?: string) {
  return useQuery({
    queryKey: ['teacher', 'attendance', schoolId, month],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      if (month) {
        const startDate = new Date(month);
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        params.append('start_date', startDate.toISOString().split('T')[0]);
        params.append('end_date', endDate.toISOString().split('T')[0]);
      }

      const url = `/api/teacher/attendance${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch attendance');
      }

      const data = await response.json();
      return data.attendance || [];
    },
  });
}

/**
 * Get teacher's class schedules
 * Uses API route to bypass RLS securely
 */
export function useTeacherSchedules(schoolId?: string, day?: string) {
  return useQuery({
    queryKey: ['teacher', 'schedules', schoolId, day],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      if (day) params.append('day', day);

      const url = `/api/teacher/schedules${params.toString() ? '?' + params.toString() : ''}`;

      console.log('🔍 Fetching teacher schedules from:', url);
      console.log('📋 School ID passed to hook:', schoolId);

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      console.log('📡 Schedules response status:', response.status);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error', details: `HTTP ${response.status}` }));
        console.error('❌ Error fetching schedules:', error.error, error.details);
        console.error('Full error object:', error);
        throw new Error(error.error || error.details || 'Failed to fetch schedules');
      }

      const data = await response.json();
      console.log('✅ Schedules loaded:', data.schedules?.length || 0, 'schedules');
      if (data.schedules && data.schedules.length > 0) {
        console.log('📋 Sample schedule:', data.schedules[0]);
      } else {
        console.warn('⚠️ No schedules returned from API');
      }
      return data.schedules || [];
    },
    enabled: true, // Always enabled - API will get school_id from database or use provided one
    retry: 1,
    staleTime: 0, // Always consider data stale, so it refetches when needed
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Refetch when component mounts
  });
}

/**
 * Get today's classes for the teacher
 * Uses API routes to bypass RLS securely
 */
export function useTodaysClasses(schoolId?: string) {
  return useQuery({
    queryKey: ['teacher', 'today-classes', schoolId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const today = new Date().toISOString().split('T')[0];
      const authHeader = { 'Authorization': `Bearer ${session.access_token || ''}` };

      // Get classes assigned to teacher
      const classesUrl = schoolId 
        ? `/api/teacher/classes?school_id=${schoolId || 'undefined'}`
        : '/api/teacher/classes';
      
      const classesResponse = await fetch(classesUrl, {
        cache: 'no-store',
        headers: authHeader
      });

      if (!classesResponse.ok) {
        throw new Error('Failed to fetch classes');
      }

      const classesData = await classesResponse.json();
      const classAssignments = classesData?.classes ?? classesData?.data ?? [];

      if (classAssignments.length === 0) return [];

      // Get today's reports
      const reportsUrl = `/api/teacher/reports?date=${today}${schoolId ? `&school_id=${schoolId || 'undefined'}` : ''}`;
      const reportsResponse = await fetch(reportsUrl, {
        cache: 'no-store',
        headers: authHeader
      });

      const reportsData = reportsResponse.ok ? await reportsResponse.json() : { reports: [] };
      const todayReports = reportsData.reports || [];
       
      const reportedClassIds = new Set(todayReports.map((r: any) => r.class_id));

      // API now returns flat structure, so we can use it directly
      return classAssignments
         
        .map((ca: any) => ({
          ...ca,
          hasReport: reportedClassIds.has(ca.id || ca.class_id),
          assignment: ca
        }))
         
        .filter((c: any) => !schoolId || c.school_id === schoolId);
    },
    enabled: !!schoolId,
    // Small polling fallback in case realtime isn't available / RLS blocks replication events
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/**
 * Get periods for the teacher's school
 * Uses API route to bypass RLS securely
 */
export function useTeacherPeriods(schoolId?: string, day?: string) {
  return useQuery({
    queryKey: ['teacher', 'periods', schoolId, day],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      if (day) params.append('day', day);

      const url = `/api/teacher/periods${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to fetch periods' }));
        throw new Error(error.error || 'Failed to fetch periods');
      }

      const data = await response.json();
      return data.periods || [];
    },
    enabled: true, // Always enabled - API will get school_id from database
    retry: 1,
  });
}

// ==================== Mutation Hooks ====================

/**
 * Submit a daily teaching report (auto-marks attendance as Present)
 * Uses API route to bypass RLS securely
 */
export function useSubmitReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportData: {
      school_id: string;
      grade: string;
      date: string;
      start_time?: string;
      end_time?: string;
      topics_taught?: string;
      activities?: string;
      notes?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Submit report via API route
      const response = await fetchWithCsrf('/api/teacher/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          school_id: reportData.school_id,
          grade: reportData.grade,
          date: reportData.date,
          start_time: reportData.start_time,
          end_time: reportData.end_time,
          topics_taught: reportData.topics_taught,
          activities: reportData.activities,
          notes: reportData.notes
        })
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.details || error.error || 'Failed to submit report';
        const errorWithDetails = new Error(errorMessage);
         
        (errorWithDetails as any).details = error.details;
         
        (errorWithDetails as any).hint = error.hint;
         
        (errorWithDetails as any).data = error;
        throw errorWithDetails;
      }

      const data = await response.json();
      return data.report;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['teacher', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'monthly-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'today-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'today-classes'] });
      
      // Show success notification (integrate with your toast system)
      console.log('Report submitted successfully');
    },
     
    onError: (error: any) => {
      console.error('Error submitting report:', error.message || 'Failed to submit report');
    },
  });
}

/**
 * Apply for leave
 * Uses API route to bypass RLS securely
 */
export function useApplyLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leaveData: {
      school_id: string;
      start_date: string;
      end_date: string;
      reason: string;
      substitute_required?: boolean;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Submit leave request via API route
      const response = await fetchWithCsrf('/api/teacher/leaves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          school_id: leaveData.school_id,
          start_date: leaveData.start_date,
          end_date: leaveData.end_date,
          reason: leaveData.reason,
          substitute_required: leaveData.substitute_required
        })
      });

      if (!response.ok) {
        // API may return different error shapes depending on middleware / handler.
        // Prefer JSON if possible, but fall back to text and HTTP status.
        let errorJson: any = null;
        let errorText: string | null = null;
        try {
          errorJson = await response.json();
        } catch {
          try {
            errorText = await response.text();
          } catch {
            // ignore
          }
        }

        const message =
          errorJson?.details ||
          errorJson?.error ||
          errorJson?.message ||
          errorText ||
          `Failed to submit leave request (HTTP ${response.status})`;

        const errorWithDetails = new Error(message);
        (errorWithDetails as any).status = response.status;
        (errorWithDetails as any).data = errorJson ?? { raw: errorText };
        throw errorWithDetails;
      }

      const data = await response.json();
      return data.leave;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'leaves'] });
      
      // Show success notification
      console.log('Leave request submitted successfully');
    },
     
    onError: (error: any) => {
      console.error('Error submitting leave request:', error.message || 'Failed to submit leave request');
    },
  });
}


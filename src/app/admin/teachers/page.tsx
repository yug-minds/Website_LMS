"use client";

import { useState, useEffect, useCallback } from "react";
import { frontendLogger, fetchWithLogging, handleApiErrorResponse } from "../../../lib/frontend-logger";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { useAutoSaveForm } from "../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../lib/form-persistence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../../../components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "../../../components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "../../../components/ui/select";
import { 
  Label 
} from "../../../components/ui/label";
import { 
  Textarea 
} from "../../../components/ui/textarea";
import AddTeacherDialog from "../../../components/AddTeacherDialog";
import TeacherProfileView from "../../../components/TeacherProfileView";
import { NotificationPanel, useNotifications } from "../../../components/NotificationPanel";
import { 
  Users, 
  School, 
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Shield,
  Search,
  Plus,
  Briefcase,
  Edit,
  Trash2
} from "lucide-react";
import { fetchWithCsrf } from '../../../lib/csrf-client';

interface Teacher {
  id: string;
  teacher_id: string;
  full_name: string;
  email: string;
  phone?: string;
  qualification?: string;
  experience_years?: number;
  specialization?: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'Suspended';
  created_at: string;
  updated_at?: string;
  temp_password?: string;
  teacher_schools?: TeacherSchool[];
}

interface TeacherSchool {
  id: string;
  teacher_id: string;
  school_id: string;
  grades_assigned: string[];
  subjects: string[];
  working_days_per_week: number;
  max_students_per_session: number;
  is_primary: boolean;
  schools?: {
    id: string;
    name: string;
    school_code: string;
  };
}

interface School {
  id: string;
  name: string;
  school_code: string;
  city?: string;
  state?: string;
}

interface LeaveRequest {
  id: string;
  teacher_id: string;
  school_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  applied_at?: string;
  approved_at?: string;
  rejected_at?: string;
  approved_by?: string;
  admin_remarks?: string;
  profiles?: {
    id: string;
    full_name: string;
    email: string;
  };
  schools?: {
    id: string;
    name: string;
    school_code: string;
  };
}

interface AttendanceSummary {
  totalDays: number;
  presentDays: number;
  absentApprovedDays: number;
  absentUnapprovedDays: number;
  attendanceRate: number;
  presentToday?: number;
  absentToday?: number;
  onLeaveToday?: number;
  totalTeachers?: number;
  teacherTodayStatus?: Record<string, { status: string; isOnLeave: boolean; leaveType?: string }>;
}

interface Stats {
  totalTeachers: number;
  activeTeachers: number;
  pendingLeaves: number;
  averageAttendance: number;
}

export default function TeachersManagement() {
  // State management
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'teachers' | 'attendance' | 'leaves'>('teachers');
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [profileRefreshTrigger, setProfileRefreshTrigger] = useState(0);
  const [leaveRefreshTrigger, setLeaveRefreshTrigger] = useState(0);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Notification system
  const { notifications, addNotification, markAsRead, dismiss } = useNotifications();

  // Form data - load from storage if available
  const initialFormData = (() => {
    if (typeof window !== 'undefined') {
      const saved = loadFormData<{
        full_name: string;
        email: string;
        phone: string;
        address: string;
        qualification: string;
        experience_years: number;
        specialization: string;
        school_assignments: TeacherSchool[];
        temp_password: string;
      }>('admin-teachers-form');
      if (saved) return saved;
    }
    return {
      full_name: "",
      email: "",
      phone: "",
      address: "",
      qualification: "",
      experience_years: 0,
      specialization: "",
      school_assignments: [] as TeacherSchool[],
      temp_password: ""
    };
  })();

  const [formData, setFormData] = useState(initialFormData);
  
  // Auto-save form data
  const { isDirty: isFormDirty } = useAutoSaveForm({
    formId: 'admin-teachers-form',
    formData,
    autoSave: true,
    autoSaveInterval: 3000,
    debounceDelay: 800,
    useSession: false,
    onLoad: (data) => {
      setFormData(data);
    },
  });

  // Auto-save teacher form data
  useAutoSaveForm({
    formId: 'admin-teachers-form',
    formData,
    autoSaveInterval: 3000,
    debounceDelay: 800,
    useSession: false,
    onLoad: (data) => {
      // Only load if form is empty (to avoid overwriting user input)
      if (!formData.full_name && !formData.email) {
        setFormData(data);
      }
    },
    markDirty: true,
  });

  const [leaveFormData, setLeaveFormData] = useState({
    status: "",
    admin_remarks: ""
  });
  
  // Auto-save leave form data
  useAutoSaveForm({
    formId: 'admin-leave-form',
    formData: leaveFormData,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (!leaveFormData.status) {
        setLeaveFormData(data);
      }
    },
    markDirty: true,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [customSubjectInputs, setCustomSubjectInputs] = useState<Record<string, string>>({});
  const availableSubjects = ['Robotics', 'Coding', 'AI/ML', 'Python'];
  const [stats, setStats] = useState<Stats>({
    totalTeachers: 0,
    activeTeachers: 0,
    pendingLeaves: 0,
    averageAttendance: 0
  });

  // Update statistics
  // IMPORTANT: Use allLeaveRequests (not filtered leaveRequests) for accurate pending count
  const updateStats = useCallback((teachersData: Teacher[], leavesData: LeaveRequest[] = allLeaveRequests, attendanceData: AttendanceSummary | null = attendanceSummary) => {
    const active = teachersData.filter((t: any) => t.status === 'Active').length;
    const pendingLeaves = leavesData.filter((leave: any) => leave.status === 'Pending').length;
    
    setStats({
      totalTeachers: teachersData.length,
      activeTeachers: active,
      pendingLeaves: pendingLeaves,
      averageAttendance: attendanceData?.attendanceRate || 0
    });
  }, [allLeaveRequests, attendanceSummary]);

  // Sync leaveRequests with allLeaveRequests based on current filter
  useEffect(() => {
    if (leaveStatusFilter === 'all') {
      setLeaveRequests(allLeaveRequests);
    } else {
      setLeaveRequests(allLeaveRequests.filter((leave: any) => leave.status === leaveStatusFilter));
    }
  }, [allLeaveRequests, leaveStatusFilter]);

  // Force refresh when leaveRefreshTrigger changes
  useEffect(() => {
    if (leaveRefreshTrigger > 0) {
      // Re-sync leaveRequests with current filter
      if (leaveStatusFilter === 'all') {
        setLeaveRequests(allLeaveRequests);
    } else {
        setLeaveRequests(allLeaveRequests.filter((leave: any) => leave.status === leaveStatusFilter));
      }
    }
  }, [leaveRefreshTrigger, allLeaveRequests, leaveStatusFilter]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    setLastRefresh(new Date());
    await loadAllData();
    setRefreshing(false);
  };

  // Helper function for fetch with timeout (using frontendLogger)
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
    frontendLogger.debug('API request initiated', {
      component: 'TeachersManagement',
      url,
      method: options.method || 'GET',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        frontendLogger.error('API request failed', {
          component: 'TeachersManagement',
          url,
          status: response.status,
          error: errorData,
        });
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      frontendLogger.debug('API request succeeded', {
        component: 'TeachersManagement',
        url,
        status: response.status,
      });
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        frontendLogger.error('Request timeout', {
          component: 'TeachersManagement',
          url,
          timeout,
        }, error);
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      
      frontendLogger.error('API request exception', {
        component: 'TeachersManagement',
        url,
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  };

  // Load teachers
  const loadTeachers = useCallback(async () => {
    try {
      frontendLogger.info('Loading teachers', {
        component: 'TeachersManagement',
        action: 'loadTeachers',
      });

      const response = await fetchWithCsrf('/api/admin/teachers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      
      const data = await response.json();
      const teachersArray = (Array.isArray(data?.data) ? data.data : (data?.teachers || []));
      
      frontendLogger.info('Teachers loaded successfully', {
        component: 'TeachersManagement',
        action: 'loadTeachers',
        count: teachersArray.length,
      });
      
      setTeachers(teachersArray);
      
      // Force update filtered teachers immediately
      if (teachersArray.length > 0) {
        // The useEffect will automatically update filteredTeachers
      } else {
        frontendLogger.warn('No teachers found in response', {
          component: 'TeachersManagement',
          action: 'loadTeachers',
        });
      }
    } catch (error) {
      const errorInfo = handleApiErrorResponse(error, {
        component: 'TeachersManagement',
        action: 'loadTeachers',
      }, 'Failed to load teachers');
      
      frontendLogger.error('Error loading teachers', {
        component: 'TeachersManagement',
        action: 'loadTeachers',
      }, error instanceof Error ? error : new Error(String(error)));
      
      // Set empty array on error to prevent infinite loading
      setTeachers([]);
    }
  }, []);

  // Load schools
  const loadSchools = useCallback(async () => {
    try {
      frontendLogger.debug('Loading schools', {
        component: 'TeachersManagement',
        action: 'loadSchools',
      });

      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      
      const data = await response.json();
      const schoolsArray = data.schools || [];
      
      frontendLogger.info('Schools loaded successfully', {
        component: 'TeachersManagement',
        action: 'loadSchools',
        count: schoolsArray.length,
      });
      
      setSchools(schoolsArray);
    } catch (error) {
      const errorInfo = handleApiErrorResponse(error, {
        component: 'TeachersManagement',
        action: 'loadSchools',
      }, 'Failed to load schools');
      
      frontendLogger.error('Error loading schools', {
        component: 'TeachersManagement',
        action: 'loadSchools',
      }, error instanceof Error ? error : new Error(String(error)));
      
      setSchools([]);
    }
  }, []);

  // Load leave requests
  const loadLeaveRequests = useCallback(async () => {
    try {
      frontendLogger.debug('Loading leave requests', {
        component: 'TeachersManagement',
        action: 'loadLeaveRequests',
      });

      const response = await fetchWithCsrf('/api/admin/leaves', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ [loadLeaveRequests] API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        frontendLogger.error('API request failed', {
          component: 'TeachersManagement',
          action: 'loadLeaveRequests',
          status: response.status,
          error: errorData,
        });
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const allLeaves = data.leaves || [];
      
      console.log('✅ [loadLeaveRequests] Leave requests loaded:', {
        count: allLeaves.length,
        leaves: allLeaves.map((l: any) => ({
          id: l.id,
          teacher: l.profiles?.full_name,
          status: l.status,
          startDate: l.start_date,
          endDate: l.end_date
        }))
      });
      
      frontendLogger.info('Leave requests loaded successfully', {
        component: 'TeachersManagement',
        action: 'loadLeaveRequests',
        count: allLeaves.length,
      });

      setAllLeaveRequests(allLeaves);
      
      // Filter based on current status filter
      if (leaveStatusFilter === 'all') {
        setLeaveRequests(allLeaves);
      } else {
        setLeaveRequests(allLeaves.filter((leave: LeaveRequest) => leave.status === leaveStatusFilter));
      }
    } catch (error) {
      const errorInfo = handleApiErrorResponse(error, {
        component: 'TeachersManagement',
        action: 'loadLeaveRequests',
      }, 'Failed to load leave requests');
      
      console.error('❌ [loadLeaveRequests] Error:', error);
      frontendLogger.error('Error loading leave requests', {
        component: 'TeachersManagement',
        action: 'loadLeaveRequests',
      }, error instanceof Error ? error : new Error(String(error)));
      
      setAllLeaveRequests([]);
      setLeaveRequests([]);
    }
  }, [leaveStatusFilter]);

  // Filter leave requests by status
  const filterLeaveRequests = (status: 'all' | 'Pending' | 'Approved' | 'Rejected') => {
    setLeaveStatusFilter(status);
    if (status === 'all') {
      setLeaveRequests(allLeaveRequests);
    } else {
      setLeaveRequests(allLeaveRequests.filter((leave: any) => leave.status === status));
    }
  };

  // Load attendance data
  const loadAttendanceData = useCallback(async () => {
    try {
      frontendLogger.debug('Loading attendance data', {
        component: 'TeachersManagement',
        action: 'loadAttendanceData',
      });

      const response = await fetchWithCsrf('/api/admin/teacher-attendance', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      
      if (!response.ok) {
        let errorData: any = {};
        const contentType = response.headers.get('content-type');
        try {
          const responseText = await response.text();
          if (responseText) {
            if (contentType && contentType.includes('application/json')) {
              try {
                errorData = JSON.parse(responseText);
              } catch {
                errorData = { error: responseText || `HTTP ${response.status}`, details: responseText || 'Invalid JSON response' };
              }
            } else {
              errorData = { error: responseText || `HTTP ${response.status}`, details: responseText || 'Unknown error' };
            }
          } else {
            errorData = { error: `HTTP ${response.status}`, details: response.statusText || 'Empty response from server', status: response.status };
          }
        } catch (readError) {
          errorData = { 
            error: `HTTP ${response.status}`,
            details: `Failed to read error response: ${readError instanceof Error ? readError.message : String(readError)}`,
            status: response.status
          };
        }
        
        console.error('❌ [loadAttendanceData] API error:', {
          status: response.status,
          statusText: response.statusText,
          statusCode: response.status,
          error: errorData,
          contentType
        });
        
        const errorMessage = errorData.details || errorData.error || errorData.message || `Failed to fetch attendance data (HTTP ${response.status}: ${response.statusText})`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      console.log('✅ [loadAttendanceData] Attendance data loaded:', {
        hasSummary: !!data.summary,
        summary: data.summary,
        attendanceCount: data.attendance?.length || 0
      });
      
      frontendLogger.info('Attendance data loaded successfully', {
        component: 'TeachersManagement',
        action: 'loadAttendanceData',
        hasSummary: !!data.summary,
        attendanceCount: data.attendance?.length || 0
      });

      // Always set summary, even if empty (so UI can show "Not Marked" status)
      setAttendanceSummary(data.summary || {
        totalDays: 0,
        presentDays: 0,
        absentApprovedDays: 0,
        absentUnapprovedDays: 0,
        attendanceRate: 0,
        presentToday: 0,
        absentToday: teachers.length,
        onLeaveToday: 0,
        totalTeachers: teachers.length,
        teacherTodayStatus: {}
      });
    } catch (error) {
      const errorInfo = handleApiErrorResponse(error, {
        component: 'TeachersManagement',
        action: 'loadAttendanceData',
      }, 'Failed to load attendance data');
      
      console.error('❌ [loadAttendanceData] Error:', error);
      frontendLogger.error('Error loading attendance data', {
        component: 'TeachersManagement',
        action: 'loadAttendanceData',
      }, error instanceof Error ? error : new Error(String(error)));
      
      // Set a default summary so UI can still render
      // Use current teachers state or fallback to 0
      const teacherCount = teachers.length || 0;
      setAttendanceSummary({
        totalDays: 0,
        presentDays: 0,
        absentApprovedDays: 0,
        absentUnapprovedDays: 0,
        attendanceRate: 0,
        presentToday: 0,
        absentToday: teacherCount,
        onLeaveToday: 0,
        totalTeachers: teacherCount,
        teacherTodayStatus: {}
      });
    }
  }, []);


  // Main data loading function with retry mechanism and safety timeout
  const loadAllData = useCallback(async (retryCount = 0) => {
    frontendLogger.info('Starting to load all data', {
      component: 'TeachersManagement',
      action: 'loadAllData',
      attempt: retryCount + 1,
    });
    
    setLoading(true);
    
    // Safety timeout: Always stop loading after 15 seconds
    const safetyTimeout = setTimeout(() => {
      frontendLogger.warn('Safety timeout reached', {
        component: 'TeachersManagement',
        action: 'loadAllData',
      });
      setLoading(false);
    }, 15000);
    
    try {
      // Load data with Promise.allSettled to handle partial failures
      const results = await Promise.allSettled([
        loadTeachers(),
        loadSchools(),
        loadLeaveRequests(),
        loadAttendanceData()
      ]);
      
      // Check if all succeeded
      const allSucceeded = results.every((result: any) => result.status === 'fulfilled');
      
      if (allSucceeded) {
        frontendLogger.info('All data loaded successfully', {
          component: 'TeachersManagement',
          action: 'loadAllData',
        });
      } else {
        const failed = results.filter((r: any) => r.status === 'rejected');
        frontendLogger.warn('Some data failed to load', {
          component: 'TeachersManagement',
          action: 'loadAllData',
          failedCount: failed.length,
          totalCount: results.length,
        });
      }
      
      clearTimeout(safetyTimeout);
      setLoading(false);
    } catch (error) {
      frontendLogger.error('Error loading data', {
        component: 'TeachersManagement',
        action: 'loadAllData',
        attempt: retryCount + 1,
      }, error instanceof Error ? error : new Error(String(error)));
      
      clearTimeout(safetyTimeout);
      
      // Retry up to 1 time with delay, then give up
      if (retryCount < 1) {
        const delay = 2000; // 2 seconds
        frontendLogger.info('Retrying data load', {
          component: 'TeachersManagement',
          action: 'loadAllData',
          delay,
          nextAttempt: retryCount + 2,
        });
        
        setTimeout(() => {
          loadAllData(retryCount + 1);
        }, delay);
        return;
      }
      
      frontendLogger.error('Max retries reached', {
        component: 'TeachersManagement',
        action: 'loadAllData',
      });
      setLoading(false);
    }
  }, [loadTeachers, loadSchools, loadLeaveRequests, loadAttendanceData]);

  // Load all data on mount (only once)
  useEffect(() => {
    loadAllData(0);
  }, []);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: () => loadAllData(0),
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
    hasUnsavedData: () => {
      // Check if any dialog is open (indicating unsaved changes)
      // Also check if forms have unsaved data via Zustand store
      return showAddDialog || showEditDialog || showLeaveDialog || isFormDirty;
    },
  });

  // Update stats when data changes
  useEffect(() => {
    // Always update stats when data changes, even if arrays are empty
    updateStats(teachers, allLeaveRequests, attendanceSummary);
  }, [teachers, allLeaveRequests, attendanceSummary, updateStats]);

  // Filter teachers based on search and filters
  useEffect(() => {
    let filtered = teachers;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter((teacher: any) =>
        teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.phone?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((teacher: any) => teacher.status === statusFilter);
    }

    // School filter
    if (schoolFilter !== "all") {
      filtered = filtered.filter((teacher: any) => 
        teacher.teacher_schools?.some((school: any) => school.school_id === schoolFilter)
      );
    }

    setFilteredTeachers(filtered);
  }, [searchTerm, statusFilter, schoolFilter, teachers]);

  // Handle view teacher profile
  const handleViewTeacherProfile = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowProfileView(true);
  };

  // Handle edit teacher
  const handleEditTeacher = (teacher: Teacher) => {
    console.log('📝 Editing teacher:', teacher);
    console.log('📚 Teacher school assignments:', teacher.teacher_schools);
    
    setEditingTeacher(teacher);
    
    // Transform teacher_schools to match form data structure
    // The API returns teacher_schools with nested schools object, but form expects flat structure
     
    const schoolAssignments = (teacher.teacher_schools || []).map((assignment: any) => ({
      id: assignment.id || `assignment-${Date.now()}-${Math.random()}`,
      teacher_id: assignment.teacher_id || teacher.id || '',
      school_id: assignment.school_id || '',
      grades_assigned: Array.isArray(assignment.grades_assigned) ? assignment.grades_assigned : [],
      subjects: Array.isArray(assignment.subjects) ? assignment.subjects : [],
      working_days_per_week: assignment.working_days_per_week || 5,
      max_students_per_session: assignment.max_students_per_session || 30,
      is_primary: assignment.is_primary || false
    }));
    
    console.log('📋 Transformed school assignments:', schoolAssignments);
    
    setFormData({
      full_name: teacher.full_name,
      email: teacher.email,
      phone: teacher.phone || '',
      address: '',
      qualification: teacher.qualification || '',
      experience_years: teacher.experience_years || 0,
      specialization: teacher.specialization || '',
      school_assignments: schoolAssignments,
      temp_password: teacher.temp_password || ''
    });
    setShowPassword(false); // Reset password visibility
    setNewPassword(""); // Reset new password
    setShowNewPassword(false); // Reset new password visibility
    setCustomSubjectInputs({}); // Reset custom subject inputs
    setShowEditDialog(true);
  };

  // Handle change password
  const handleChangePassword = async () => {
    if (!editingTeacher) return;

    if (!newPassword) {
      alert('Please enter a new password');
      return;
    }
    
    // Validate password strength (8+ chars, uppercase, lowercase, number)
    const { validatePasswordClient } = await import('../../../lib/password-validation');
    const passwordError = validatePasswordClient(newPassword);
    if (passwordError) {
      alert(passwordError);
      return;
    }

    if (!confirm(`Are you sure you want to change the password for "${editingTeacher.full_name}"? They will need to use the new password to log in.`)) {
      return;
    }

    try {
      setActionLoading('change-password');
      const response = await fetchWithCsrf('/api/admin/teachers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingTeacher.id,
          temp_password: newPassword,
          change_password: true // Flag to indicate password change
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Password changed successfully for "${editingTeacher.full_name}"!\n\nNew password: ${newPassword}\n\nPlease share this password securely with the teacher.`);
        setNewPassword("");
        setShowNewPassword(false);
        // Refresh the teacher list to get updated data
        loadAllData();
      } else {
        const errorMessage = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to change password';
        alert(`Failed to change password: ${errorMessage}`);
        console.error('Password change error:', data);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error changing password: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Generate new password
  const generateNewPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
  };

  // Copy new password to clipboard
  const copyNewPassword = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      alert('Password copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  // Handle update teacher
  const handleUpdateTeacher = async () => {
    if (!editingTeacher) return;

    // Validation: Check if at least one school and one grade are assigned
    const hasValidAssignments = formData.school_assignments.some((assignment: any) => 
      assignment.school_id && assignment.grades_assigned.length > 0
    );

    if (!hasValidAssignments) {
      alert('Please assign at least one school and one grade before saving.');
      return;
    }

    try {
      setActionLoading('edit');
      // Don't include temp_password in regular update (only use it for password change)
      const { temp_password, ...updateData } = formData;
      const response = await fetchWithCsrf('/api/admin/teachers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingTeacher.id,
          ...updateData
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Teacher updated successfully!');
        
        // Trigger profile refresh if the updated teacher is currently being viewed
        if (selectedTeacher && selectedTeacher.id === editingTeacher.id) {
          setProfileRefreshTrigger(prev => prev + 1);
        }
        
        setShowEditDialog(false);
        setEditingTeacher(null);
        resetForm();
        setShowPassword(false);
        setNewPassword("");
        setShowNewPassword(false);
        setCustomSubjectInputs({});
        loadAllData();
      } else {
        const errorMessage = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to update teacher';
        alert(`Failed to update teacher: ${errorMessage}`);
        console.error('Update error:', data);
      }
    } catch (error) {
      console.error('Error updating teacher:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error updating teacher: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle delete teacher
  const handleDeleteTeacher = async (teacherId: string) => {
    if (!confirm('Are you sure you want to delete this teacher?')) return;

    try {
      console.log('🗑️ Deleting teacher with ID:', teacherId);
      console.log('📋 Teacher ID type:', typeof teacherId);
      
      // Find the teacher in the current list to verify
      const teacherToDelete = teachers.find((t: any) => t.id === teacherId);
      console.log('📋 Teacher to delete:', teacherToDelete ? {
        id: teacherToDelete.id,
        teacher_id: teacherToDelete.teacher_id,
        email: teacherToDelete.email,
        name: teacherToDelete.full_name
      } : 'NOT FOUND IN LOCAL STATE');
      
      setActionLoading(teacherId);
      const response = await fetchWithCsrf('/api/admin/teachers', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: teacherId }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Teacher deleted successfully:', data.message);
        
        // Immediately remove from local state
        setTeachers(prev => prev.filter((t: any) => t.id !== teacherId));
        
        // Refresh all data
        await loadAllData();
        
        alert('Teacher deleted successfully!');
      } else {
        const data = await response.json();
        console.error('❌ Delete failed:', data);
        alert(`Failed to delete teacher: ${data.error || data.details || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting teacher:', error);
      alert('Error deleting teacher');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle leave request action
  const handleLeaveAction = async (leaveId: string, action: 'approve' | 'reject') => {
    try {
      setActionLoading(leaveId);
      const response = await fetchWithCsrf('/api/admin/leaves', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: leaveId,
          status: action === 'approve' ? 'Approved' : 'Rejected',
          approved_by: 'admin', // In real app, use actual admin ID
          admin_remarks: leaveFormData.admin_remarks
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Find the leave request to get teacher name and complete object
        const leaveRequest = allLeaveRequests.find((l: any) => l.id === leaveId) || leaveRequests.find((l: any) => l.id === leaveId);
        const teacherName = leaveRequest?.profiles?.full_name || 'Teacher';
        
        // Add notification
        addNotification({
          type: 'success',
          title: `Leave ${action === 'approve' ? 'Approved' : 'Rejected'}`,
          message: `${teacherName}'s leave request has been ${action === 'approve' ? 'approved' : 'rejected'}.`
        });

        // For demo leaves, update the state immediately
        if (leaveId.startsWith('demo-leave-') && leaveRequest) {
          const newStatus: 'Approved' | 'Rejected' = action === 'approve' ? 'Approved' : 'Rejected';
          const now = new Date().toISOString();
          
          // Create updated leave object
          const updatedLeave = {
            ...leaveRequest,
            status: newStatus,
            approved_at: action === 'approve' ? now : leaveRequest.approved_at,
            rejected_at: action === 'reject' ? now : leaveRequest.rejected_at,
            approved_by: action === 'approve' ? 'admin@example.com' : leaveRequest.approved_by,
            admin_remarks: leaveFormData.admin_remarks || leaveRequest.admin_remarks || ''
          };
          
          // Update allLeaveRequests
          const updatedAllLeaves = allLeaveRequests.map((leave: any) => 
            leave.id === leaveId ? updatedLeave : leave
          );
          setAllLeaveRequests(updatedAllLeaves);
          
          // Immediately remove from current view if not matching current filter
          console.log('🔄 Leave action:', { leaveId, action, newStatus, leaveStatusFilter });
          
          if (leaveStatusFilter !== 'all' && leaveStatusFilter !== newStatus) {
            console.log('🚫 Removing leave from current view (filter mismatch)');
            setLeaveRequests(prev => {
              const filtered = prev.filter((leave: any) => leave.id !== leaveId);
              console.log('📋 Updated leaveRequests after removal:', filtered.length);
              return filtered;
            });
          } else if (leaveStatusFilter === 'all') {
            console.log('🔄 Updating leave in place (showing all)');
            // If showing all, update the leave in place
            setLeaveRequests(prev => prev.map((leave: any) => 
              leave.id === leaveId ? updatedLeave : leave
            ));
          } else if (leaveStatusFilter === newStatus) {
            console.log('➕ Adding/updating leave (filter matches new status)');
            // If filter matches new status, add to view
            setLeaveRequests(prev => {
              const exists = prev.some((l: any) => l.id === leaveId);
              if (exists) {
                return prev.map((leave: any) => leave.id === leaveId ? updatedLeave : leave);
              } else {
                return [...prev, updatedLeave];
              }
            });
          }
          
          // Force a refresh by updating the last refresh time and trigger
          setLastRefresh(new Date());
          setLeaveRefreshTrigger(prev => prev + 1);
          
          // Update stats with the updated leave data
          updateStats(teachers, updatedAllLeaves, attendanceSummary);
        } else {
          // For real data, reload from API
          await loadLeaveRequests();
        }

        setShowLeaveDialog(false);
        setSelectedLeave(null);
        setLeaveFormData({ status: '', admin_remarks: '' });
        
        // Reload data to refresh other stats
        loadAllData();
      } else {
        addNotification({
          type: 'error',
          title: 'Action Failed',
          message: `Failed to ${action} leave: ${data.error}`
        });
      }
    } catch (error) {
      console.error('Error processing leave action:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: `Failed to ${action} leave request`
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      full_name: "",
      email: "",
      phone: "",
      address: "",
      qualification: "",
      experience_years: 0,
      specialization: "",
      school_assignments: [],
      temp_password: ""
    });
  };

  // Handle input change
  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Generate password
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, temp_password: password }));
  };

  // Handle add custom subject
  const handleAddCustomSubject = (assignmentIndex: number) => {
    const assignmentId = formData.school_assignments[assignmentIndex]?.id || `assignment-${assignmentIndex}`;
    const customSubject = customSubjectInputs[assignmentId]?.trim();
    
    if (!customSubject) {
      return;
    }

    // Check if subject already exists (case-insensitive)
    const assignment = formData.school_assignments[assignmentIndex];
    if (assignment) {
      const subjectExists = assignment.subjects.some(
        s => s.toLowerCase() === customSubject.toLowerCase()
      );
      if (subjectExists) {
        alert('This subject is already added');
        return;
      }

      // Add custom subject
      const updatedAssignments = [...formData.school_assignments];
      updatedAssignments[assignmentIndex] = {
        ...updatedAssignments[assignmentIndex],
        subjects: [...updatedAssignments[assignmentIndex].subjects, customSubject]
      };
      
      setFormData(prev => ({
        ...prev,
        school_assignments: updatedAssignments
      }));

      // Clear input
      setCustomSubjectInputs(prev => ({
        ...prev,
        [assignmentId]: ''
      }));
    }
  };

  // Copy password
  const copyPassword = () => {
    navigator.clipboard.writeText(formData.temp_password);
    alert('Password copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center space-y-4">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-lg font-medium text-gray-700">Loading teachers data...</p>
          <p className="text-sm text-gray-500">Please wait while we fetch the data</p>
          <Button
            variant="outline"
            onClick={() => {
              console.log('Manual load trigger');
              setLoading(false);
              loadAllData(0);
            }}
            className="mt-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teachers Management</h1>
          <div className="flex items-center gap-4 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <p className="text-muted-foreground">Manage teachers, attendance, and leave requests</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Teacher
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Teachers</p>
                <p className="text-2xl font-bold">{stats.totalTeachers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Active Teachers</p>
                <p className="text-2xl font-bold">{stats.activeTeachers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Pending Leaves</p>
                <p className="text-2xl font-bold">{stats.pendingLeaves}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Avg Attendance</p>
                <p className="text-2xl font-bold">{stats.averageAttendance}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('teachers')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'teachers'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Teachers
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'attendance'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Attendance
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'leaves'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Leave Requests
          </button>
        </div>

        {/* Teachers Tab */}
        {activeTab === 'teachers' && (
        <Card className="bg-white overflow-visible">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Teachers</CardTitle>
                <CardDescription>
                  Manage teacher accounts and information
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search teachers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="On Leave">On Leave</SelectItem>
                    <SelectItem value="Suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="School" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Schools</SelectItem>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredTeachers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No teachers found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== "all" || schoolFilter !== "all"
                    ? "No teachers match your current filters. Try adjusting your search or filters."
                    : "Get started by adding your first teacher."}
                </p>
                <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2 mx-auto">
                  <Plus className="h-4 w-4" />
                  Add Teacher
                </Button>
              </div>
            ) : (
              <div className="relative overflow-visible">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Qualification</TableHead>
                      <TableHead>Experience</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Schools</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {filteredTeachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium">{teacher.full_name}</TableCell>
                      <TableCell>{teacher.email}</TableCell>
                      <TableCell>{teacher.phone || 'N/A'}</TableCell>
                      <TableCell>{teacher.qualification || 'N/A'}</TableCell>
                      <TableCell>{teacher.experience_years || 0} years</TableCell>
                      <TableCell>
                        <Badge className={
                          teacher.status === 'Active' ? 'bg-green-500' :
                          teacher.status === 'On Leave' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }>
                          {teacher.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {teacher.teacher_schools && teacher.teacher_schools.length > 0 ? (
                          <div className="space-y-1">
                            {teacher.teacher_schools.map((school, index) => (
                              <div key={index} className="text-sm">
                                <span className="font-medium">{school.schools?.name}</span>
                                <span className="text-muted-foreground ml-1">
                                  ({school.grades_assigned && Array.isArray(school.grades_assigned) 
                                    ? school.grades_assigned.join(', ') 
                                    : 'No grades'})
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No schools assigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-blue-50"
                            onClick={() => handleViewTeacherProfile(teacher)}
                            title="View Profile"
                          >
                            <Eye className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-green-50"
                            onClick={() => handleEditTeacher(teacher)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-red-50"
                            onClick={() => handleDeleteTeacher(teacher.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && (
        <Card className="bg-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Teacher Attendance</CardTitle>
                <CardDescription>
                  View and manage teacher attendance records
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {attendanceSummary && attendanceSummary.totalTeachers !== undefined ? (
              <div className="space-y-6">
                {/* Attendance Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <Users className="h-8 w-8 text-blue-600" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-blue-900">Total Teachers</p>
                          <p className="text-2xl font-bold text-blue-900">
                            {attendanceSummary.totalTeachers || teachers.length}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-green-900">Present Today</p>
                          <p className="text-2xl font-bold text-green-900">
                            {attendanceSummary.presentToday ?? attendanceSummary.presentDays ?? 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-50 border-red-200">
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <XCircle className="h-8 w-8 text-red-600" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-red-900">Absent Today</p>
                          <p className="text-2xl font-bold text-red-900">
                            {attendanceSummary.absentToday ?? 0}
                          </p>
                          {attendanceSummary.onLeaveToday && attendanceSummary.onLeaveToday > 0 && (
                            <p className="text-xs text-red-700 mt-1">
                              ({attendanceSummary.onLeaveToday} on leave)
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-yellow-50 border-yellow-200">
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <Clock className="h-8 w-8 text-yellow-600" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-yellow-900">Average Attendance</p>
                          <p className="text-2xl font-bold text-yellow-900">
                            {attendanceSummary.attendanceRate || 0}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Attendance Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Teacher Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Today's Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Account Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Attendance Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {teachers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                              No teachers found
                            </td>
                          </tr>
                        ) : (
                          teachers.map((teacher) => {
                            const todayStatus = attendanceSummary.teacherTodayStatus?.[teacher.id] || { status: 'Not Marked', isOnLeave: false };
                            const getStatusBadge = () => {
                              switch (todayStatus.status) {
                                case 'Present':
                                  return <Badge className="bg-green-500 text-white">Present</Badge>;
                                case 'On Leave':
                                  return <Badge className="bg-blue-500 text-white">On Leave {todayStatus.leaveType ? `(${todayStatus.leaveType})` : ''}</Badge>;
                                case 'Absent':
                                  return <Badge className="bg-red-500 text-white">Absent</Badge>;
                                case 'Not Marked':
                                  return <Badge variant="outline" className="border-gray-300 text-gray-600">Not Marked</Badge>;
                                default:
                                  return <Badge variant="outline" className="border-gray-300 text-gray-600">{todayStatus.status}</Badge>;
                              }
                            };
                            
                            return (
                              <tr key={teacher.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {teacher.full_name}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                  {teacher.email}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {getStatusBadge()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <Badge className={teacher.status === 'Active' ? 'bg-green-500' : 'bg-gray-500'}>
                                    {teacher.status || 'Active'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                  {attendanceSummary.attendanceRate || 0}%
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Attendance Data</h3>
                <p className="text-muted-foreground mb-4">
                  Attendance records will appear here once teachers start marking attendance.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Leave Requests Section */}
        {activeTab === 'leaves' && (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Leave Requests</CardTitle>
            <CardDescription>
              Manage teacher leave requests and approvals
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Status Count Badges */}
            <div className="flex gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  Active ({allLeaveRequests.filter((leave: any) => leave.status === 'Pending').length})
                </Badge>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Approved ({allLeaveRequests.filter((leave: any) => leave.status === 'Approved').length})
                </Badge>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  Rejected ({allLeaveRequests.filter((leave: any) => leave.status === 'Rejected').length})
                </Badge>
              </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={leaveStatusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => filterLeaveRequests('all')}
              >
                All
              </Button>
              <Button
                variant={leaveStatusFilter === 'Pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => filterLeaveRequests('Pending')}
              >
                Active
              </Button>
              <Button
                variant={leaveStatusFilter === 'Approved' ? 'default' : 'outline'}
                size="sm"
                onClick={() => filterLeaveRequests('Approved')}
              >
                Approved
              </Button>
              <Button
                variant={leaveStatusFilter === 'Rejected' ? 'default' : 'outline'}
                size="sm"
                onClick={() => filterLeaveRequests('Rejected')}
              >
                Rejected
              </Button>
            </div>

            {leaveRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="mx-auto h-12 w-12 mb-2" />
                <p>No {leaveStatusFilter === 'all' ? '' : leaveStatusFilter.toLowerCase()} leave requests found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leaveRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{request.profiles?.full_name}</div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            request.status === 'Pending' 
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200' 
                              : request.status === 'Approved'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {request.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {request.start_date} to {request.end_date} ({request.total_days} days)
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Type:</span> {request.leave_type}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Reason:</span> {request.reason}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">School:</span> {request.schools?.name}
                      </div>
                      {request.status === 'Approved' && request.approved_at && (
                        <div className="text-xs text-green-600">
                          <span className="font-medium">Approved on:</span> {new Date(request.approved_at).toLocaleDateString()}
                        </div>
                      )}
                      {request.status === 'Rejected' && request.rejected_at && (
                        <div className="text-xs text-red-600">
                          <span className="font-medium">Rejected on:</span> {new Date(request.rejected_at).toLocaleDateString()}
                        </div>
                      )}
                      {request.admin_remarks && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Admin Remarks:</span> {request.admin_remarks}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {request.status === 'Pending' ? (
                        <>
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setSelectedLeave(request);
                              setLeaveFormData({ status: 'Approved', admin_remarks: '' });
                              setShowLeaveDialog(true);
                            }}
                            disabled={actionLoading === request.id}
                          >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => {
                                setSelectedLeave(request);
                                setLeaveFormData({ status: 'Rejected', admin_remarks: '' });
                                setShowLeaveDialog(true);
                              }}
                              disabled={actionLoading === request.id}
                            >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {request.status === 'Approved' ? '✓ Approved' : '✗ Rejected'}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* Add Teacher Dialog */}
      <AddTeacherDialog
        isOpen={showAddDialog}
        onClose={() => {
          setShowAddDialog(false);
          // Don't call resetForm here - AddTeacherDialog handles its own reset
        }}
        onSuccess={async () => {
          console.log('✅ Teacher creation successful, starting refresh...');
          setShowAddDialog(false);
          
          // Small delay to ensure database transaction is committed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Force immediate refresh using loadTeachers
          try {
            console.log('🔄 Calling loadTeachers...');
            await loadTeachers();
            console.log('✅ loadTeachers completed, teachers state updated');
            
            // Also refresh all data to update stats
            await loadAllData();
            console.log('✅ loadAllData completed');
          } catch (error) {
            console.error('❌ Error in onSuccess refresh:', error);
            // Force reload all data as fallback
            await loadAllData();
          }
        }}
      />

      {/* Edit Teacher Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open: boolean) => {
        setShowEditDialog(open);
        if (!open) {
          setShowPassword(false); // Reset password visibility when closing
        }
      }}>
        <DialogContent className="max-w-2xl bg-white max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit Teacher</DialogTitle>
            <DialogDescription>
              Update teacher information and school assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 bg-white rounded-lg overflow-y-auto flex-1 pr-2" style={{ maxHeight: 'calc(90vh - 180px)' }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_full_name">Full Name</Label>
                <Input
                  id="edit_full_name"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <Label htmlFor="edit_email">Email</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter email address"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_phone">Phone</Label>
                <Input
                  id="edit_phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="edit_qualification">Qualification</Label>
                <Input
                  id="edit_qualification"
                  value={formData.qualification}
                  onChange={(e) => handleInputChange('qualification', e.target.value)}
                  placeholder="Enter qualification"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_experience_years">Experience (Years)</Label>
                <Input
                  id="edit_experience_years"
                  type="number"
                  value={formData.experience_years}
                  onChange={(e) => handleInputChange('experience_years', parseInt(e.target.value) || 0)}
                  placeholder="Enter years of experience"
                />
              </div>
              <div>
                <Label htmlFor="edit_specialization">Specialization</Label>
                <Input
                  id="edit_specialization"
                  value={formData.specialization}
                  onChange={(e) => handleInputChange('specialization', e.target.value)}
                  placeholder="Enter specialization"
                />
              </div>
            </div>
            <div>
              <Label>Change Current Password</Label>
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  Use this to reset the password if the teacher has forgotten it. A new password will be generated and assigned.
                </p>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="new_password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8: uppercase, lowercase, number)"
                    className="pl-10 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={generateNewPassword}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Generate
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={copyNewPassword}
                    disabled={!newPassword}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={!newPassword || newPassword.length < 8 || actionLoading === 'change-password'}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {actionLoading === 'change-password' ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-3 w-3" />
                        Change Password
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* School and Grade Assignments Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">School & Grade Assignments</h3>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => {
                    const newAssignment: TeacherSchool = {
                      id: `temp-${Date.now()}`,
                      teacher_id: editingTeacher?.id || '',
                      school_id: '',
                      grades_assigned: [],
                      subjects: [],
                      working_days_per_week: 5,
                      max_students_per_session: 30,
                      is_primary: formData.school_assignments.length === 0
                    };
                    setFormData(prev => ({
                      ...prev,
                      school_assignments: [...prev.school_assignments, newAssignment]
                    }));
                  }}
                  className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <School className="h-4 w-4" />
                  Add School
                </Button>
              </div>
              
              {formData.school_assignments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <School className="mx-auto h-12 w-12 mb-2" />
                  <p>No schools assigned</p>
                  <p className="text-sm">Click &quot;Add School&quot; to assign schools and grades</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.school_assignments.map((assignment, index) => (
                    <div key={assignment.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Assignment {index + 1}</h4>
                        <div className="flex items-center gap-2">
                          <Label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={assignment.is_primary}
                              onChange={(e) => {
                                const updatedAssignments = [...formData.school_assignments];
                                updatedAssignments[index].is_primary = e.target.checked;
                                // If this is set as primary, unset others
                                if (e.target.checked) {
                                  updatedAssignments.forEach((a, i) => {
                                    if (i !== index) a.is_primary = false;
                                  });
                                }
                                setFormData(prev => ({
                                  ...prev,
                                  school_assignments: updatedAssignments
                                }));
                              }}
                            />
                            Primary School
                          </Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                school_assignments: prev.school_assignments.filter((_, i) => i !== index)
                              }));
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`school_${index}`}>School</Label>
                          <Select
                            value={assignment.school_id}
                            onValueChange={(value) => {
                              const updatedAssignments = [...formData.school_assignments];
                              updatedAssignments[index].school_id = value;
                              updatedAssignments[index].grades_assigned = []; // Reset grades when school changes
                              setFormData(prev => ({
                                ...prev,
                                school_assignments: updatedAssignments
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a school" />
                            </SelectTrigger>
                            <SelectContent>
                              {schools.map((school) => (
                                <SelectItem key={school.id} value={school.id}>
                                  {school.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor={`working_days_${index}`}>Working Days/Week</Label>
                          <Input
                            id={`working_days_${index}`}
                            type="number"
                            min="1"
                            max="7"
                            value={assignment.working_days_per_week}
                            onChange={(e) => {
                              const updatedAssignments = [...formData.school_assignments];
                              updatedAssignments[index].working_days_per_week = parseInt(e.target.value) || 5;
                              setFormData(prev => ({
                                ...prev,
                                school_assignments: updatedAssignments
                              }));
                            }}
                          />
                        </div>
                      </div>
                      
                      {assignment.school_id && (
                        <>
                          <div>
                            <Label>Grades</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map((grade) => (
                                <Label key={grade} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={assignment.grades_assigned.includes(grade)}
                                    onChange={(e) => {
                                      const updatedAssignments = [...formData.school_assignments];
                                      if (e.target.checked) {
                                        updatedAssignments[index].grades_assigned = [...updatedAssignments[index].grades_assigned, grade];
                                      } else {
                                        updatedAssignments[index].grades_assigned = updatedAssignments[index].grades_assigned.filter((g: any) => g !== grade);
                                      }
                                      setFormData(prev => ({
                                        ...prev,
                                        school_assignments: updatedAssignments
                                      }));
                                    }}
                                  />
                                  <span className="text-sm">{grade}</span>
                                </Label>
                              ))}
                            </div>
                          </div>
                          
                          <div>
                            <Label>Subjects</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {availableSubjects.map((subject) => (
                                <Label key={subject} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={assignment.subjects.includes(subject)}
                                    onChange={(e) => {
                                      const updatedAssignments = [...formData.school_assignments];
                                      if (e.target.checked) {
                                        updatedAssignments[index].subjects = [...updatedAssignments[index].subjects, subject];
                                      } else {
                                        updatedAssignments[index].subjects = updatedAssignments[index].subjects.filter((s: any) => s !== subject);
                                      }
                                      setFormData(prev => ({
                                        ...prev,
                                        school_assignments: updatedAssignments
                                      }));
                                    }}
                                  />
                                  <span className="text-sm">{subject}</span>
                                </Label>
                              ))}
                              {/* Display custom subjects */}
                              {assignment.subjects
                                .filter((subject: any) => !availableSubjects.includes(subject))
                                .map((subject) => (
                                  <Label key={subject} className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={assignment.subjects.includes(subject)}
                                      onChange={(e) => {
                                        const updatedAssignments = [...formData.school_assignments];
                                        if (e.target.checked) {
                                          updatedAssignments[index].subjects = [...updatedAssignments[index].subjects, subject];
                                        } else {
                                          updatedAssignments[index].subjects = updatedAssignments[index].subjects.filter((s: any) => s !== subject);
                                        }
                                        setFormData(prev => ({
                                          ...prev,
                                          school_assignments: updatedAssignments
                                        }));
                                      }}
                                    />
                                    <span className="text-sm">{subject}</span>
                                  </Label>
                                ))}
                            </div>
                            {/* Add Custom Subject */}
                            <div className="mt-2 flex gap-2">
                              <Input
                                placeholder="Enter custom subject"
                                value={customSubjectInputs[assignment.id] || ''}
                                onChange={(e) => setCustomSubjectInputs(prev => ({
                                  ...prev,
                                  [assignment.id]: e.target.value
                                }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddCustomSubject(index);
                                  }
                                }}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={() => handleAddCustomSubject(index)}
                                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                              >
                                <Plus className="h-4 w-4" />
                                Add
                              </Button>
                            </div>
                          </div>
                          
                          <div>
                            <Label htmlFor={`max_students_${index}`}>Max Students/Session</Label>
                            <Input
                              id={`max_students_${index}`}
                              type="number"
                              min="1"
                              max="50"
                              value={assignment.max_students_per_session}
                              onChange={(e) => {
                                const updatedAssignments = [...formData.school_assignments];
                                updatedAssignments[index].max_students_per_session = parseInt(e.target.value) || 30;
                                setFormData(prev => ({
                                  ...prev,
                                  school_assignments: updatedAssignments
                                }));
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false);
              setCustomSubjectInputs({});
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateTeacher}
              disabled={actionLoading === 'edit'}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {actionLoading === 'edit' ? 'Updating...' : 'Update Teacher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Action Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {leaveFormData.status === 'Approved' ? 'Approve Leave Request' : 'Reject Leave Request'}
            </DialogTitle>
            <DialogDescription>
              {leaveFormData.status === 'Approved' 
                ? 'Are you sure you want to approve this leave request?' 
                : 'Are you sure you want to reject this leave request?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="admin_remarks">Admin Remarks (Optional)</Label>
              <Textarea
                id="admin_remarks"
                value={leaveFormData.admin_remarks}
                onChange={(e) => setLeaveFormData(prev => ({ ...prev, admin_remarks: e.target.value }))}
                placeholder="Enter any remarks about this decision..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedLeave) {
                  handleLeaveAction(selectedLeave.id, leaveFormData.status === 'Approved' ? 'approve' : 'reject');
                }
              }}
              className={leaveFormData.status === 'Approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {leaveFormData.status === 'Approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Panel */}
      <NotificationPanel
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onDismiss={dismiss}
      />

      {/* Teacher Profile View */}
      <TeacherProfileView
        teacher={selectedTeacher}
        open={showProfileView}
        onClose={() => {
          setShowProfileView(false);
          setSelectedTeacher(null);
        }}
        refreshTrigger={profileRefreshTrigger}
      />
    </div>
  );
}

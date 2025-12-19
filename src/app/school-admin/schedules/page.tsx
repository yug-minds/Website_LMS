"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { fetchWithCsrf } from "../../../lib/csrf-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { 
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Building2,
  Users,
  BookOpen,
  MapPin,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  Loader2
} from "lucide-react";
import { useSchoolAdmin } from "../../../contexts/SchoolAdminContext";
import { useAutoSaveForm } from "../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../lib/form-persistence";

interface Schedule {
  id: string;
  school_id: string;
  class_id?: string;
  teacher_id?: string;
  subject: string;
  grade: string;
  day_of_week: string;
  period_id?: string;
  room_id?: string;
  start_time: string;
  end_time: string;
  academic_year: string;
  is_active: boolean;
  notes?: string;
  class?: {
    id: string;
    class_name: string;
    grade: string;
    subject: string;
  };
  teacher?: {
    id: string;
    full_name: string;
    email: string;
  };
  period?: {
    id: string;
    period_number: number;
    start_time: string;
    end_time: string;
  };
  room?: {
    id: string;
    room_number: string;
    room_name?: string;
    capacity?: number;
  };
}

interface Period {
  id: string;
  school_id: string;
  period_number: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface Room {
  id: string;
  school_id: string;
  room_number: string;
  room_name?: string;
  capacity?: number;
  location?: string;
  facilities?: string[];
  is_active: boolean;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
}

interface Class {
  id: string;
  class_name: string;
  grade: string;
  subject?: string;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const AVAILABLE_GRADES = [
  'Pre-K', 
  'Kindergarten', 
  'Grade 1', 
  'Grade 2', 
  'Grade 3', 
  'Grade 4', 
  'Grade 5',
  'Grade 6', 
  'Grade 7', 
  'Grade 8', 
  'Grade 9', 
  'Grade 10', 
  'Grade 11', 
  'Grade 12'
];

export default function ClassSchedulingPage() {
  const { schoolInfo } = useSchoolAdmin();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolGrades, setSchoolGrades] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'class'>('week');
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog states
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const initialScheduleForm = {
    class_id: '',
    teacher_id: '',
    subject: '',
    grade: '',
    day_of_week: 'Monday',
    period_id: '',
    room_id: '',
    start_time: '',
    end_time: '',
    academic_year: '2024-25',
    notes: ''
  };

  const initialPeriodForm = {
    period_number: 1,
    start_time: '',
    end_time: '',
    is_active: true
  };

  const initialRoomForm = {
    room_number: '',
    room_name: '',
    capacity: '',
    location: '',
    facilities: [] as string[],
    is_active: true
  };

  // Load saved form data (after schoolInfo is available)
  const savedScheduleForm = typeof window !== 'undefined' && schoolInfo?.id
    ? loadFormData<typeof initialScheduleForm>(`school-admin-schedule-form-${schoolInfo.id}`)
    : null;
  const savedPeriodForm = typeof window !== 'undefined' && schoolInfo?.id
    ? loadFormData<typeof initialPeriodForm>(`school-admin-period-form-${schoolInfo.id}`)
    : null;
  const savedRoomForm = typeof window !== 'undefined' && schoolInfo?.id
    ? loadFormData<typeof initialRoomForm>(`school-admin-room-form-${schoolInfo.id}`)
    : null;

  // Form states
  const [scheduleForm, setScheduleForm] = useState(initialScheduleForm);
  const [periodForm, setPeriodForm] = useState(initialPeriodForm);
  const [roomForm, setRoomForm] = useState(initialRoomForm);

  // Load saved data when schoolInfo becomes available
  useEffect(() => {
    if (schoolInfo?.id && savedScheduleForm) {
      setScheduleForm(savedScheduleForm);
    }
    if (schoolInfo?.id && savedPeriodForm) {
      setPeriodForm(savedPeriodForm);
    }
    if (schoolInfo?.id && savedRoomForm) {
      setRoomForm(savedRoomForm);
    }
  }, [schoolInfo?.id]);

  // Auto-save forms (only when schoolInfo is available)
  const scheduleFormId = schoolInfo?.id ? `school-admin-schedule-form-${schoolInfo.id}` : '';
  const periodFormId = schoolInfo?.id ? `school-admin-period-form-${schoolInfo.id}` : '';
  const roomFormId = schoolInfo?.id ? `school-admin-room-form-${schoolInfo.id}` : '';

  const { isDirty: isScheduleFormDirty, clearSavedData: clearScheduleForm } = useAutoSaveForm({
    formId: scheduleFormId || 'temp-schedule-form',
    formData: scheduleForm,
    autoSave: !!schoolInfo?.id, // Only auto-save when schoolInfo is loaded
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && schoolInfo?.id && !savedScheduleForm) {
        setScheduleForm(data);
      }
    },
    markDirty: true,
  });

  const { isDirty: isPeriodFormDirty, clearSavedData: clearPeriodForm } = useAutoSaveForm({
    formId: periodFormId || 'temp-period-form',
    formData: periodForm,
    autoSave: !!schoolInfo?.id,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && schoolInfo?.id && !savedPeriodForm) {
        setPeriodForm(data);
      }
    },
    markDirty: true,
  });

  const { isDirty: isRoomFormDirty, clearSavedData: clearRoomForm } = useAutoSaveForm({
    formId: roomFormId || 'temp-room-form',
    formData: roomForm,
    autoSave: !!schoolInfo?.id,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && schoolInfo?.id && !savedRoomForm) {
        setRoomForm(data);
      }
    },
    markDirty: true,
  });

  // Helper function to normalize grade for comparison
  const normalizeGradeForComparison = (grade: string): string => {
    // Remove "Grade " prefix and convert to lowercase for comparison
    const normalized = grade.replace(/^Grade\s+/i, '').trim().toLowerCase();
    // Handle special cases
    if (normalized === 'pre-k' || normalized === 'prek') return 'pre-k';
    if (normalized === 'k' || normalized === 'kindergarten') return 'kindergarten';
    return normalized;
  };

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };

      // Fetch school info to get grades_offered
      try {
        const schoolResponse = await fetchWithCsrf(`/api/school-admin/school`, {
          cache: 'no-store',
        });
        
        if (schoolResponse.ok) {
          const schoolData = await schoolResponse.json();
          if (schoolData.school?.grades_offered && Array.isArray(schoolData.school.grades_offered)) {
            setSchoolGrades(schoolData.school.grades_offered);
            console.log('✅ School grades loaded:', schoolData.school.grades_offered);
          } else {
            // Fallback to all available grades if school doesn't have grades_offered set
            setSchoolGrades(AVAILABLE_GRADES);
            console.log('⚠️ No grades_offered found, using all available grades');
          }
        } else {
          // Fallback to all available grades if school fetch fails
          setSchoolGrades(AVAILABLE_GRADES);
          console.log('⚠️ Failed to fetch school, using all available grades');
        }
      } catch (err) {
        console.log('Error fetching school grades, using all available grades:', err);
        setSchoolGrades(AVAILABLE_GRADES);
      }

      // Load all data in parallel
      const [schedulesRes, periodsRes, roomsRes, teachersRes] = await Promise.all([
        fetchWithCsrf('/api/school-admin/schedules', { cache: 'no-store' }),
        fetchWithCsrf('/api/school-admin/periods', { cache: 'no-store' }),
        fetchWithCsrf('/api/school-admin/rooms', { cache: 'no-store' }),
        fetchWithCsrf('/api/school-admin/teachers', { cache: 'no-store' })
      ]);

      if (schedulesRes.ok) {
        const data = await schedulesRes.json();
        setSchedules(data.schedules || []);
      }

      if (periodsRes.ok) {
        const data = await periodsRes.json();
        setPeriods(data.periods || []);
      }

      if (roomsRes.ok) {
        const data = await roomsRes.json();
        setRooms(data.rooms || []);
      } else {
        console.error('❌ Error loading rooms:', roomsRes.status);
        const errorData = await roomsRes.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Rooms error details:', errorData);
        setRooms([]);
      }

      if (teachersRes.ok) {
        const data = await teachersRes.json();
        const teacherSchools = data.teachers || [];
        
        console.log('📋 Raw teachers API response:', {
          count: teacherSchools.length,
          sample: teacherSchools[0]
        });
        
        // Transform the API response to match expected format for schedule form
        // API returns: [{ teacher: {...}, profile: {...}, ...teacher_schools }]
        // We need: [{ id, full_name, email, ... }]
        // Note: teacher_id in schedules is the profile ID (user ID), not the teacher record ID
        const transformedTeachers = teacherSchools
           
          .map((ts: any) => {
            const teacher = ts.teacher || {};
            const profile = ts.profile || {};
            
            // Use profile ID (user ID) as the primary ID since schedules.teacher_id references profiles.id
            const profileId = profile.id || ts.teacher_id || teacher.profile_id;
            
            if (!profileId) {
              console.warn('⚠️ No profile ID found for teacher_schools record:', ts.id);
              return null;
            }
            
            // Use teacher data first, fallback to profile data
            const transformed = {
              id: profileId, // This should be the profile ID (user ID)
              full_name: teacher.full_name || profile.full_name || 'Unknown',
              email: teacher.email || profile.email || '',
              phone: teacher.phone || profile.phone || ''
            };
            
            // Validate that we have at least a name and email
            if (transformed.full_name === 'Unknown' || !transformed.email) {
              console.warn('⚠️ Invalid teacher data:', transformed);
              return null;
            }
            
            return transformed;
          })
           
          .filter((teacher: any) => teacher !== null); // Filter out null entries
        
        console.log('✅ Teachers loaded for schedule form:', transformedTeachers.length);
        if (transformedTeachers.length > 0) {
          console.log('📋 Sample teacher data:', transformedTeachers[0]);
        } else {
          console.warn('⚠️ No teachers found after transformation.');
          console.warn('📋 Raw API response:', JSON.stringify(teacherSchools, null, 2));
        }
        setTeachers(transformedTeachers);
      } else {
        console.error('❌ Error loading teachers:', teachersRes.status);
        const errorData = await teachersRes.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error details:', errorData);
        setTeachers([]);
      }

      // Load classes
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, class_name, grade, subject')
        .eq('is_active', true)
        .order('grade', { ascending: true })
         
        .order('class_name', { ascending: true }) as any;
      
      if (classesData) {
        setClasses(classesData);
      }

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter schedules
  const filteredSchedules = schedules.filter((schedule: any) => {
    const matchesDay = viewMode === 'day' ? schedule.day_of_week === selectedDay : true;
    const matchesGrade = selectedGrade === 'all' || schedule.grade === selectedGrade;
    const matchesClass = selectedClass === 'all' || schedule.class_id === selectedClass;
    const matchesSearch = searchTerm === '' || 
      schedule.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.teacher?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.room?.room_number.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesDay && matchesGrade && matchesClass && matchesSearch && schedule.is_active;
  });

  // Group schedules by day for week view
  const schedulesByDay = DAYS_OF_WEEK.reduce((acc: Record<string, Schedule[]>, day: string) => {
    acc[day] = filteredSchedules.filter((s: any) => s.day_of_week === day);
    return acc;
  }, {} as Record<string, Schedule[]>);

  // Handle schedule operations
  const handleCreateSchedule = async () => {
    try {
      // Prepare request body - convert empty strings to null for optional fields
      const requestBody = {
        ...scheduleForm,
        teacher_id: scheduleForm.teacher_id || null,
        period_id: scheduleForm.period_id || null,
        room_id: scheduleForm.room_id || null,
        class_id: scheduleForm.class_id || null,
        notes: scheduleForm.notes || null
      };

      const response = await fetchWithCsrf('/api/school-admin/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || error.details || 'Failed to create schedule'}`);
        return;
      }

      await loadData();
      setScheduleDialogOpen(false);
      resetScheduleForm();
    } catch (error) {
      console.error('Error creating schedule:', error);
      alert('Failed to create schedule');
    }
  };

  const handleUpdateSchedule = async () => {
    if (!editingSchedule) return;

    try {
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };

      // Prepare request body - convert empty strings to null for optional fields
      const requestBody = {
        ...scheduleForm,
        teacher_id: scheduleForm.teacher_id || null,
        period_id: scheduleForm.period_id || null,
        room_id: scheduleForm.room_id || null,
        class_id: scheduleForm.class_id || null,
        notes: scheduleForm.notes || null
      };

      const response = await fetch(`/api/school-admin/schedules/${editingSchedule.id}`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || error.details || 'Failed to update schedule'}`);
        return;
      }

      await loadData();
      setScheduleDialogOpen(false);
      setEditingSchedule(null);
      resetScheduleForm();
    } catch (error) {
      console.error('Error updating schedule:', error);
      alert('Failed to update schedule');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };

      const response = await fetch(`/api/school-admin/schedules/${id}`, {
        method: 'DELETE',
        headers: authHeader
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || error.details || 'Failed to delete schedule'}`);
        return;
      }

      await loadData();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Failed to delete schedule');
    }
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      class_id: schedule.class_id || '',
      teacher_id: schedule.teacher_id || '',
      subject: schedule.subject,
      grade: schedule.grade,
      day_of_week: schedule.day_of_week,
      period_id: schedule.period_id || '',
      room_id: schedule.room_id || '',
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      academic_year: schedule.academic_year,
      notes: schedule.notes || ''
    });
    setScheduleDialogOpen(true);
  };

  const resetScheduleForm = () => {
    setScheduleForm({
      class_id: '',
      teacher_id: '',
      subject: '',
      grade: '',
      day_of_week: 'Monday',
      period_id: '',
      room_id: '',
      start_time: '',
      end_time: '',
      academic_year: '2024-25',
      notes: ''
    });
    setEditingSchedule(null);
  };

  // Handle period operations
  const handleCreatePeriod = async () => {
    try {
      const response = await fetchWithCsrf('/api/school-admin/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(periodForm)
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || error.details || 'Failed to create period'}`);
        return;
      }

      await loadData();
      setPeriodForm({ period_number: 1, start_time: '', end_time: '', is_active: true });
      setEditingPeriod(null);
    } catch (error) {
      console.error('Error creating period:', error);
      alert('Failed to create period');
    }
  };

  const handleUpdatePeriod = async () => {
    if (!editingPeriod) {
      alert('Error: No period selected for editing');
      return;
    }

    if (!periodForm.start_time || !periodForm.end_time) {
      alert('Error: Start time and end time are required');
      return;
    }

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session?.access_token) {
        alert('Error: Not authenticated. Please log in again.');
        return;
      }

      const authHeader = { 'Authorization': `Bearer ${session.data.session.access_token}` };

      const response = await fetch(`/api/school-admin/periods/${editingPeriod.id}`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(periodForm)
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error || data.details || 'Failed to update period'}`);
        return;
      }

      await loadData();
      setPeriodForm({ period_number: 1, start_time: '', end_time: '', is_active: true });
      setEditingPeriod(null);
      alert('Period updated successfully');
    } catch (error) {
      console.error('Error updating period:', error);
      alert(`Failed to update period: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeletePeriod = async (id: string) => {
    if (!id) {
      alert('Error: Period ID is missing');
      return;
    }

    if (!confirm('Are you sure you want to delete this period? This action cannot be undone.')) return;

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session?.access_token) {
        alert('Error: Not authenticated. Please log in again.');
        return;
      }

      const authHeader = { 'Authorization': `Bearer ${session.data.session.access_token}` };

      const response = await fetch(`/api/school-admin/periods/${id}`, {
        method: 'DELETE',
        headers: authHeader
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error || data.details || 'Failed to delete period'}`);
        return;
      }

      await loadData();
      alert('Period deleted successfully');
    } catch (error) {
      console.error('Error deleting period:', error);
      alert(`Failed to delete period: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

   
  const handleEditPeriod = (period: any) => {
    setEditingPeriod(period);
    setPeriodForm({
      period_number: period.period_number || 1,
      start_time: period.start_time || '',
      end_time: period.end_time || '',
      is_active: period.is_active !== undefined ? period.is_active : true
    });
  };

  const resetPeriodForm = () => {
    setPeriodForm({ period_number: 1, start_time: '', end_time: '', is_active: true });
    setEditingPeriod(null);
  };

  // Handle room operations
  const handleCreateRoom = async () => {
    try {
      const response = await fetchWithCsrf('/api/school-admin/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...roomForm,
          capacity: roomForm.capacity ? parseInt(roomForm.capacity) : null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || error.details || 'Failed to create room'}`);
        return;
      }

      await loadData();
      setRoomDialogOpen(false);
      setRoomForm({
        room_number: '',
        room_name: '',
        capacity: '',
        location: '',
        facilities: [],
        is_active: true
      });
      setEditingRoom(null);
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room');
    }
  };

  const handleUpdateRoom = async () => {
    if (!editingRoom) return;

    try {
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };

      const response = await fetch(`/api/school-admin/rooms/${editingRoom.id}`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...roomForm,
          capacity: roomForm.capacity ? parseInt(roomForm.capacity) : null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || error.details || 'Failed to update room'}`);
        return;
      }

      await loadData();
      setRoomForm({
        room_number: '',
        room_name: '',
        capacity: '',
        location: '',
        facilities: [],
        is_active: true
      });
      setEditingRoom(null);
    } catch (error) {
      console.error('Error updating room:', error);
      alert('Failed to update room');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('Are you sure you want to delete this room? This action cannot be undone.')) return;

    try {
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };

      const response = await fetch(`/api/school-admin/rooms/${id}`, {
        method: 'DELETE',
        headers: authHeader
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || error.details || 'Failed to delete room'}`);
        return;
      }

      await loadData();
    } catch (error) {
      console.error('Error deleting room:', error);
      alert('Failed to delete room');
    }
  };

  // Handle sync schedules to teachers
  const handleSyncToTeachers = async () => {
    if (!confirm('This will sync all active class schedules to the teacher dashboard. Continue?')) {
      return;
    }

    try {
      setIsSyncing(true);
      const response = await fetchWithCsrf('/api/school-admin/schedules/sync-to-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error || data.details || 'Failed to sync schedules to teachers'}`);
        return;
      }

      alert(`Success! ${data.synced} schedule(s) synced to teacher dashboard. ${data.skipped} already existed.`);
    } catch (error) {
      console.error('Error syncing schedules to teachers:', error);
      alert('Failed to sync schedules to teachers');
    } finally {
      setIsSyncing(false);
    }
  };

   
  const handleEditRoom = (room: any) => {
    setEditingRoom(room);
    setRoomForm({
      room_number: room.room_number || '',
      room_name: room.room_name || '',
      capacity: room.capacity ? String(room.capacity) : '',
      location: room.location || '',
      facilities: room.facilities || [],
      is_active: room.is_active !== undefined ? room.is_active : true
    });
  };

  const resetRoomForm = () => {
    setRoomForm({
      room_number: '',
      room_name: '',
      capacity: '',
      location: '',
      facilities: [],
      is_active: true
    });
    setEditingRoom(null);
  };

  // Get available grades - filter to only show school's assigned grades
  const getAvailableGrades = () => {
    if (schoolGrades.length > 0) {
      // Filter AVAILABLE_GRADES to only include grades assigned to the school
      const normalizedSchoolGrades = schoolGrades.map((g: any) => normalizeGradeForComparison(g));
      return AVAILABLE_GRADES.filter((grade: any) => {
        const normalizedGrade = normalizeGradeForComparison(grade);
        return normalizedSchoolGrades.includes(normalizedGrade);
      });
    }
    // Fallback to all available grades if school grades not loaded yet
    return AVAILABLE_GRADES;
  };

  const availableGrades = getAvailableGrades();
  
  // Get unique grades from schedules (for filter dropdown)
  const uniqueGradesFromSchedules = [...new Set(schedules.map((s: any) => s.grade))].sort();

  // Format time for display
  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Class Scheduling</h1>
        <p className="text-gray-600 mt-2">Create and manage school timetable</p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => setScheduleDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Schedule
          </Button>
          <Button variant="outline" onClick={() => setPeriodDialogOpen(true)}>
            <Clock className="h-4 w-4 mr-2" />
            Manage Periods
          </Button>
          <Button variant="outline" onClick={() => setRoomDialogOpen(true)}>
            <Building2 className="h-4 w-4 mr-2" />
            Manage Rooms
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSyncToTeachers}
            disabled={isSyncing}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Push to Teachers
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="timetable" className="space-y-6">
        <TabsList>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="list">Schedule List</TabsTrigger>
        </TabsList>

        {/* Timetable Tab */}
        <TabsContent value="timetable" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>View Mode</Label>
                  <Select value={viewMode} onValueChange={(v: 'day' | 'week' | 'class') => setViewMode(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">By Day</SelectItem>
                      <SelectItem value="week">By Week</SelectItem>
                      <SelectItem value="class">By Class</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {viewMode === 'day' && (
                  <div>
                    <Label>Day</Label>
                    <Select value={selectedDay} onValueChange={setSelectedDay}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day: any) => (
                          <SelectItem key={day} value={day}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Grade</Label>
                  <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      {uniqueGradesFromSchedules.map((grade: any) => (
                        <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search schedules..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Week View */}
          {viewMode === 'week' && (
            <div className="space-y-4">
              {DAYS_OF_WEEK.map((day: any) => {
                const daySchedules = schedulesByDay[day] || [];
                return (
                  <Card key={day}>
                    <CardHeader>
                      <CardTitle className="text-lg">{day}</CardTitle>
                      <CardDescription>{daySchedules.length} classes scheduled</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {daySchedules.length === 0 ? (
                        <p className="text-gray-500 text-sm">No classes scheduled for this day</p>
                      ) : (
                        <div className="space-y-2">
                          {daySchedules.map((schedule: any) => (
                            <div
                              key={schedule.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                            >
                              <div className="flex items-center gap-4">
                                <div className="text-sm font-medium">
                                  {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                                </div>
                                <div>
                                  <div className="font-medium">{schedule.subject}</div>
                                  <div className="text-sm text-gray-600">
                                    {schedule.grade} • {schedule.teacher?.full_name || 'No teacher'}
                                  </div>
                                </div>
                                {schedule.room && (
                                  <Badge variant="outline">
                                    <MapPin className="h-3 w-3 mr-1" />
                                    {schedule.room.room_number}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditSchedule(schedule)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteSchedule(schedule.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Day View */}
          {viewMode === 'day' && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedDay} Schedule</CardTitle>
                <CardDescription>
                  {filteredSchedules.length} classes scheduled
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredSchedules.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No classes scheduled for {selectedDay}</p>
                ) : (
                  <div className="space-y-2">
                    {filteredSchedules
                      .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
                      .map((schedule: any) => (
                        <div
                          key={schedule.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-sm font-medium w-32">
                              {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                            </div>
                            <div>
                              <div className="font-medium">{schedule.subject}</div>
                              <div className="text-sm text-gray-600">
                                {schedule.grade} • {schedule.teacher?.full_name || 'No teacher'}
                              </div>
                            </div>
                            {schedule.room && (
                              <Badge variant="outline">
                                <MapPin className="h-3 w-3 mr-1" />
                                {schedule.room.room_number}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditSchedule(schedule)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSchedule(schedule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Class View */}
          {viewMode === 'class' && (
            <Card>
              <CardHeader>
                <CardTitle>Schedule by Class</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Label>Select Class</Label>
                  <Select value={selectedClass} onValueChange={setSelectedClass}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes.map((cls: any) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.class_name} - {cls.grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Similar to day view but filtered by class */}
                {filteredSchedules.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No classes scheduled</p>
                ) : (
                  <div className="space-y-2">
                    {filteredSchedules
                      .sort((a: any, b: any) => {
                        const dayOrder = DAYS_OF_WEEK.indexOf(a.day_of_week) - DAYS_OF_WEEK.indexOf(b.day_of_week);
                        if (dayOrder !== 0) return dayOrder;
                        return a.start_time.localeCompare(b.start_time);
                      })
                      .map((schedule: any) => (
                        <div
                          key={schedule.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <Badge variant="outline">{schedule.day_of_week}</Badge>
                            <div className="text-sm font-medium w-32">
                              {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                            </div>
                            <div>
                              <div className="font-medium">{schedule.subject}</div>
                              <div className="text-sm text-gray-600">
                                {schedule.grade} • {schedule.teacher?.full_name || 'No teacher'}
                              </div>
                            </div>
                            {schedule.room && (
                              <Badge variant="outline">
                                <MapPin className="h-3 w-3 mr-1" />
                                {schedule.room.room_number}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditSchedule(schedule)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSchedule(schedule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Schedule List Tab */}
        <TabsContent value="list" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>All Schedules</CardTitle>
              <CardDescription>Complete list of all scheduled classes</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules
                    .sort((a: any, b: any) => {
                      const dayOrder = DAYS_OF_WEEK.indexOf(a.day_of_week) - DAYS_OF_WEEK.indexOf(b.day_of_week);
                      if (dayOrder !== 0) return dayOrder;
                      return a.start_time.localeCompare(b.start_time);
                    })
                    .map((schedule: any) => (
                      <TableRow key={schedule.id}>
                        <TableCell>
                          <Badge variant="outline">{schedule.day_of_week}</Badge>
                        </TableCell>
                        <TableCell>
                          {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                        </TableCell>
                        <TableCell className="font-medium">{schedule.subject}</TableCell>
                        <TableCell>{schedule.grade}</TableCell>
                        <TableCell>{schedule.teacher?.full_name || '-'}</TableCell>
                        <TableCell>{schedule.room?.room_number || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditSchedule(schedule)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSchedule(schedule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {filteredSchedules.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-lg font-medium">No schedules found</p>
                  <p className="text-sm">Create a new schedule to get started</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={(open) => {
        setScheduleDialogOpen(open);
        if (!open) {
          resetScheduleForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Add New Schedule'}</DialogTitle>
            <DialogDescription>
              Create a new class schedule with teacher, time, and room assignment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={scheduleForm.subject}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, subject: e.target.value })}
                  placeholder="e.g., Mathematics"
                />
              </div>
              <div>
                <Label htmlFor="grade">Grade *</Label>
                <Select
                  value={scheduleForm.grade || undefined}
                  onValueChange={(value) => setScheduleForm({ ...scheduleForm, grade: value })}
                >
                  <SelectTrigger id="grade">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGrades.length > 0 ? (
                      availableGrades.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))
                    ) : (
                      AVAILABLE_GRADES.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {availableGrades.length === 0 && schoolGrades.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Loading school grades...</p>
                )}
                {availableGrades.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Showing {availableGrades.length} grade(s) assigned to your school
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="day_of_week">Day of Week *</Label>
                <Select
                  value={scheduleForm.day_of_week}
                  onValueChange={(value) => setScheduleForm({ ...scheduleForm, day_of_week: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day: any) => (
                      <SelectItem key={day} value={day}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="teacher_id">Teacher</Label>
                <Select
                  value={scheduleForm.teacher_id || undefined}
                  onValueChange={(value) => setScheduleForm({ ...scheduleForm, teacher_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.length > 0 ? (
                      <>
                        {teachers.map((teacher: any) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            {teacher.full_name}
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <SelectItem value="none" disabled>No teachers available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="period_id">Period *</Label>
                <Select
                  value={scheduleForm.period_id || undefined}
                  onValueChange={(value) => {
                    const selectedPeriod = periods.find((p: any) => p.id === value);
                    setScheduleForm({ 
                      ...scheduleForm, 
                      period_id: value === 'none' ? '' : value,
                      start_time: selectedPeriod ? selectedPeriod.start_time : '',
                      end_time: selectedPeriod ? selectedPeriod.end_time : ''
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select period *" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.length > 0 ? (
                      <>
                        {periods.map((period: any) => (
                          <SelectItem key={period.id} value={period.id}>
                            Period {period.period_number} ({formatTime(period.start_time)} - {formatTime(period.end_time)})
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <SelectItem value="none" disabled>No periods available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="room_id">Room</Label>
                <Select
                  value={scheduleForm.room_id || undefined}
                  onValueChange={(value) => setScheduleForm({ ...scheduleForm, room_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select room (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.length > 0 ? (
                      <>
                        {rooms.map((room: any) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.room_number} {room.room_name && `- ${room.room_name}`}
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <SelectItem value="none" disabled>No rooms available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={scheduleForm.notes}
                onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setScheduleDialogOpen(false);
              resetScheduleForm();
            }}>
              Cancel
            </Button>
            <Button onClick={editingSchedule ? handleUpdateSchedule : handleCreateSchedule}>
              {editingSchedule ? 'Update' : 'Create'} Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period Dialog */}
      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Periods</DialogTitle>
            <DialogDescription>Define time periods for class scheduling</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="max-h-64 overflow-y-auto space-y-2">
              {periods.map((period: any) => (
                <div key={period.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <div className="font-medium">Period {period.period_number}</div>
                    <div className="text-sm text-gray-600">
                      {formatTime(period.start_time)} - {formatTime(period.end_time)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={period.is_active ? 'default' : 'secondary'}>
                      {period.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditPeriod(period)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePeriod(period.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>Period Number</Label>
                  <Input
                    type="number"
                    value={periodForm.period_number}
                    onChange={(e) => setPeriodForm({ ...periodForm, period_number: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={periodForm.start_time}
                    onChange={(e) => setPeriodForm({ ...periodForm, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={periodForm.end_time}
                    onChange={(e) => setPeriodForm({ ...periodForm, end_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {editingPeriod && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetPeriodForm();
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={editingPeriod ? handleUpdatePeriod : handleCreatePeriod}
                  className={editingPeriod ? 'flex-1' : 'w-full'}
                >
                  {editingPeriod ? 'Update Period' : 'Add Period'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Rooms</DialogTitle>
            <DialogDescription>Add and manage classrooms</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="max-h-64 overflow-y-auto space-y-2">
              {rooms.map((room: any) => (
                <div key={room.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <div className="font-medium">{room.room_number} {room.room_name && `- ${room.room_name}`}</div>
                    <div className="text-sm text-gray-600">
                      {room.capacity && `Capacity: ${room.capacity}`}
                      {room.location && room.capacity && ' • '}
                      {room.location && `Location: ${room.location}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={room.is_active ? 'default' : 'secondary'}>
                      {room.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditRoom(room)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRoom(room.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Room Number *</Label>
                  <Input
                    value={roomForm.room_number}
                    onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
                    placeholder="e.g., R101"
                  />
                </div>
                <div>
                  <Label>Room Name</Label>
                  <Input
                    value={roomForm.room_name}
                    onChange={(e) => setRoomForm({ ...roomForm, room_name: e.target.value })}
                    placeholder="e.g., Science Lab"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Capacity</Label>
                  <Input
                    type="number"
                    value={roomForm.capacity}
                    onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })}
                    placeholder="e.g., 30"
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input
                    value={roomForm.location}
                    onChange={(e) => setRoomForm({ ...roomForm, location: e.target.value })}
                    placeholder="e.g., First Floor"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {editingRoom && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetRoomForm();
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={editingRoom ? handleUpdateRoom : handleCreateRoom}
                  className={editingRoom ? 'flex-1' : 'w-full'}
                >
                  {editingRoom ? 'Update Room' : 'Add Room'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


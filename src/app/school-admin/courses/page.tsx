"use client";

import { useState, useEffect, useCallback, Fragment, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { addTokensToHeaders } from "../../../lib/csrf-client";
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
  Search,
  BookOpen,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  BarChart3
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { List } from "lucide-react";
import { fetchWithCsrf } from "../../../lib/csrf-client";

interface Course {
  id: string;
  school_id: string;
  grade: string;
  course_name: string;
  description: string;
  num_chapters: number;
   
  content_summary: any;
  status: 'Draft' | 'Published' | 'Archived';
  created_at: string;
  updated_at: string;
  chapters: CourseChapter[];
  student_progress: {
    total_students: number;
    completed_students: number;
    average_progress: number;
  };
}

interface CourseChapter {
  id: string;
  course_id: string;
  chapter_number: number;
  title: string;
  learning_outcomes: string[];
  content_type: 'video' | 'material' | 'assignment' | 'quiz';
  content_url: string;
  content_description: string;
  is_published: boolean;
  created_at: string;
}

interface CourseProgress {
  course_id: string;
  course_name: string;
  grade: string;
  total_students: number;
  completed_students: number;
  average_progress: number;
  chapters_completed: number;
  total_chapters: number;
}

export default function CoursesManagement() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseProgress, setCourseProgress] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [overallStudentCount, setOverallStudentCount] = useState<number>(0);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isCourseDetailsOpen, setIsCourseDetailsOpen] = useState(false);

  // Analytics data - will be calculated from real course data
  const [progressData, setProgressData] = useState<Array<{ name: string; completed: number; pending: number }>>([]);
  const [gradeProgressData, setGradeProgressData] = useState<Array<{ name: string; progress: number }>>([]);
  const [chapterCompletionData, setChapterCompletionData] = useState<Array<{ name: string; completed: number }>>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const isFetchingRef = useRef(false);
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(new Set());
  const [gradeStudentsByCourse, setGradeStudentsByCourse] = useState<Record<string, any>>({});
  const [loadingCourseProgressId, setLoadingCourseProgressId] = useState<string | null>(null);
  
  // For Progress Tracking tab - track expanded state per course+grade combination
  const [expandedProgressKeys, setExpandedProgressKeys] = useState<Set<string>>(new Set());
  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
   
  const [studentsDialogData, setStudentsDialogData] = useState<{ students: any[]; chapters: any[]; error?: string } | null>(null);
  const [overallProgressDialogOpen, setOverallProgressDialogOpen] = useState(false);
  const [overallProgressData, setOverallProgressData] = useState<any>(null);
  const [loadingOverallProgress, setLoadingOverallProgress] = useState(false);
  const [selectedCourseForStudents, setSelectedCourseForStudents] = useState<Course | null>(null);

  const loadCourses = useCallback(async () => {
    if (isFetchingRef.current) return; // prevent overlapping loads
    isFetchingRef.current = true;
    let isActive = true;
    const abort = new AbortController();
    try {
      setLoading(true);
      
      // Get current user's school via API (bypasses RLS)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get profile using API route to avoid RLS
      const profileHeaders = await addTokensToHeaders();
      const profileRes = await fetch(`/api/profile?userId=${user.id}`, { 
        cache: 'no-store', 
        signal: abort.signal,
        headers: profileHeaders
      });
      const profileJson = profileRes.ok ? await profileRes.json() : null;
      const profile = profileJson?.profile;
      // Verify user is school admin
      if (profile?.role !== 'school_admin') {
        console.warn('User is not a school admin. Role:', profile?.role);
        return;
      }
      
      // Get school_id from school API response (uses school_admins table)
      // Note: API routes will handle school_id automatically, but we fetch it for display
      try {
        const session = await supabase.auth.getSession();
        const schoolResponse = await fetch(`/api/school-admin/school`, {
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token || ''}`
          }
        });
        if (schoolResponse.ok) {
          const schoolData = await schoolResponse.json();
          if (schoolData.school?.id) {
            // Set school_id if needed for display
            // API routes will handle school_id automatically
          }
        }
      } catch (err) {
        console.warn('Could not fetch school info:', err);
        // Continue anyway - API routes will handle school_id
      }

      // Fetch courses using server API (filters by admin's school_id and bypasses RLS)
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };
      // Fetch courses and progress in parallel
      const [coursesRes, progressRes, studentsRes] = await Promise.all([
        fetch(`/api/school-admin/courses`, { cache: 'no-store', headers: authHeader, signal: abort.signal }),
        fetch(`/api/school-admin/courses/progress`, { cache: 'no-store', headers: authHeader, signal: abort.signal }),
        fetch(`/api/school-admin/students`, { cache: 'no-store', headers: authHeader, signal: abort.signal })
      ]);

      if (!coursesRes.ok) {
        console.error('Error loading courses from API');
        if (isActive) {
          setCourses([]);
          setCourseProgress([]);
        }
        return;
      }

      const [{ courses: apiCourses }, progressJson, studentsJson] = await Promise.all([
        coursesRes.json(),
        progressRes.ok ? progressRes.json() : Promise.resolve({ progress: [] }),
        studentsRes.ok ? studentsRes.json() : Promise.resolve({ students: [] })
      ]);

      // Set overall student count (distinct students in the school)
      if (studentsRes.ok) {
        const count = Array.isArray(studentsJson?.students) ? studentsJson.students.length : 0;
        if (isActive) setOverallStudentCount(count);
      }

      // Helper to normalize grade format
       
      const normalizeGrade = (g: any): string => {
        if (!g && g !== 0) return 'N/A';
        const str = String(g).trim();
        const numMatch = str.match(/(\d{1,2})/);
        if (numMatch) return `Grade ${numMatch[1]}`;
        return str;
      };

      // Server already expands courses per grade, so each course row has a single grade
       
      const mappedCourses: Course[] = (apiCourses || []).map((c: any) => {
        return {
          id: c.id,
          school_id: c.school_id,
          grade: normalizeGrade(c.grade || 'N/A'), // Use grade directly from expanded API response
          course_name: c.title || c.course_name || 'Untitled Course',
          description: c.description || '',
          num_chapters: Array.isArray(c.chapters) ? c.chapters.length : (c.num_chapters || 0),
          content_summary: null,
          status: ((c.status || 'Draft') as 'Draft' | 'Published' | 'Archived'),
          created_at: c.created_at,
          updated_at: c.updated_at,
           
          chapters: (c.chapters || []).map((ch: any) => ({
            id: ch.id,
            course_id: c.id,
            chapter_number: ch.chapter_number,
            title: ch.title,
            learning_outcomes: ch.learning_outcomes || [],
             
            content_type: (ch.content_type || 'material') as any,
            content_url: ch.content_url || '',
            content_description: ch.content_description || '',
            is_published: !!ch.is_published,
            created_at: ch.created_at
          })),
          student_progress: {
            total_students: 0,
            completed_students: 0,
            average_progress: 0
          }
        };
      });

      console.log(`✅ Mapped ${apiCourses?.length || 0} course row(s) from API`);

      // Fetch progress via API (bypasses RLS) and merge
      const progressData = progressJson || { progress: [] };
      const progressMap = new Map<string, { total_students: number; completed_students: number; average_progress: number; grade_breakdown?: Array<{grade:string; total:number; completed:number; average_progress?:number}> }>();
       
      (progressData.progress || []).forEach((p: any) => progressMap.set(p.course_id, p));

      // Helper to extract grade number for matching
      const getGradeNum = (g: string): string | null => {
        const m = String(g).match(/(\d{1,2})/);
        return m ? m[1] : null;
      };

      const coursesWithProgress = mappedCourses.map((course) => {
        const p = progressMap.get(course.id);
        if (!p) return course;

        // Try to find grade-specific progress from breakdown
        let gradeProgress: { total: number; completed: number; average_progress: number } | null = null;
        if (Array.isArray(p.grade_breakdown) && p.grade_breakdown.length > 0) {
          const courseGradeNum = getGradeNum(course.grade);
          if (courseGradeNum) {
             
            const found = p.grade_breakdown.find((gb: any) => {
              const gbGradeNum = getGradeNum(gb.grade);
              return gbGradeNum === courseGradeNum;
            });
            if (found && typeof found.average_progress === 'number') {
              gradeProgress = {
                total: found.total || 0,
                completed: found.completed || 0,
                average_progress: found.average_progress
              };
            }
          }
        }

        // Use grade-specific progress if available, otherwise use overall course progress
        const student_progress = gradeProgress
          ? {
              total_students: gradeProgress.total || 0,
              completed_students: gradeProgress.completed || 0,
              average_progress: gradeProgress.average_progress || 0
            }
          : {
              total_students: p.total_students || 0,
              completed_students: p.completed_students || 0,
              average_progress: p.average_progress || 0
            };

        return {
          ...course,
          student_progress
        } as Course;
      });

      // Server already returns per-grade rows; just set directly
      if (isActive) setCourses(coursesWithProgress);

      const progressSummary: CourseProgress[] = coursesWithProgress.map((course: any) => ({
        course_id: course.id,
        course_name: course.course_name,
        grade: course.grade,
        total_students: course.student_progress.total_students,
        completed_students: course.student_progress.completed_students,
        average_progress: course.student_progress.average_progress,
         
        chapters_completed: course.chapters?.filter((c: any) => c.is_published).length || 0,
        total_chapters: course.num_chapters
      }));

      if (isActive) setCourseProgress(progressSummary);
      
      // Load analytics data after courses are loaded
      if (isActive) {
        loadAnalyticsData(coursesWithProgress, progressSummary);
      }
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      if (isActive) setLoading(false);
      isFetchingRef.current = false;
    }
    return () => { isActive = false; abort.abort(); };
  }, []);

  // Helper function to format grade names
  const formatGrade = (g: string) => {
    if (!g) return 'N/A';
    const m = (g || '').toString().toLowerCase().match(/(grade\s*|g\s*)?(\d{1,2})/);
    return m ? `Grade ${m[2]}` : g.replace(/^(.)/, (s) => s.toUpperCase());
  };

  // Load and calculate analytics data from real course data
  const loadAnalyticsData = useCallback((coursesData: Course[], progressData: CourseProgress[]) => {
    try {
      setLoadingAnalytics(true);
      
      // 1. Course Progress by Subject (group by course name)
      const courseProgressMap = new Map<string, { completed: number; total: number }>();
      coursesData.forEach(course => {
        const courseName = course.course_name || 'Unknown';
        const existing = courseProgressMap.get(courseName) || { completed: 0, total: 0 };
        existing.completed += course.student_progress.completed_students;
        existing.total += course.student_progress.total_students;
        courseProgressMap.set(courseName, existing);
      });
      
      const subjectProgress = Array.from(courseProgressMap.entries()).map(([name, data]) => {
        const total = data.total || 0;
        const completed = data.completed || 0;
        const pending = total - completed;
        const completedPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const pendingPercent = total > 0 ? Math.round((pending / total) * 100) : 0;
        return {
          name: name.length > 20 ? name.substring(0, 20) + '...' : name,
          completed: completedPercent,
          pending: pendingPercent
        };
      }).slice(0, 10); // Limit to top 10 subjects
      
      setProgressData(subjectProgress);
      
      // 2. Progress by Grade (from courseProgress)
      const gradeProgressMap = new Map<string, { total: number; sum: number; count: number }>();
      progressData.forEach(progress => {
        const grade = progress.grade || 'Unknown';
        const existing = gradeProgressMap.get(grade) || { total: 0, sum: 0, count: 0 };
        existing.total += progress.total_students;
        existing.sum += progress.average_progress;
        existing.count += 1;
        gradeProgressMap.set(grade, existing);
      });
      
      const gradeProgress = Array.from(gradeProgressMap.entries())
        .map(([name, data]) => ({
          name: formatGrade(name),
          progress: data.count > 0 ? Math.round(data.sum / data.count) : 0
        }))
        .sort((a: any, b: any) => {
          // Sort by grade number if available
          const aNum = parseInt(a.name.match(/\d+/)?.[0] || '0');
          const bNum = parseInt(b.name.match(/\d+/)?.[0] || '0');
          return aNum - bNum;
        });
      
      setGradeProgressData(gradeProgress);
      
      // 3. Chapter Completion Rate (from all courses)
      const chapterCompletionMap = new Map<number, { completed: number; total: number }>();
      coursesData.forEach(course => {
        if (course.chapters && course.chapters.length > 0) {
          course.chapters.forEach(chapter => {
            const chapterNum = chapter.chapter_number || 0;
            const existing = chapterCompletionMap.get(chapterNum) || { completed: 0, total: 0 };
            if (chapter.is_published) {
              existing.completed += 1;
            }
            existing.total += 1;
            chapterCompletionMap.set(chapterNum, existing);
          });
        }
      });
      
      const chapterCompletion = Array.from(chapterCompletionMap.entries())
        .map(([num, data]) => ({
          name: `Chapter ${num}`,
          completed: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
        }))
        .sort((a: any, b: any) => {
          const aNum = parseInt(a.name.match(/\d+/)?.[0] || '0');
          const bNum = parseInt(b.name.match(/\d+/)?.[0] || '0');
          return aNum - bNum;
        })
        .slice(0, 10); // Limit to top 10 chapters
      
      setChapterCompletionData(chapterCompletion);
      
      console.log('✅ Analytics data loaded:', {
        subjects: subjectProgress.length,
        grades: gradeProgress.length,
        chapters: chapterCompletion.length
      });
    } catch (error) {
      console.error('❌ Error loading analytics data:', error);
      // Set empty arrays on error
      setProgressData([]);
      setGradeProgressData([]);
      setChapterCompletionData([]);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const handleViewCourseDetails = (course: Course) => {
    setSelectedCourse(course);
    setIsCourseDetailsOpen(true);
  };

  const handleRequestCourseUpdate = async (courseId: string) => {
    const course = courses.find((c: any) => c.id === courseId);
    if (!course) return;

     
    const confirmed = confirm(`Request update for "${course.course_name}" (${formatGrade(course.grade as any)})?\n\nThis will send a notification to the admin.`);
    if (!confirmed) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please log in to request course updates');
        return;
      }

      // Create notification via API route (bypasses RLS)
      const response = await fetchWithCsrf('/api/school-admin/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Course Update Request',
           
          message: `School admin has requested an update for course: ${course.course_name} (${formatGrade(course.grade as any)})`,
          type: 'info',
          recipientType: 'role',
          recipients: ['admin'] // Send to admin role
        })
      });

      if (response.ok) {
        alert('Course update request sent to admin successfully!');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error creating notification:', errorData.error);
        alert(`Failed to send update request: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error requesting course update:', error);
      alert('An error occurred. Please try again.');
    }
  };

  const handleViewOverallProgress = async (courseId: string) => {
    console.log('📊 Opening overall progress view for course:', courseId);
    setOverallProgressDialogOpen(true);
    setOverallProgressData(null);
    setLoadingOverallProgress(true);

    try {
      // Find course info from courses list
      const course = courses.find((c: any) => c.id === courseId);
      
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };
      
      // Fetch both grade-wise progress and detailed progress
      const [progressRes, studentsRes] = await Promise.all([
        fetch(`/api/school-admin/courses/progress/students?courseId=${courseId}`, { 
          cache: 'no-store', 
          headers: authHeader 
        }),
        fetch(`/api/school-admin/courses/progress/students/detail?courseId=${courseId}`, { 
          cache: 'no-store', 
          headers: authHeader 
        })
      ]);

      const progressData = await progressRes.json();
      const studentsData = await studentsRes.json();

      if (!progressRes.ok || !studentsRes.ok) {
        console.error('Failed to load overall progress:', progressData.error || studentsData.error);
        setOverallProgressData({ 
          course: course || null,
          summary: { byGrade: [], overall: {} },
          students: studentsData.students || [],
          chapters: studentsData.chapters || []
        });
        return;
      }

      // Calculate overall stats from grade-wise summary
       
      const totalStudents = progressData.summary?.reduce((sum: number, g: any) => sum + (g.total || 0), 0) || (studentsData.students?.length || 0);
       
      const completedStudents = progressData.summary?.reduce((sum: number, g: any) => sum + (g.completed || 0), 0) || 0;
      const averageProgress = progressData.summary?.length > 0 
         
        ? Math.round(progressData.summary.reduce((sum: number, g: any) => sum + (g.average_progress || 0), 0) / progressData.summary.length)
        : (studentsData.students?.length > 0 
           
          ? Math.round(studentsData.students.reduce((sum: number, s: any) => sum + (s.overall_progress || 0), 0) / studentsData.students.length)
          : 0);

      // Combine the data for overall view
      const overallData = {
        course: course || null,
        summary: progressData,
        students: studentsData.students || [],
        chapters: studentsData.chapters || [],
        // Calculate overall stats
        overall: {
          total_students: totalStudents,
          completed_students: completedStudents,
          average_progress: averageProgress
        }
      };

      setOverallProgressData(overallData);
      console.log('✅ Overall progress loaded:', overallData);
    } catch (e) {
      console.error('❌ Error loading overall progress:', e);
      setOverallProgressData({ 
        course: null,
        summary: { byGrade: [], overall: {} },
        students: [],
        chapters: []
      });
    } finally {
      setLoadingOverallProgress(false);
    }
  };

  const handleViewProgress = (courseId: string, grade?: string) => {
    console.log('📈 Toggling grade-wise progress for:', { courseId, grade });
    // For Progress Tracking tab, use composite key (courseId-grade)
    // For Courses tab, use just courseId
    const key = grade ? `${courseId}-${grade}` : courseId;
    const setState = grade ? setExpandedProgressKeys : setExpandedCourseIds;
    const getState = grade ? expandedProgressKeys : expandedCourseIds;
    
    // Toggle expanded state
    const next = new Set(getState);
    if (next.has(key)) {
      console.log('📉 Collapsing:', key);
      next.delete(key);
      setState(next);
      return;
    }
    console.log('📊 Expanding:', key);
    next.add(key);
    setState(next);

    // Load per-student progress if needed
    if (!gradeStudentsByCourse[courseId]) {
      console.log('🔄 Loading grade-wise progress for course:', courseId);
      loadCourseStudentsProgress(courseId).catch((e) => {
        console.error('❌ Error loading grade-wise progress:', e);
      });
    } else {
      console.log('✅ Grade-wise progress already loaded for course:', courseId);
    }
  };

  const loadCourseStudentsProgress = async (courseId: string) => {
    try {
      console.log('🔄 Loading grade-wise progress for course:', courseId);
      setLoadingCourseProgressId(courseId);
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };
      const url = `/api/school-admin/courses/progress/students?courseId=${courseId}`;
      console.log('🌐 Fetching grade-wise progress from:', url);
      const res = await fetch(url, { cache: 'no-store', headers: authHeader });
      const data = await res.json();
      console.log('📦 Grade-wise progress API response:', { status: res.status, ok: res.ok, data });
      if (!res.ok) {
        console.error('❌ Failed to load per-student progress:', data.error || data.details);
        alert(`Failed to load grade-wise progress: ${data.error || data.details || 'Unknown error'}`);
        return;
      }
      console.log(`✅ Loaded grade-wise progress for course ${courseId}:`, data);
      setGradeStudentsByCourse(prev => ({ ...prev, [courseId]: data }));
    } catch (e) {
      console.error('❌ Error loading per-student progress:', e);
      alert(`Error loading grade-wise progress: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoadingCourseProgressId(null);
    }
  };

  const handleOpenStudentsDialog = async (courseId: string) => {
    try {
      console.log('📊 Opening students dialog for course:', courseId);
      
      // Find course info from courses list
      const course = courses.find((c: any) => c.id === courseId);
      setSelectedCourseForStudents(course || null);
      
      setStudentsDialogOpen(true);
      setStudentsDialogData(null); // Clear previous data while loading
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };
      const url = `/api/school-admin/courses/progress/students/detail?courseId=${courseId}`;
      console.log('🌐 Fetching from:', url);
      const res = await fetch(url, { cache: 'no-store', headers: authHeader });
      const data = await res.json();
      console.log('📦 API response:', { status: res.status, ok: res.ok, data });
      
      if (!res.ok) {
        console.error('❌ Failed to load students detail:', data.error || data.details);
        // If course not found or unauthorized, show specific message
        if (res.status === 404 || res.status === 401) {
          setStudentsDialogData({ 
            students: [], 
            chapters: [],
            error: data.details || data.error || 'Course not found or access denied'
          });
        } else {
          // For other errors, set empty data but show error in dialog
          setStudentsDialogData({ 
            students: [], 
            chapters: [],
            error: data.details || data.error || 'Failed to load student data'
          });
        }
        return;
      }
      
      // Ensure data structure is correct
      if (data && Array.isArray(data.students)) {
        console.log(`✅ Loaded ${data.students.length} student(s) for course ${courseId}`);
        setStudentsDialogData(data);
      } else {
        console.warn('⚠️ Unexpected data format from API:', data);
        setStudentsDialogData({ 
          students: [], 
          chapters: [],
          error: 'Invalid data format received'
        });
      }
    } catch (e) {
      console.error('❌ Error loading students detail:', e);
      // Set empty data on error so dialog shows message instead of infinite loading
      setStudentsDialogData({ 
        students: [], 
        chapters: [],
        error: e instanceof Error ? e.message : 'Unknown error occurred'
      });
    }
  };

  const filteredCourses = courses.filter((course: any) => {
    const name = (course.course_name || '').toLowerCase();
    const desc = (course.description || '').toLowerCase();
    const matchesSearch = name.includes((searchTerm || '').toLowerCase()) || desc.includes((searchTerm || '').toLowerCase());
    const status = (course.status || '').toLowerCase();
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    const matchesGrade = gradeFilter === "all" || course.grade === gradeFilter;
    
    return matchesSearch && matchesStatus && matchesGrade;
  });

  const getGrades = () => {
    return [...new Set(courses.map((c: any) => c.grade).filter(Boolean))].sort();
  };

  const getStats = () => {
    const total = courses.length;
    const published = courses.filter((c: any) => c.status === 'Published').length;
    const draft = courses.filter((c: any) => c.status === 'Draft').length;
    const archived = courses.filter((c: any) => c.status === 'Archived').length;
    const totalStudents = overallStudentCount;
    const averageProgress = courseProgress.length > 0 
      ? Math.round(courseProgress.reduce((sum: number, c: any) => sum + c.average_progress, 0) / courseProgress.length)
      : 0;
    
    return { total, published, draft, archived, totalStudents, averageProgress };
  };

  const stats = getStats();

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
        <h1 className="text-3xl font-bold text-gray-900">Courses & Progress</h1>
        <p className="text-gray-600 mt-2">Track course progress and student completion rates</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All courses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.published}</div>
            <p className="text-xs text-muted-foreground">Active courses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">Enrolled students</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Progress</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageProgress}%</div>
            <p className="text-xs text-muted-foreground">Overall progress</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="courses" className="space-y-6">
        <TabsList>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="progress">Progress Tracking</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Courses Tab */}
        <TabsContent value="courses" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      placeholder="Search courses..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="grade">Grade</Label>
                  <Select value={gradeFilter} onValueChange={setGradeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      {getGrades().map((grade: any) => (
                        <SelectItem key={grade} value={grade}>
                          Grade {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Courses Table */}
          <Card>
            <CardHeader>
              <CardTitle>Courses List</CardTitle>
              <CardDescription>Manage courses and track their progress</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Chapters</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCourses.map((course) => {
                    // Composite key to differentiate same course across grades
                    const rowKey = `${course.id}-${course.grade}`;
                    return (
                      <TableRow key={rowKey}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{course.course_name}</div>
                            <div className="text-sm text-gray-500 max-w-xs truncate">
                              {course.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatGrade(course.grade as any)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {course.chapters?.filter((c: any) => c.is_published).length || 0} / {course.num_chapters}
                          </div>
                          <div className="text-xs text-gray-500">Published</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{course.student_progress.total_students}</div>
                          <div className="text-xs text-gray-500 mb-1">
                            {course.student_progress.completed_students} completed
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ width: `${course.student_progress.average_progress}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium">
                              {course.student_progress.average_progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            course.status === 'Published' ? 'default' : 
                            course.status === 'Draft' ? 'secondary' : 'destructive'
                          }>
                            {course.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewCourseDetails(course)}
                            >
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenStudentsDialog(course.id)}
                            >
                              Students
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {filteredCourses.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <BookOpen className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-lg font-medium">No courses found</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Progress Tracking Tab */}
        <TabsContent value="progress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Course Progress Overview</CardTitle>
              <CardDescription>Track student progress across all courses</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Total Students</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Average Progress</TableHead>
                  <TableHead>Chapters</TableHead>
                  <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courseProgress.map((progress) => {
                    const progressKey = `${progress.course_id}-${progress.grade}`;
                    return (
                    <Fragment key={progressKey}>
                    <TableRow>
                      <TableCell>
                        <div className="font-medium">{progress.course_name}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Grade {progress.grade}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{progress.total_students}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{progress.completed_students}</div>
                        <div className="text-xs text-gray-500">
                          {progress.total_students > 0 
                            ? Math.round((progress.completed_students / progress.total_students) * 100)
                            : 0}% completion rate
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full" 
                              style={{ width: `${progress.average_progress}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">
                            {progress.average_progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {progress.chapters_completed} / {progress.total_chapters}
                        </div>
                        <div className="text-xs text-gray-500">Published</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewProgress(progress.course_id, progress.grade)}
                          >
                            Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewOverallProgress(progress.course_id)}
                          >
                            Overall
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedProgressKeys.has(progressKey) && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="rounded-lg border p-3 bg-white">
                            {loadingCourseProgressId === progress.course_id && (
                              <div className="text-center py-6 text-sm text-gray-500">Loading grade-wise progress...</div>
                            )}
                            {gradeStudentsByCourse[progress.course_id] && (
                              <div className="space-y-3">
                                {(gradeStudentsByCourse[progress.course_id].summary || []).map((g: any) => (
                                  <div key={g.grade} className="rounded-md border p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="font-semibold">{formatGrade(g.grade)}</div>
                                      <div className="text-xs text-gray-600">{g.total} students • {g.completed} completed • Avg {g.average_progress}%</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Student</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Progress</TableHead>
                                            <TableHead>Status</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {(gradeStudentsByCourse[progress.course_id].byGrade[g.grade] || []).map((s: any) => (
                                            <TableRow key={s.id}>
                                              <TableCell className="font-medium">{s.full_name}</TableCell>
                                              <TableCell className="text-sm text-gray-600">{s.email}</TableCell>
                                              <TableCell>
                                                <div className="flex items-center">
                                                  <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                                                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${s.progress || 0}%` }} />
                                                  </div>
                                                  <span className="text-sm">{s.progress || 0}%</span>
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                <Badge variant={s.completed ? 'default' : 'secondary'}>{s.completed ? 'Completed' : 'In progress'}</Badge>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {loadingAnalytics ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Course Progress by Subject */}
                <Card>
                  <CardHeader>
                    <CardTitle>Course Progress by Subject</CardTitle>
                    <CardDescription>Completion rates by subject area</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {progressData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={progressData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="completed" fill="#8884d8" name="Completed" />
                          <Bar dataKey="pending" fill="#ffc658" name="Pending" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-gray-500">
                        <p>No course data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Grade-wise Progress */}
                <Card>
                  <CardHeader>
                    <CardTitle>Progress by Grade</CardTitle>
                    <CardDescription>Average progress across different grades</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {gradeProgressData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={gradeProgressData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="progress" stroke="#8884d8" strokeWidth={2} name="Progress %" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-gray-500">
                        <p>No grade data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Chapter Completion */}
              <Card>
                <CardHeader>
                  <CardTitle>Chapter Completion Rate</CardTitle>
                  <CardDescription>Published chapter completion rates</CardDescription>
                </CardHeader>
                <CardContent>
                  {chapterCompletionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chapterCompletionData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="completed" fill="#00C49F" name="Completion %" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      <p>No chapter data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Course Details Dialog */}
      <Dialog open={isCourseDetailsOpen} onOpenChange={setIsCourseDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Course Details</DialogTitle>
            <DialogDescription>
              View detailed information about the course
            </DialogDescription>
          </DialogHeader>
          {selectedCourse && (
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-gray-500">Course Name</Label>
                    <p className="font-medium">{selectedCourse.course_name}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Grade</Label>
                    <p className="font-medium">{formatGrade(selectedCourse.grade as any)}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Status</Label>
                    <Badge variant={
                      selectedCourse.status === 'Published' ? 'default' : 
                      selectedCourse.status === 'Draft' ? 'secondary' : 'destructive'
                    }>
                      {selectedCourse.status}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Total Chapters</Label>
                    <p className="font-medium">{selectedCourse.num_chapters}</p>
                  </div>
                </div>
                {selectedCourse.description && (
                  <div>
                    <Label className="text-sm text-gray-500">Description</Label>
                    <p className="text-sm mt-1">{selectedCourse.description}</p>
                  </div>
                )}
              </div>

              {/* Student Progress */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Student Progress</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm text-gray-500">Total Students</Label>
                    <p className="text-2xl font-bold">{selectedCourse.student_progress.total_students}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Completed</Label>
                    <p className="text-2xl font-bold text-green-600">{selectedCourse.student_progress.completed_students}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Average Progress</Label>
                    <p className="text-2xl font-bold">{selectedCourse.student_progress.average_progress}%</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full"
                      style={{ width: `${selectedCourse.student_progress.average_progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Chapters */}
              {selectedCourse.chapters && selectedCourse.chapters.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Chapters ({selectedCourse.chapters.length})</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedCourse.chapters.map((chapter, index) => (
                      <div key={chapter.id || index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Chapter {chapter.chapter_number || index + 1}</span>
                            <span className="text-sm text-gray-500">- {chapter.title}</span>
                          </div>
                          <Badge variant={chapter.is_published ? 'default' : 'secondary'}>
                            {chapter.is_published ? 'Published' : 'Draft'}
                          </Badge>
                        </div>
                        {chapter.content_description && (
                          <p className="text-sm text-gray-600 mt-1">{chapter.content_description}</p>
                        )}
                        {chapter.learning_outcomes && chapter.learning_outcomes.length > 0 && (
                          <div className="mt-2">
                            <Label className="text-xs text-gray-500">Learning Outcomes:</Label>
                            <ul className="list-disc list-inside text-xs text-gray-600 mt-1">
                              {chapter.learning_outcomes.map((outcome: string, i: number) => (
                                <li key={i}>{outcome}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="space-y-2 border-t pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-gray-500">Created At</Label>
                    <p>{new Date(selectedCourse.created_at).toLocaleString()}</p>
                  </div>
                  {selectedCourse.updated_at && (
                    <div>
                      <Label className="text-gray-500">Last Updated</Label>
                      <p>{new Date(selectedCourse.updated_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCourseDetailsOpen(false)}>
              Close
            </Button>
            {selectedCourse && (
              <Button onClick={() => {
                handleRequestCourseUpdate(selectedCourse.id);
                setIsCourseDetailsOpen(false);
              }}>
                Request Update
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Students Detail Dialog */}
      <Dialog open={studentsDialogOpen} onOpenChange={setStudentsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Enrolled Students - Detailed Progress
              {selectedCourseForStudents && (
                <span className="text-base font-normal text-gray-600">- {selectedCourseForStudents.course_name}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              View all students enrolled in this course with their progress and chapter-wise completion
            </DialogDescription>
          </DialogHeader>
          {!studentsDialogData ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p>Loading students...</p>
            </div>
          ) : studentsDialogData.error ? (
            <div className="text-center py-8 text-red-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
              <p className="text-lg font-medium mb-2">Error Loading Students</p>
              <p className="text-sm">{studentsDialogData.error}</p>
            </div>
          ) : studentsDialogData.students.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2">No Students Found</p>
              <p className="text-sm">No students are currently enrolled in this course or match the course grades.</p>
              <p className="text-xs mt-2 text-gray-400">Students will appear here once they are enrolled in the course.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Students</span>
                    <span className="text-2xl font-bold">{studentsDialogData.students.length}</span>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Completed</span>
                    <span className="text-2xl font-bold text-green-600">
                      {studentsDialogData.students.filter((s: any) => s.completed).length}
                    </span>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Avg Progress</span>
                    <span className="text-2xl font-bold">
                      {studentsDialogData.students.length > 0
                        ? Math.round(
                            studentsDialogData.students.reduce(
                               
                              (sum: number, s: any) => sum + (s.overall_progress || 0),
                              0
                            ) / studentsDialogData.students.length
                          )
                        : 0}%
                    </span>
                  </div>
                </Card>
              </div>

              {/* Students Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                  <div className="text-sm font-medium text-gray-700">
                    All Enrolled Students ({studentsDialogData.students.length})
                  </div>
                  {studentsDialogData.chapters && studentsDialogData.chapters.length > 0 && (
                    <div className="text-xs text-gray-500">
                      {studentsDialogData.chapters.length} chapter{studentsDialogData.chapters.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto max-h-[50vh]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="w-[200px]">Student Name</TableHead>
                        <TableHead className="w-[200px]">Email</TableHead>
                        <TableHead className="w-[100px]">Grade</TableHead>
                        <TableHead className="w-[180px]">Overall Progress</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="min-w-[300px]">Chapter Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsDialogData.students
                         
                        .sort((a: any, b: any) => (b.overall_progress || 0) - (a.overall_progress || 0))
                         
                        .map((s: any) => (
                          <TableRow key={s.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{s.full_name || 'Unknown'}</TableCell>
                            <TableCell className="text-sm text-gray-600">{s.email || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{s.grade || 'Unknown'}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-200 rounded-full h-2.5 min-w-[80px]">
                                  <div 
                                    className="bg-blue-600 h-2.5 rounded-full transition-all" 
                                    style={{ width: `${s.overall_progress || 0}%` }} 
                                  />
                                </div>
                                <span className="text-sm font-semibold min-w-[40px] text-right">
                                  {s.overall_progress || 0}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={s.completed ? 'default' : 'secondary'}
                                className={s.completed ? 'bg-green-600 text-white' : ''}
                              >
                                {s.completed ? 'Completed' : 'In Progress'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {s.chapters && s.chapters.length > 0 ? (
                                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-2">
                                  {s.chapters
                                     
                                    .sort((a: any, b: any) => (a.chapter_number || 0) - (b.chapter_number || 0))
                                     
                                    .map((ch: any) => (
                                      <div key={ch.id} className="flex items-center justify-between text-xs py-0.5">
                                        <span className="truncate mr-2 flex-1" title={`${ch.title || 'Chapter ' + (ch.chapter_number || '')}`}>
                                          Ch {ch.chapter_number || ''}: {ch.title || 'Untitled'}
                                        </span>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                            <div 
                                              className={`h-1.5 rounded-full transition-all ${
                                                ch.progress === 100 ? 'bg-green-600' : 
                                                ch.progress >= 50 ? 'bg-blue-600' : 
                                                ch.progress > 0 ? 'bg-yellow-500' : 'bg-gray-300'
                                              }`}
                                              style={{ width: `${ch.progress || 0}%` }} 
                                            />
                                          </div>
                                          <span className="text-xs font-medium min-w-[35px] text-right">
                                            {ch.progress || 0}%
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">No chapter data</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStudentsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overall Progress Dialog */}
      <Dialog open={overallProgressDialogOpen} onOpenChange={setOverallProgressDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Overall Course Progress
              {overallProgressData?.course && (
                <span className="text-base font-normal text-gray-600">- {overallProgressData.course.course_name}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              Comprehensive overview of course progress across all grades
            </DialogDescription>
          </DialogHeader>
          {loadingOverallProgress ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading overall progress...</p>
            </div>
          ) : overallProgressData ? (
            <div className="space-y-6 py-4">
              {/* Overall Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Students</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{overallProgressData.overall?.total_students || overallProgressData.students?.length || 0}</div>
                    <p className="text-xs text-gray-500 mt-1">Enrolled across all grades</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">{overallProgressData.overall?.completed_students || 0}</div>
                    <p className="text-xs text-gray-500 mt-1">Students who finished</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Average Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{overallProgressData.overall?.average_progress || 0}%</div>
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${overallProgressData.overall?.average_progress || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Grade-wise Breakdown */}
              {overallProgressData.summary?.summary && overallProgressData.summary.summary.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Grade-wise Progress</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {overallProgressData.summary.summary.map((gradeData: any) => (
                      <Card key={gradeData.grade}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-medium">{formatGrade(gradeData.grade)}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Total Students</span>
                              <span className="font-semibold">{gradeData.total || 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Completed</span>
                              <span className="font-semibold text-green-600">{gradeData.completed || 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Average Progress</span>
                              <span className="font-semibold">{gradeData.average_progress || 0}%</span>
                            </div>
                            <div className="mt-2">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${gradeData.average_progress || 0}%` }}
                                ></div>
                              </div>
                            </div>
                            {gradeData.total > 0 && (
                              <div className="text-xs text-gray-500">
                                {Math.round((gradeData.completed / gradeData.total) * 100)}% completion rate
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Students Summary Table */}
              {overallProgressData.students && overallProgressData.students.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Students Summary</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overallProgressData.students.slice(0, 10).map((student: any) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium">{student.full_name || 'Unknown'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{student.grade || 'Unknown'}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full"
                                    style={{ width: `${student.overall_progress || 0}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm font-medium">{student.overall_progress || 0}%</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={student.completed ? 'default' : 'secondary'}>
                                {student.completed ? 'Completed' : 'In Progress'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {overallProgressData.students.length > 10 && (
                      <div className="p-4 text-center text-sm text-gray-500 border-t">
                        Showing 10 of {overallProgressData.students.length} students
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chapters Summary */}
              {overallProgressData.chapters && overallProgressData.chapters.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Chapters Overview</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {overallProgressData.chapters.map((chapter: any, index: number) => (
                      <Card key={chapter.id || index} className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            Chapter {chapter.chapter_number || index + 1}
                          </span>
                          {chapter.is_published && (
                            <Badge variant="default" className="text-xs">Published</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 truncate" title={chapter.title}>
                          {chapter.title || 'Untitled Chapter'}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {(!overallProgressData.summary?.summary || overallProgressData.summary.summary.length === 0) &&
               (!overallProgressData.students || overallProgressData.students.length === 0) && (
                <div className="text-center py-12 text-gray-500">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">No Progress Data</p>
                  <p className="text-sm">No students have enrolled in this course yet.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2">No Data Available</p>
              <p className="text-sm">Unable to load progress data.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverallProgressDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

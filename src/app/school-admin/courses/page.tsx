"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { addTokensToHeaders } from "../../../lib/csrf-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { 
  Search,
  BookOpen,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { List } from "lucide-react";
import { fetchWithCsrf } from "../../../lib/csrf-client";

interface Course {
  id: string;
  school_id: string;
  grade: string;
  course_name: string;
  description: string;
  num_chapters: number;
   
  content_summary: Record<string, unknown> | null;
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

  const isFetchingRef = useRef(false);
  const [_expandedCourseIds, _setExpandedCourseIds] = useState<Set<string>>(new Set());
  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
   
  interface Student {
    id?: string;
    completed?: boolean;
    overall_progress?: number;
  }
  
  interface Chapter {
    id?: string;
    title?: string;
  }
  
  const [studentsDialogData, setStudentsDialogData] = useState<{ students: Student[]; chapters: Chapter[]; error?: string } | null>(null);
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

      // Debug: Log raw API response
      console.log('🔍 Raw API courses response:', {
        coursesCount: apiCourses?.length || 0,
        firstCourse: apiCourses?.[0] ? {
          id: apiCourses[0].id,
          title: apiCourses[0].title || apiCourses[0].course_name,
          grades: apiCourses[0].grades,
          chapters: apiCourses[0].chapters,
          chaptersLength: Array.isArray(apiCourses[0].chapters) ? apiCourses[0].chapters.length : 'not array',
          num_chapters: apiCourses[0].num_chapters,
          hasChaptersField: 'chapters' in (apiCourses[0] || {})
        } : null
      });

      // Set overall student count (distinct students in the school)
      if (studentsRes.ok) {
        const count = Array.isArray(studentsJson?.students) ? studentsJson.students.length : 0;
        if (isActive) setOverallStudentCount(count);
      }

      // API now returns aggregated courses with all grades and chapters
      // Map API response directly to Course interface
      interface ApiCourse {
        id: string;
        school_id?: string;
        grades?: string[];
        grade?: string;
        title?: string;
        course_name?: string;
        description?: string;
        num_chapters?: number;
        status?: string;
        created_at?: string;
        updated_at?: string;
        chapters?: Array<{
          id: string;
          order_number?: number;
          order_index?: number;
          title?: string;
          name?: string;
          learning_outcomes?: string[];
          content_type?: string;
          content_url?: string;
          content_description?: string;
          is_published?: boolean;
          created_at?: string;
        }>;
      }
      
      const mappedCourses: Course[] = (apiCourses || []).map((c: ApiCourse) => {
        // API provides grades as array, but we also support comma-separated string for backward compatibility
        const grades = Array.isArray(c.grades) ? c.grades : (c.grade ? c.grade.split(',').map((g: string) => g.trim()) : []);
        
        // Map chapters from API response
        type ApiChapterItem = NonNullable<ApiCourse['chapters']>[number];
        const chapters = Array.isArray(c.chapters) ? (c.chapters || []).map((ch: ApiChapterItem) => ({
          id: ch.id,
          course_id: c.id,
          chapter_number: ch.order_number || ch.order_index || 0,
          title: ch.title || ch.name || 'Untitled Chapter',
          learning_outcomes: ch.learning_outcomes || [],
          content_type: (ch.content_type || 'material') as 'video' | 'material' | 'assignment' | 'quiz',
          content_url: ch.content_url || '',
          content_description: ch.content_description || '',
          is_published: !!ch.is_published,
          created_at: ch.created_at
        })) : [];

        // Log if chapters are missing
        if (!Array.isArray(c.chapters) || c.chapters.length === 0) {
          console.warn('Course missing chapters in API response:', {
            courseId: c.id,
            courseName: c.title || c.course_name,
            hasChaptersField: 'chapters' in c,
            chaptersType: typeof c.chapters,
            chaptersValue: c.chapters,
            num_chapters: c.num_chapters
          });
        }

        return {
          id: c.id,
          school_id: c.school_id,
          grade: grades.join(', '), // Comma-separated string for display
          course_name: c.title || c.course_name || 'Untitled Course',
          description: c.description || '',
          num_chapters: c.num_chapters !== undefined ? c.num_chapters : chapters.length,
          content_summary: null,
          status: ((c.status || 'Draft') as 'Draft' | 'Published' | 'Archived'),
          created_at: c.created_at,
          updated_at: c.updated_at,
          chapters: chapters,
          student_progress: {
            total_students: 0,
            completed_students: 0,
            average_progress: 0
          }
        };
      });
      
      console.log('📚 Mapped courses with chapters:', {
        totalCourses: mappedCourses.length,
        coursesWithChapters: mappedCourses.filter(c => c.chapters && c.chapters.length > 0).length,
        sampleCourse: mappedCourses[0] ? {
          id: mappedCourses[0].id,
          name: mappedCourses[0].course_name,
          chaptersCount: mappedCourses[0].chapters?.length || 0,
          num_chapters: mappedCourses[0].num_chapters
        } : null
      });

      // Fetch progress via API (bypasses RLS) and merge
      const progressData = progressJson || { progress: [] };
      const progressMap = new Map<string, { total_students: number; completed_students: number; average_progress: number; grade_breakdown?: Array<{grade:string; total:number; completed:number; average_progress?:number}> }>();
       
      interface ProgressData {
        course_id: string;
        total_students?: number;
        completed_students?: number;
        average_progress?: number;
        grade_breakdown?: Array<{grade: string; total: number; completed: number; average_progress?: number}>;
      }
      
      (progressData.progress || []).forEach((p: ProgressData) => {
        progressMap.set(p.course_id, {
          total_students: p.total_students ?? 0,
          completed_students: p.completed_students ?? 0,
          average_progress: p.average_progress ?? 0,
          grade_breakdown: p.grade_breakdown,
        });
      });

      // Helper to extract grade number for matching
      const _getGradeNum = (g: string): string | null => {
        const m = String(g).match(/(\d{1,2})/);
        return m ? m[1] : null;
      };

      // Merge progress data with courses
      const coursesWithProgress = mappedCourses.map((course) => {
        const p = progressMap.get(course.id);
        if (!p) return course;

        // Use overall course progress (aggregated across all grades)
        const student_progress = {
          total_students: p.total_students || 0,
          completed_students: p.completed_students || 0,
          average_progress: p.average_progress || 0
        };

        return {
          ...course,
          student_progress
        } as Course;
      });

      // Set aggregated courses (one row per course, not per grade)
      if (isActive) setCourses(coursesWithProgress);

      // Create progress summary - one entry per course (not per grade)
      const progressSummary: CourseProgress[] = coursesWithProgress.map((course: Course) => ({
        course_id: course.id,
        course_name: course.course_name,
        grade: course.grade, // This now contains all grades comma-separated
        total_students: course.student_progress.total_students,
        completed_students: course.student_progress.completed_students,
        average_progress: course.student_progress.average_progress,
        chapters_completed: course.chapters?.filter((c: CourseChapter) => c.is_published).length || 0,
        total_chapters: course.num_chapters
      }));

      if (isActive) setCourseProgress(progressSummary);
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


  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const _handleViewCourseDetails = (course: Course) => {
    setSelectedCourse(course);
    setIsCourseDetailsOpen(true);
  };

  const handleRequestCourseUpdate = async (courseId: string) => {
    const course = courses.find((c: Course) => c.id === courseId);
    if (!course) return;

     
    const confirmed = confirm(`Request update for "${course.course_name}" (${formatGrade(course.grade)}?\n\nThis will send a notification to the admin.`);
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
           
          message: `School admin has requested an update for course: ${course.course_name} (${formatGrade(course.grade)})`,
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


  const _handleOpenStudentsDialog = async (courseId: string) => {
    try {
      console.log('📊 Opening students dialog for course:', courseId);
      
      // Find course info from courses list
      const course = courses.find((c: Course) => c.id === courseId);
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

  const filteredCourses = courses.filter((course: Course) => {
    const name = (course.course_name || '').toLowerCase();
    const desc = (course.description || '').toLowerCase();
    const matchesSearch = name.includes((searchTerm || '').toLowerCase()) || desc.includes((searchTerm || '').toLowerCase());
    const status = (course.status || '').toLowerCase();
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    const matchesGrade = gradeFilter === "all" || course.grade === gradeFilter;
    
    return matchesSearch && matchesStatus && matchesGrade;
  });

  const getGrades = () => {
    return [...new Set(courses.map((c: Course) => c.grade).filter(Boolean))].sort();
  };

  const getStats = () => {
    const total = courses.length;
    const published = courses.filter((c: Course) => c.status === 'Published').length;
    const draft = courses.filter((c: Course) => c.status === 'Draft').length;
    const archived = courses.filter((c: Course) => c.status === 'Archived').length;
    const totalStudents = overallStudentCount;
    const averageProgress = courseProgress.length > 0 
      ? Math.round(courseProgress.reduce((sum: number, c: CourseProgress) => sum + c.average_progress, 0) / courseProgress.length)
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

      <div className="space-y-6">
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
                      {getGrades().map((grade: string) => (
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
                  <TableHead>Students</TableHead>
                  <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCourses.map((course) => {
                    const rowKey = course.id;
                    // Parse grades from comma-separated string or use grades array if available
                    interface CourseWithGrades extends Course {
                      grades?: string[];
                    }
                    
                    const grades: string[] = Array.isArray((course as CourseWithGrades).grades) 
                      ? ((course as CourseWithGrades).grades ?? []) 
                      : (course.grade ? String(course.grade).split(',').map(g => g.trim()).filter(Boolean) : []);
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
                          <div className="flex flex-wrap gap-1">
                            {grades.length > 0 ? (
                              grades.map((grade: string, idx: number) => (
                                <Badge key={idx} variant="outline">{formatGrade(grade)}</Badge>
                              ))
                            ) : (
                              <Badge variant="outline">N/A</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{course.student_progress.total_students}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            course.status === 'Published' ? 'default' : 
                            course.status === 'Draft' ? 'secondary' : 'destructive'
                          }>
                            {course.status}
                          </Badge>
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
      </div>

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
                    <p className="font-medium">{formatGrade(selectedCourse.grade)}</p>
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
                      {studentsDialogData.students.filter((s: Student) => s.completed).length}
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
                               
                              (sum: number, s: Student) => sum + (s.overall_progress || 0),
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
                        <TableHead className="w-[100px]">Section</TableHead>
                        <TableHead className="w-[180px]">Overall Progress</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="min-w-[300px]">Chapter Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsDialogData.students
                        .sort((a: { overall_progress?: number }, b: { overall_progress?: number }) => (b.overall_progress || 0) - (a.overall_progress || 0))
                        .map((s: { id: string; full_name?: string; email?: string; grade?: string; section?: string; overall_progress?: number; completed?: boolean; chapters?: Array<{ id: string; title?: string; chapter_number?: number; progress?: number }> }) => (
                          <TableRow key={s.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{s.full_name || 'Unknown'}</TableCell>
                            <TableCell className="text-sm text-gray-600">{s.email || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{s.grade || 'Unknown'}</Badge>
                            </TableCell>
                            <TableCell>
                              {s.section ? (
                                <Badge variant="outline">{s.section}</Badge>
                              ) : (
                                <span className="text-gray-400 italic text-sm">-</span>
                              )}
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
                                    .sort((a: { chapter_number?: number }, b: { chapter_number?: number }) => (a.chapter_number || 0) - (b.chapter_number || 0))
                                    .map((ch: { id: string; title?: string; chapter_number?: number; progress?: number }) => (
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
    </div>
  );
}

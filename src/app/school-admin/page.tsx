"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useSchoolAdmin } from "../../contexts/SchoolAdminContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  Users, 
  User, 
  BookOpen, 
  AlertCircle,
  Plus,
  Eye,
  RefreshCw,
  TrendingUp,
  Clock,
  CheckCircle,
  ClipboardList,
  School
} from "lucide-react";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import { useSmartRefresh } from "../../hooks/useSmartRefresh";

// Chart color palette
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

// Enhanced interfaces for real-time data
interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  activeCourses: number;
  pendingReports: number;
  pendingLeaves: number;
  averageAttendance: number;
}

interface QuickActionPreview {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  data: Array<{
    id?: string;
    name?: string;
    full_name?: string;
    title?: string;
    created_at: string;
    status?: string;
    email?: string;
  }>;
  loading: boolean;
  lastUpdated: string;
  route: string;
}

interface RecentActivity {
  id: string;
  title: string;
  message: string;
  created_at: string;
  type: 'success' | 'warning' | 'info' | 'error';
}

export default function SchoolAdminDashboard() {
  const router = useRouter();
  const { schoolInfo: contextSchoolInfo } = useSchoolAdmin();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalTeachers: 0,
    activeCourses: 0,
    pendingReports: 0,
    pendingLeaves: 0,
    averageAttendance: 0
  });
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  
  // Use context schoolInfo if available, otherwise use local state
  const displaySchoolInfo = contextSchoolInfo || schoolInfo;
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [quickActionPreviews, setQuickActionPreviews] = useState<QuickActionPreview[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Real-time chart data states
  const [growthData, setGrowthData] = useState<Array<{name: string; teachers: number; students: number}>>([]);
  const [attendanceData, setAttendanceData] = useState<Array<{name: string; attendance: number}>>([]);
  const [courseProgressData, setCourseProgressData] = useState<Array<{name: string; completed: number; pending: number}>>([]);
  const [gradeDistributionData, setGradeDistributionData] = useState<Array<{name: string; students: number}>>([]);

  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Get current user and session once (reuse for all API calls)
      const [userResult, sessionResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession()
      ]);
      
      const { data: { user } } = userResult;
      if (!user) return;

      const session = sessionResult.data.session;
      const authHeader = {
        'Authorization': `Bearer ${session?.access_token || ''}`,
        'Cache-Control': 'no-cache'
      };

      // Parallelize profile, school, and stats API calls
      const [
        profileResponse,
        schoolResponse,
        statsResponse
      ] = await Promise.all([
        fetch(`/api/profile?userId=${user.id}`, { cache: 'no-store', method: 'GET', headers: authHeader }),
        fetch(`/api/school-admin/school`, { cache: 'no-store', headers: authHeader }),
        fetch(`/api/school-admin/stats?t=${new Date().getTime()}`, { cache: 'no-store', headers: authHeader })
      ]);

      // Process profile response
      let profile = null;
      if (profileResponse.ok) {
        try {
          const profileData = await profileResponse.json();
          profile = profileData.profile;
        } catch (err) {
          console.error('Error parsing profile:', err);
          return;
        }
      } else {
        console.error('Error fetching profile:', profileResponse.status);
        return;
      }

      // Verify user is school admin
      if (profile?.role !== 'school_admin') {
        console.warn('User is not a school admin. Role:', profile?.role);
        return;
      }

      // Process school response
      console.log('🔍 Loading school via API route (uses school_admins table)');
      if (schoolResponse.ok) {
        try {
          const schoolData = await schoolResponse.json();
          if (schoolData.school) {
            console.log('✅ School loaded successfully:', schoolData.school.name);
            setSchoolInfo(schoolData.school);
          } else {
            console.warn('⚠️ School not found in API response');
          }
        } catch (err) {
          console.error('❌ Error parsing school data:', err);
        }
      } else {
        console.error('❌ Failed to load school from API:', schoolResponse.status);
        const errorData = await schoolResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ School API error:', errorData.error || 'Unknown error');
      }
      
      // Process stats response
      let newStats: DashboardStats = {
        totalStudents: 0,
        totalTeachers: 0,
        activeCourses: 0,
        pendingReports: 0,
        pendingLeaves: 0,
        averageAttendance: 0
      };
      
      if (statsResponse.ok) {
        try {
          const { stats: apiStats } = await statsResponse.json();
          console.log('✅ Stats loaded successfully:', apiStats);
          newStats = {
            ...apiStats,
            averageAttendance: apiStats.averageAttendance || 0
          };
        } catch (err) {
          console.error('Error parsing stats:', err);
        }
      } else {
        console.log('Using fallback stats');
      }
      setStats(newStats);

      // Parallelize activity loading (students and teachers)
      const activityItems: RecentActivity[] = [];
      try {
        const [studentsResponse, teachersResponse] = await Promise.all([
          fetch(`/api/school-admin/students?limit=3`, { cache: 'no-store', headers: authHeader }),
          fetch(`/api/school-admin/teachers?limit=3`, { cache: 'no-store', headers: authHeader })
        ]);
        
        // Process students response
        if (studentsResponse.ok) {
          try {
            const studentsData = await studentsResponse.json();
            const recentStudents = (studentsData.students || []).slice(0, 2);
             
            recentStudents.forEach((s: any) => {
              activityItems.push({
                id: `student-${s.id}`,
                title: 'New Student Enrollment',
                message: `${s.profile?.full_name || 'A student'} enrolled in the school`,
                created_at: s.enrolled_at || s.created_at || new Date().toISOString(),
                type: 'success'
              });
            });
          } catch (err) {
            console.log('Error parsing student activity:', err);
          }
        }

        // Process teachers response
        if (teachersResponse.ok) {
          try {
            const teachersData = await teachersResponse.json();
            const recentTeachers = (teachersData.teachers || []).slice(0, 2);
             
            recentTeachers.forEach((t: any) => {
              const teacher = t.teacher || t;
              activityItems.push({
                id: `teacher-${t.id || t.teacher_id}`,
                title: 'New Teacher Assignment',
                message: `${teacher?.full_name || 'A teacher'} was assigned to the school`,
                created_at: t.assigned_at || t.created_at || new Date().toISOString(),
                type: 'info'
              });
            });
          } catch (err) {
            console.log('Error parsing teacher activity:', err);
          }
        }

        // Add pending reports warning
        if (newStats.pendingReports > 0) {
          activityItems.push({
            id: 'pending-reports',
            title: 'Pending Reports',
            message: `${newStats.pendingReports} teacher report(s) awaiting approval`,
            created_at: new Date().toISOString(),
            type: 'warning'
          });
        }

        // Add pending leaves warning
        if (newStats.pendingLeaves > 0) {
          activityItems.push({
            id: 'pending-leaves',
            title: 'Pending Leave Requests',
            message: `${newStats.pendingLeaves} leave request(s) awaiting approval`,
            created_at: new Date().toISOString(),
            type: 'warning'
          });
        }

        // Sort by created_at (most recent first) and limit to 5
        activityItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentActivity(activityItems.slice(0, 5));
      } catch (error) {
        console.log('Error loading activity:', error);
        setRecentActivity([]);
      }

      // Parallelize quick action previews and chart data loading
      await Promise.all([
        loadQuickActionPreviews(profile.school_id).catch(error => {
          console.error('Error loading quick action previews:', error);
        }),
        loadChartData(newStats, profile.school_id).catch(error => {
          console.error('Error loading chart data:', error);
        })
      ]);
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const loadChartData = useCallback(async (currentStats: DashboardStats, schoolId: string) => {
    try {
      // Set empty growth data - will be populated from real data when available
      setGrowthData([]);

      // Set empty attendance data - will be populated from real data when available
      setAttendanceData([]);

      // Set empty course progress data - will be populated from real data when available
      setCourseProgressData([]);

      // Set empty grade distribution data - will be populated from real data when available
      setGradeDistributionData([]);

    } catch (error) {
      console.error('Error loading chart data:', error);
      // Set empty data on error
      setGrowthData([]);
      setAttendanceData([]);
      setCourseProgressData([]);
      setGradeDistributionData([]);
    }
  }, []);

  const loadQuickActionPreviews = async (schoolId: string) => {
    const previews: QuickActionPreview[] = [];

    // Get session once and reuse for all API calls
    const session = await supabase.auth.getSession();
    const authHeader = {
      'Authorization': `Bearer ${session.data.session?.access_token || ''}`,
      'Cache-Control': 'no-cache'
    };

    // Parallelize all preview API calls
    const [
      studentsResponse,
      teachersResponse,
      reportsResponse,
      coursesResponse
    ] = await Promise.allSettled([
      fetch(`/api/school-admin/students?limit=3`, { cache: 'no-store', headers: authHeader }),
      fetch(`/api/school-admin/teachers?limit=3`, { cache: 'no-store', headers: authHeader }),
      fetch(`/api/school-admin/reports?limit=3&pending=true`, { cache: 'no-store', headers: authHeader }),
      fetch(`/api/school-admin/courses?status=Published&limit=3`, { cache: 'no-store', headers: authHeader })
    ]);

    // Process students preview
    if (studentsResponse.status === 'fulfilled' && studentsResponse.value.ok) {
      try {
        const studentsData = await studentsResponse.value.json();
        const recentStudents = (studentsData.students || []).slice(0, 3);
        previews.push({
          id: 'students',
          title: 'Recent Students',
          description: 'Latest student enrollments',
          icon: <User className="h-4 w-4" />,
           
          data: recentStudents.map((s: any) => ({
            id: s.id,
            full_name: s.profile?.full_name || 'Unknown',
            email: s.profile?.email || '',
            created_at: s.enrolled_at || s.created_at || new Date().toISOString()
          })),
          loading: false,
          lastUpdated: new Date().toISOString(),
          route: '/school-admin/students'
        });
      } catch (error) {
        console.log('Students preview unavailable:', error);
      }
    }

    // Process teachers preview
    if (teachersResponse.status === 'fulfilled' && teachersResponse.value.ok) {
      try {
        const teachersData = await teachersResponse.value.json();
        const recentTeachers = (teachersData.teachers || []).slice(0, 3);
        previews.push({
          id: 'teachers',
          title: 'Recent Teachers',
          description: 'Latest teacher assignments',
          icon: <Users className="h-4 w-4" />,
           
          data: recentTeachers.map((t: any) => {
            const teacher = t.teacher || t;
            return {
              id: t.id,
              full_name: teacher?.full_name || 'Unknown',
              email: teacher?.email || '',
              created_at: t.assigned_at || t.created_at || new Date().toISOString()
            };
          }),
          loading: false,
          lastUpdated: new Date().toISOString(),
          route: '/school-admin/teachers'
        });
      } catch (error) {
        console.log('Teachers preview unavailable:', error);
      }
    }

    // Process reports preview
    if (reportsResponse.status === 'fulfilled' && reportsResponse.value.ok) {
      try {
        const reportsData = await reportsResponse.value.json();
        const recentReports = (reportsData.reports || []).slice(0, 3);
        if (recentReports.length > 0) {
          previews.push({
            id: 'reports',
            title: 'Pending Reports',
            description: 'Teacher reports awaiting approval',
            icon: <ClipboardList className="h-4 w-4" />,
             
            data: recentReports.map((r: any) => {
              const profile = r.teacher || {};
              return {
                id: r.id,
                full_name: profile?.full_name || 'Unknown Teacher',
                name: r.topics_taught?.substring(0, 30) || 'Report',
                created_at: r.created_at || r.date || new Date().toISOString(),
                status: 'Pending'
              };
            }),
            loading: false,
            lastUpdated: new Date().toISOString(),
            route: '/school-admin/reports'
          });
        }
      } catch (error) {
        console.log('Reports preview unavailable:', error);
      }
    }

    // Process courses preview
    if (coursesResponse.status === 'fulfilled' && coursesResponse.value.ok) {
      try {
        const coursesData = await coursesResponse.value.json();
        const recentCourses = (coursesData.courses || []).slice(0, 3);
        previews.push({
          id: 'courses',
          title: 'Active Courses',
          description: 'Published courses in your school',
          icon: <BookOpen className="h-4 w-4" />,
           
          data: recentCourses.map((c: any) => ({
            id: c.id,
            title: c.title,
            created_at: c.created_at,
            status: c.status
          })),
          loading: false,
          lastUpdated: new Date().toISOString(),
          route: '/school-admin/courses'
        });
      } catch (error) {
        console.log('Courses preview unavailable:', error);
      }
    }

    setQuickActionPreviews(previews);
  };

  useEffect(() => {
    if (!isMounted) return;
    
    // Load data immediately when component mounts
    // No auto-refresh interval - smart refresh will handle tab switching refreshes
    loadDashboardData();
  }, [loadDashboardData, isMounted]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadDashboardData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  const handleRefresh = async () => {
    await loadDashboardData();
  };

  const handleQuickAction = (route: string) => {
    router.push(route);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {displaySchoolInfo?.name ? `${displaySchoolInfo.name} Admin Panel` : 'School Admin Dashboard'}
            </h1>
            <p className="text-gray-600 mt-2">
              {schoolInfo ? `Welcome back, School Admin` : 'Welcome back, School Admin'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-500">
                Last updated: {isMounted ? (() => {
                  const hours = lastRefresh.getHours();
                  const minutes = lastRefresh.getMinutes();
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  const displayHours = hours % 12 || 12;
                  const displayMinutes = minutes.toString().padStart(2, '0');
                  return `${displayHours}:${displayMinutes} ${ampm}`;
                })() : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              Active enrollments
            </p>
            <div className="flex items-center gap-1 mt-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-xs text-blue-600">Active</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTeachers}</div>
            {stats.averageAttendance > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  {stats.averageAttendance}% attendance rate
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-600">{stats.averageAttendance}% avg</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCourses}</div>
            <p className="text-xs text-muted-foreground">
              Published courses
            </p>
            {stats.activeCourses > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span className="text-xs text-orange-600">Published</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingReports + stats.pendingLeaves}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingReports} reports, {stats.pendingLeaves} leaves
            </p>
            <div className="flex items-center gap-1 mt-2">
              {(stats.pendingReports > 0 || stats.pendingLeaves > 0) && (
                <>
                  <AlertCircle className="h-3 w-3 text-red-500" />
                  <span className="text-xs text-red-600">Action required</span>
                </>
              )}
              {stats.pendingReports === 0 && stats.pendingLeaves === 0 && (
                <>
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-600">All clear</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Quick Actions
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Common administrative tasks with real-time previews</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {quickActionPreviews.map((preview) => (
                  <div key={preview.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {preview.icon}
                        <span className="font-medium">{preview.title}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleQuickAction(preview.route)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{preview.description}</p>
                    <div className="space-y-1">
                      {preview.data && preview.data.length > 0 ? (
                        preview.data.slice(0, 2).map((item, index: number) => (
                          <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                            <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                            <span className="truncate">
                              {item.name || item.full_name || item.title || 'Unknown'}
                            </span>
                            <span className="text-gray-400">
                              {new Date(item.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-gray-400 italic">No recent data</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Button 
                        className="flex-1 justify-start" 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleQuickAction(preview.route)}
                      >
                        <Plus className="mr-2 h-3 w-3" />
                        {preview.id === 'students' ? 'Manage Students' :
                         preview.id === 'teachers' ? 'Manage Teachers' :
                         preview.id === 'reports' ? 'View Reports' :
                         preview.id === 'courses' ? 'View Courses' : 'Manage'}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* School Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  School Status
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Current school metrics and health</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.averageAttendance > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Average Attendance</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-blue-100 text-blue-800">
                          {stats.averageAttendance}%
                        </Badge>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Pending Reports</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={stats.pendingReports > 0 ? "destructive" : "secondary"}>
                        {stats.pendingReports}
                      </Badge>
                      {stats.pendingReports > 0 && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Pending Leave Requests</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={stats.pendingLeaves > 0 ? "destructive" : "secondary"}>
                        {stats.pendingLeaves}
                      </Badge>
                      {stats.pendingLeaves > 0 && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Enrollment</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {stats.totalStudents + stats.totalTeachers}
                      </Badge>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Active Courses</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-purple-100 text-purple-800">
                        {stats.activeCourses}
                      </Badge>
                      <CheckCircle className="h-4 w-4 text-purple-500" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Recent Activity
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              </CardTitle>
              <CardDescription>Latest system events and notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className={`w-2 h-2 rounded-full ${
                        activity.type === 'success' ? 'bg-green-500' :
                        activity.type === 'warning' ? 'bg-yellow-500' :
                        activity.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                      } animate-pulse`}></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.title}</p>
                        <p className="text-xs text-gray-500">{activity.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(activity.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-400">
                          {Math.round((Date.now() - new Date(activity.created_at).getTime()) / (1000 * 60))}m ago
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <School className="h-8 w-8 mx-auto mb-2" />
                    <p>No recent activity</p>
                    <p className="text-sm">System events will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Growth Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Growth Overview
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Teachers and Students over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={growthData.length > 0 ? growthData : [{name: 'No Data', teachers: 0, students: 0}]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="teachers" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                    <Area type="monotone" dataKey="students" stackId="1" stroke="#ffc658" fill="#ffc658" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Teacher Attendance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Teacher Attendance
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Weekly attendance trends</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={attendanceData.length > 0 ? attendanceData : [{name: 'No Data', attendance: 0}]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="attendance" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Course Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Course Progress
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Completion rates by subject</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={courseProgressData.length > 0 ? courseProgressData : [{name: 'No Data', completed: 0, pending: 0}]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }: any) => `${name}: ${value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="completed"
                    >
                      {(courseProgressData.length > 0 ? courseProgressData : [{name: 'No Data', completed: 0, pending: 0}]).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Grade Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Student Distribution by Grade
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Current enrollment by grade level</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={gradeDistributionData.length > 0 ? gradeDistributionData : [{name: 'No Data', students: 0}]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }: any) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="students"
                    >
                      {(gradeDistributionData.length > 0 ? gradeDistributionData : [{name: 'No Data', students: 0}]).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Management Tab */}
        <TabsContent value="management" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/school-admin/students')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="mr-2 h-5 w-5" />
                  Students Management
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Manage students and enrollments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Add, edit, and manage student records. Generate joining codes and track enrollment.
                  </p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Quick Stats</span>
                      <Badge variant="outline">{stats.totalStudents} students</Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Active Students:</span>
                        <span className="font-medium">{stats.totalStudents}</span>
                      </div>
                    </div>
                  </div>
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push('/school-admin/students');
                    }}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Manage Students
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/school-admin/teachers')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="mr-2 h-5 w-5" />
                  Teachers Management
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Manage teachers and assignments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Manage teacher assignments, track attendance, and handle leave requests.
                  </p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Quick Stats</span>
                      <Badge variant="outline">{stats.totalTeachers} teachers</Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Active Teachers:</span>
                        <span className="font-medium">{stats.totalTeachers}</span>
                      </div>
                      {stats.averageAttendance > 0 && (
                        <div className="flex justify-between">
                          <span>Avg Attendance:</span>
                          <span className="font-medium">{stats.averageAttendance}%</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Pending Leaves:</span>
                        <span className="font-medium text-red-600">{stats.pendingLeaves}</span>
                      </div>
                    </div>
                  </div>
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push('/school-admin/teachers');
                    }}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Manage Teachers
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/school-admin/courses')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="mr-2 h-5 w-5" />
                  Courses Management
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                </CardTitle>
                <CardDescription>Manage courses and track progress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    View courses, track completion rates, and manage course content.
                  </p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Quick Stats</span>
                      <Badge variant="outline">{stats.activeCourses} courses</Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Active Courses:</span>
                        <span className="font-medium">{stats.activeCourses}</span>
                      </div>
                    </div>
                  </div>
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push('/school-admin/courses');
                    }}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Courses
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Teacher Reports & Leaves
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              </CardTitle>
              <CardDescription>Review and approve teacher reports and leave requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/school-admin/reports')}>
                  <CardHeader>
                    <CardTitle className="text-lg">Pending Reports</CardTitle>
                    <CardDescription>Teacher reports awaiting approval</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-3xl font-bold text-orange-600">{stats.pendingReports}</div>
                      <p className="text-sm text-gray-600">
                        {stats.pendingReports === 0 
                          ? 'All reports have been reviewed'
                          : `${stats.pendingReports} report(s) need your attention`}
                      </p>
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push('/school-admin/reports');
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Reports
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/school-admin/teachers')}>
                  <CardHeader>
                    <CardTitle className="text-lg">Pending Leaves</CardTitle>
                    <CardDescription>Teacher leave requests awaiting approval</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-3xl font-bold text-red-600">{stats.pendingLeaves}</div>
                      <p className="text-sm text-gray-600">
                        {stats.pendingLeaves === 0 
                          ? 'No pending leave requests'
                          : `${stats.pendingLeaves} leave request(s) need your review`}
                      </p>
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push('/school-admin/teachers?tab=leaves');
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Review Leaves
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


"use client";

import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  RefreshCw,
  UserPlus,
  School,
  Users,
  User,
  BookOpen,
  TrendingUp
} from "lucide-react";
import CreateAccountDialog from "../../components/admin/CreateAccountDialog";
import { useSmartRefresh } from "../../hooks/useSmartRefresh";
import { SkeletonDashboard } from "../../components/ui/skeleton-dashboard";
import { fetchWithCsrf } from "../../lib/csrf-client";

// Lazy load tab components
const AdminOverviewTab = lazy(() => import("../../components/admin/AdminOverviewTab"));
const AdminManagementTab = lazy(() => import("../../components/admin/AdminManagementTab"));
const AdminReportsTab = lazy(() => import("../../components/admin/AdminReportsTab"));
const AdminStudentProgressTab = lazy(() => import("../../components/admin/AdminStudentProgressTab"));
// Enrollments feature removed

// Enhanced interfaces for real-time data
interface DashboardStats {
  totalSchools: number;
  totalTeachers: number;
  totalStudents: number;
  activeCourses: number;
  pendingLeaves: number;
  systemHealth: number;
  avgAttendance: number;
  completionRate: number;
  activeUsers: number;
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
}

interface RecentActivity {
  id: string;
  title: string;
  message: string;
  created_at: string;
  type: 'success' | 'warning' | 'info' | 'error';
}

export default function AdminDashboard() {
  console.log('🔵 AdminDashboard component rendering...');
  const router = useRouter();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalSchools: 0,
    totalTeachers: 0,
    totalStudents: 0,
    activeCourses: 0,
    pendingLeaves: 0,
    systemHealth: 99.9,
    avgAttendance: 0,
    completionRate: 0,
    activeUsers: 0
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [quickActionPreviews, setQuickActionPreviews] = useState<QuickActionPreview[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isMounted, setIsMounted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isCreateAccountDialogOpen, setIsCreateAccountDialogOpen] = useState(false);

  useEffect(() => {
    console.log('🔵 useEffect running - setting isMounted to true');
    try {
      setIsMounted(true);
      console.log('✅ isMounted set successfully');
     
    } catch (error: unknown) {
      console.error('❌ Error in useEffect:', error);
      setHasError(true);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(errorMessage);
    }
  }, []);
  
  // Monthly trends for stats cards
  const [monthlyTrends, setMonthlyTrends] = useState<Array<{name: string; value: number; change: number}>>([]);

  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Fetch stats from API route with cache-busting to ensure real-time data
      const timestamp = new Date().getTime();
      
      // Default stats to prevent blank screen
      let newStats: DashboardStats = {
        totalSchools: 0,
        totalTeachers: 0,
        totalStudents: 0,
        activeCourses: 0,
        pendingLeaves: 0,
        systemHealth: 0,
        avgAttendance: 0,
        completionRate: 0,
        activeUsers: 0
      };
      
      try {
        // Use fetchWithCsrf to automatically include auth token
        const statsResponse = await fetchWithCsrf(`/api/admin/stats?t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (statsResponse.ok) {
          const { stats: apiStats } = await statsResponse.json();
          console.log('✅ Stats loaded successfully (real-time):', apiStats);
          newStats = {
            ...apiStats,
            systemHealth: 0, // Will be calculated from real data if needed
            avgAttendance: 0, // Will be calculated from real attendance data
            completionRate: 0, // Will be calculated from real completion data
            activeUsers: apiStats.totalTeachers + apiStats.totalStudents
          };
        } else {
          console.log('API response not OK, using fallback stats');
        }
      } catch (fetchError) {
        console.error('Error fetching stats:', fetchError);
        // Use default stats - component will still render
      }
      
      // Always set stats (even if API failed) to prevent blank screen
      setStats(newStats);

      // Set monthly trends with actual values and 0 change (no fake data)
      const trends = [
        { name: "Schools", value: newStats.totalSchools, change: 0 },
        { name: "Teachers", value: newStats.totalTeachers, change: 0 },
        { name: "Students", value: newStats.totalStudents, change: 0 },
        { name: "Courses", value: newStats.activeCourses, change: 0 }
      ];
      setMonthlyTrends(trends);

      // Load recent activity - Note: If notifications API doesn't exist, create /api/admin/notifications
      // For now, we'll skip this or handle gracefully
      try {
        // TODO: Create /api/admin/notifications route for admin access
        // For now, leave empty or use API if available
        setRecentActivity([]);
      } catch {
        setRecentActivity([]);
      }

      // Load quick action previews immediately (needed for Overview tab)
      try {
        await loadQuickActionPreviews().catch((error: unknown) => {
          console.error('Error loading quick action previews:', error);
          // Continue anyway
        });
      } catch (error) {
        console.error('Error loading dashboard components:', error);
        // Continue anyway
      }
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Always set default stats to prevent blank screen
      setStats({
        totalSchools: 0,
        totalTeachers: 0,
        totalStudents: 0,
        activeCourses: 0,
        pendingLeaves: 0,
        systemHealth: 0,
        avgAttendance: 0,
        completionRate: 0,
        activeUsers: 0
      });
    } finally {
      setIsRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadQuickActionPreviews is stable, avoid circular deps
  }, []);


  const loadQuickActionPreviews = useCallback(async () => {
    const previews: QuickActionPreview[] = [];

    // Parallelize all preview API calls using fetchWithCsrf for automatic auth
    const [
      schoolsResponse,
      teachersResponse,
      studentsResponse,
      coursesResponse
    ] = await Promise.allSettled([
      fetchWithCsrf('/api/admin/schools', {}),
      fetchWithCsrf('/api/admin/teachers?limit=3&offset=0', {}),
      fetchWithCsrf('/api/admin/students?limit=3', {}),
      fetchWithCsrf('/api/admin/courses?limit=3&offset=0', {})
    ]);

    // Process schools preview
    if (schoolsResponse.status === 'fulfilled' && schoolsResponse.value.ok) {
      try {
        const responseData = await schoolsResponse.value.json();
        const schools = responseData.schools || [];
        
        if (!Array.isArray(schools)) {
          console.warn('Schools API returned non-array data:', responseData);
        }
        
        // Sort by created_at DESC to get most recent, then take first 3
        const recentSchools = Array.isArray(schools) 
          ? schools
              .sort((a: { created_at?: string }, b: { created_at?: string }) => {
                const dateA = new Date(a.created_at || 0).getTime();
                const dateB = new Date(b.created_at || 0).getTime();
                return dateB - dateA; // DESC order
              })
              .slice(0, 3)
              .map((s: { id: string; name: string; created_at?: string }) => ({
                id: s.id,
                name: s.name,
                created_at: s.created_at ?? ''
              }))
          : [];
        
        previews.push({
          id: 'schools',
          title: 'Recent Schools',
          description: 'Latest registered schools',
          icon: <School className="h-4 w-4" />,
          data: recentSchools,
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.error('Schools preview unavailable:', error);
        // Still add the preview card but with empty data so UI doesn't break
        previews.push({
          id: 'schools',
          title: 'Recent Schools',
          description: 'Latest registered schools',
          icon: <School className="h-4 w-4" />,
          data: [],
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      }
    } else if (schoolsResponse.status === 'rejected') {
      console.error('Schools API request failed:', schoolsResponse.reason);
    }

    // Process teachers preview
    if (teachersResponse.status === 'fulfilled' && teachersResponse.value.ok) {
      try {
        const responseData = await teachersResponse.value.json();
        // Handle both pagination formats: {teachers: [...]} or {data: [...]}
        const teachers = responseData.teachers || responseData.data || [];
        
        if (!Array.isArray(teachers)) {
          console.warn('Teachers API returned non-array data:', responseData);
        }
        
        const teacherData = Array.isArray(teachers) ? teachers.slice(0, 3).map((t: { id: string; full_name: string; email: string; created_at?: string }) => ({
          id: t.id,
          full_name: t.full_name,
          email: t.email,
          created_at: t.created_at ?? ''
        })) : [];
        
        previews.push({
          id: 'teachers',
          title: 'Recent Teachers',
          description: 'Latest teacher registrations',
          icon: <Users className="h-4 w-4" />,
          data: teacherData,
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.error('Teachers preview unavailable:', error);
        // Still add the preview card but with empty data so UI doesn't break
        previews.push({
          id: 'teachers',
          title: 'Recent Teachers',
          description: 'Latest teacher registrations',
          icon: <Users className="h-4 w-4" />,
          data: [],
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      }
    } else if (teachersResponse.status === 'rejected') {
      console.error('Teachers API request failed:', teachersResponse.reason);
    }

    // Process students preview
    if (studentsResponse.status === 'fulfilled' && studentsResponse.value.ok) {
      try {
        const responseData = await studentsResponse.value.json();
        // Handle both pagination formats: {students: [...]} or {data: [...]}
        const students = responseData.students || responseData.data || [];
        
        if (!Array.isArray(students)) {
          console.warn('Students API returned non-array data:', responseData);
        }
        
        const studentData = Array.isArray(students) ? students.slice(0, 3).map((s: { id: string; full_name: string; email: string; created_at?: string }) => ({
          id: s.id,
          full_name: s.full_name,
          email: s.email,
          created_at: s.created_at ?? ''
        })) : [];
        
        previews.push({
          id: 'students',
          title: 'Recent Students',
          description: 'Latest student enrollments',
          icon: <User className="h-4 w-4" />,
          data: studentData,
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.error('Students preview unavailable:', error);
        // Still add the preview card but with empty data so UI doesn't break
        previews.push({
          id: 'students',
          title: 'Recent Students',
          description: 'Latest student enrollments',
          icon: <User className="h-4 w-4" />,
          data: [],
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      }
    } else if (studentsResponse.status === 'rejected') {
      console.error('Students API request failed:', studentsResponse.reason);
    }

    // Process courses preview
    if (coursesResponse.status === 'fulfilled' && coursesResponse.value.ok) {
      try {
        const responseData = await coursesResponse.value.json();
        // Handle both pagination formats: {courses: [...]} or {data: [...]}
        const courses = responseData.courses || responseData.data || [];
        
        if (!Array.isArray(courses)) {
          console.warn('Courses API returned non-array data:', responseData);
        }
        
        const courseData = Array.isArray(courses) ? courses.slice(0, 3).map((c: { id: string; title?: string; course_name?: string; name?: string; status?: string; created_at?: string }) => ({
          id: c.id,
          title: c.title || c.course_name || c.name,
          status: c.status,
          created_at: c.created_at ?? ''
        })) : [];
        
        previews.push({
          id: 'courses',
          title: 'Recent Courses',
          description: 'Latest course publications',
          icon: <BookOpen className="h-4 w-4" />,
          data: courseData,
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.error('Courses preview unavailable:', error);
        // Still add the preview card but with empty data so UI doesn't break
        previews.push({
          id: 'courses',
          title: 'Recent Courses',
          description: 'Latest course publications',
          icon: <BookOpen className="h-4 w-4" />,
          data: [],
          loading: false,
          lastUpdated: new Date().toISOString()
        });
      }
    } else if (coursesResponse.status === 'rejected') {
      console.error('Courses API request failed:', coursesResponse.reason);
    }

      setQuickActionPreviews(previews);
  }, []);


  useEffect(() => {
    // Initial load only - no auto-refresh interval
    // Smart refresh will handle tab switching refreshes
    loadDashboardData();
  }, [loadDashboardData]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadDashboardData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  const handleRefresh = async () => {
    await loadDashboardData();
  };

  const handleQuickAction = async (actionId: string) => {
    // Navigate to the appropriate management page
    const routes: Record<string, string> = {
      'schools': '/admin/schools',
      'teachers': '/admin/teachers',
      'students': '/admin/students',
      'courses': '/admin/courses'
    };

    if (routes[actionId]) {
      router.push(routes[actionId]);
    } else {
      // Fallback: refresh preview data
      const previewIndex = quickActionPreviews.findIndex(p => p.id === actionId);
      if (previewIndex !== -1) {
        const updatedPreviews = [...quickActionPreviews];
        updatedPreviews[previewIndex].loading = true;
        setQuickActionPreviews(updatedPreviews);

        setTimeout(async () => {
          await loadQuickActionPreviews();
        }, 1000);
      }
    }
  };

  // If there's an error, show error message
  if (hasError) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold mb-2">Error Loading Dashboard</h2>
          <p className="text-red-700">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // Safety check - ensure component always renders something
  if (!isMounted) {
    console.log('⏳ Component not mounted yet, showing loading...');
    return (
      <div className="p-8" style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  console.log('✅ Component fully mounted, rendering dashboard...');
  return (
        <div className="p-4 md:p-6 lg:p-8" style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
          {/* Header */}
          <div className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Welcome back, Admin User</p>
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
              onClick={() => setIsCreateAccountDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Create Account
            </Button>
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
                <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
                <School className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSchools}</div>
            <p className="text-xs text-muted-foreground">
              {monthlyTrends.find(t => t.name === 'Schools')?.change || 0}% from last month
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-xs text-green-600">Active</span>
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
            <p className="text-xs text-muted-foreground">
              {monthlyTrends.find(t => t.name === 'Teachers')?.change || 0}% from last month
            </p>
            {stats.avgAttendance > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-xs text-blue-600">{stats.avgAttendance}% attendance</span>
              </div>
            )}
              </CardContent>
            </Card>

        <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              {monthlyTrends.find(t => t.name === 'Students')?.change || 0}% from last month
            </p>
            {stats.completionRate > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span className="text-xs text-purple-600">{stats.completionRate}% completion</span>
              </div>
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
            {monthlyTrends.find(t => t.name === 'Courses')?.change !== undefined && monthlyTrends.find(t => t.name === 'Courses')?.change !== 0 && (
              <p className="text-xs text-muted-foreground">
                {monthlyTrends.find(t => t.name === 'Courses')?.change} new this week
              </p>
            )}
            {stats.activeCourses > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span className="text-xs text-orange-600">Published</span>
              </div>
            )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="management">Management</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="student-progress">Student Progress</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <Suspense fallback={<SkeletonDashboard />}>
                <AdminOverviewTab
                  stats={stats}
                  quickActionPreviews={quickActionPreviews}
                  recentActivity={recentActivity}
                  isLoading={isRefreshing}
                  onQuickAction={handleQuickAction}
                />
              </Suspense>
            </TabsContent>

            {/* Management Tab */}
            <TabsContent value="management" className="space-y-6">
              <Suspense fallback={<SkeletonDashboard />}>
                <AdminManagementTab
                  stats={stats}
                  isLoading={isRefreshing}
                />
              </Suspense>
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports" className="space-y-6">
              <Suspense fallback={<SkeletonDashboard />}>
                <AdminReportsTab
                  stats={stats}
                  lastRefresh={lastRefresh}
                  isLoading={isRefreshing}
                />
              </Suspense>
            </TabsContent>

            {/* Student Progress Tab */}
            <TabsContent value="student-progress" className="space-y-6">
              <Suspense fallback={<SkeletonDashboard />}>
                <AdminStudentProgressTab />
              </Suspense>
            </TabsContent>
          </Tabs>

        {/* Create Account Dialog */}
        <CreateAccountDialog
          isOpen={isCreateAccountDialogOpen}
          onClose={() => setIsCreateAccountDialogOpen(false)}
          onSuccess={() => {
            handleRefresh();
            setIsCreateAccountDialogOpen(false);
          }}
        />
    </div>
  );
}





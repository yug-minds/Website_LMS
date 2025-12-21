"use client";

import { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useTeacherSchool } from "./context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  BookOpen, 
  FileText,
  Calendar,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { 
  useTeacherClasses, 
  useTeacherReports, 
  useTeacherMonthlyAttendance,
  useTeacherLeaves,
  useTodaysClasses
} from "../../hooks/useTeacherData";
import { useSmartRefresh } from "../../hooks/useSmartRefresh";
import { SkeletonDashboard } from "../../components/ui/skeleton-dashboard";

// Lazy load tab components
const TeacherOverviewTab = lazy(() => import("../../components/teacher/TeacherOverviewTab"));
const TeacherAttendanceTab = lazy(() => import("../../components/teacher/TeacherAttendanceTab"));
const TeacherReportsTab = lazy(() => import("../../components/teacher/TeacherReportsTab"));
const TeacherAnalyticsTab = lazy(() => import("../../components/teacher/TeacherAnalyticsTab"));
const StudentProgressTab = lazy(() => import("../../components/teacher/StudentProgressTab"));

// Interfaces
interface DashboardStats {
  todaysClasses: number;
  pendingReports: number;
  totalClasses: number;
  monthlyAttendance: number;
  pendingLeaves: number;
  totalStudents: number;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedSchool } = useTeacherSchool();
  const [stats, setStats] = useState<DashboardStats>({
    todaysClasses: 0,
    pendingReports: 0,
    totalClasses: 0,
    monthlyAttendance: 0,
    pendingLeaves: 0,
    totalStudents: 0
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isMounted, setIsMounted] = useState(false);

  // React Query hooks - only load data needed for stats
  const { data: classes, isLoading: classesLoading } = useTeacherClasses(selectedSchool?.id);
  const { data: todaysClasses, isLoading: todaysClassesLoading } = useTodaysClasses(selectedSchool?.id);
  const { data: reports, isLoading: reportsLoading } = useTeacherReports(selectedSchool?.id, { limit: 5 });
  const { data: monthlyAttendance, isLoading: attendanceLoading } = useTeacherMonthlyAttendance(selectedSchool?.id, 6);
  const { data: leaves, isLoading: leavesLoading } = useTeacherLeaves(selectedSchool?.id);

  // Refresh function to reload all dashboard data
  const loadDashboardData = async () => {
    if (!selectedSchool?.id) return;
    
    setIsRefreshing(true);
    try {
      // Invalidate all teacher-related queries to force refetch (match actual query keys)
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'classes', selectedSchool.id] });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'today-classes', selectedSchool.id] });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'reports', selectedSchool.id] });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'monthly-attendance', selectedSchool.id] });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'leaves', selectedSchool.id] });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'schedules', selectedSchool.id] });
      await queryClient.invalidateQueries({ queryKey: ['teacher'] });
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error refreshing dashboard data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Best-effort realtime updates (invalidate queries on relevant table changes)
  useEffect(() => {
    if (!selectedSchool?.id) return;

    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const teacherId = userData?.user?.id;
      if (!teacherId || isCancelled) return;

      channel = supabase
        .channel(`teacher-dashboard-${teacherId}-${selectedSchool.id}`)
        // Class assignments (admin assigns classes to teacher)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "teacher_classes",
            filter: `teacher_id=eq.${teacherId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["teacher", "classes", selectedSchool.id] });
            queryClient.invalidateQueries({ queryKey: ["teacher", "today-classes", selectedSchool.id] });
            setLastRefresh(new Date());
          }
        )
        // Schedules (if schedules drive derived classes)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "class_schedules",
            filter: `teacher_id=eq.${teacherId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["teacher", "classes", selectedSchool.id] });
            queryClient.invalidateQueries({ queryKey: ["teacher", "schedules", selectedSchool.id] });
            queryClient.invalidateQueries({ queryKey: ["teacher", "today-classes", selectedSchool.id] });
            setLastRefresh(new Date());
          }
        )
        // Reports (pending reports card)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "teacher_reports",
            filter: `teacher_id=eq.${teacherId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["teacher", "reports", selectedSchool.id] });
            queryClient.invalidateQueries({ queryKey: ["teacher", "today-classes", selectedSchool.id] });
            setLastRefresh(new Date());
          }
        )
        // Leaves (pending leaves card)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "teacher_leaves",
            filter: `teacher_id=eq.${teacherId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["teacher", "leaves", selectedSchool.id] });
            setLastRefresh(new Date());
          }
        )
        .subscribe();
    };

    setup();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient, selectedSchool?.id]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadDashboardData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  // Use useMemo to calculate stats and activity efficiently (only recalculates when data changes)
  const dashboardStats = useMemo(() => {
    if (!selectedSchool) return {
      todaysClasses: 0,
      pendingReports: 0,
      totalClasses: 0,
      monthlyAttendance: 0,
      pendingLeaves: 0,
      totalStudents: 0
    };

    // Calculate monthly attendance percentage
    const attendancePct = (() => {
      if (!monthlyAttendance || monthlyAttendance.length === 0) return 0;
      const currentMonth = monthlyAttendance[0];
      const total = currentMonth.total_days || currentMonth.present_count + currentMonth.absent_count + currentMonth.leave_count + currentMonth.unreported_count || 1;
      const present = currentMonth.present_count || 0;
      return Math.round((present / total) * 100);
    })();

    return {
      todaysClasses: todaysClasses?.length || 0,
       
      pendingReports: reports?.filter((r: any) => r.report_status === 'Submitted').length || 0,
      totalClasses: classes?.length || 0,
      monthlyAttendance: attendancePct,
       
      pendingLeaves: leaves?.filter((l: any) => l.status === 'Pending').length || 0,
      totalStudents: 0
    };
  }, [selectedSchool, classes, todaysClasses, reports, leaves, monthlyAttendance]);

  // Update stats when calculated values change
  useEffect(() => {
    setStats(dashboardStats);
    setLastRefresh(new Date());
  }, [dashboardStats]);

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!selectedSchool) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
              <p className="text-lg font-medium">No school selected</p>
              <p className="text-sm text-gray-600 mt-2">
                Please select a school from the dropdown above to view your dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Welcome back! Here&apos;s an overview of your teaching activities at {selectedSchool.name}
          </p>
        </div>
        <Button
          onClick={loadDashboardData}
          disabled={isRefreshing}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todaysClasses}</div>
            <p className="text-xs text-muted-foreground">Classes scheduled today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingReports}</div>
            <p className="text-xs text-muted-foreground">Reports awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClasses}</div>
            <p className="text-xs text-muted-foreground">Classes assigned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Attendance</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.monthlyAttendance}%</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Leaves</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingLeaves}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Refresh</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {lastRefresh.toLocaleTimeString()}
            </div>
            <p className="text-xs text-muted-foreground">Just now</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="student-progress">Student Progress</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Suspense fallback={<SkeletonDashboard />}>
            <TeacherOverviewTab selectedSchoolId={selectedSchool?.id} />
          </Suspense>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-6">
          <Suspense fallback={<SkeletonDashboard />}>
            <TeacherAttendanceTab />
          </Suspense>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <Suspense fallback={<SkeletonDashboard />}>
            <TeacherReportsTab selectedSchoolId={selectedSchool?.id} />
          </Suspense>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <Suspense fallback={<SkeletonDashboard />}>
            <TeacherAnalyticsTab selectedSchoolId={selectedSchool?.id} />
          </Suspense>
        </TabsContent>

        {/* Student Progress Tab */}
        <TabsContent value="student-progress" className="space-y-6">
          <Suspense fallback={<SkeletonDashboard />}>
            <StudentProgressTab selectedSchoolId={selectedSchool?.id} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}


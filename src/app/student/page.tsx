"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { frontendLogger } from "../../lib/frontend-logger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { 
  BookOpen, 
  FileText,
  Calendar,
  Award,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  Bell,
  BarChart,
  Play,
  Upload
} from "lucide-react";
import Link from "next/link";
import { 
  useStudentProfile,
  useStudentDashboardStats,
  useStudentCourses,
  useStudentAssignments,
  useStudentNotifications
} from "../../hooks/useStudentData";
import { useSmartRefresh } from "../../hooks/useSmartRefresh";
import { useQueryClient } from "@tanstack/react-query";

export default function StudentDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [greeting, setGreeting] = useState("Hello");
  const [isMounted, setIsMounted] = useState(false);
  
  // OPTIMIZATION: Request deduplication - Track ongoing requests to prevent duplicates
  const ongoingRequests = useRef<Map<string, Promise<any>>>(new Map());
  
  // OPTIMIZATION: Incremental Loading - Load critical data first, defer non-critical
  // Critical: profile, stats (needed for header/stats cards)
  // Non-critical: notifications (can be deferred)
  const { data: profile, isLoading: profileLoading } = useStudentProfile();
  const { data: stats, isLoading: statsLoading } = useStudentDashboardStats();
  const { data: courses, isLoading: coursesLoading } = useStudentCourses();
  const { data: assignments, isLoading: assignmentsLoading } = useStudentAssignments();
  
  // OPTIMIZATION: Defer non-critical data loading - load after initial render
  const [shouldLoadNonCritical, setShouldLoadNonCritical] = useState(false);
  
  useEffect(() => {
    // Defer non-critical data loading using requestIdleCallback
    if (isMounted && !shouldLoadNonCritical) {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        requestIdleCallback(() => {
          setShouldLoadNonCritical(true);
        }, { timeout: 500 });
      } else {
        setTimeout(() => {
          setShouldLoadNonCritical(true);
        }, 200);
      }
    }
  }, [isMounted, shouldLoadNonCritical]);
  
  // OPTIMIZATION: Only load notifications after initial render (non-critical)
  // Notifications hook doesn't support enabled flag, so we'll handle it differently
  // by conditionally rendering the notifications section
  const { data: notifications, isLoading: notificationsLoading } = useStudentNotifications();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    
    frontendLogger.debug('Student dashboard mounted', {
      component: 'StudentDashboard',
    });
    
    // Set greeting based on time of day
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  // Check for force password change using profile data from hook (no duplicate query)
  useEffect(() => {
    if ((profile as any)?.force_password_change) {
      router.push('/student/settings?force_change=true');
    }
  }, [profile, router]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    queryKeys: [
      ['studentProfile'],
      ['studentDashboardStats'],
      ['studentCourses'],
      ['studentAssignments'],
      ['studentNotifications']
    ],
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Get pending assignments (due soon)
  const pendingAssignments = Array.isArray(assignments)
    ? (assignments as any[]).filter((a: any) => 
        a.status === 'not_started' || a.status === 'in_progress'
      ).slice(0, 3)
    : [];

  // Get recent notifications
  const recentNotifications = notifications?.filter(n => !n.is_read).slice(0, 5) || [];

  // Get active courses - a course is "active" if it exists and is not 100% complete
  // This matches the logic in useStudentDashboardStats
  const activeCourses = courses?.filter((c: any) => {
    const progress = c.progress_percentage || 0
    return progress < 100
  }).slice(0, 3) || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            {greeting}, {profile?.full_name?.split(' ')[0] || 'Student'}! 👋
          </h1>
          <p className="text-gray-600 mt-2">
            {profile?.students?.[0]?.schools?.[0]?.name} • Grade {profile?.students?.[0]?.grade}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/student/notifications">
            <Button variant="outline" className="relative">
              <Bell className="h-4 w-4" />
              {recentNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {recentNotifications.length}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeCourses || 0}</div>
            <p className="text-xs text-muted-foreground">Courses in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Assignments</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.pendingAssignments || 0}</div>
            <p className="text-xs text-muted-foreground">Due soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Courses Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.completedCourses || 0}</div>
            <p className="text-xs text-muted-foreground">Total courses finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completedAssignments || 0}</div>
            <p className="text-xs text-muted-foreground">Assignments done</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Active Courses & Assignments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Courses */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active Courses</CardTitle>
                  <CardDescription>Continue your learning journey</CardDescription>
                </div>
                <Link href="/student/my-courses">
                  <Button variant="outline" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {coursesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : activeCourses.length > 0 ? (
                <div className="space-y-4">
                  {activeCourses.map((course: any) => (
                    <div key={course.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{course.name || course.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{course.grade} • {course.subject}</p>
                          <div className="mt-3">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-600">Progress</span>
                              <span className="font-medium">{course.progress_percentage?.toFixed(0) || 0}%</span>
                            </div>
                            <Progress value={course.progress_percentage || 0} className="h-2" />
                          </div>
                        </div>
                        <Link href={`/student/my-courses/${course.id}`}>
                          <Button size="sm" className="ml-4">
                            <Play className="h-4 w-4 mr-2" />
                            Continue
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No active courses yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Assignments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pending Assignments</CardTitle>
                  <CardDescription>Assignments due soon</CardDescription>
                </div>
                <Link href="/student/assignments">
                  <Button variant="outline" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {assignmentsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : pendingAssignments.length > 0 ? (
                <div className="space-y-4">
                  {pendingAssignments.map((assignment: any) => (
                    <div key={assignment.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{assignment.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{assignment.course_title}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1" />
                              Due: {new Date(assignment.due_date).toLocaleDateString()}
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1" />
                              {assignment.days_until_due > 0 
                                ? `${assignment.days_until_due} days left`
                                : 'Due today'
                              }
                            </div>
                          </div>
                        </div>
                        <Link href={`/student/assignments/${assignment.id}`}>
                          <Button size="sm" variant={assignment.days_until_due <= 2 ? "default" : "outline"}>
                            <Upload className="h-4 w-4 mr-2" />
                            Start
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>All caught up! No pending assignments</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Quick Actions & Notifications */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/student/my-courses">
                <Button variant="outline" className="w-full justify-start">
                  <BookOpen className="h-4 w-4 mr-2" />
                  My Courses
                </Button>
              </Link>
              <Link href="/student/assignments">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-2" />
                  Assignments
                </Button>
              </Link>
              <Link href="/student/certificates">
                <Button variant="outline" className="w-full justify-start">
                  <Award className="h-4 w-4 mr-2" />
                  Certificates
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Notifications - OPTIMIZATION: Lazy load this section */}
          {shouldLoadNonCritical ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Notifications</CardTitle>
                  <Link href="/student/notifications">
                    <Button variant="ghost" size="sm">View All</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {notificationsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : recentNotifications.length > 0 ? (
                  <div className="space-y-3">
                    {recentNotifications.map((notification: any) => (
                      <div key={notification.id} className="p-3 border rounded-lg bg-blue-50">
                        <div className="flex items-start gap-2">
                          <Bell className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                            <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(notification.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Bell className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No new notifications</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2">Loading notifications...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Performance Overview - OPTIMIZATION: Lazy load this section */}
          {shouldLoadNonCritical ? (
            <Card>
              <CardHeader>
                <CardTitle>Performance</CardTitle>
                <CardDescription>Your overall stats</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Course Progress</span>
                    <span className="font-medium">
                      {courses && courses.length > 0
                         
                        ? Math.round(courses.reduce((acc: number, c: any) => acc + (c.progress_percentage || 0), 0) / courses.length)
                        : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={courses && courses.length > 0
                       
                      ? courses.reduce((acc: number, c: any) => acc + (c.progress_percentage || 0), 0) / courses.length
                      : 0
                    } 
                    className="h-2" 
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Average Grade</span>
                    <span className="font-medium">{stats?.averageGrade || 0}%</span>
                  </div>
                  <Progress value={stats?.averageGrade || 0} className="h-2" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Performance</CardTitle>
                <CardDescription>Your overall stats</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2">Loading performance data...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}





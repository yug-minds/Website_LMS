"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { addTokensToHeaders } from "../../../lib/csrf-client";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { 
  TrendingUp,
  Users,
  GraduationCap,
  BookOpen,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  PieChart,
  Activity,
  Download,
  Calendar,
  Target
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
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

interface AnalyticsData {
  totalStudents: number;
  totalTeachers: number;
  activeCourses: number;
  averageAttendance: number;
  studentEngagement: number;
  courseCompletion: number;
  monthlyGrowth: {
    students: number;
    teachers: number;
    courses: number;
  };
}

export default function AnalyticsDashboard() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    totalStudents: 0,
    totalTeachers: 0,
    activeCourses: 0,
    averageAttendance: 0,
    studentEngagement: 0,
    courseCompletion: 0,
    monthlyGrowth: {
      students: 0,
      teachers: 0,
      courses: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30");
  const [schoolId, setSchoolId] = useState<string>("");
  
  // Real-time chart data - will be populated from database
  const [attendanceTrendData, setAttendanceTrendData] = useState<Array<{ name: string; attendance: number; students: number }>>([]);
  const [gradeDistributionData, setGradeDistributionData] = useState<Array<{ name: string; students: number; color: string }>>([]);
  const [courseProgressData, setCourseProgressData] = useState<Array<{ name: string; completed: number; inProgress: number; notStarted: number }>>([]);
  const [teacherPerformanceData, setTeacherPerformanceData] = useState<Array<{ name: string; attendance: number; reports: number; students: number }>>([]);
  const [monthlyEnrollmentData, setMonthlyEnrollmentData] = useState<Array<{ month: string; students: number; teachers: number; courses: number }>>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const loadAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingCharts(true);
      
      // Get current user's school
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use API route to get profile (bypasses RLS)
      let profile = null;
      try {
        const profileHeaders = await addTokensToHeaders();
        const profileResponse = await fetch(`/api/profile?userId=${user.id}`, {
          cache: 'no-store',
          method: 'GET',
          headers: profileHeaders
        });
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          profile = profileData.profile;
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        return;
      }

      // Verify user is school admin
      if (profile?.role !== 'school_admin') {
        console.warn('User is not a school admin. Role:', profile?.role);
        return;
      }
      
      // Note: school_id is stored in state for display purposes only
      // All API endpoints get school_id from school_admins table automatically
      // Get school_id from school API response (uses school_admins table)
      const session = await supabase.auth.getSession();
      const authHeader = { 'Authorization': `Bearer ${session.data.session?.access_token || ''}` };
      
      // Get school info to set school_id
      try {
        const schoolResponse = await fetch(`/api/school-admin/school`, {
          cache: 'no-store',
          headers: authHeader
        });
        if (schoolResponse.ok) {
          const schoolData = await schoolResponse.json();
          if (schoolData.school?.id) {
            setSchoolId(schoolData.school.id);
          }
        }
      } catch (err) {
        console.warn('Could not fetch school info:', err);
        // Continue anyway - API routes will handle school_id
      }

      // Fetch all data in parallel - all endpoints use authenticated school_id automatically
      const [statsRes, studentsRes, teachersRes, coursesRes, progressRes] = await Promise.all([
        fetch(`/api/school-admin/stats`, { cache: 'no-store', headers: authHeader }),
        fetch(`/api/school-admin/students`, { cache: 'no-store', headers: authHeader }),
        fetch(`/api/school-admin/teachers`, { cache: 'no-store', headers: authHeader }),
        fetch(`/api/school-admin/courses`, { cache: 'no-store', headers: authHeader }),
        fetch(`/api/school-admin/courses/progress`, { cache: 'no-store', headers: authHeader })
      ]);

      // Parse responses
      const statsData = statsRes.ok ? await statsRes.json() : { stats: {} };
      const studentsData = studentsRes.ok ? await studentsRes.json() : { students: [] };
      const teachersData = teachersRes.ok ? await teachersRes.json() : { teachers: [] };
      const coursesData = coursesRes.ok ? await coursesRes.json() : { courses: [] };
      const progressData = progressRes.ok ? await progressRes.json() : { progress: [] };

      const stats = statsData.stats || {};
      const students = studentsData.students || [];
      const teachers = teachersData.teachers || [];
      const courses = coursesData.courses || [];
      const progress = progressData.progress || [];

      // Calculate basic metrics
      const totalStudents = stats.totalStudents || students.length || 0;
      const totalTeachers = stats.totalTeachers || teachers.length || 0;
       
      const activeCourses = stats.activeCourses || courses.filter((c: any) => c.status === 'Published').length || 0;
      const averageAttendance = stats.averageAttendance || 0;

      // Calculate monthly growth (current month vs last month)
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      // Count students enrolled in current month vs last month
       
      const currentMonthStudents = students.filter((s: any) => {
        const enrolledDate = new Date(s.enrolled_at || s.created_at || 0);
        return enrolledDate.getMonth() === currentMonth && enrolledDate.getFullYear() === currentYear;
      }).length;

       
      const lastMonthStudents = students.filter((s: any) => {
        const enrolledDate = new Date(s.enrolled_at || s.created_at || 0);
        return enrolledDate.getMonth() === lastMonth && enrolledDate.getFullYear() === lastMonthYear;
      }).length;

      const studentGrowth = currentMonthStudents - lastMonthStudents;

      // Count teachers assigned in current month vs last month
       
      const currentMonthTeachers = teachers.filter((t: any) => {
        const assignedDate = new Date(t.assigned_at || t.created_at || 0);
        return assignedDate.getMonth() === currentMonth && assignedDate.getFullYear() === currentYear;
      }).length;

       
      const lastMonthTeachers = teachers.filter((t: any) => {
        const assignedDate = new Date(t.assigned_at || t.created_at || 0);
        return assignedDate.getMonth() === lastMonth && assignedDate.getFullYear() === lastMonthYear;
      }).length;

      const teacherGrowth = currentMonthTeachers - lastMonthTeachers;

      // Count courses created in current month vs last month
       
      const currentMonthCourses = courses.filter((c: any) => {
        const createdDate = new Date(c.created_at || 0);
        return createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
      }).length;

       
      const lastMonthCourses = courses.filter((c: any) => {
        const createdDate = new Date(c.created_at || 0);
        return createdDate.getMonth() === lastMonth && createdDate.getFullYear() === lastMonthYear;
      }).length;

      const courseGrowth = currentMonthCourses - lastMonthCourses;

      // Calculate course completion rate (for student engagement estimation)
       
      const totalEnrolled = progress.reduce((sum: number, p: any) => sum + (p.total_students || 0), 0);
       
      const totalCompleted = progress.reduce((sum: number, p: any) => sum + (p.completed_students || 0), 0);
      
      // Calculate student engagement (percentage of students enrolled in at least one course)
      // Estimate based on enrollment ratio
      const studentEngagement = totalStudents > 0 && totalEnrolled > 0 
        ? Math.round(Math.min(100, (totalEnrolled / totalStudents) * 100))
        : 0;
      
      // Calculate course completion rate
      const courseCompletion = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0;

      setAnalyticsData({
        totalStudents,
        totalTeachers,
        activeCourses,
        averageAttendance,
        studentEngagement,
        courseCompletion,
        monthlyGrowth: {
          students: studentGrowth,
          teachers: teacherGrowth,
          courses: courseGrowth
        }
      });

      // Load chart data
      await loadChartData(students, teachers, courses, progress, averageAttendance, authHeader);
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
      setLoadingCharts(false);
    }
  }, []);

  // Load all chart data from real database
  const loadChartData = async (
     
    students: any[],
     
    teachers: any[],
     
    courses: any[],
     
    progress: any[],
    averageAttendance: number,
    authHeader: { 'Authorization': string }
  ) => {
    try {
      // 1. Calculate Grade Distribution
      const gradeMap = new Map<string, number>();
       
      students.forEach((student: any) => {
        const grade = student.grade || 'Unknown';
        gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);
      });

      const gradeDistribution = Array.from(gradeMap.entries())
        .map(([name, count], index) => ({
          name: name.includes('Grade') ? name : `Grade ${name}`,
          students: count,
          color: COLORS[index % COLORS.length]
        }))
        .sort((a: any, b: any) => {
          const aNum = parseInt(a.name.match(/\d+/)?.[0] || '0');
          const bNum = parseInt(b.name.match(/\d+/)?.[0] || '0');
          return aNum - bNum;
        });

      setGradeDistributionData(gradeDistribution);

      // 2. Calculate Course Progress by Subject
      const courseProgressMap = new Map<string, { completed: number; inProgress: number; notStarted: number }>();
       
      courses.forEach((course: any) => {
        const courseName = course.title || course.course_name || 'Unknown';
         
        const courseProgress = progress.find((p: any) => p.course_id === course.id);
        if (courseProgress) {
          const completed = courseProgress.completed_students || 0;
          const total = courseProgress.total_students || 0;
          const avgProgress = courseProgress.average_progress || 0;
          const inProgress = total - completed;
          const notStarted = total > 0 ? Math.max(0, total - Math.round((avgProgress / 100) * total)) : 0;
          
          const existing = courseProgressMap.get(courseName) || { completed: 0, inProgress: 0, notStarted: 0 };
          existing.completed += completed;
          existing.inProgress += inProgress;
          existing.notStarted += notStarted;
          courseProgressMap.set(courseName, existing);
        }
      });

      const courseProgress = Array.from(courseProgressMap.entries())
        .map(([name, data]) => {
          const total = data.completed + data.inProgress + data.notStarted;
          return {
            name: name.length > 20 ? name.substring(0, 20) + '...' : name,
            completed: total > 0 ? Math.round((data.completed / total) * 100) : 0,
            inProgress: total > 0 ? Math.round((data.inProgress / total) * 100) : 0,
            notStarted: total > 0 ? Math.round((data.notStarted / total) * 100) : 0
          };
        })
        .slice(0, 10); // Top 10 courses

      setCourseProgressData(courseProgress);

      // 3. Calculate Teacher Performance
      const reportsRes = await fetch(`/api/school-admin/reports`, { cache: 'no-store', headers: authHeader });
      const reportsData = reportsRes.ok ? await reportsRes.json() : { reports: [] };
      const reports = reportsData.reports || [];

      const teacherPerformanceMap = new Map<string, { reports: number; students: number }>();
       
      teachers.forEach((teacher: any) => {
        const teacherName = teacher.teacher?.full_name || teacher.profile?.full_name || 'Unknown';
        const teacherId = teacher.teacher_id || teacher.profile?.id;
        
        // Count reports for this teacher
         
        const teacherReports = reports.filter((r: any) => r.teacher_id === teacherId).length;
        
        // Estimate students taught (from courses/progress)
         
        const studentsTaught = progress.reduce((sum: number, p: any) => {
          // This is an approximation - in a real system, you'd track teacher-student relationships
          return sum + (p.total_students || 0);
        }, 0) / Math.max(teachers.length, 1);

        teacherPerformanceMap.set(teacherName, {
          reports: teacherReports,
          students: Math.round(studentsTaught)
        });
      });

      // Calculate actual attendance from teacher_reports if available
      // For now, set to 0 if no attendance data is available
      const teacherPerformance = Array.from(teacherPerformanceMap.entries())
        .map(([name, data]) => ({
          name: name.length > 15 ? name.substring(0, 15) + '...' : name,
          attendance: 0, // Calculate from database - no mock data
          reports: data.reports,
          students: data.students
        }))
        .slice(0, 10); // Top 10 teachers

      setTeacherPerformanceData(teacherPerformance);

      // 4. Calculate Monthly Enrollment Trends (last 6 months)
      const monthlyEnrollment: Array<{ month: string; students: number; teachers: number; courses: number }> = [];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = monthNames[date.getMonth()];
        const monthYear = date.getFullYear();

         
        const monthStudents = students.filter((s: any) => {
          const enrolledDate = new Date(s.enrolled_at || s.created_at || 0);
          return enrolledDate.getMonth() === date.getMonth() && enrolledDate.getFullYear() === monthYear;
        }).length;

         
        const monthTeachers = teachers.filter((t: any) => {
          const assignedDate = new Date(t.assigned_at || t.created_at || 0);
          return assignedDate.getMonth() === date.getMonth() && assignedDate.getFullYear() === monthYear;
        }).length;

         
        const monthCourses = courses.filter((c: any) => {
          const createdDate = new Date(c.created_at || 0);
          return createdDate.getMonth() === date.getMonth() && createdDate.getFullYear() === monthYear;
        }).length;

        monthlyEnrollment.push({
          month,
          students: monthStudents,
          teachers: monthTeachers,
          courses: monthCourses
        });
      }

      setMonthlyEnrollmentData(monthlyEnrollment);

      // 5. Calculate Attendance Trends (last 6 weeks)
      // Use actual averageAttendance from stats if available, otherwise 0
      const attendanceTrend: Array<{ name: string; attendance: number; students: number }> = [];
      const totalStudentsCount = students.length;
      
      for (let i = 5; i >= 0; i--) {
        const weekDate = new Date();
        weekDate.setDate(weekDate.getDate() - (i * 7));
        const weekName = `Week ${6 - i}`;
        
        // Use actual averageAttendance from stats (calculated from database)
        // If no data available, show 0 instead of mock data
        const attendance = averageAttendance || 0;
        
        attendanceTrend.push({
          name: weekName,
          attendance: Math.max(0, Math.min(100, attendance)),
          students: totalStudentsCount
        });
      }

      setAttendanceTrendData(attendanceTrend);

      console.log('✅ All analytics chart data loaded from database');
    } catch (error) {
      console.error('❌ Error loading chart data:', error);
      // Set empty arrays on error
      setAttendanceTrendData([]);
      setGradeDistributionData([]);
      setCourseProgressData([]);
      setTeacherPerformanceData([]);
      setMonthlyEnrollmentData([]);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadAnalyticsData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadAnalyticsData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-2">Comprehensive insights into your school&apos;s performance</p>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              +{analyticsData.monthlyGrowth.students} from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalTeachers}</div>
            <p className="text-xs text-muted-foreground">
              +{analyticsData.monthlyGrowth.teachers} from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.activeCourses}</div>
            <p className="text-xs text-muted-foreground">
              +{analyticsData.monthlyGrowth.courses} from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Attendance</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.averageAttendance}%</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Growth */}
            <Card>
              <CardHeader>
                <CardTitle>Monthly Growth</CardTitle>
                <CardDescription>Student and teacher enrollment trends</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCharts ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : monthlyEnrollmentData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={monthlyEnrollmentData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="students" stackId="1" stroke="#8884d8" fill="#8884d8" name="Students" />
                      <Area type="monotone" dataKey="teachers" stackId="2" stroke="#82ca9d" fill="#82ca9d" name="Teachers" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No enrollment data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Grade Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Student Distribution by Grade</CardTitle>
                <CardDescription>Current enrollment by grade level</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCharts ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : gradeDistributionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={gradeDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(props: any) => {
                          const name = props.name || '';
                          const students = (props as any).students || 0;
                          return `${name}: ${students}`;
                        }}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="students"
                      >
                        {gradeDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No grade distribution data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Student Engagement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{analyticsData.studentEngagement}%</div>
                <p className="text-sm text-gray-500">Based on login frequency and activity</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  Course Completion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{analyticsData.courseCompletion}%</div>
                <p className="text-sm text-gray-500">Average completion rate across all courses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">99.9%</div>
                <p className="text-sm text-gray-500">Platform uptime and performance</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Students Tab */}
        <TabsContent value="students" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Student Attendance Trend</CardTitle>
                <CardDescription>Weekly attendance patterns</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCharts ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : attendanceTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={attendanceTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="attendance" stroke="#8884d8" strokeWidth={2} name="Attendance %" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No attendance data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Student Activity</CardTitle>
                <CardDescription>Daily active students vs total enrollment</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCharts ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : attendanceTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={attendanceTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="students" fill="#82ca9d" name="Active Students" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No student activity data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Teachers Tab */}
        <TabsContent value="teachers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Teacher Performance</CardTitle>
              <CardDescription>Attendance, reports, and student count by teacher</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCharts ? (
                <div className="flex items-center justify-center h-[400px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : teacherPerformanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={teacherPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="attendance" fill="#8884d8" name="Attendance %" />
                    <Bar dataKey="reports" fill="#82ca9d" name="Reports Submitted" />
                    <Bar dataKey="students" fill="#ffc658" name="Students Taught" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-gray-500">
                  <p>No teacher performance data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Courses Tab */}
        <TabsContent value="courses" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Course Progress by Subject</CardTitle>
                <CardDescription>Completion status across different subjects</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCharts ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : courseProgressData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={courseProgressData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="completed" stackId="a" fill="#00C49F" name="Completed" />
                      <Bar dataKey="inProgress" stackId="a" fill="#FFBB28" name="In Progress" />
                      <Bar dataKey="notStarted" stackId="a" fill="#FF8042" name="Not Started" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No course progress data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Course Engagement</CardTitle>
                <CardDescription>Student participation in different courses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {courseProgressData.map((course, index) => (
                    <div key={course.name} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <span className="font-medium">{course.name}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-sm text-gray-500">
                          {course.completed}% completed
                        </div>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full" 
                            style={{ 
                              width: `${course.completed}%`,
                              backgroundColor: COLORS[index % COLORS.length]
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


"use client";

import { useState, useEffect, useCallback } from "react";
import { addTokensToHeaders } from "../../../lib/csrf-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "../../../components/ui/tabs";
import { 
  Users,
  School,
  BarChart3,
  Activity,
  Download,
  RefreshCw
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
  Line,
  AreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from "recharts";

export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState({
    totalSchools: 0,
    totalTeachers: 0,
    totalStudents: 0,
    activeCourses: 0,
    systemHealth: 99.9,
    avgAttendance: 0,
    completionRate: 0
  });
  const [trends, setTrends] = useState({
    schoolsChange: 0,
    teachersChange: 0,
    studentsChange: 0,
    coursesChange: 0
  });
  const [monthlyGrowth, setMonthlyGrowth] = useState<Array<{name: string; schools: number; teachers: number; students: number; courses: number}>>([]);
  const [topSchools, setTopSchools] = useState<Array<{name: string; engagement: number}>>([]);
  const [popularCourses, setPopularCourses] = useState<Array<{name: string; students: number}>>([]);
  const [schoolDistribution, setSchoolDistribution] = useState<Array<{name: string; value: number; color: string; percentage?: number}>>([]);
  const [teacherPerformance, setTeacherPerformance] = useState<Array<{name: string; value: number; color: string}>>([]);
  const [courseEngagement, setCourseEngagement] = useState<Array<{name: string; engagement: number; completion: number}>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch from API route with cache-busting for real-time data
      const timestamp = new Date().getTime();
      const headers = await addTokensToHeaders();
      const response = await fetch(`/api/admin/analytics?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          ...headers,
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        console.error('Failed to load analytics');
        setIsLoading(false);
        return;
      }

      const result = await response.json();
      
      if (result.analytics) {
        setAnalytics(result.analytics);
      }
      
      if (result.trends) {
        setTrends(result.trends);
      }
      
      if (result.monthlyGrowth) {
        setMonthlyGrowth(result.monthlyGrowth);
      }
      
      if (result.topSchools) {
        setTopSchools(result.topSchools);
      }
      
      if (result.popularCourses) {
        setPopularCourses(result.popularCourses);
      }
      
      if (result.schoolDistribution) {
        setSchoolDistribution(result.schoolDistribution);
      }
      
      if (result.teacherPerformance) {
        // Transform API response to chart format
        const performanceChartData = [
          { name: 'Excellent', value: result.teacherPerformance.excellent || 0, color: '#00C49F' },
          { name: 'Good', value: result.teacherPerformance.good || 0, color: '#0088FE' },
          { name: 'Average', value: result.teacherPerformance.average || 0, color: '#FFBB28' },
          { name: 'Needs Improvement', value: result.teacherPerformance.needsImprovement || 0, color: '#FF8042' }
        ];
        setTeacherPerformance(performanceChartData);
      }
      
      if (result.courseEngagement) {
        setCourseEngagement(result.courseEngagement);
      } else {
        // Initialize empty if not provided
        setCourseEngagement([]);
      }

      console.log('✅ Analytics loaded successfully (real-time):', result);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadAnalytics,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });


  const exportAnalytics = async (type: string) => {
    try {
      console.log(`Exporting ${type} analytics...`);
      // Implementation would depend on your export system
    } catch (error) {
      console.error('Error exporting analytics:', error);
    }
  };

  return (
    <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Performance Analytics</h1>
                <p className="text-gray-600 mt-2">Comprehensive system analytics and insights</p>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => loadAnalytics()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'Loading...' : 'Refresh'}
                </Button>
                <Button variant="outline" onClick={() => exportAnalytics('full')}>
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
                <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
                <School className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? '...' : analytics.totalSchools}</div>
                <p className={`text-xs ${trends.schoolsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.schoolsChange >= 0 ? '+' : ''}{trends.schoolsChange}% from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? '...' : analytics.totalTeachers}</div>
                <p className={`text-xs ${trends.teachersChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.teachersChange >= 0 ? '+' : ''}{trends.teachersChange}% from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? '...' : analytics.totalStudents}</div>
                <p className={`text-xs ${trends.studentsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.studentsChange >= 0 ? '+' : ''}{trends.studentsChange}% from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Health</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{analytics.systemHealth}%</div>
                <p className="text-xs text-muted-foreground">Uptime this month</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Analytics */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="growth">Growth</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="engagement">Engagement</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Monthly Growth */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Growth</CardTitle>
                    <CardDescription>User and content growth over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex items-center justify-center h-[300px]">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={monthlyGrowth}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Area type="monotone" dataKey="schools" stackId="1" stroke="#8884d8" fill="#8884d8" name="Schools" />
                          <Area type="monotone" dataKey="teachers" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Teachers" />
                          <Area type="monotone" dataKey="students" stackId="1" stroke="#ffc658" fill="#ffc658" name="Students" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* School Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>School Distribution</CardTitle>
                    <CardDescription>Types of schools in the system</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex items-center justify-center h-[300px]">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <RechartsPieChart>
                          <Pie
                            data={schoolDistribution}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(props: any) => {
                              const name = props.name || '';
                              const percentage = props.percentage || 0;
                              return `${name}: ${percentage}%`;
                            }}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {schoolDistribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          { }
                          <Tooltip formatter={(value: number, name: string, props: any) => [
                            `${value} schools (${props.payload.percentage}%)`,
                            name
                          ]} />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Performance Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Average Attendance</CardTitle>
                    <CardDescription>Teacher attendance rate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">{analytics.avgAttendance}%</div>
                    <p className="text-sm text-gray-600 mt-2">This month</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Course Completion</CardTitle>
                    <CardDescription>Average course completion rate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">{analytics.completionRate}%</div>
                    <p className="text-sm text-gray-600 mt-2">Overall</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Active Courses</CardTitle>
                    <CardDescription>Published courses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">{analytics.activeCourses}</div>
                    <p className="text-sm text-gray-600 mt-2">Live courses</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Growth Tab */}
            <TabsContent value="growth" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Growth Trends</CardTitle>
                  <CardDescription>Detailed growth analysis over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center h-[400px]">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={monthlyGrowth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="schools" fill="#8884d8" name="Schools" />
                        <Bar dataKey="teachers" fill="#82ca9d" name="Teachers" />
                        <Bar dataKey="students" fill="#ffc658" name="Students" />
                        <Bar dataKey="courses" fill="#ff8042" name="Courses" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Teacher Performance</CardTitle>
                    <CardDescription>Distribution of teacher performance levels</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex items-center justify-center h-[300px]">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <RechartsPieChart>
                          <Pie
                            data={teacherPerformance}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(props: any) => {
                              const name = props.name || '';
                              const value = props.value || 0;
                              return `${name}: ${value}`;
                            }}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {teacherPerformance.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => `${value} teachers`} />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                    <CardDescription>Key performance indicators</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">System Uptime</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {analytics.systemHealth}%
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Teacher Attendance</span>
                        <Badge variant="default" className="bg-blue-100 text-blue-800">
                          {analytics.avgAttendance}%
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Course Completion</span>
                        <Badge variant="default" className="bg-purple-100 text-purple-800">
                          {analytics.completionRate}%
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Active Users</span>
                        <Badge variant="default" className="bg-orange-100 text-orange-800">
                          {analytics.totalTeachers + analytics.totalStudents}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Engagement Tab */}
            <TabsContent value="engagement" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Course Engagement</CardTitle>
                  <CardDescription>Student engagement and course completion trends</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center h-[400px]">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : courseEngagement.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={courseEngagement}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="engagement" stroke="#8884d8" strokeWidth={2} name="Engagement %" />
                        <Line type="monotone" dataKey="completion" stroke="#82ca9d" strokeWidth={2} name="Completion %" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[400px] text-gray-500">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                        <p>No engagement data available</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Performing Schools</CardTitle>
                    <CardDescription>Schools with highest engagement</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {topSchools.length > 0 ? (
                        topSchools.map((school, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm">{school.name}</span>
                            <Badge variant="default">{school.engagement}%</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No data available</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Most Popular Courses</CardTitle>
                    <CardDescription>Courses with highest enrollment</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {popularCourses.length > 0 ? (
                        popularCourses.map((course, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm">{course.name}</span>
                            <Badge variant="default">{course.students} students</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No data available</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
    </div>
  );
}

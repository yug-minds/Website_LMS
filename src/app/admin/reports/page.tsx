"use client";

import { useState, useEffect, useCallback } from "react";
import { addTokensToHeaders } from "../../../lib/csrf-client";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";

const SUBJECT_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA'];
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
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
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "../../../components/ui/tabs";
import { 
  Search,
  Download,
  Eye,
  Users,
  TrendingUp,
  BarChart3,
  FileText,
  Clock
} from "lucide-react";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { fetchWithCsrf } from '../../../lib/csrf-client';

interface TeacherReport {
  id: string;
  teacher_id: string;
  school_id: string;
  date: string;
  grade: string;
  topics_taught: string;
  student_count: number;
  duration_hours: number;
  notes: string;
  created_at: string;
   
  profiles?: any;
   
  schools?: any;
  teacher_name?: string;
  teacher_email?: string;
  school_name?: string;
  // Deprecated: class_name is kept for backward compatibility but grade should be used
  class_name?: string;
}

interface TeacherPerformance {
  teacher_id: string;
  teacher_name: string;
  school_name: string;
  total_reports: number;
  total_hours: number;
  avg_students: number;
  attendance_rate: number;
  last_report_date: string;
}

export default function TeacherReports() {
  const [reports, setReports] = useState<TeacherReport[]>([]);
  const [performance, setPerformance] = useState<TeacherPerformance[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  { }
  { }
  { }
  const [schoolFilter, setSchoolFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  { }
   
  { }
  const [schools, setSchools] = useState<any[]>([]);
  { }
  { }
  const [teachers, setTeachers] = useState<any[]>([]);
  { }
  const [grades, setGrades] = useState<string[]>([]);
  { }
  const [loading, setLoading] = useState(false);
  { }
  const [reportTrendsData, setReportTrendsData] = useState<any[]>([]);
  { }
  const [subjectDistributionData, setSubjectDistributionData] = useState<any[]>([]);

  // Move helper calculations above loadData to avoid temporal dead zone issues


  const calculatePerformanceMetrics = useCallback((reports: TeacherReport[]) => {
    const teacherMap = new Map();

    reports.forEach(report => {
      const teacherId = report.teacher_id;
      if (!teacherMap.has(teacherId)) {
        teacherMap.set(teacherId, {
          teacher_id: teacherId,
          teacher_name: report.profiles?.full_name || report.teacher_name || 'Unknown',
          school_name: report.schools?.name || report.school_name || 'Unknown',
          total_reports: 0,
          total_hours: 0,
          total_students: 0,
          attendance_rate: 0,
          last_report_date: report.date
        });
      }

      const teacher = teacherMap.get(teacherId);
      teacher.total_reports += 1;
      teacher.total_hours += report.duration_hours || 0;
      teacher.total_students += report.student_count || 0;
      teacher.attendance_rate = Math.min(100, (teacher.total_reports / 20) * 100); // Assuming 20 working days
      if (new Date(report.date) > new Date(teacher.last_report_date)) {
        teacher.last_report_date = report.date;
      }
    });

  return Array.from(teacherMap.values()).map((teacher: any) => ({
    ...teacher,
    avg_students: Math.round(teacher.total_students / teacher.total_reports) || 0
  }));
  }, []);

  const calculateWeeklyTrends = useCallback((reports: TeacherReport[]) => {
    const now = new Date();
    const weeks: any[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7) - (now.getDay() || 7) + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekReports = reports.filter((report: any) => {
        const reportDate = new Date(report.date);
        return reportDate >= weekStart && reportDate <= weekEnd;
      });
      const totalReports = weekReports.length;
      const totalHours = weekReports.reduce((sum: number, r: any) => sum + (r.duration_hours || 0), 0);
      weeks.push({
        name: `Week ${4 - i}`,
        reports: totalReports,
        hours: Math.round(totalHours * 10) / 10
      });
    }
    return weeks;
  }, []);

  const calculateSubjectDistribution = useCallback((reports: TeacherReport[]) => {
    const subjectMap = new Map<string, number>();
    reports.forEach(report => {
      const topics = report.topics_taught?.toLowerCase() || '';
      let subject = 'Other';
      if (topics.includes('math') || topics.includes('algebra') || topics.includes('geometry') || topics.includes('calculus') || topics.includes('arithmetic')) {
        subject = 'Mathematics';
      } else if (topics.includes('science') || topics.includes('physics') || topics.includes('chemistry') || topics.includes('biology')) {
        subject = 'Science';
      } else if (topics.includes('english') || topics.includes('literature') || topics.includes('grammar') || topics.includes('writing') || topics.includes('reading')) {
        subject = 'English';
      } else if (topics.includes('history') || topics.includes('social') || topics.includes('geography')) {
        subject = 'History';
      } else if (topics.includes('coding') || topics.includes('programming') || topics.includes('computer') || topics.includes('ai') || topics.includes('python') || topics.includes('java')) {
        subject = 'Coding/Computer Science';
      } else if (topics.includes('art') || topics.includes('drawing') || topics.includes('painting')) {
        subject = 'Arts';
      } else if (topics.includes('music')) {
        subject = 'Music';
      } else if (topics.includes('physical') || topics.includes('pe') || topics.includes('sport')) {
        subject = 'Physical Education';
      } else if (report.grade) {
        subject = report.grade;
      }
      subjectMap.set(subject, (subjectMap.get(subject) || 0) + 1);
    });
    const total = reports.length || 1;
    const distribution = Array.from(subjectMap.entries())
      .map(([name, count], index) => ({
        name,
        value: Math.round((count / total) * 100),
        count,
        color: SUBJECT_COLORS[index % SUBJECT_COLORS.length]
      }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);
    return distribution;
  }, []);


  const calculateAnalyticsData = useCallback((reports: TeacherReport[]) => {
    // Calculate weekly report trends (last 4 weeks)
    const weeklyTrends = calculateWeeklyTrends(reports);
    setReportTrendsData(weeklyTrends);

    // Calculate subject/grade distribution
    const subjectDistribution = calculateSubjectDistribution(reports);
    setSubjectDistributionData(subjectDistribution);
  }, [calculateSubjectDistribution, calculateWeeklyTrends]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (schoolFilter) params.append('school_id', schoolFilter);
      if (gradeFilter) params.append('grade', gradeFilter);
      if (teacherFilter) params.append('teacher_id', teacherFilter);
      if (searchTerm) params.append('search', searchTerm);

      const headers = await addTokensToHeaders();
      const response = await fetch(`/api/admin/teacher-reports?${params.toString()}`, {
        headers
      });
      const result = await response.json();

      if (!response.ok) {
        console.error('Error loading reports:', result.error);
        setReports([]);
        setPerformance([]);
        return;
      }

      const reportsData = result.reports || [];
      setReports(reportsData);
      
      // Extract unique grades from reports for filter dropdown
      const uniqueGrades = [...new Set(reportsData.map((r: TeacherReport) => r.grade).filter(Boolean) as string[])].sort() as string[];
      if (uniqueGrades.length > 0) {
        setGrades(uniqueGrades);
      }
      
      // Calculate performance metrics
      const performanceData = calculatePerformanceMetrics(reportsData);
      setPerformance(performanceData);
      
      // Calculate analytics data
      calculateAnalyticsData(reportsData);
    } catch (error) {
      console.error('Error loading reports:', error);
      setReports([]);
      setPerformance([]);
      setReportTrendsData([]);
      setSubjectDistributionData([]);
    } finally {
      setLoading(false);
    }
  }, [calculateAnalyticsData, calculatePerformanceMetrics, dateFilter, gradeFilter, schoolFilter, searchTerm, teacherFilter]);

  const loadSchools = useCallback(async () => {
    try {
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const result = await response.json();
      
      if (result.schools) {
        setSchools(result.schools);
      }
    } catch (error) {
      console.error('Error loading schools:', error);
    }
  }, []);

  const loadTeachers = useCallback(async () => {
    try {
      console.log('🔍 Loading teachers for reports page...');
      
      // Load teachers via API route (respects RLS via server-side admin client)
      const response = await fetchWithCsrf('/api/admin/teachers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const result = await response.json();

      if (!response.ok) {
        console.error('❌ Error loading teachers from API:', result.error);
        setTeachers([]);
        return;
      }

      console.log('✅ Teachers API response:', result.teachers?.length || 0, 'teachers');

      // Transform teachers data to match expected format
      // The API returns teachers from the teachers table, we need to map them
       
      const teachersData = (result.teachers || []).map((teacher: any) => ({
        id: teacher.profile_id || teacher.id, // Use profile_id for teacher_reports filtering
        full_name: teacher.full_name || 'Unknown',
        email: teacher.email || ''
      }));

      console.log('📋 Transformed teachers from API:', teachersData.length);
      setTeachers(teachersData);
      
      // No fallback to direct queries - rely solely on API routes for security
    } catch (error) {
      console.error('❌ Error loading teachers:', error);
      setTeachers([]);
    }
  }, []);

  useEffect(() => {
    loadSchools();
    loadTeachers();
  }, [loadSchools, loadTeachers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });



  // Reports are already filtered by API, no need to filter again
  const filteredReports = reports;

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const exportToCSV = () => {
    if (filteredReports.length === 0) {
      alert('No reports to export');
      return;
    }

    // CSV headers
    const headers = ['Teacher Name', 'Teacher Email', 'School', 'Date', 'Grade', 'Topics Taught', 'Students', 'Duration (Hours)', 'Notes'];
    
    // CSV rows
    const rows = filteredReports.map((report: any) => [
      report.profiles?.full_name || report.teacher_name || 'Unknown',
      report.profiles?.email || report.teacher_email || '',
      report.schools?.name || report.school_name || 'Unknown',
      new Date(report.date).toLocaleDateString(),
      report.grade || 'N/A',
      report.topics_taught || '',
      report.student_count || 0,
      report.duration_hours || 0,
      report.notes || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row: any) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename with filters
    let filename = 'teacher_reports';
    if (dateFilter) filename += `_${dateFilter}`;
    if (schoolFilter) {
      const schoolName = schools.find((s: any) => s.id === schoolFilter)?.name || 'school';
      filename += `_${schoolName.replace(/\s+/g, '_')}`;
    }
    if (gradeFilter) filename += `_${gradeFilter}`;
    filename += '.csv';
    
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Teacher Reports</h1>
            <p className="text-gray-600 mt-2">Monitor teacher performance and daily reports</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reports.length}</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Teachers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{teachers.length}</div>
                <p className="text-xs text-muted-foreground">Total teachers ({performance.length} with reports)</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Attendance</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performance.length > 0 ? 
                    Math.round(performance.reduce((sum: number, p: any) => sum + p.attendance_rate, 0) / performance.length) : 0}%
                </div>
                <p className="text-xs text-muted-foreground">Teacher attendance</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reports.reduce((total: number, report: any) => total + (report.duration_hours || 0), 0)}
                </div>
                <p className="text-xs text-muted-foreground">Teaching hours</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="reports" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="reports">Daily Reports</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            {/* Daily Reports Tab */}
            <TabsContent value="reports" className="space-y-6">
              {/* Filters */}
              <Card>
                <CardHeader>
                  <CardTitle>Filter Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="search">Search</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="search"
                          placeholder="Search reports..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <div className="flex gap-2">
                        <Input
                          id="date"
                          type="date"
                          value={dateFilter}
                          onChange={(e) => setDateFilter(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDateFilter(getTodayDate())}
                          title="Today"
                        >
                          Today
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="school">School</Label>
                      <select
                        id="school"
                        value={schoolFilter}
                        onChange={(e) => setSchoolFilter(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="">All Schools</option>
                        {schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grade">Grade</Label>
                      <select
                        id="grade"
                        value={gradeFilter}
                        onChange={(e) => setGradeFilter(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="">All Grades</option>
                        {grades.length > 0 ? (
                          grades.map((grade) => (
                            <option key={grade} value={grade}>
                              {grade}
                            </option>
                          ))
                        ) : (
                          // Fallback to common grades if no reports exist yet
                          ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].map((grade) => (
                            <option key={grade} value={grade}>
                              {grade}
                          </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teacher">Teacher</Label>
                      <select
                        id="teacher"
                        value={teacherFilter}
                        onChange={(e) => setTeacherFilter(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="">All Teachers</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.full_name || teacher.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Actions</Label>
                      <Button 
                        variant="outline" 
                        onClick={exportToCSV}
                        className="w-full"
                        disabled={loading || filteredReports.length === 0}
                      >
                        {loading ? (
                          <>
                            <Clock className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Export ({filteredReports.length})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reports Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Daily Reports ({filteredReports.length})</CardTitle>
                  <CardDescription>View all teacher daily reports</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Teacher</TableHead>
                        <TableHead>School</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Topics</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Students</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8">
                            <div className="flex items-center justify-center gap-2">
                              <Clock className="h-4 w-4 animate-spin" />
                              Loading reports...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredReports.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                            No reports found. {reports.length === 0 ? 'No reports available.' : 'Try adjusting your filters.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredReports.map((report) => (
                          <TableRow key={report.id}>
                            <TableCell className="font-medium">
                              {report.profiles?.full_name || report.teacher_name || 'Unknown'}
                            </TableCell>
                            <TableCell>{report.schools?.name || report.school_name || 'Unknown'}</TableCell>
                            <TableCell>
                              {new Date(report.date).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <div>
                                <Badge variant="outline" className="text-sm font-medium">
                                  {report.grade || 'N/A'}
                                  </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="truncate" title={report.topics_taught}>
                                {report.topics_taught || 'N/A'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Clock className="h-4 w-4 mr-1 text-blue-600" />
                                {report.duration_hours || 0}h
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Users className="h-4 w-4 mr-1 text-green-600" />
                                {report.student_count || 0}
                              </div>
                            </TableCell>
                            <TableCell>
                              {report.notes && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  title={report.notes}
                                  className="truncate max-w-xs"
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Teacher Performance</CardTitle>
                  <CardDescription>Track individual teacher performance metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Teacher</TableHead>
                        <TableHead>School</TableHead>
                        <TableHead>Reports</TableHead>
                        <TableHead>Total Hours</TableHead>
                        <TableHead>Avg Students</TableHead>
                        <TableHead>Attendance</TableHead>
                        <TableHead>Last Report</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {performance.map((teacher) => (
                        <TableRow key={teacher.teacher_id}>
                          <TableCell className="font-medium">
                            {teacher.teacher_name}
                          </TableCell>
                          <TableCell>{teacher.school_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <FileText className="h-4 w-4 mr-1" />
                              {teacher.total_reports}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1" />
                              {teacher.total_hours}h
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Users className="h-4 w-4 mr-1" />
                              {teacher.avg_students}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div 
                                  className="bg-green-600 h-2 rounded-full" 
                                  style={{ width: `${teacher.attendance_rate}%` }}
                                ></div>
                              </div>
                              <span className="text-sm">{Math.round(teacher.attendance_rate)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(teacher.last_report_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                teacher.attendance_rate >= 90 ? 'default' :
                                teacher.attendance_rate >= 70 ? 'secondary' : 'destructive'
                              }
                            >
                              {teacher.attendance_rate >= 90 ? 'Excellent' :
                               teacher.attendance_rate >= 70 ? 'Good' : 'Needs Attention'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Report Trends */}
                <Card>
                  <CardHeader>
                    <CardTitle>Report Trends</CardTitle>
                    <CardDescription>Weekly report submission trends</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {reportTrendsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={reportTrendsData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                          <Tooltip 
                             
                            formatter={(value: any, name: string) => {
                              if (name === 'reports') return [`${value} reports`, 'Reports'];
                              if (name === 'hours') return [`${value} hours`, 'Teaching Hours'];
                              return [value, name];
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="reports" 
                            stroke="#8884d8" 
                            strokeWidth={2}
                            name="Reports"
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="hours" 
                            stroke="#82ca9d" 
                            strokeWidth={2}
                            name="Teaching Hours"
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                      </LineChart>
                    </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-gray-500">
                        <div className="text-center">
                          <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                          <p>No data available for the selected period</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Subject Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Subject Distribution</CardTitle>
                    <CardDescription>Teaching topics distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {subjectDistributionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={subjectDistributionData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                            label={(props: any) => {
                              const name = props.name || '';
                              const value = props.value || 0;
                              const count = (props as any).count || 0;
                              return `${name}: ${value}% (${count})`;
                            }}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {subjectDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                          <Tooltip 
                             
                            formatter={(value: any, name: string, props: any) => {
                              return [`${value}% (${props.payload.count} reports)`, props.payload.name];
                            }}
                          />
                          <Legend 
                             
                            formatter={(value: string, entry: any) => `${value} (${entry.payload.count})`}
                          />
                      </PieChart>
                    </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-gray-500">
                        <div className="text-center">
                          <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                          <p>No subject data available</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Performance Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance Summary</CardTitle>
                  <CardDescription>Overall system performance metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {performance.filter((p: any) => p.attendance_rate >= 90).length}
                      </div>
                      <div className="text-sm text-gray-600">Excellent Teachers</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-yellow-600">
                        {performance.filter((p: any) => p.attendance_rate >= 70 && p.attendance_rate < 90).length}
                      </div>
                      <div className="text-sm text-gray-600">Good Teachers</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-600">
                        {performance.filter((p: any) => p.attendance_rate < 70).length}
                      </div>
                      <div className="text-sm text-gray-600">Need Attention</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
    </div>
  );
}

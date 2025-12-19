"use client";

import { useTeacherSchool } from "../context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useTeacherMonthlyAttendance, 
  useTeacherReports,
  useTeacherLeaves
} from "../../../hooks/useTeacherData";
import MonthlyAttendanceChart from "../../../components/teacher/MonthlyAttendanceChart";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { TrendingUp, Calendar, FileText, Clock } from "lucide-react";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

type MonthlyAttendanceRecord = {
  month: string;
  present_count: number;
  absent_count: number;
  leave_count: number;
};

/**
 * Analytics Page
 * 
 * Displays comprehensive analytics and insights for the teacher
 */
export default function AnalyticsPage() {
  const { selectedSchool } = useTeacherSchool();
  const queryClient = useQueryClient();
  const { data: monthlyAttendance, isLoading: attendanceLoading } = useTeacherMonthlyAttendance(
    selectedSchool?.id,
    12
  );
  const { data: reports, isLoading: reportsLoading } = useTeacherReports(selectedSchool?.id);
  const { data: leaves, isLoading: leavesLoading } = useTeacherLeaves(selectedSchool?.id);

  // Use smart refresh for tab switching
  useSmartRefresh({
    queryKeys: [
      ['teacherMonthlyAttendance', selectedSchool?.id],
      ['teacherReports', selectedSchool?.id],
      ['teacherLeaves', selectedSchool?.id]
    ],
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  // Calculate statistics
  const totalReports = reports?.length || 0;
   
  const approvedReports = reports?.filter((r: any) => r.report_status === 'Approved').length || 0;
   
  const pendingReports = reports?.filter((r: any) => r.report_status === 'Submitted').length || 0;
   
  const approvedLeaves = leaves?.filter((l: any) => l.status === 'Approved').length || 0;
   
  const pendingLeaves = leaves?.filter((l: any) => l.status === 'Pending').length || 0;
   
  const rejectedLeaves = leaves?.filter((l: any) => l.status === 'Rejected').length || 0;

  // Attendance trend data
   
  const attendanceTrend = monthlyAttendance?.slice().reverse().map((m: any) => ({
    month: new Date(m.month).toLocaleDateString('en-US', { month: 'short' }),
    percentage: m.total_days > 0 ? Math.round((m.present_count / m.total_days) * 100) : 0,
    present: m.present_count,
    absent: m.absent_count,
    leave: m.leave_count
  })) || [];

  const attendanceBarData =
    monthlyAttendance?.slice(0, 6).map((m: MonthlyAttendanceRecord) => ({
      month: new Date(m.month).toLocaleDateString('en-US', { month: 'short' }),
      Present: m.present_count,
      Absent: m.absent_count,
      Leave: m.leave_count,
    })) ?? [];

  // Report status distribution
  const reportStatusData = [
    { name: 'Approved', value: approvedReports, color: '#00C49F' },
    { name: 'Pending', value: pendingReports, color: '#FFBB28' },
     
    { name: 'Flagged', value: reports?.filter((r: any) => r.report_status === 'Flagged').length || 0, color: '#FF8042' }
  ];

  // Leave status distribution
  const leaveStatusData = [
    { name: 'Approved', value: approvedLeaves, color: '#00C49F' },
    { name: 'Pending', value: pendingLeaves, color: '#FFBB28' },
    { name: 'Rejected', value: rejectedLeaves, color: '#FF8042' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Comprehensive insights and analytics {selectedSchool ? `for ${selectedSchool.name}` : ''}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReports}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalReports > 0 ? Math.round((approvedReports / totalReports) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Reports approved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Leaves</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedLeaves}</div>
            <p className="text-xs text-muted-foreground">Leave requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Attendance</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {attendanceTrend.length > 0
                 
                ? Math.round(attendanceTrend.reduce((sum: number, d: any) => sum + d.percentage, 0) / attendanceTrend.length)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Last 12 months</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Attendance Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Attendance Overview</CardTitle>
            <CardDescription>Attendance statistics for the last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyAttendanceChart />
          </CardContent>
        </Card>

        {/* Attendance Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance Trend</CardTitle>
            <CardDescription>Attendance percentage over time</CardDescription>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : attendanceTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="percentage" stroke="#0088FE" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <p>No attendance data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Report Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Report Status Distribution</CardTitle>
            <CardDescription>Breakdown of report submission status</CardDescription>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : totalReports > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={reportStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) => {
                      const name = props.name || '';
                      const percent = props.percent || 0;
                      return `${name} ${(percent * 100).toFixed(0)}%`;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {reportStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <p>No reports submitted yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leave Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Leave Request Status</CardTitle>
            <CardDescription>Breakdown of leave request status</CardDescription>
          </CardHeader>
          <CardContent>
            {leavesLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (approvedLeaves + pendingLeaves + rejectedLeaves) > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={leaveStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) => {
                      const name = props.name || '';
                      const percent = props.percent || 0;
                      return `${name} ${(percent * 100).toFixed(0)}%`;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {leaveStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <p>No leave requests submitted yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance Breakdown (Last 6 Months)</CardTitle>
            <CardDescription>Present vs Absent vs Leave</CardDescription>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : monthlyAttendance && monthlyAttendance.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={attendanceBarData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="Present" fill="#00C49F" />
                  <Bar dataKey="Absent" fill="#FF8042" />
                  <Bar dataKey="Leave" fill="#FFBB28" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <p>No attendance data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Report Count */}
        <Card>
          <CardHeader>
            <CardTitle>Report Submission Trend</CardTitle>
            <CardDescription>Number of reports submitted per month</CardDescription>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : reports && reports.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={(() => {
                  // Group reports by month
                  const monthlyReports: { [key: string]: number } = {};
                   
                  reports.forEach((r: any) => {
                    const month = new Date(r.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                    monthlyReports[month] = (monthlyReports[month] || 0) + 1;
                  });
                  return Object.entries(monthlyReports).map(([month, count]) => ({ month, count }));
                })()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="#0088FE" fill="#0088FE" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <p>No reports submitted yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

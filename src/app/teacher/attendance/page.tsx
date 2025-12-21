"use client";

import { useState } from "react";
import { useTeacherSchool } from "../context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { useTeacherAttendance, useTeacherMonthlyAttendance, useTodayAttendanceStatus } from "../../../hooks/useTeacherData";
import MonthlyAttendanceChart from "../../../components/teacher/MonthlyAttendanceChart";
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle, FileText } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Progress as ProgressBar } from "../../../components/ui/progress";
import Link from "next/link";
import { Button } from "../../../components/ui/button";

/**
 * Attendance Page
 * 
 * Shows teacher's monthly attendance data, calendar view, and statistics
 */
export default function AttendancePage() {
  const { selectedSchool } = useTeacherSchool();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data: monthlyAttendance, isLoading: monthlyLoading } = useTeacherMonthlyAttendance(
    selectedSchool?.id,
    6
  );
  const { data: dailyAttendance, isLoading: dailyLoading } = useTeacherAttendance(
    selectedSchool?.id,
    selectedMonth
  );

  // Get today's attendance status and report progress
  const today = new Date().toISOString().split('T')[0];
  const { data: todayStatus, isLoading: todayLoading } = useTodayAttendanceStatus(
    selectedSchool?.id,
    today
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Present':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'Absent':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'Leave-Approved':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'Leave-Rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'Pending':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'Unreported':
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Present':
        return <Badge className="bg-green-100 text-green-800">Present</Badge>;
      case 'Absent':
        return <Badge className="bg-red-100 text-red-800">Absent</Badge>;
      case 'Leave-Approved':
        return <Badge className="bg-yellow-100 text-yellow-800">Leave Approved</Badge>;
      case 'Leave-Rejected':
        return <Badge className="bg-red-100 text-red-800">Leave Rejected</Badge>;
      case 'Unreported':
        return <Badge className="bg-gray-100 text-gray-800">Unreported</Badge>;
      case 'Pending':
        return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const currentMonthData = monthlyAttendance?.[0];
  const attendancePercentage = currentMonthData && currentMonthData.total_days > 0
    ? Math.round((currentMonthData.present_count / currentMonthData.total_days) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Attendance</h1>
        <p className="text-gray-600 mt-2">
          View your attendance records and statistics {selectedSchool ? `for ${selectedSchool.name}` : ''}
        </p>
        <p className="text-sm text-blue-600 mt-2 bg-blue-50 border border-blue-200 rounded-md p-3 inline-block">
          <strong>Note:</strong> Your attendance is automatically marked as &quot;Present&quot; when you submit reports for all scheduled periods for the day.
        </p>
      </div>

      {/* Today's Attendance Status Card */}
      {todayStatus && (
        <Card className="border-2 border-blue-200 bg-blue-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Today&apos;s Attendance Status
                </CardTitle>
                <CardDescription>
                  {new Date(todayStatus.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })} ({todayStatus.dayOfWeek})
                </CardDescription>
              </div>
              {todayStatus.attendance?.status && (
                <div>
                  {getStatusBadge(todayStatus.attendance.status)}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayStatus.totalPeriods > 0 ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">Report Progress</span>
                    <span className="text-gray-600">
                      {todayStatus.periodsWithReports} of {todayStatus.totalPeriods} periods
                    </span>
                  </div>
                  <ProgressBar 
                    value={todayStatus.progress} 
                    className="h-3"
                  />
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{todayStatus.progress}% complete</span>
                    <span>{todayStatus.totalPeriods - todayStatus.periodsWithReports} period(s) remaining</span>
                  </div>
                </div>

                {/* Submitted Periods List */}
                {todayStatus.submittedPeriods && todayStatus.submittedPeriods.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">
                      Submitted Reports ({todayStatus.submittedPeriods.length})
                    </p>
                    <div className="space-y-1">
                      {todayStatus.submittedPeriods.map((period: any, index: number) => {
                        const formatTime = (time: string) => {
                          if (!time) return '';
                          const [hours, minutes] = time.split(':');
                          const hour = parseInt(hours);
                          const ampm = hour >= 12 ? 'PM' : 'AM';
                          const displayHour = hour % 12 || 12;
                          return `${displayHour}:${minutes} ${ampm}`;
                        };
                        
                        return (
                          <div key={period.period_id || index} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-md">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                              <span className="text-sm text-green-800">
                                {period.grade && `Grade ${period.grade}`}
                                {period.subject && ` - ${period.subject}`}
                                {period.start_time && period.end_time && ` (${formatTime(period.start_time)} - ${formatTime(period.end_time)})`}
                              </span>
                            </div>
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">
                              Submitted
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pending Periods List */}
                {todayStatus.pendingPeriods && todayStatus.pendingPeriods.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">
                      Pending Reports ({todayStatus.pendingPeriods.length})
                    </p>
                    <div className="space-y-1">
                      {todayStatus.pendingPeriods.map((period: any, index: number) => {
                        const formatTime = (time: string) => {
                          if (!time) return '';
                          const [hours, minutes] = time.split(':');
                          const hour = parseInt(hours);
                          const ampm = hour >= 12 ? 'PM' : 'AM';
                          const displayHour = hour % 12 || 12;
                          return `${displayHour}:${minutes} ${ampm}`;
                        };
                        
                        return (
                          <div key={period.period_id || index} className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                              <span className="text-sm text-yellow-800">
                                {period.grade && `Grade ${period.grade}`}
                                {period.subject && ` - ${period.subject}`}
                                {period.start_time && period.end_time && ` (${formatTime(period.start_time)} - ${formatTime(period.end_time)})`}
                              </span>
                            </div>
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                              Pending
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {todayStatus.allPeriodsHaveReports ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-900">
                        All period reports submitted!
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        Your attendance will be marked as &quot;Present&quot; automatically.
                        {todayStatus.attendance?.status === 'Present' && ' ✓ Already marked as Present'}
                      </p>
                    </div>
                  </div>
                ) : todayStatus.totalPeriods > 0 ? (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-900">
                        Submit reports for all periods to mark attendance
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        You have submitted reports for {todayStatus.periodsWithReports} out of {todayStatus.totalPeriods} scheduled periods.
                        {todayStatus.totalPeriods - todayStatus.periodsWithReports > 0 && (
                          <> Submit {todayStatus.totalPeriods - todayStatus.periodsWithReports} more report(s) to mark your attendance as &quot;Present&quot;.</>
                        )}
                      </p>
                      <Link href="/teacher/reports">
                        <Button variant="outline" size="sm" className="mt-3">
                          <FileText className="h-4 w-4 mr-2" />
                          Submit Report
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <AlertCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    No scheduled periods for today
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {todayStatus.submittedReports > 0 
                      ? `You have submitted ${todayStatus.submittedReports} report(s) today.`
                      : 'Submit a report to mark your attendance.'}
                  </p>
                </div>
              </div>
            )}

            {todayStatus.attendance?.status === 'Leave-Approved' && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">
                    Leave Approved
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Your leave request has been approved. This status will not be overridden by report submissions.
                  </p>
                </div>
              </div>
            )}

            {todayStatus.attendance?.status === 'Leave-Rejected' && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-900">
                    Leave Rejected
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    Your leave request has been rejected. Submit reports for all periods to mark your attendance as &quot;Present&quot;.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly Attendance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Attendance Overview</CardTitle>
          <CardDescription>
            Attendance statistics for the last 6 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyAttendanceChart />
        </CardContent>
      </Card>

      {/* Current Month Stats */}
      {currentMonthData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Present</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{currentMonthData.present_count}</div>
              <p className="text-xs text-muted-foreground">Days present</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Absent</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{currentMonthData.absent_count}</div>
              <p className="text-xs text-muted-foreground">Days absent</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leave</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{currentMonthData.leave_count}</div>
              <p className="text-xs text-muted-foreground">Days on leave</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attendance %</CardTitle>
              <Calendar className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{attendancePercentage}%</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily Attendance Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daily Attendance</CardTitle>
              <CardDescription>
                Day-by-day attendance records for {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </CardDescription>
            </div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </CardHeader>
        <CardContent>
          {dailyLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : dailyAttendance && dailyAttendance.length > 0 ? (
            <div className="grid grid-cols-7 gap-2">
              {/* Calendar Grid */}
              {Array.from({ length: new Date(selectedMonth + '-01').getDay() }, (_, i) => (
                <div key={`empty-${i}`} className="h-16"></div>
              ))}
              {Array.from({ length: new Date(
                new Date(selectedMonth + '-01').getFullYear(),
                new Date(selectedMonth + '-01').getMonth() + 1,
                0
              ).getDate() }, (_, i) => {
                const day = i + 1;
                const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                 
                const attendanceRecord = dailyAttendance.find((a: any) => a.date === dateStr);
                
                return (
                  <div
                    key={day}
                    className={`h-16 border rounded-lg p-2 flex flex-col items-center justify-center ${
                      attendanceRecord?.status === 'Present' ? 'bg-green-50 border-green-200' :
                      attendanceRecord?.status === 'Absent' ? 'bg-red-50 border-red-200' :
                      attendanceRecord?.status === 'Leave-Approved' ? 'bg-yellow-50 border-yellow-200' :
                      attendanceRecord?.status === 'Leave-Rejected' ? 'bg-red-50 border-red-200' :
                      attendanceRecord?.status === 'Pending' ? 'bg-blue-50 border-blue-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <span className="text-sm font-medium">{day}</span>
                    {attendanceRecord && (
                      <div className="mt-1">
                        {getStatusIcon(attendanceRecord.status)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No attendance records for this month</p>
              <p className="text-sm mt-2">
                Submit reports for all scheduled periods each day to track your attendance
              </p>
              <Link href="/teacher/reports">
                <Button variant="outline" size="sm" className="mt-4">
                  <FileText className="h-4 w-4 mr-2" />
                  Submit Report
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance Details Table */}
      {dailyAttendance && dailyAttendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Details</CardTitle>
            <CardDescription>Detailed attendance records for the selected month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-sm font-medium">Date</th>
                    <th className="text-left p-3 text-sm font-medium">Status</th>
                    <th className="text-left p-3 text-sm font-medium">Recorded At</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyAttendance.map((record: any) => (
                    <tr key={record.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-sm">
                        {new Date(record.date).toLocaleDateString('en-US', { 
                          weekday: 'short',
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="p-3">
                        {getStatusBadge(record.status)}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {record.recorded_at ? new Date(record.recorded_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

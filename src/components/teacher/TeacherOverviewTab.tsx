"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { 
  BookOpen, 
  FileText,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Plus
} from "lucide-react";
import { 
  useTeacherClasses, 
  useTeacherReports, 
  useTeacherLeaves,
  useTodaysClasses,
  useTeacherSchedules
} from "../../hooks/useTeacherData";
import { SkeletonDashboard } from "../ui/skeleton-dashboard";

interface TeacherOverviewTabProps {
  selectedSchoolId?: string;
}

interface RecentActivity {
  id: string;
  title: string;
  message: string;
  created_at: string;
  type: 'success' | 'warning' | 'info' | 'error';
}

export default function TeacherOverviewTab({ selectedSchoolId }: TeacherOverviewTabProps) {
  const { data: todaysClasses, isLoading: todaysClassesLoading } = useTodaysClasses(selectedSchoolId);
  const { data: reports, isLoading: reportsLoading } = useTeacherReports(selectedSchoolId, { limit: 5 });
  const { data: leaves, isLoading: leavesLoading } = useTeacherLeaves(selectedSchoolId);
  const { data: schedules, isLoading: schedulesLoading, error: schedulesError } = useTeacherSchedules(selectedSchoolId);

  const recentActivity = useMemo(() => {
    if (!selectedSchoolId) return [];

    const activity: RecentActivity[] = [];
    
    // Recent reports
    const recentReports = reports?.slice(0, 3) || [];
    recentReports.forEach((report: any) => {
      const classData = Array.isArray(report.classes) ? report.classes[0] : report.classes;
      activity.push({
        id: `report-${report.id}`,
        title: 'Report Submitted',
        message: `Submitted report for ${report.grade || classData?.grade || 'grade'} on ${new Date(report.date).toLocaleDateString()}`,
        created_at: report.created_at,
        type: report.report_status === 'Approved' ? 'success' : 'info'
      });
    });

    // Pending leaves
    const pendingLeavesList = leaves?.filter((l: any) => l.status === 'Pending') || [];
    if (pendingLeavesList.length > 0) {
      activity.push({
        id: 'pending-leaves',
        title: 'Pending Leave Requests',
        message: `${pendingLeavesList.length} leave request(s) awaiting approval`,
        created_at: new Date().toISOString(),
        type: 'warning'
      });
    }

    // Sort by date and limit
    activity.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return activity.slice(0, 5);
  }, [selectedSchoolId, reports, leaves]);

  if (todaysClassesLoading || reportsLoading || leavesLoading || schedulesLoading) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Classes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Today&apos;s Classes</CardTitle>
                <CardDescription>Your scheduled classes for today</CardDescription>
              </div>
              <Link href="/teacher/reports">
                <Button size="sm" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Submit Report
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {todaysClasses && todaysClasses.length > 0 ? (
              <div className="space-y-3">
                {todaysClasses.slice(0, 5).map((classItem: any) => (
                  <div
                    key={classItem.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium">{classItem.grade || classItem.class_name || 'N/A'}</p>
                      <p className="text-sm text-gray-600">{classItem.subject || 'General'}</p>
                    </div>
                    <Badge variant={classItem.hasReport ? "default" : "outline"}>
                      {classItem.hasReport ? "Reported" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No classes scheduled for today</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest activities and updates</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                  >
                    <div className={`mt-1 ${
                      activity.type === 'success' ? 'text-green-500' :
                      activity.type === 'warning' ? 'text-yellow-500' :
                      activity.type === 'error' ? 'text-red-500' :
                      'text-blue-500'
                    }`}>
                      {activity.type === 'success' ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <AlertCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{activity.title}</p>
                      <p className="text-xs text-gray-600 mt-1">{activity.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(activity.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/teacher/reports">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <h3 className="font-semibold mb-1">Submit Report</h3>
                  <p className="text-sm text-gray-600">Daily teaching report</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/teacher/leaves">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 text-center">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                  <h3 className="font-semibold mb-1">Apply for Leave</h3>
                  <p className="text-sm text-gray-600">Submit leave request</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/teacher/attendance">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 text-center">
                  <Calendar className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <h3 className="font-semibold mb-1">View Attendance</h3>
                  <p className="text-sm text-gray-600">Monthly attendance chart</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/teacher/classes">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 text-center">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                  <h3 className="font-semibold mb-1">My Classes</h3>
                  <p className="text-sm text-gray-600">View all classes</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* My Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>My Schedule</CardTitle>
          <CardDescription>Your complete class schedule for the week</CardDescription>
        </CardHeader>
        <CardContent>
          {schedulesError ? (
            <div className="text-center py-8 text-red-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <p className="font-medium">Error loading schedule</p>
              <p className="text-sm mt-1">{(schedulesError as Error)?.message || 'Failed to load schedule'}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          ) : schedules && schedules.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Room</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule: any) => {
                    const formatTime = (time: string) => {
                      if (!time) return '';
                      const [hours, minutes] = time.split(':');
                      const hour = parseInt(hours);
                      const ampm = hour >= 12 ? 'PM' : 'AM';
                      const displayHour = hour % 12 || 12;
                      return `${displayHour}:${minutes} ${ampm}`;
                    };

                    return (
                      <TableRow key={schedule.id}>
                        <TableCell>
                          <Badge variant="outline">{schedule.day_of_week}</Badge>
                        </TableCell>
                        <TableCell>
                          {schedule.period ? (
                            <span className="text-sm">
                              {formatTime(schedule.period.start_time)} - {formatTime(schedule.period.end_time)}
                            </span>
                          ) : schedule.start_time && schedule.end_time ? (
                            <span className="text-sm">
                              {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{schedule.subject}</TableCell>
                        <TableCell>{schedule.grade}</TableCell>
                        <TableCell>
                          {schedule.room ? (
                            <span>{schedule.room.room_number} {schedule.room.room_name && `- ${schedule.room.room_name}`}</span>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No classes scheduled</p>
              <p className="text-sm mt-1">Your schedule will appear here once classes are assigned.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



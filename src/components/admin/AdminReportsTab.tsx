"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Download, AlertCircle, Clock } from "lucide-react";
import { SkeletonDashboard } from "../ui/skeleton-dashboard";

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

interface AdminReportsTabProps {
  stats: DashboardStats;
  lastRefresh: Date;
  isLoading?: boolean;
}

export default function AdminReportsTab({
  stats,
  lastRefresh,
  isLoading = false
}: AdminReportsTabProps) {
  const router = useRouter();

  if (isLoading) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Export Reports
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Generate and download system reports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={() => router.push('/admin/reports')}
              >
                <Download className="mr-2 h-4 w-4" />
                School Report
                <Badge variant="secondary" className="ml-auto">{stats.totalSchools} schools</Badge>
              </Button>
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={() => router.push('/admin/reports')}
              >
                <Download className="mr-2 h-4 w-4" />
                Teacher Performance Report
                <Badge variant="secondary" className="ml-auto">{stats.totalTeachers} teachers</Badge>
              </Button>
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={() => router.push('/admin/reports')}
              >
                <Download className="mr-2 h-4 w-4" />
                Student Enrollment Report
                <Badge variant="secondary" className="ml-auto">{stats.totalStudents} students</Badge>
              </Button>
              <Button 
                className="w-full justify-start" 
                variant="outline"
                onClick={() => router.push('/admin/reports')}
              >
                <Download className="mr-2 h-4 w-4" />
                Course Progress Report
                <Badge variant="secondary" className="ml-auto">{stats.activeCourses} courses</Badge>
              </Button>
            </div>
            <div className="pt-3 border-t">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                <span>Last report generated: {lastRefresh.toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              System Alerts
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Important notifications and alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.pendingLeaves > 0 && (
                <div className="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      {stats.pendingLeaves} pending leave requests
                    </p>
                    <p className="text-xs text-yellow-600">Requires your attention</p>
                  </div>
                </div>
              )}
              
              {stats.pendingLeaves === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No alerts at this time</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



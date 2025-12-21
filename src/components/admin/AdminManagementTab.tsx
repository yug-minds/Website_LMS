"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { 
  School, 
  Users, 
  User, 
  BookOpen, 
  ClipboardList,
  Settings,
  Eye
} from "lucide-react";
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

interface AdminManagementTabProps {
  stats: DashboardStats;
  isLoading?: boolean;
}

export default function AdminManagementTab({
  stats,
  isLoading = false
}: AdminManagementTabProps) {
  const router = useRouter();

  if (isLoading) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="mr-2 h-5 w-5" />
              Schools Management
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Manage schools and their settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Add, edit, and manage schools. Generate joining codes for student enrollment.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Quick Stats</span>
                  <Badge variant="outline">{stats.totalSchools} schools</Badge>
                </div>
              </div>
              <Button className="w-full" onClick={() => router.push('/admin/schools')}>
                <Eye className="mr-2 h-4 w-4" />
                Manage Schools
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="mr-2 h-5 w-5" />
              Teachers Management
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Manage teachers and their assignments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Assign teachers to schools, track attendance, and manage leave requests.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Quick Stats</span>
                  <Badge variant="outline">{stats.totalTeachers} teachers</Badge>
                </div>
              </div>
              <Button className="w-full" onClick={() => router.push('/admin/teachers')}>
                <Eye className="mr-2 h-4 w-4" />
                Manage Teachers
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="mr-2 h-5 w-5" />
              Students Management
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Manage student accounts and enrollment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Bulk import students, manage enrollments, and track progress.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Quick Stats</span>
                  <Badge variant="outline">{stats.totalStudents} students</Badge>
                </div>
              </div>
              <Button className="w-full" onClick={() => router.push('/admin/students')}>
                <Eye className="mr-2 h-4 w-4" />
                Manage Students
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="mr-2 h-5 w-5" />
              Course Management
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Create and manage courses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Create courses, assign content, and manage course schedules.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Quick Stats</span>
                  <Badge variant="outline">{stats.activeCourses} courses</Badge>
                </div>
              </div>
              <Button className="w-full" onClick={() => router.push('/admin/courses')}>
                <Eye className="mr-2 h-4 w-4" />
                Manage Courses
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="mr-2 h-5 w-5" />
              Reports Management
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Monitor teacher reports and performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                View daily reports, track performance, and generate insights.
              </p>
              <Button className="w-full" onClick={() => router.push('/admin/reports')}>
                <Eye className="mr-2 h-4 w-4" />
                View Reports
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="mr-2 h-5 w-5" />
              System Settings
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Configure system-wide settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Manage admin accounts, system configuration, and permissions.
              </p>
              <Button className="w-full" onClick={() => router.push('/admin/settings')}>
                <Eye className="mr-2 h-4 w-4" />
                System Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



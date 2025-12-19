"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { 
  AlertCircle,
  RefreshCw,
  Clock,
  Activity,
  TrendingUp,
  CheckCircle
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

interface QuickActionPreview {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  data: Array<{
    id?: string;
    name?: string;
    full_name?: string;
    title?: string;
    created_at: string;
    status?: string;
    email?: string;
  }>;
  loading: boolean;
  lastUpdated: string;
}

interface RecentActivity {
  id: string;
  title: string;
  message: string;
  created_at: string;
  type: 'success' | 'warning' | 'info' | 'error';
}

interface AdminOverviewTabProps {
  stats: DashboardStats;
  quickActionPreviews: QuickActionPreview[];
  recentActivity: RecentActivity[];
  isLoading?: boolean;
  onQuickAction?: (id: string) => void;
}

export default function AdminOverviewTab({
  stats,
  quickActionPreviews,
  recentActivity,
  isLoading = false,
  onQuickAction
}: AdminOverviewTabProps) {
  const router = useRouter();

  if (isLoading) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Quick Actions
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Common administrative tasks with real-time previews</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {quickActionPreviews.map((preview) => (
              <div key={preview.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {preview.icon}
                    <span className="font-medium">{preview.title}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onQuickAction?.(preview.id)}
                    disabled={preview.loading}
                  >
                    {preview.loading ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-gray-600 mb-2">{preview.description}</p>
                <div className="space-y-1">
                  {preview.data && preview.data.length > 0 ? (
                    preview.data.slice(0, 2).map((item, index: number) => (
                      <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                        <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                        <span className="truncate">
                          {item.name || item.full_name || item.title || 'Unknown'}
                        </span>
                        <span className="text-gray-400">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-gray-400 italic">No recent data</div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              System Status
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Current system health and metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.systemHealth > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">System Health</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      {stats.systemHealth}%
                    </Badge>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Pending Leave Requests</span>
                <div className="flex items-center gap-2">
                  <Badge variant={stats.pendingLeaves > 0 ? "destructive" : "secondary"}>
                    {stats.pendingLeaves}
                  </Badge>
                  {stats.pendingLeaves > 0 && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Active Users</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {stats.activeUsers}
                  </Badge>
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                </div>
              </div>
              {stats.avgAttendance > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Average Attendance</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">
                      {stats.avgAttendance}%
                    </Badge>
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
              )}
              {stats.completionRate > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Course Completion</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-purple-100 text-purple-800">
                      {stats.completionRate}%
                    </Badge>
                    <CheckCircle className="h-4 w-4 text-purple-500" />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Recent Activity
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          </CardTitle>
          <CardDescription>Latest system events and notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.type === 'success' ? 'bg-green-500' :
                    activity.type === 'warning' ? 'bg-yellow-500' :
                    activity.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                  } animate-pulse`}></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-xs text-gray-500">{activity.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-400">
                      {Math.round((Date.now() - new Date(activity.created_at).getTime()) / (1000 * 60))}m ago
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Activity className="h-8 w-8 mx-auto mb-2" />
                <p>No recent activity</p>
                <p className="text-sm">System events will appear here</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



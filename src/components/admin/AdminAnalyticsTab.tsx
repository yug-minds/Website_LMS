"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { SkeletonChart } from "../ui/skeleton-chart";

interface AdminAnalyticsTabProps {
  growthData: Array<{name: string; schools: number; teachers: number; students: number}>;
  attendanceData: Array<{name: string; attendance: number}>;
  courseProgressData: Array<{name: string; completed: number; pending: number}>;
  isLoading?: boolean;
}

export default function AdminAnalyticsTab({
  growthData,
  attendanceData,
  courseProgressData,
  isLoading = false
}: AdminAnalyticsTabProps) {
  const [Charts, setCharts] = useState<any>(null);
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  useEffect(() => {
    // Dynamically import recharts when component mounts
    import("recharts").then((module) => {
      setCharts(module);
    });
  }, []);

  if (isLoading || !Charts) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    );
  }

  const { ResponsiveContainer, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } = Charts;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Growth Overview
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Schools, Teachers, and Students over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={growthData.length > 0 ? growthData : [{name: 'No Data', schools: 0, teachers: 0, students: 0}]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="schools" stackId="1" stroke="#8884d8" fill="#8884d8" />
                <Area type="monotone" dataKey="teachers" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                <Area type="monotone" dataKey="students" stackId="1" stroke="#ffc658" fill="#ffc658" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Teacher Attendance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Teacher Attendance
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            </CardTitle>
            <CardDescription>Weekly attendance trends</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={attendanceData.length > 0 ? attendanceData : [{name: 'No Data', attendance: 0}]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="attendance" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Course Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Course Progress
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
          </CardTitle>
          <CardDescription>Completion rates by subject</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={courseProgressData.length > 0 ? courseProgressData : [{name: 'No Data', completed: 0, pending: 0}]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, completed }: { name: string; completed: number }) => `${name}: ${completed}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="completed"
              >
                {(courseProgressData.length > 0 ? courseProgressData : [{name: 'No Data', completed: 0, pending: 0}]).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}


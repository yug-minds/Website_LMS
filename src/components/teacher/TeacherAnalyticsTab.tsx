"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import { useTeacherMonthlyAttendance } from "../../hooks/useTeacherData";
import { SkeletonChart } from "../ui/skeleton-chart";

type TeacherMonthlyAttendanceRecord = {
  month: string | Date;
  present_count?: number;
  present?: number;
  total_days?: number;
  absent_count?: number;
  leave_count?: number;
  unreported_count?: number;
};

interface TeacherAnalyticsTabProps {
  selectedSchoolId?: string;
}

export default function TeacherAnalyticsTab({ selectedSchoolId }: TeacherAnalyticsTabProps) {
  const { data: monthlyAttendance, isLoading: attendanceLoading } = useTeacherMonthlyAttendance(selectedSchoolId, 6);

  const attendanceAreaData = useMemo(() => {
    return monthlyAttendance?.map((m: TeacherMonthlyAttendanceRecord) => {
      const present = m.present_count ?? m.present ?? 0;
      const fallbackTotal =
        (m.present_count ?? 0) +
        (m.absent_count ?? 0) +
        (m.leave_count ?? 0) +
        (m.unreported_count ?? 0);
      const rawTotal = m.total_days ?? fallbackTotal;
      const total = rawTotal > 0 ? rawTotal : 1;

      return {
        month:
          typeof m.month === 'string'
            ? new Date(m.month).toLocaleDateString('en-US', { month: 'short' })
            : m.month,
        attendance: Math.round((present / total) * 100),
      };
    }) ?? [];
  }, [monthlyAttendance]);

  const attendanceBreakdownData = useMemo(() => {
    return monthlyAttendance && monthlyAttendance.length > 0
      ? [
          (() => {
            const m = monthlyAttendance[0] as TeacherMonthlyAttendanceRecord;
            return {
              name:
                typeof m.month === 'string'
                  ? new Date(m.month).toLocaleDateString('en-US', { month: 'long' })
                  : m.month,
              Present: m.present_count ?? m.present ?? 0,
              Absent: m.absent_count ?? 0,
              Leave: m.leave_count ?? 0,
            };
          })(),
        ]
      : [];
  }, [monthlyAttendance]);

  if (attendanceLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Attendance Trend</CardTitle>
            <CardDescription>Attendance percentage over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyAttendance && monthlyAttendance.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={attendanceAreaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="attendance" stroke="#0088FE" fill="#0088FE" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No attendance data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance Breakdown</CardTitle>
            <CardDescription>Present vs Absent vs Leave (Last Month)</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyAttendance && monthlyAttendance.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={attendanceBreakdownData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="Present" fill="#00C49F" />
                  <Bar dataKey="Absent" fill="#FF8042" />
                  <Bar dataKey="Leave" fill="#FFBB28" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No attendance data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



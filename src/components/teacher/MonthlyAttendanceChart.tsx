"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { supabase } from "../../lib/supabase";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Calendar, TrendingUp } from "lucide-react";

interface AttendanceData {
  month: string;
  present: number;
  absent: number;
  leave: number;
  unreported: number;
}

const COLORS = {
  present: '#10B981',
  absent: '#EF4444',
  leave: '#F59E0B',
  unreported: '#6B7280'
};

export default function MonthlyAttendanceChart() {
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewType, setViewType] = useState<'bar' | 'pie'>('bar');

  useEffect(() => {
    loadAttendanceData();
  }, []);

  const loadAttendanceData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // IMPORTANT: Don't query views/tables directly from client (RLS can block and returns opaque errors).
      // Use the teacher analytics API which runs with server-side privileges and returns monthlyAttendanceRaw.
      const res = await fetch(`/api/teacher/analytics?limit=6&t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${session.access_token || ''}`
        }
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        console.error('Error loading attendance data:', {
          status: res.status,
          statusText: res.statusText,
          body: bodyText || undefined
        });
        return;
      }

      const json = await res.json().catch(() => null);
      const raw = (json as any)?.analytics?.monthlyAttendanceRaw;
      const data = Array.isArray(raw) ? raw : [];

      // Transform data for chart
      const chartData = data.map((item: any) => ({
        month: new Date(item.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        present: item.present_count || 0,
        absent: item.absent_count || 0,
        leave: item.leave_count || 0,
        unreported: item.unreported_count || 0
      }));

      setAttendanceData(chartData.reverse()); // Reverse to show oldest first
    } catch (error) {
      console.error('Error loading attendance data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentMonthData = () => {
    if (attendanceData.length === 0) return null;
    return attendanceData[attendanceData.length - 1];
  };

  const currentMonthData = getCurrentMonthData();
  const totalDays = currentMonthData ? 
    currentMonthData.present + currentMonthData.absent + currentMonthData.leave + currentMonthData.unreported : 0;
  const attendancePercentage = totalDays > 0 && currentMonthData ? 
    Math.round((currentMonthData.present / totalDays) * 100) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Attendance</CardTitle>
          <CardDescription>Loading attendance data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Monthly Attendance</CardTitle>
            <CardDescription>
              {currentMonthData ? 
                `Current month: ${attendancePercentage}% attendance` : 
                'No attendance data available'
              }
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setViewType('bar')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                viewType === 'bar' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setViewType('pie')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                viewType === 'pie' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Pie
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {attendanceData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No attendance data</p>
            <p className="text-sm">Submit your first report to start tracking attendance</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Month Summary */}
            {currentMonthData && (
              <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{currentMonthData.present}</div>
                  <div className="text-xs text-gray-600">Present</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{currentMonthData.absent}</div>
                  <div className="text-xs text-gray-600">Absent</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{currentMonthData.leave}</div>
                  <div className="text-xs text-gray-600">Leave</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{currentMonthData.unreported}</div>
                  <div className="text-xs text-gray-600">Unreported</div>
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="h-64">
              {viewType === 'bar' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="present" stackId="a" fill={COLORS.present} name="Present" />
                    <Bar dataKey="absent" stackId="a" fill={COLORS.absent} name="Absent" />
                    <Bar dataKey="leave" stackId="a" fill={COLORS.leave} name="Leave" />
                    <Bar dataKey="unreported" stackId="a" fill={COLORS.unreported} name="Unreported" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Present', value: currentMonthData?.present || 0, color: COLORS.present },
                        { name: 'Absent', value: currentMonthData?.absent || 0, color: COLORS.absent },
                        { name: 'Leave', value: currentMonthData?.leave || 0, color: COLORS.leave },
                        { name: 'Unreported', value: currentMonthData?.unreported || 0, color: COLORS.unreported }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[
                        { name: 'Present', value: currentMonthData?.present || 0, color: COLORS.present },
                        { name: 'Absent', value: currentMonthData?.absent || 0, color: COLORS.absent },
                        { name: 'Leave', value: currentMonthData?.leave || 0, color: COLORS.leave },
                        { name: 'Unreported', value: currentMonthData?.unreported || 0, color: COLORS.unreported }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Legend */}
            <div className="flex justify-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.present }}></div>
                <span>Present</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.absent }}></div>
                <span>Absent</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.leave }}></div>
                <span>Leave</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.unreported }}></div>
                <span>Unreported</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

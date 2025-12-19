"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { 
  Users, 
  School, 
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Trash2,
  Search,
  Plus
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { fetchWithCsrf } from '../../../lib/csrf-client';

// Enhanced interfaces for better type safety
interface Teacher {
  id: string;
  teacher_id: string;
  full_name: string;
  email: string;
  phone?: string;
  qualification?: string;
  experience_years?: number;
  specialization?: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'Suspended';
  created_at: string;
  teacher_schools?: TeacherSchool[];
}

interface TeacherSchool {
  id: string;
  teacher_id: string;
  school_id: string;
  grades_assigned: string[];
  subjects: string[];
  working_days_per_week: number;
  max_students_per_session: number;
  is_primary: boolean;
  schools?: {
    id: string;
    name: string;
    school_code: string;
  };
}

interface School {
  id: string;
  name: string;
  school_code: string;
  city?: string;
  state?: string;
}

interface LeaveRequest {
  id: string;
  teacher_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  total_days: number;
  teacher?: {
    full_name: string;
    email: string;
  };
}

export default function TeachersManagement() {
  const router = useRouter();
  // State management
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("teachers");

  // Statistics
  const [stats, setStats] = useState({
    totalTeachers: 0,
    activeTeachers: 0,
    pendingLeaves: 0,
    averageAttendance: 94
  });

  const handleAddTeacherClick = () => {
    router.push("/admin/teachers");
  };

  // Load all data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  // Filter teachers based on search term
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredTeachers(teachers);
    } else {
      const filtered = teachers.filter((teacher: any) =>
        teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.teacher_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTeachers(filtered);
    }
  }, [searchTerm, teachers]);

  // Update statistics
  const updateStats = useCallback((teachersData: Teacher[]) => {
    const active = teachersData.filter((t: any) => t.status === 'Active').length;
    setStats({
      totalTeachers: teachersData.length,
      activeTeachers: active,
      pendingLeaves: leaveRequests.length,
      averageAttendance: 94
    });
  }, [leaveRequests]);

  // Main data loading function
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadTeachers(),
        loadSchools(),
        loadLeaveRequests()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load teachers with enhanced error handling
  const loadTeachers = useCallback(async () => {
    try {
      // Use API route instead of direct Supabase client
      const response = await fetchWithCsrf('/api/admin/teachers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch teachers' }));
        console.error('Error fetching teachers:', errorData.error);
        setTeachers([]);
        updateStats([]);
        return;
      }

      const data = await response.json();
      const teachersData = (Array.isArray(data?.data) ? data.data : (data?.teachers || []));
      setTeachers(teachersData);
      updateStats(teachersData);

    } catch (error) {
      console.error('Unexpected error loading teachers:', error);
      setTeachers([]);
      updateStats([]);
    }
  }, [updateStats]);

  // Load schools
  const loadSchools = useCallback(async () => {
    try {
      // Use API route instead of direct Supabase client
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch schools' }));
        console.error('Error loading schools:', errorData.error);
        setSchools([]);
        return;
      }

      const data = await response.json();
      // Filter active schools (if is_active property exists)
       
      const activeSchools = (data.schools || []).filter((s: any) => s.is_active !== false);
      setSchools(activeSchools);
    } catch (error) {
      console.error('Unexpected error loading schools:', error);
      setSchools([]);
    }
  }, []);

  // Load leave requests
  const loadLeaveRequests = useCallback(async () => {
    try {
      // Use API route instead of direct Supabase client
      const response = await fetchWithCsrf('/api/admin/leaves?status=Pending', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch leave requests' }));
        console.error('Error loading leave requests:', errorData.error);
        setLeaveRequests([]);
        return;
      }

      const data = await response.json();
      setLeaveRequests(data.leaves || []);
    } catch (error) {
      console.error('Unexpected error loading leave requests:', error);
      setLeaveRequests([]);
    }
  }, []);


  // Render loading state
  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Teachers Management</h1>
          <p className="text-muted-foreground">Manage teachers, attendance, and leave requests</p>
        </div>
        <Button onClick={handleAddTeacherClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Teacher
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTeachers}</div>
            <p className="text-xs text-muted-foreground">Active teachers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Leaves</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingLeaves}</div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Attendance</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageAttendance}%</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schools.length}</div>
            <p className="text-xs text-muted-foreground">With teachers</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="leaves">Leave Requests</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        {/* Teachers Tab */}
        <TabsContent value="teachers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Teachers ({filteredTeachers.length})</CardTitle>
                  <CardDescription>Manage all teacher accounts</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search teachers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredTeachers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-semibold">No teachers found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchTerm ? 'Try adjusting your search' : 'Get started by adding a new teacher'}
                  </p>
                  {!searchTerm && (
                    <Button onClick={handleAddTeacherClick} className="mt-4">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Teacher
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-4 text-left font-medium">Name</th>
                        <th className="p-4 text-left font-medium">Email</th>
                        <th className="p-4 text-left font-medium">Assigned Schools</th>
                        <th className="p-4 text-left font-medium">Status</th>
                        <th className="p-4 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeachers.map((teacher) => (
                        <tr key={teacher.id} className="border-b hover:bg-muted/50">
                          <td className="p-4">
                            <div>
                              <div className="font-medium">{teacher.full_name}</div>
                              <div className="text-sm text-muted-foreground">{teacher.teacher_id}</div>
                            </div>
                          </td>
                          <td className="p-4 text-sm">{teacher.email}</td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {teacher.teacher_schools && teacher.teacher_schools.length > 0 ? (
                                teacher.teacher_schools.map((ts, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {ts.schools?.name || 'Unknown School'}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No schools assigned</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge 
                              variant={teacher.status === 'Active' ? 'default' : 'secondary'}
                              className={
                                teacher.status === 'Active' ? 'bg-green-500' :
                                teacher.status === 'On Leave' ? 'bg-yellow-500' :
                                'bg-gray-500'
                              }
                            >
                              {teacher.status}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leave Requests Tab */}
        <TabsContent value="leaves" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Leave Requests ({leaveRequests.length})</CardTitle>
              <CardDescription>Review and manage teacher leave requests</CardDescription>
            </CardHeader>
            <CardContent>
              {leaveRequests.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-semibold">No pending leave requests</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    All leave requests have been processed
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {leaveRequests.map((request) => (
                    <div key={request.id} className="border rounded-lg p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="font-medium">{request.teacher?.full_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {request.start_date} to {request.end_date} ({request.total_days} days)
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Type:</span> {request.leave_type}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Reason:</span> {request.reason}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive">
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Overview</CardTitle>
              <CardDescription>Monitor teacher attendance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-semibold">Attendance tracking</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  View and manage teacher attendance records
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

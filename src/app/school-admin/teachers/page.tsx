"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { supabase } from "../../../lib/supabase";
import { fetchWithCsrf, addTokensToHeaders } from "../../../lib/csrf-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { 
  Plus,
  Search,
  Edit,
  Trash2,
  Download,
  Filter,
  User,
  Mail,
  Calendar,
  Users,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  AlertCircle
} from "lucide-react";

interface Teacher {
  id: string;
  teacher_id: string;
  full_name: string;
  email: string;
  phone: string;
  qualification: string;
  experience_years: number;
  specialization: string;
  status: string;
  created_at: string;
  teacher_schools: {
    grades_assigned: string[];
    subjects: string[];
    working_days_per_week: number;
    max_students_per_session: number;
  }[];
  attendance_percentage?: number;
  leaves_taken?: number;
}

interface LeaveRequest {
  id: string;
  teacher_id: string;
  school_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  leave_type: string;
  status: string;
  total_days?: number;
  substitute_required?: boolean;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
  };
}

function TeachersContent() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("Pending");
  // Removed isAddDialogOpen and isEditDialogOpen - school admins cannot add or edit teachers, only main admins can
  // Removed selectedTeacher - no longer needed since editing is disabled
  const [schoolId, setSchoolId] = useState<string>("");

  // Form states
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    qualification: "",
    experience_years: 0,
    specialization: "",
    grades_assigned: [] as string[],
    subjects: [] as string[],
    working_days_per_week: 2,
    max_students_per_session: 30
  });

  const loadTeachers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 Loading teachers for school admin...');
      
      // Get session once and reuse
      const session = await supabase.auth.getSession();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('❌ Authentication error:', authError);
        setError(authError ? 'Authentication failed. Please log in again.' : 'No authenticated user found. Please log in.');
        setTeachers([]);
        setLoading(false);
        return;
      }

      // Parallel API calls for better performance
      const profileHeaders = await addTokensToHeaders();
      const [profileResponse, teachersResponse, leavesResponse] = await Promise.allSettled([
        fetch(`/api/profile?userId=${user.id}`, {
          cache: 'no-store',
          method: 'GET',
          headers: profileHeaders
        }),
        fetchWithCsrf('/api/school-admin/teachers', {
          cache: 'no-store',
        }),
        fetch(`/api/school-admin/leaves?status=${leaveStatusFilter === 'all' ? '' : leaveStatusFilter}`, {
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token || ''}`
          }
        })
      ]);

      // Handle profile response
      let profile = null;
      if (profileResponse.status === 'fulfilled' && profileResponse.value.ok) {
        const profileData = await profileResponse.value.json();
        profile = profileData.profile;
      } else {
        const errorMsg = profileResponse.status === 'rejected' 
          ? 'Failed to connect to server' 
          : 'Failed to load your profile';
        setError(errorMsg);
        setTeachers([]);
        setLoading(false);
        return;
      }

      // Verify user is school admin
      if (profile?.role !== 'school_admin') {
        console.warn('⚠️ User is not a school admin. Role:', profile?.role);
        setError('Access denied. School admin access required.');
        setTeachers([]);
        setLoading(false);
        return;
      }
      
      // Get school_id from school API response (uses school_admins table)
      try {
        const session = await supabase.auth.getSession();
        const schoolResponse = await fetch(`/api/school-admin/school`, {
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${session.data.session?.access_token || ''}`
          }
        });
        if (schoolResponse.ok) {
          const schoolData = await schoolResponse.json();
          if (schoolData.school?.id) {
            setSchoolId(schoolData.school.id);
            console.log('✅ School ID:', schoolData.school.id);
          } else {
            setError('No school assigned to your account. Please contact support.');
            setTeachers([]);
            setLoading(false);
            return;
          }
        } else {
          setError('Failed to load school information. Please try again.');
          setTeachers([]);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Error fetching school info:', err);
        setError('Failed to load school information. Please try again.');
        setTeachers([]);
        setLoading(false);
        return;
      }

      // Handle teachers response
      if (teachersResponse.status === 'fulfilled' && teachersResponse.value.ok) {
        const result = await teachersResponse.value.json();
        const teacherSchools = result.teachers || [];
        console.log('✅ Teachers loaded from API:', teacherSchools.length);

        if (teacherSchools.length === 0) {
          console.warn('⚠️ No teachers found for this school');
          setTeachers([]);
        } else {
          // Transform the API response to match expected format
           
          const teachersData = teacherSchools.map((ts: any) => {
            const teacher = ts.teacher || {};
            const profile = ts.profile || {};
            const userId = teacher.id || profile.id || teacher.profile_id || ts.teacher_id;
            
            return {
              id: userId || ts.id,
              teacher_id: teacher.teacher_id || `TCH-${(userId || ts.teacher_id)?.slice(0, 8) || 'UNKNOWN'}`,
              full_name: teacher.full_name || profile.full_name || 'Unknown',
              email: teacher.email || profile.email || '',
              phone: teacher.phone || profile.phone || '',
              qualification: teacher.qualification || '',
              experience_years: teacher.experience_years || 0,
              specialization: teacher.specialization || '',
              status: teacher.status || 'Active',
              created_at: teacher.created_at || ts.assigned_at,
              teacher_schools: [{
                grades_assigned: ts.grades_assigned || [],
                subjects: ts.subjects || [],
                working_days_per_week: ts.working_days_per_week || 5,
                max_students_per_session: ts.max_students_per_session || 30
              }]
            };
           
          }).filter((teacher: any) => teacher.full_name !== 'Unknown' || teacher.email);

          // Set teachers without mock stats - stats should come from database
          // If stats are needed, they should be fetched from the API
          setTeachers(teachersData);
        }
      } else {
        const errorData = teachersResponse.status === 'fulfilled' 
          ? await teachersResponse.value.json().catch(() => ({ error: 'Unknown error' }))
          : { error: 'Network error' };
        console.error('❌ Error loading teachers from API:', errorData.error);
        setError(errorData.error || 'Failed to load teachers');
        setTeachers([]);
      }

      // Handle leave requests response (non-blocking)
      if (leavesResponse.status === 'fulfilled' && leavesResponse.value.ok) {
        const leavesData = await leavesResponse.value.json();
        setLeaveRequests(leavesData.leaves || []);
      } else {
        console.warn('⚠️ Leave requests unavailable:', leavesResponse.status === 'rejected' ? 'Network error' : 'API error');
        setLeaveRequests([]);
      }

      setLoading(false);
    } catch (error) {
      console.error('❌ Error loading teachers:', error);
       
      setError((error as any)?.message || 'Failed to load teachers. Please try again.');
      setTeachers([]);
      setLoading(false);
    }
  }, [leaveStatusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTeachers();
  }, [loadTeachers]);

  // Note: handleAddTeacher, handleEditTeacher, and handleDeleteTeacher have been removed.
  // School admins can only view teachers - they cannot add, edit, or delete teachers.
  // Only main admins can manage teachers.

  const handleExportTeachers = () => {
    if (filteredTeachers.length === 0) {
      alert('No teachers to export');
      return;
    }

    // Prepare CSV data
    const headers = ['Name', 'Email', 'Phone', 'Qualification', 'Specialization', 'Experience (Years)', 'Attendance %', 'Leaves Taken', 'Status'];
    const rows = filteredTeachers.map((teacher: any) => [
      teacher.full_name || '',
      teacher.email || '',
      teacher.phone || '',
      teacher.qualification || '',
      teacher.specialization || '',
      teacher.experience_years || 0,
      teacher.attendance_percentage || 0,
      teacher.leaves_taken || 0,
      teacher.status || 'Active'
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row: any) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `teachers_export_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`✅ Exported ${filteredTeachers.length} teacher(s) to CSV`);
  };

  const handleLeaveRequest = async (leaveId: string, action: 'approve' | 'reject') => {
    try {
      // This API route enforces CSRF, so we must use the CSRF-aware helper.
      const response = await fetchWithCsrf(`/api/school-admin/leaves/${leaveId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        // Reload leave requests
        const statusParam = leaveStatusFilter === 'all' ? '' : `?status=${leaveStatusFilter}`;
        const leavesResponse = await fetchWithCsrf(`/api/school-admin/leaves${statusParam}`, {
          cache: 'no-store',
        });
        if (leavesResponse.ok) {
          const leavesData = await leavesResponse.json();
          setLeaveRequests(leavesData.leaves || []);
        }
        alert(`Leave request ${action === 'approve' ? 'approved' : 'rejected'} successfully! Attendance has been updated automatically.`);
      } else {
        let errorData: any = null;
        let errorText: string | null = null;
        try {
          errorData = await response.json();
        } catch {
          try {
            errorText = await response.text();
          } catch {
            // ignore
          }
        }
        const message =
          errorData?.details ||
          errorData?.error ||
          errorData?.message ||
          errorText ||
          `HTTP ${response.status}`;
        console.error('Error updating leave request:', message);
        console.error('Full error response:', errorData ?? errorText);
        alert(`Failed to ${action} leave request: ${message}`);
      }
    } catch (error) {
      console.error('Error updating leave request:', error);
      alert(`Error ${action === 'approve' ? 'approving' : 'rejecting'} leave request. Please try again.`);
    }
  };

  const filteredTeachers = teachers.filter((teacher: any) => {
    const matchesSearch = teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         teacher.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || teacher.status.toLowerCase() === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <div className="h-9 bg-gray-200 rounded w-64 animate-pulse mb-2"></div>
          <div className="h-5 bg-gray-200 rounded w-96 animate-pulse"></div>
        </div>
        <Card>
          <CardHeader>
            <div className="h-6 bg-gray-200 rounded w-48 animate-pulse mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-72 animate-pulse"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                  <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-48 animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded w-64 animate-pulse"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                  <div className="h-6 bg-gray-200 rounded w-20 animate-pulse"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Teachers Management</h1>
        <p className="text-gray-600 mt-2">Manage teachers and track attendance</p>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-900">Error loading teachers</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setError(null);
                  loadTeachers();
                }}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="teachers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="leaves">
            Leave Requests
            {leaveRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {leaveRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Teachers Tab */}
        <TabsContent value="teachers" className="space-y-6">
          {/* Filters and Actions */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search teachers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Showing {filteredTeachers.length} of {teachers.length} teachers
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleExportTeachers}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
          </div>

          {/* Teachers Table */}
          <Card>
            <CardHeader>
              <CardTitle>Teachers List</CardTitle>
              <CardDescription>Manage teacher information and track performance</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Qualification</TableHead>
                    <TableHead>Experience</TableHead>
                    <TableHead>Attendance %</TableHead>
                    <TableHead>Leaves Taken</TableHead>
                    <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <div className="font-medium">{teacher.full_name}</div>
                            <div className="text-sm text-gray-500">{teacher.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{teacher.qualification}</div>
                        <div className="text-xs text-gray-500">{teacher.specialization}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{teacher.experience_years} years</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <TrendingUp className="h-4 w-4 mr-1 text-green-600" />
                          <span className="text-sm font-medium">{teacher.attendance_percentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{teacher.leaves_taken} days</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          teacher.status === 'Active' ? 'default' : 
                          teacher.status === 'On Leave' ? 'secondary' : 'destructive'
                        }>
                          {teacher.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredTeachers.length === 0 && teachers.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">No teachers assigned to this school</p>
                  <p className="text-sm mt-2">Teachers need to be created and assigned to your school by the main administrator.</p>
                  <p className="text-xs mt-1 text-gray-400">If you believe this is an error, please contact support.</p>
                </div>
              )}
              {filteredTeachers.length === 0 && teachers.length > 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">No teachers match your search</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leave Requests Tab */}
        <TabsContent value="leaves" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leave Requests</CardTitle>
                  <CardDescription>Review and approve teacher leave applications</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={leaveStatusFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setLeaveStatusFilter('all');
                      loadTeachers();
                    }}
                  >
                    All
                  </Button>
                  <Button
                    variant={leaveStatusFilter === 'Pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setLeaveStatusFilter('Pending');
                      loadTeachers();
                    }}
                  >
                    Pending
                  </Button>
                  <Button
                    variant={leaveStatusFilter === 'Approved' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setLeaveStatusFilter('Approved');
                      loadTeachers();
                    }}
                  >
                    Approved
                  </Button>
                  <Button
                    variant={leaveStatusFilter === 'Rejected' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setLeaveStatusFilter('Rejected');
                      loadTeachers();
                    }}
                  >
                    Rejected
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {leaveRequests.length > 0 ? (
                <div className="space-y-4">
                  {leaveRequests.map((leave) => (
                    <div key={leave.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                          <Clock className="h-5 w-5 text-orange-600" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{leave.profiles?.full_name || 'Unknown Teacher'}</div>
                          <div className="text-sm text-gray-500">{leave.profiles?.email || ''}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">Type:</span> {leave.leave_type || 'Personal'} • {' '}
                            <span className="font-medium">Dates:</span> {new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()} ({leave.total_days || 0} days)
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            <span className="font-medium">Reason:</span> {leave.reason}
                          </div>
                          {leave.substitute_required && (
                            <Badge variant="outline" className="mt-1 text-xs">Substitute Required</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {leave.status === 'Pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleLeaveRequest(leave.id, 'approve')}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleLeaveRequest(leave.id, 'reject')}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {leave.status === 'Approved' && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        )}
                        {leave.status === 'Rejected' && (
                          <Badge className="bg-red-100 text-red-800">
                            <XCircle className="h-3 w-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                        {leave.reviewed_at && (
                          <div className="text-xs text-gray-500 ml-2">
                            Reviewed: {new Date(leave.reviewed_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-lg font-medium">No pending leave requests</p>
                  <p className="text-sm">All leave requests have been processed</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Teacher Dialog removed - school admins cannot edit teachers */}
    </div>
  );
}

export default function TeachersManagement() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <TeachersContent />
    </Suspense>
  );
}

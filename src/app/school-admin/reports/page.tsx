"use client";

import { useState, useEffect, useCallback } from "react";
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
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Calendar,
  User,
  BookOpen,
  Users,
  AlertCircle,
  CheckSquare,
  Square
} from "lucide-react";

interface TeacherReport {
  id: string;
  teacher_id: string;
  school_id: string;
  date: string;
  grade: string;
  topics_taught: string;
  student_count: number;
  duration_hours: number;
  notes: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  teacher: {
    full_name: string;
    email: string;
  };
  status: 'Pending' | 'Approved' | 'Rejected';
  // Deprecated: class_name is kept for backward compatibility but grade should be used
  class_name?: string;
}

export default function ReportsManagement() {
  const [reports, setReports] = useState<TeacherReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [dateRange, setDateRange] = useState({
    start: "",
    end: ""
  });
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [isBulkApproveOpen, setIsBulkApproveOpen] = useState(false);
  const [schoolId, setSchoolId] = useState<string>("");

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get current user's school
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use API route to get profile (bypasses RLS)
      let profile = null;
      try {
        const profileHeaders = await addTokensToHeaders();
        const profileResponse = await fetch(`/api/profile?userId=${user.id}`, {
          cache: 'no-store',
          method: 'GET',
          headers: profileHeaders
        });
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          profile = profileData.profile;
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        return;
      }

      // Verify user is school admin
      if (profile?.role !== 'school_admin') {
        console.warn('User is not a school admin. Role:', profile?.role);
        return;
      }
      
      // Get school_id from school API response (uses school_admins table)
      try {
        const session = await supabase.auth.getSession();
        const schoolResponse = await fetchWithCsrf(`/api/school-admin/school`, {
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        if (schoolResponse.ok) {
          const schoolData = await schoolResponse.json();
          if (schoolData.school?.id) {
            setSchoolId(schoolData.school.id);
          }
        }
      } catch (err) {
        console.warn('Could not fetch school info:', err);
        // Continue anyway - API routes will handle school_id
      }

      // Load teacher reports via API route (bypasses RLS)
      const response = await fetchWithCsrf('/api/school-admin/reports', {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      } else {
        console.error('Error loading reports from API:', response.status);
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API error:', errorData.error);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleApproveReport = async (reportId: string) => {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetchWithCsrf(`/api/school-admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'approve' })
      });

      if (response.ok) {
        loadReports();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error approving report:', errorData.error);
        alert(`Failed to approve report: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error approving report:', error);
      alert('Error approving report. Please try again.');
    }
  };

  const handleRejectReport = async (reportId: string) => {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetchWithCsrf(`/api/school-admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'reject',
          notes: (reports.find((r: any) => r.id === reportId)?.notes || '') + ' [REJECTED]'
        })
      });

      if (response.ok) {
        loadReports();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error rejecting report:', errorData.error);
        alert(`Failed to reject report: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error rejecting report:', error);
      alert('Error rejecting report. Please try again.');
    }
  };

  const handleBulkApprove = async () => {
    try {
      const response = await fetchWithCsrf('/api/school-admin/reports/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report_ids: selectedReports })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Successfully approved ${data.approved || selectedReports.length} report(s)`);
        setSelectedReports([]);
        setIsBulkApproveOpen(false);
        loadReports();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error bulk approving reports:', errorData.error);
        alert(`Failed to approve reports: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error bulk approving reports:', error);
      alert('Error bulk approving reports. Please try again.');
    }
  };

  const handleSelectReport = (reportId: string) => {
    setSelectedReports(prev => 
      prev.includes(reportId) 
        ? prev.filter((id: any) => id !== reportId)
        : [...prev, reportId]
    );
  };

  const handleSelectAll = () => {
    const pendingReports = filteredReports.filter((r: any) => r.status === 'Pending');
    if (selectedReports.length === pendingReports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(pendingReports.map((r: any) => r.id));
    }
  };

  const filteredReports = reports.filter((report: any) => {
    const matchesSearch = report.teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.topics_taught.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (report.grade || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || report.status.toLowerCase() === statusFilter;
    const matchesTeacher = teacherFilter === "all" || report.teacher_id === teacherFilter;
    const matchesGrade = gradeFilter === "all" || report.grade === gradeFilter;
    
    const matchesDateRange = (!dateRange.start || new Date(report.date) >= new Date(dateRange.start)) &&
                           (!dateRange.end || new Date(report.date) <= new Date(dateRange.end));
    
    return matchesSearch && matchesStatus && matchesTeacher && matchesGrade && matchesDateRange;
  });

  const getTeachers = () => {
    const teachers = [...new Set(reports.map((r: any) => r.teacher_id))];
    return teachers.map((teacherId: any) => {
      const report = reports.find((r: any) => r.teacher_id === teacherId);
      return {
        id: teacherId,
        name: report?.teacher.full_name || 'Unknown'
      };
    });
  };

  const getGrades = () => {
    return [...new Set(reports.map((r: any) => r.grade))].sort();
  };

  const getStats = () => {
    const total = reports.length;
    const pending = reports.filter((r: any) => r.status === 'Pending').length;
    const approved = reports.filter((r: any) => r.status === 'Approved').length;
    const rejected = reports.filter((r: any) => r.status === 'Rejected').length;
    
    return { total, pending, approved, rejected };
  };

  const stats = getStats();

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Teacher Reports</h1>
        <p className="text-gray-600 mt-2">Review and approve teacher daily reports</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Approved reports</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Rejected reports</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="teacher">Teacher</Label>
              <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teachers</SelectItem>
                  {getTeachers().map((teacher: any) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="grade">Grade</Label>
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  {getGrades().map((grade: any) => (
                    <SelectItem key={grade} value={grade}>
                      Grade {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-600">
          Showing {filteredReports.length} of {reports.length} reports
        </div>
        <div className="flex gap-2">
          {stats.pending > 0 && (
            <Dialog open={isBulkApproveOpen} onOpenChange={setIsBulkApproveOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Bulk Approve ({selectedReports.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Approve Reports</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to approve {selectedReports.length} selected reports?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsBulkApproveOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleBulkApprove}>Approve All</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle>Teacher Reports</CardTitle>
          <CardDescription>Review and approve daily teaching reports</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="h-8 w-8 p-0"
                  >
                    {selectedReports.length === filteredReports.filter((r: any) => r.status === 'Pending').length ? 
                      <CheckSquare className="h-4 w-4" /> : 
                      <Square className="h-4 w-4" />
                    }
                  </Button>
                </TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Topics</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    {report.status === 'Pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectReport(report.id)}
                        className="h-8 w-8 p-0"
                      >
                        {selectedReports.includes(report.id) ? 
                          <CheckSquare className="h-4 w-4" /> : 
                          <Square className="h-4 w-4" />
                        }
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="h-3 w-3 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{report.teacher.full_name}</div>
                        <div className="text-xs text-gray-500">{report.teacher.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm">
                      <Calendar className="h-4 w-4 mr-1" />
                      {new Date(report.date).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-sm font-medium">
                      {report.grade || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm max-w-xs truncate" title={report.topics_taught}>
                      {report.topics_taught}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm">
                      <Users className="h-4 w-4 mr-1" />
                      {report.student_count}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{report.duration_hours}h</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      report.status === 'Approved' ? 'default' : 
                      report.status === 'Pending' ? 'secondary' : 'destructive'
                    }>
                      {report.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredReports.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <BookOpen className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg font-medium">No reports found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


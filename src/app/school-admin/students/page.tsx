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
  GraduationCap,
  Eye,
  EyeOff,
  Key,
  RefreshCw,
  Copy,
  Shield
} from "lucide-react";

interface Student {
  id: string;
  profile_id: string;
  school_id: string;
  grade: string;
  joining_code: string;
  enrolled_at: string;
  is_active: boolean;
  profile: {
    full_name: string;
    email: string;
    created_at: string;
    parent_name?: string;
    parent_phone?: string;
  };
  last_login?: string;
}

// Available grades for selection
const availableGrades = [
  'Pre-K', 'Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
];

export default function StudentsManagement() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [schoolId, setSchoolId] = useState<string>("");
  const [schoolGrades, setSchoolGrades] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    grade: "",
    joining_code: "",
    password: "",
    parent_name: "",
    parent_phone: ""
  });

  const loadStudents = useCallback(async () => {
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

      // Fetch school info to get school_id and grades_offered
      // API route uses school_admins table to get school_id (primary source of truth)
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
          if (schoolData.school) {
            // Set school_id from API response (comes from school_admins table)
            setSchoolId(schoolData.school.id);
            
            if (schoolData.school.grades_offered && Array.isArray(schoolData.school.grades_offered)) {
              setSchoolGrades(schoolData.school.grades_offered);
            } else {
              // Fallback to all available grades if school doesn't have grades_offered set
              setSchoolGrades(availableGrades);
            }
          } else {
            console.warn('School not found in API response');
            setSchoolGrades(availableGrades);
          }
        } else {
          console.warn('Failed to fetch school info:', schoolResponse.status);
          // Fallback to all available grades if school fetch fails
          setSchoolGrades(availableGrades);
        }
      } catch (err) {
        console.log('Error fetching school info, using all available grades:', err);
        setSchoolGrades(availableGrades);
      }

      // Load students for this school using API route (automatically filters by admin's school_id)
      const response = await fetchWithCsrf(`/api/school-admin/students`, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Transform API response to match expected format
         
        const transformedStudents = (data.students || []).map((student: any) => ({
          id: student.id,
          profile_id: student.profile?.id || student.student_id,
          student_id: student.student_id,
          school_id: student.school_id,
          grade: student.grade,
          joining_code: student.joining_code,
          is_active: student.is_active,
          enrolled_at: student.enrolled_at,
          profile: {
            ...student.profile,
            parent_name: student.profile?.parent_name || '',
            parent_phone: student.profile?.parent_phone || ''
          }
        }));
        setStudents(transformedStudents);
      } else {
        console.error('Error loading students from API');
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API error:', errorData.error || 'Unknown error');
        // No fallback - rely on API route for security
        setStudents([]);
      }
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleAddStudent = async () => {
    try {
      setIsAddingStudent(true);
      
      if (!schoolId) {
        alert('School ID not available. Please refresh the page.');
        console.error('School ID not available');
        setIsAddingStudent(false);
        return;
      }

      // Validate required fields
      if (!formData.full_name || !formData.email || !formData.grade || !formData.password) {
        alert('Please fill in all required fields: Full Name, Email, Grade, and Password');
        setIsAddingStudent(false);
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        alert('Please enter a valid email address');
        setIsAddingStudent(false);
        return;
      }

      // Validate password strength (8+ chars, uppercase, lowercase, number)
      const { validatePasswordClient } = await import('../../../lib/password-validation');
      const passwordError = validatePasswordClient(formData.password);
      if (passwordError) {
        alert(passwordError);
        setIsAddingStudent(false);
        return;
      }

      console.log('➕ Creating student...', {
        full_name: formData.full_name,
        email: formData.email,
        grade: formData.grade,
        school_id: schoolId || undefined });

      // Use school-admin API endpoint (auto-populates school_id)
      const response = await fetchWithCsrf('/api/school-admin/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          grade: formData.grade,
          joining_code: formData.joining_code || null,
          password: formData.password,
          parent_name: formData.parent_name || null,
          parent_phone: formData.parent_phone || null
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error creating student:', result.error || result.details || 'Failed to create student');
        alert(`Failed to create student: ${result.error || result.details || 'Please try again.'}`);
        setIsAddingStudent(false);
        return;
      }

      if (result.success) {
        console.log('✅ Student created successfully:', result.student);
        const studentName = formData.full_name;
        const studentEmail = formData.email;
        // Reset form and close dialog
        setFormData({
          full_name: "",
          email: "",
          grade: "",
          joining_code: "",
          password: "",
          parent_name: "",
          parent_phone: ""
        });
        setIsAddDialogOpen(false);
        // Reload students list to show the new student
        await loadStudents();
        alert(`Student "${studentName}" added successfully! They can now log in using ${studentEmail} and the password you provided.`);
      } else {
        console.error('Failed to create student:', result.error);
        alert(`Failed to create student: ${result.error || 'Please try again.'}`);
      }
     
    } catch (error: any) {
      console.error('Error adding student:', error);
      alert(`Error adding student: ${error.message || 'Please try again.'}`);
    } finally {
      setIsAddingStudent(false);
    }
  };

  const handleViewStudent = (student: Student) => {
    setViewingStudent(student);
    setIsViewDialogOpen(true);
  };

  const handleEditStudentClick = (student: Student) => {
    setSelectedStudent(student);
    setFormData({
      full_name: student?.profile?.full_name || "",
      email: student?.profile?.email || "",
      grade: student.grade || "",
      joining_code: student.joining_code || "",
      password: "",
      parent_name: student?.profile?.parent_name || "",
      parent_phone: student?.profile?.parent_phone || ""
    });
    setNewPassword(""); // Reset new password
    setShowNewPassword(false); // Reset new password visibility
    setIsEditDialogOpen(true);
  };

  const handleChangePassword = async () => {
    if (!selectedStudent) return;

    if (!newPassword) {
      alert('Please enter a new password');
      return;
    }
    
    // Validate password strength (8+ chars, uppercase, lowercase, number)
    const { validatePasswordClient } = await import('../../../lib/password-validation');
    const passwordError = validatePasswordClient(newPassword);
    if (passwordError) {
      alert(passwordError);
      return;
    }

    setActionLoading('change-password');

    try {
      console.log('🔐 Changing password for student:', selectedStudent?.profile?.email);

      // Use API route to change password
      const response = await fetchWithCsrf(`/api/admin/students/${selectedStudent.profile_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: newPassword,
          change_password: true // Flag to indicate password change
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to change password');
      }

      alert(`Password changed successfully for "${selectedStudent?.profile?.full_name || 'student'}"!\n\nNew password: ${newPassword}\n\nPlease share this password securely with the student.`);
      
      // Reset password field
      setNewPassword("");
      
      // Refresh the student list to get updated data
      await loadStudents();
     
    } catch (error: any) {
      console.error('Error changing password:', error);
      alert(`Failed to change password: ${error.message || 'Please try again.'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const generateNewPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
  };

  const copyNewPassword = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      alert('Password copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy password:', err);
      alert('Failed to copy password to clipboard');
    }
  };

  const handleEditStudent = async () => {
    if (!selectedStudent) return;

    try {
      console.log('✏️ Updating student:', selectedStudent.id);

      // Use API route to update student (uses admin client, bypasses RLS)
      const response = await fetchWithCsrf(`/api/admin/students/${selectedStudent.profile_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          grade: formData.grade,
          joining_code: formData.joining_code || null,
          parent_name: formData.parent_name || null,
          parent_phone: formData.parent_phone || null
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error updating student:', result.error || 'Failed to update student');
        alert(`Failed to update student: ${result.error || 'Please try again.'}`);
        return;
      }

      console.log('✅ Student updated successfully');
      setIsEditDialogOpen(false);
      setSelectedStudent(null);
      await loadStudents();
      alert(`Student "${formData.full_name}" updated successfully!`);
     
    } catch (error: any) {
      console.error('Error updating student:', error);
      alert(`Error updating student: ${error.message || 'Please try again.'}`);
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    if (!confirm(`Are you sure you want to delete student "${student?.profile?.full_name || 'student'}"? This action cannot be undone and will delete all associated data including enrollments, courses, and notifications.`)) {
      return;
    }

    try {
      console.log('🗑️ Deleting student:', student.profile_id);

      // Use API route to delete student (performs cascading delete)
      const response = await fetchWithCsrf(`/api/admin/students/${student.profile_id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error deleting student:', result.error || 'Failed to delete student');
        alert(`Failed to delete student: ${result.error || 'Please try again.'}`);
        return;
      }

      console.log('✅ Student deleted successfully');
      await loadStudents();
      alert(`Student "${student?.profile?.full_name || 'student'}" deleted successfully!`);
     
    } catch (error: any) {
      console.error('Error deleting student:', error);
      alert(`Error deleting student: ${error.message || 'Please try again.'}`);
    }
  };

  const handleResetPassword = async (student: Student) => {
    if (!confirm(`Are you sure you want to reset the password for "${student?.profile?.full_name || 'student'}"? They will need to use the new password to log in.`)) {
      return;
    }

    try {
      console.log('🔐 Resetting password for student:', student.profile_id);

      // Generate a random password
      const newPassword = `TempPass${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

      // Use API route to reset password (uses admin client)
      const response = await fetchWithCsrf(`/api/admin/students/${student.profile_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: newPassword
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error resetting password:', result.error || 'Failed to reset password');
        alert(`Failed to reset password: ${result.error || 'Please try again.'}`);
        return;
      }

      console.log('✅ Password reset successfully');
      alert(`Password reset successfully for "${student?.profile?.full_name || 'student'}"!\n\nNew temporary password: ${newPassword}\n\nPlease share this password securely with the student.`);
     
    } catch (error: any) {
      console.error('Error resetting password:', error);
      alert(`Error resetting password: ${error.message || 'Please try again.'}`);
    }
  };

  const filteredStudents = students.filter((student: any) => {
    const q = (searchTerm || "").toLowerCase();
    const fullName = (student?.profile?.full_name ?? "").toString().toLowerCase();
    const email = (student?.profile?.email ?? "").toString().toLowerCase();
    const matchesSearch = fullName.includes(q) || email.includes(q);
    const matchesGrade = gradeFilter === "all" || student.grade === gradeFilter;
    const matchesStatus = statusFilter === "all" || 
                         (statusFilter === "active" && student.is_active) ||
                         (statusFilter === "inactive" && !student.is_active);
    
    return matchesSearch && matchesGrade && matchesStatus;
  });

  const getGradeOptions = () => {
    const grades = [...new Set(students.map((s: any) => s.grade))].sort();
    return grades;
  };

  const handleExportStudents = () => {
    if (filteredStudents.length === 0) {
      alert('No students to export');
      return;
    }

    // Prepare CSV data
    const headers = ['Name', 'Email', 'Grade', 'Joining Code', 'Status', 'Enrolled Date'];
    const rows = filteredStudents.map((student: any) => [
      student?.profile?.full_name || '',
      student?.profile?.email || '',
      student.grade || '',
      student.joining_code || '',
      student.is_active ? 'Active' : 'Inactive',
      new Date(student.enrolled_at).toLocaleDateString()
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
    link.setAttribute('download', `students_export_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`✅ Exported ${filteredStudents.length} student(s) to CSV`);
  };

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
        <h1 className="text-3xl font-bold text-gray-900">Students Management</h1>
        <p className="text-gray-600 mt-2">Manage student enrollment and information</p>
      </div>

      {/* Filters and Actions */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {getGradeOptions().map((grade: any) => (
                <SelectItem key={grade} value={grade}>Grade {grade}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {filteredStudents.length} of {students.length} students
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportStudents}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Student
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Student</DialogTitle>
                  <DialogDescription>
                    Add a new student to your school. They will receive login credentials.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="full_name" className="text-right">
                      Full Name
                    </Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="grade" className="text-right">
                      Grade
                    </Label>
                    <Select
                      value={formData.grade}
                      onValueChange={(value) => setFormData({...formData, grade: value})}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select grade" />
                      </SelectTrigger>
                      <SelectContent>
                        {(schoolGrades.length > 0 ? schoolGrades : availableGrades).map((grade) => (
                          <SelectItem key={grade} value={grade}>
                            {grade}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="joining_code" className="text-right">
                      Joining Code
                    </Label>
                    <Input
                      id="joining_code"
                      value={formData.joining_code}
                      onChange={(e) => setFormData({...formData, joining_code: e.target.value})}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="password" className="text-right">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="parent_name" className="text-right">
                      Parent Name
                    </Label>
                    <Input
                      id="parent_name"
                      value={formData.parent_name}
                      onChange={(e) => setFormData({...formData, parent_name: e.target.value})}
                      className="col-span-3"
                      placeholder="Enter parent/guardian name"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="parent_phone" className="text-right">
                      Parent Number
                    </Label>
                    <Input
                      id="parent_phone"
                      type="tel"
                      value={formData.parent_phone}
                      onChange={(e) => setFormData({...formData, parent_phone: e.target.value})}
                      className="col-span-3"
                      placeholder="Enter parent/guardian phone"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsAddDialogOpen(false)}
                    disabled={isAddingStudent}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleAddStudent}
                    disabled={isAddingStudent}
                  >
                    {isAddingStudent ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Student
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle>Students List</CardTitle>
          <CardDescription>Manage student information and enrollment status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Parent Name</TableHead>
                <TableHead>Parent Number</TableHead>
                <TableHead>Joining Code</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium">{student?.profile?.full_name || "Unnamed student"}</div>
                        <div className="text-sm text-gray-500">{student?.profile?.email || "No email"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">Grade {student.grade}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {student?.profile?.parent_name || (
                        <span className="text-gray-400 italic">Not provided</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {student?.profile?.parent_phone ? (
                        <a 
                          href={`tel:${student.profile.parent_phone}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {student.profile.parent_phone}
                        </a>
                      ) : (
                        <span className="text-gray-400 italic">Not provided</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                      {student.joining_code}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="h-4 w-4 mr-1" />
                      {new Date(student.enrolled_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={student.is_active ? "default" : "secondary"}>
                      {student.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleViewStudent(student)}
                        title="View student details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleEditStudentClick(student)}
                        title="Edit student"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleDeleteStudent(student)}
                        title="Delete student"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredStudents.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <GraduationCap className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg font-medium">No students found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Student Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Details</DialogTitle>
            <DialogDescription>
              View detailed information about the student
            </DialogDescription>
          </DialogHeader>
          {viewingStudent && (
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Full Name</Label>
                  <p className="text-base font-medium">{viewingStudent?.profile?.full_name || "Unnamed student"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Email</Label>
                  <p className="text-base">{viewingStudent?.profile?.email || "No email"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Student ID</Label>
                  <p className="text-base font-mono text-sm">{viewingStudent.id}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Grade</Label>
                  <Badge variant="outline">Grade {viewingStudent.grade}</Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Joining Code</Label>
                  <p className="text-base font-mono text-sm">{viewingStudent.joining_code || 'Not provided'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <Badge variant={viewingStudent.is_active ? "default" : "secondary"}>
                    {viewingStudent.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Enrolled Date</Label>
                  <p className="text-base">{new Date(viewingStudent.enrolled_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Created At</Label>
                  <p className="text-base">
                    {viewingStudent?.profile?.created_at
                      ? new Date(viewingStudent.profile.created_at).toLocaleDateString()
                      : "Unknown"}
                  </p>
                </div>
              </div>

              {/* Parent Information */}
              {(viewingStudent?.profile?.parent_name || viewingStudent?.profile?.parent_phone) && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-3">Parent/Guardian Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {viewingStudent?.profile?.parent_name && (
                      <div>
                        <Label className="text-sm font-medium text-gray-500">Parent Name</Label>
                        <p className="text-base">{viewingStudent.profile.parent_name}</p>
                      </div>
                    )}
                    {viewingStudent?.profile?.parent_phone && (
                      <div>
                        <Label className="text-sm font-medium text-gray-500">Parent Phone</Label>
                        <p className="text-base">
                          <a 
                            href={`tel:${viewingStudent.profile.parent_phone}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {viewingStudent.profile.parent_phone}
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Student Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) {
          setSelectedStudent(null);
          setNewPassword(""); // Reset new password
          setShowNewPassword(false); // Reset new password visibility
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
            <DialogDescription>
              Update student information and enrollment details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_full_name" className="text-right">
                Full Name
              </Label>
              <Input
                id="edit_full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_email" className="text-right">
                Email
              </Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Change Password
              </Label>
              <div className="col-span-3 space-y-2">
                <p className="text-xs text-gray-500">
                  Use this to reset the password if the student has forgotten it. A new password will be generated and assigned.
                </p>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="new_password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8: uppercase, lowercase, number)"
                    className="pl-10 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={generateNewPassword}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Generate
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={copyNewPassword}
                    disabled={!newPassword}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={!newPassword || newPassword.length < 8 || actionLoading === 'change-password'}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {actionLoading === 'change-password' ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-3 w-3" />
                        Change Password
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_grade" className="text-right">
                Grade
              </Label>
              <Select
                value={formData.grade}
                onValueChange={(value) => setFormData({...formData, grade: value})}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {(schoolGrades.length > 0 ? schoolGrades : availableGrades).map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_joining_code" className="text-right">
                Joining Code
              </Label>
              <Input
                id="edit_joining_code"
                value={formData.joining_code}
                onChange={(e) => setFormData({...formData, joining_code: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_parent_name" className="text-right">
                Parent Name
              </Label>
              <Input
                id="edit_parent_name"
                value={formData.parent_name}
                onChange={(e) => setFormData({...formData, parent_name: e.target.value})}
                className="col-span-3"
                placeholder="Enter parent/guardian name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_parent_phone" className="text-right">
                Parent Number
              </Label>
              <Input
                id="edit_parent_phone"
                type="tel"
                value={formData.parent_phone}
                onChange={(e) => setFormData({...formData, parent_phone: e.target.value})}
                className="col-span-3"
                placeholder="Enter parent/guardian phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditStudent}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


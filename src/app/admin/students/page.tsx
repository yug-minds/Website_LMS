"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { useAutoSaveForm } from "../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../lib/form-persistence";
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "../../../components/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../../../components/ui/table";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "../../../components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "../../../components/ui/select";
import { fetchWithCsrf } from '../../../lib/csrf-client';
import { Checkbox } from "../../../components/ui/checkbox";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  EyeOff, 
  Upload, 
  Download,
  Users,
  Search,
  Filter,
  School,
  BookOpen,
  GraduationCap,
  FileSpreadsheet,
  X,
  Loader2,
  CheckCircle,
  Circle,
  RefreshCw,
  Copy,
  Shield
} from "lucide-react";

interface Student {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
   
  student_schools?: any[];
   
  courses?: any[];
   
  student_courses?: any[];
  progress?: number;
}

interface BulkImportData {
  id?: string; // Temporary ID for tracking
  student_name: string;
  father_name?: string;
  phone_number?: string;
  grade: string;
  school_id?: string; // Will be populated after school selection
  school_name?: string; // For display
  email?: string; // To be assigned
  password?: string; // To be assigned
  status?: 'pending' | 'success' | 'error';
  error?: string;
}

export default function StudentsManagement() {
  const [students, setStudents] = useState<Student[]>([]);
   
  const [schools, setSchools] = useState<any[]>([]);
  const [studentProgressSummary, setStudentProgressSummary] = useState<{
    average_system_progress: number;
    students_completed: number;
  }>({ average_system_progress: 0, students_completed: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkImportDialogOpen, setIsBulkImportDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [isUpdatingStudent, setIsUpdatingStudent] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [addStudentError, setAddStudentError] = useState<string | null>(null);
  const [updateStudentError, setUpdateStudentError] = useState<string | null>(null);
  const [exportSelectedSchools, setExportSelectedSchools] = useState<string[]>([]);
  const [exportSelectedGrades, setExportSelectedGrades] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  
  // Load saved form data (excluding password for security)
  const savedFormData = typeof window !== 'undefined'
    ? loadFormData<{
        full_name: string;
        email: string;
        school_id: string;
        grade: string;
        parent_name: string;
        parent_phone: string;
      }>('admin-students-form')
    : null;

  const [formData, setFormData] = useState({
    full_name: savedFormData?.full_name || "",
    email: savedFormData?.email || "",
    password: "", // Never save password
    school_id: savedFormData?.school_id || "",
    grade: savedFormData?.grade || "",
    parent_name: savedFormData?.parent_name || "",
    parent_phone: savedFormData?.parent_phone || ""
  });

  // Auto-save student form (excluding password)
  const { isDirty: isFormDirty, clearSavedData } = useAutoSaveForm({
    formId: 'admin-students-form',
    formData: {
      full_name: formData.full_name,
      email: formData.email,
      school_id: formData.school_id,
      grade: formData.grade,
      parent_name: formData.parent_name,
      parent_phone: formData.parent_phone,
      // Intentionally exclude password
    },
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && !savedFormData) {
        setFormData(prev => ({
          ...prev,
          full_name: data.full_name || prev.full_name,
          email: data.email || prev.email,
          school_id: data.school_id || prev.school_id,
          grade: data.grade || prev.grade,
          parent_name: data.parent_name || prev.parent_name,
          parent_phone: data.parent_phone || prev.parent_phone,
        }));
      }
    },
    markDirty: true,
  });
  const [bulkData, setBulkData] = useState<BulkImportData[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);
  const [bulkImportResults, setBulkImportResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [defaultPassword, setDefaultPassword] = useState<string>('TempPass123!');
  const [showDefaultPassword, setShowDefaultPassword] = useState(false);
  const [showStudentPasswords, setShowStudentPasswords] = useState<Record<string, boolean>>({});
  const [selectedSchoolForImport, setSelectedSchoolForImport] = useState<string>('');
  const [emailDomain, setEmailDomain] = useState<string>(''); // Email domain like @rosebuds.edu
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Standard available grades from Pre-K to Grade 12
  const availableGrades = [
    'Pre-K', 'Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
  ];

  useEffect(() => {
    loadData();
  }, []);

  // When a school is selected for bulk import, reflect it in preview rows
  useEffect(() => {
    if (!selectedSchoolForImport) return;
    if (!bulkData || bulkData.length === 0) return;
    const schoolName = schools.find((s: any) => s.id === selectedSchoolForImport)?.name || '';
    setBulkData((prev) =>
      prev.map((item: any) => ({
        ...item,
        school_id: selectedSchoolForImport,
        school_name: item.school_name && String(item.school_name).trim() !== '' ? item.school_name : schoolName,
      }))
    );
  }, [selectedSchoolForImport, schools]);

  // Removed automatic test student creation to prevent continuous loading
  // Students should be added manually through the "Add Student" button or bulk import

  const loadData = async () => {
    try {
      // Load students via API route (bypasses RLS)
      try {
        const studentsResponse = await fetchWithCsrf('/api/admin/students?limit=1000', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        if (studentsResponse.ok) {
          const studentsData = await studentsResponse.json();
          const loadedStudents = studentsData.students || [];
          console.log('✅ Students loaded via API:', loadedStudents.length);
          
          // Transform to match expected format
           
          const transformedStudents = loadedStudents.map((student: any) => ({
            ...student,
            student_schools: student.student_schools || [],
            student_courses: [],
            progress: 0
          }));
          
          setStudents(transformedStudents);
        } else {
          throw new Error('API response not ok');
        }
      } catch (apiError) {
        console.error('Error loading students via API:', apiError);
        // Don't fallback to direct Supabase - rely on API routes only
        setStudents([]);
      }

      // Load student progress summary (real data; no dummy values)
      try {
        const progressResponse = await fetchWithCsrf('/api/admin/student-progress?limit=1000', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          const summary = progressData?.summary || {};
          setStudentProgressSummary({
            average_system_progress: Number(summary.average_system_progress || 0),
            students_completed: Number(summary.students_completed || 0),
          });
        } else {
          setStudentProgressSummary({ average_system_progress: 0, students_completed: 0 });
        }
      } catch (e) {
        console.error('Error loading student progress summary:', e);
        setStudentProgressSummary({ average_system_progress: 0, students_completed: 0 });
      }

      // Load schools - try API first, then direct Supabase
      try {
        const schoolsResponse = await fetchWithCsrf('/api/admin/schools', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        if (schoolsResponse.ok) {
          const schoolsData = await schoolsResponse.json();
          const loadedSchools = schoolsData.schools || [];
          console.log('✅ Schools loaded via API:', loadedSchools.length);
          setSchools(loadedSchools);
          
          // If no schools found, create test schools
          if (loadedSchools.length === 0) {
            console.log('⚠️ No schools found, will create test schools');
          }
        } else {
          throw new Error('API response not ok');
        }
      } catch (apiError) {
        console.error('Error loading schools via API:', apiError);
        // Don't fallback to direct Supabase - rely on API routes only
        setSchools([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setStudents([]);
      setSchools([]);
    }
  };

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: loadData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
    hasUnsavedData: () => {
      // Check if any dialog is open (indicating unsaved changes)
      // Also check if form has unsaved data via Zustand store
      return isDialogOpen || isBulkImportDialogOpen || isEditDialogOpen || isFormDirty;
    },
  });

  const handleAddStudent = async () => {
    // Validate required fields
    if (!formData.full_name || !formData.email || !formData.password) {
      setAddStudentError('Please fill in all required fields (Name, Email, Password)');
      return;
    }

    if (!formData.school_id) {
      setAddStudentError('Please select a school');
      return;
    }

    setIsAddingStudent(true);
    setAddStudentError(null);

    try {
      // Use API route to create student (bypasses RLS and uses admin client)
      const response = await fetchWithCsrf('/api/admin/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          password: formData.password,
          school_id: formData.school_id,
          grade: formData.grade || 'Not Specified',
          parent_name: formData.parent_name || null,
          parent_phone: formData.parent_phone || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create student');
      }

      // Clear saved form data after successful submission
      clearFormData('admin-students-form');
      clearSavedData();

      // Success - reset form and close dialog
      setIsDialogOpen(false);
      setFormData({ full_name: "", email: "", password: "", school_id: "", grade: "", parent_name: "", parent_phone: "" });
      setAddStudentError(null);
      
      // Reload students list
      await loadData();
      
      console.log('✅ Student created successfully:', data.student);
     
    } catch (error: any) {
      console.error('Error adding student:', error);
      setAddStudentError(error.message || 'Failed to create student. Please try again.');
    } finally {
      setIsAddingStudent(false);
    }
  };

  const handleViewStudent = (student: Student) => {
    setViewingStudent(student);
    setIsViewDialogOpen(true);
  };

  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);
    // Set form data for editing
    const schoolAssignment = student.student_schools?.[0];
    setFormData({
      full_name: student.full_name || "",
      email: student.email || "",
      password: "", // Don't pre-fill password
      school_id: schoolAssignment?.school_id || "",
      grade: schoolAssignment?.grade || "",
       
      parent_name: (student as any).parent_name || "",
       
      parent_phone: (student as any).parent_phone || ""
    });
    setNewPassword(""); // Reset new password
    setShowNewPassword(false); // Reset new password visibility
    setIsEditDialogOpen(true);
  };

  const handleDeleteStudent = async (student: Student) => {
    if (!confirm(`Are you sure you want to delete student "${student.full_name}"? This action cannot be undone and will delete all associated data including enrollments, courses, and notifications.`)) {
      return;
    }

    try {
      const response = await fetchWithCsrf(`/api/admin/students/${student.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Error deleting student:', data.error);
        alert(`Failed to delete student: ${data.error || 'Please try again.'}`);
        return;
      }

      // Remove from local state
      setStudents(prev => prev.filter((s: any) => s.id !== student.id));
      alert(`Student "${student.full_name}" deleted successfully!`);
    } catch (error) {
      console.error('Error deleting student:', error);
      alert('Failed to delete student. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    if (!editingStudent) return;

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
    setUpdateStudentError(null);

    try {
      const response = await fetchWithCsrf(`/api/admin/students/${editingStudent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: newPassword,
          change_password: true // Flag to indicate password change
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      alert(`Password changed successfully for "${editingStudent.full_name}"!\n\nNew password: ${newPassword}\n\nPlease share this password securely with the student.`);
      
      // Reset password field
      setNewPassword("");
      
      // Refresh the student list to get updated data
      await loadData();
     
    } catch (error: any) {
      console.error('Error changing password:', error);
      setUpdateStudentError(error.message || 'Failed to change password. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const generateNewPassword = () => {
    // Generate password that meets requirements: 8+ chars, uppercase, lowercase, number
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const allChars = uppercase + lowercase + numbers + special;
    
    let password = '';
    // Ensure at least one of each required type
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    
    // Fill the rest randomly (minimum 8 chars total, generate 12 for better security)
    for (let i = password.length; i < 12; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    
    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');
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

  const handleUpdateStudent = async () => {
    if (!editingStudent) return;

    // Validate required fields
    if (!formData.full_name || !formData.email) {
      setUpdateStudentError('Please fill in all required fields (Name, Email)');
      return;
    }

    if (!formData.school_id) {
      setUpdateStudentError('Please select a school');
      return;
    }

    // Validate school_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(formData.school_id)) {
      console.error('Invalid school_id format:', formData.school_id);
      setUpdateStudentError(`Invalid school selected. Please select a valid school. (ID: ${formData.school_id})`);
      return;
    }

    // Verify selected school exists in schools list
    const selectedSchool = schools.find((s: any) => s.id === formData.school_id);
    if (!selectedSchool) {
      console.error('Selected school not found in schools list:', formData.school_id);
      setUpdateStudentError('Selected school not found. Please select a valid school.');
      return;
    }

    setIsUpdatingStudent(true);
    setUpdateStudentError(null);

    try {
      // Update student profile via API (exclude password from regular updates)
      const response = await fetchWithCsrf(`/api/admin/students/${editingStudent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          school_id: formData.school_id,
          grade: formData.grade || 'Not Specified',
          parent_name: formData.parent_name || null,
          parent_phone: formData.parent_phone || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update student');
      }

      // Success - reset form and close dialog
      setIsEditDialogOpen(false);
      setEditingStudent(null);
      setFormData({ full_name: "", email: "", password: "", school_id: "", grade: "", parent_name: "", parent_phone: "" });
      setNewPassword(""); // Reset new password
      setShowNewPassword(false); // Reset new password visibility
      setUpdateStudentError(null);
      
      // Reload students list
      await loadData();
      
      console.log('✅ Student updated successfully:', data.student);
     
    } catch (error: any) {
      console.error('Error updating student:', error);
      setUpdateStudentError(error.message || 'Failed to update student. Please try again.');
    } finally {
      setIsUpdatingStudent(false);
    }
  };

  const handleBulkImport = async () => {
    if (bulkData.length === 0) {
      setBulkImportError('No data to import. Please upload a file first.');
      return;
    }

    if (!selectedSchoolForImport) {
      setBulkImportError('Please select a school for all students.');
      return;
    }

    // Validate all required fields
    const invalidRows = bulkData.filter((item: any) => 
      !item.student_name || !item.grade || !item.email || !item.password
    );

    if (invalidRows.length > 0) {
      setBulkImportError(`${invalidRows.length} row(s) are missing required fields. Please fill in all required fields.`);
      return;
    }

    setIsBulkImporting(true);
    setBulkImportError(null);
    setBulkImportResults(null);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // Process students in batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < bulkData.length; i += batchSize) {
        const batch = bulkData.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (student) => {
            try {
              // Use API route to create student (duplicate check is handled server-side)
              const response = await fetchWithCsrf('/api/admin/students', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  full_name: student.student_name,
                  email: student.email,
                  password: student.password,
                  school_id: selectedSchoolForImport,
                  grade: student.grade,
                  phone: student.phone_number || null,
                  parent_name: student.father_name || null
                }),
              });

              const data = await response.json();

              if (!response.ok) {
                const msg = data.message || data.error || 'Failed to create student';
                const details = Array.isArray(data.details)
                  ? data.details.map((d: any) => (typeof d === 'string' ? d : `${d.path?.join('.') || 'field'}: ${d.message}`)).join('; ')
                  : (typeof data.details === 'string' ? data.details : '');
                throw new Error(details ? `${msg}: ${details}` : msg);
              }

              results.success++;
             
            } catch (error: any) {
              results.failed++;
              results.errors.push(`${student.student_name}: ${error.message || 'Unknown error'}`);
              console.error(`Error importing ${student.student_name}:`, error);
            }
          })
        );
      }

      setBulkImportResults(results);

      // Reload data after successful import
      if (results.success > 0) {
        await loadData();
      }

      // Show results
      if (results.success > 0) {
        alert(`Successfully imported ${results.success} student(s). ${results.failed > 0 ? `${results.failed} failed.` : ''}`);
      } else {
        alert(`Failed to import students. ${results.errors.length > 0 ? `Errors: ${results.errors.slice(0, 3).join(', ')}` : ''}`);
      }
     
    } catch (error: any) {
      console.error('Error bulk importing students:', error);
      setBulkImportError(`Bulk import error: ${error.message}`);
    } finally {
      setIsBulkImporting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    setUploadFile(file);
    setBulkImportError(null);
    setBulkImportResults(null);
    setIsParsingFile(true);

    try {
      let parsedData: BulkImportData[] = [];

      if (fileExtension === 'csv') {
        const normalizeKey = (k: string) => String(k || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        const getValue = (row: Record<string, any>, candidates: string[]) => {
          const byNormalized: Record<string, any> = {};
          Object.keys(row || {}).forEach((key) => {
            byNormalized[normalizeKey(key)] = row[key];
          });
          for (const c of candidates) {
            const v = byNormalized[normalizeKey(c)];
            if (v !== undefined && v !== null) return String(v).trim();
          }
          return '';
        };

        // Parse CSV using PapaParse
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results: any) => {
            try {
              const rows = (results?.data || []) as Array<Record<string, any>>;

              parsedData = rows.map((row: any, index: number) => {
                // Flexible column mapping (case-insensitive, ignores spaces/underscores/dashes)
                const studentName = getValue(row, ['Student Name', 'student_name', 'StudentName', 'Name', 'Full Name', 'full_name']);
                const fatherName = getValue(row, ['Father Name', 'father_name', 'Father', 'Parent Name', 'parent_name']);
                const phoneNumber = getValue(row, ['Phone Number', 'phone_number', 'Phone', 'phone', 'Contact', 'contact']);
                const grade = getValue(row, ['Grade', 'grade', 'Class', 'class', 'Level', 'level']);
                const schoolName = getValue(row, ['School', 'school', 'School Name', 'school_name', 'SchoolName']);
                const selectedSchoolName = selectedSchoolForImport
                  ? (schools.find((s: any) => s.id === selectedSchoolForImport)?.name || '')
                  : '';

                return {
                  id: `temp-${index}`,
                  student_name: studentName,
                  father_name: fatherName,
                  phone_number: phoneNumber,
                  grade: grade,
                  school_name: schoolName || selectedSchoolName,
                  status: 'pending'
                } as BulkImportData;
              });

              const validData = parsedData.filter((item: BulkImportData) =>
                Boolean(item.student_name && item.student_name.trim() !== '' && item.grade && item.grade.trim() !== '')
              );

              if (validData.length === 0) {
                const headerFields = Array.isArray(results?.meta?.fields) ? results.meta.fields : [];
                setBulkData([]);
                setBulkImportError(
                  `No valid rows found in CSV. Ensure it has columns like "Student Name" and "Grade" and at least one row with values.\nDetected headers: ${headerFields.join(', ') || '(none)'}`
                );
              } else {
                setBulkData(validData);
                setBulkImportError(null);
              }
            } finally {
              setIsParsingFile(false);
              // Allow re-selecting the same file again
              event.target.value = '';
            }
          },
          error: (error: any) => {
            setBulkImportError(`Error parsing CSV: ${error.message || 'Unknown error'}`);
            setIsParsingFile(false);
            // Allow re-selecting the same file again
            event.target.value = '';
          }
        });
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Parse Excel using ExcelJS (secure alternative to xlsx)
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = new ExcelJS.Workbook();
            
            // Load workbook from buffer
            const buffer = data instanceof Uint8Array 
              ? Buffer.from(data.buffer || data as unknown as ArrayBufferLike) 
              : Buffer.from(data as unknown as ArrayBufferLike);
             
            await workbook.xlsx.load(buffer as any);
            
            if (!workbook.worksheets || workbook.worksheets.length === 0) {
              setBulkImportError('Excel file appears to be empty or invalid. Please check the file and try again.');
              setIsParsingFile(false);
              return;
            }
            
            // Get first worksheet
            const worksheet = workbook.worksheets[0];
            
            if (!worksheet) {
              setBulkImportError('Could not read worksheet from Excel file. Please check the file format.');
              setIsParsingFile(false);
              return;
            }
            
            // Convert worksheet to JSON
             
            const jsonData: any[] = [];
            const columnNames: string[] = [];
            
            // Get headers from first row
            const headerRow = worksheet.getRow(1);
            if (headerRow && headerRow.cellCount > 0) {
              headerRow.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
                const headerValue = cell.value?.toString() || '';
                if (headerValue) {
                  columnNames.push(headerValue);
                }
              });
            }
            
            // Process data rows (skip header row)
            worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
              if (rowNumber === 1) return; // Skip header row
              
               
              const rowData: any = {};
              row.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
                const headerName = columnNames[colNumber - 1] || `Column${colNumber}`;
                const cellValue = cell.value;
                // Handle different cell value types
                if (cellValue !== null && cellValue !== undefined) {
                  if (typeof cellValue === 'object' && 'text' in cellValue) {
                     
                    rowData[headerName] = (cellValue as any).text;
                  } else {
                    rowData[headerName] = cellValue.toString();
                  }
                } else {
                  rowData[headerName] = '';
                }
              });
              
              if (Object.keys(rowData).length > 0) {
                jsonData.push(rowData);
              }
            });
            
            if (!jsonData || jsonData.length === 0) {
              setBulkImportError('No data found in Excel file. Please ensure the file contains student data with headers.');
              console.log('Excel file parsed but no data found. Sheet names:', workbook.worksheets.map((ws: any) => ws.name));
              setIsParsingFile(false);
              return;
            }

            console.log('Excel data parsed:', jsonData.slice(0, 3)); // Log first 3 rows for debugging
            console.log('Detected columns:', columnNames);

             
            parsedData = jsonData.map((row: any, index: number) => {
              // Flexible column mapping for Excel - try multiple variations
              const studentName = row['Student Name'] || row['student_name'] || row['StudentName'] || row['Name'] || row['name'] || row['Full Name'] || row['full_name'] || '';
              const fatherName = row['Father Name'] || row['father_name'] || row['FatherName'] || row['Father'] || row['father'] || row['Parent Name'] || row['parent_name'] || '';
              const phoneNumber = row['Phone Number'] || row['phone_number'] || row['PhoneNumber'] || row['Phone'] || row['phone'] || row['Contact'] || row['contact'] || '';
              const grade = row['Grade'] || row['grade'] || row['Class'] || row['class'] || row['Level'] || row['level'] || '';
              const schoolName = row['School'] || row['school'] || row['School Name'] || row['school_name'] || row['SchoolName'] || '';
              const selectedSchoolName = selectedSchoolForImport
                ? (schools.find((s: any) => s.id === selectedSchoolForImport)?.name || '')
                : '';
              
              return {
                id: `temp-${index}`,
                student_name: studentName,
                father_name: fatherName,
                phone_number: phoneNumber,
                grade: grade,
                school_name: schoolName || selectedSchoolName,
                status: 'pending'
              } as BulkImportData;
            });

            // Filter out rows where required fields are missing
            const validData = parsedData.filter((item: BulkImportData) => {
              const isValid = item.student_name && item.student_name.trim() !== '' && item.grade && item.grade.trim() !== '';
              if (!isValid) {
                console.log('Filtered out row:', item);
              }
              return isValid;
            });

            if (validData.length === 0) {
              setBulkImportError(`No valid rows found in Excel file. Please ensure the file contains columns: "Student Name" (or "Name") and "Grade". Found columns: ${columnNames.join(', ')}`);
              console.error('All rows were filtered out. Original data length:', parsedData.length);
              setIsParsingFile(false);
              return;
            }

            console.log(`Successfully parsed ${validData.length} student(s) from ${parsedData.length} row(s)`);
            setBulkData(validData);
            setBulkImportError(null); // Clear any previous errors
            setIsParsingFile(false);
           
          } catch (error: any) {
            console.error('Error parsing Excel file:', error);
            setBulkImportError(`Error parsing Excel file: ${error.message || 'Unknown error occurred. Please check the file format and try again.'}`);
            setIsParsingFile(false);
          }
        };
        
        reader.onerror = () => {
          setBulkImportError('Failed to read Excel file. Please try again or use a different file.');
          setIsParsingFile(false);
        };
        
        reader.readAsArrayBuffer(file);
      } else if (fileExtension === 'pdf') {
        // PDF parsing - For now, show message that PDF parsing is not fully supported
        setBulkImportError('PDF parsing is not fully supported. Please use CSV or Excel (.xlsx/.xls) format.');
        return;
      } else {
        setBulkImportError(`Unsupported file format: ${fileExtension}. Please use CSV, XLSX, or XLS.`);
        return;
      }
     
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setBulkImportError(`Error uploading file: ${error.message}`);
    }
  };

  const handleEditBulkData = (id: string, field: keyof BulkImportData, value: string) => {
    setBulkData(prevData => 
      prevData.map((item: any) => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleDeleteBulkDataRow = (id: string) => {
    setBulkData(prevData => prevData.filter((item: any) => item.id !== id));
  };

  const assignEmailsAndPasswords = () => {
    // Get the email domain (ensure it starts with @ if provided, or use school name)
    let domain = emailDomain.trim();
    if (domain && !domain.startsWith('@')) {
      domain = `@${domain}`;
    }
    
    // If no domain provided, use school name as fallback
    if (!domain && selectedSchoolForImport) {
      const schoolName = schools.find((s: any) => s.id === selectedSchoolForImport)?.name?.toLowerCase().replace(/\s+/g, '') || 'school';
      domain = `@${schoolName}.edu`;
    } else if (!domain) {
      domain = '@school.edu';
    }

    const updatedData = bulkData.map((item, index) => {
      let email = item.email;
      let password = item.password || defaultPassword;

      // Generate email using student name + domain (individual assignment mode)
      if (!email) {
        // Create email from student name: "John Smith" -> "smith" (last name only)
        const nameParts = item.student_name.trim().toLowerCase().split(/\s+/);
        // Use last name only (more common for school emails)
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
        email = `${lastName}${domain}`;
      }
      if (!password) {
        password = defaultPassword;
      }

      return { ...item, email, password };
    });

    setBulkData(updatedData);
  };

  const downloadSampleCSV = () => {
    // Sample CSV data with headers + 10 example rows (template)
    const sampleData = [
      ['Student Name', 'Father Name', 'Phone Number', 'Grade'],
      ['Aarav Sharma', 'Rohit Sharma', '+919876543210', 'Grade 6'],
      ['Anaya Patel', 'Vivek Patel', '+919876543211', 'Grade 7'],
      ['Vihaan Reddy', 'Suresh Reddy', '+919876543212', 'Grade 8'],
      ['Diya Gupta', 'Amit Gupta', '+919876543213', 'Grade 5'],
      ['Arjun Singh', 'Raj Singh', '+919876543214', 'Grade 9'],
      ['Ishita Nair', 'Manoj Nair', '+919876543215', 'Grade 4'],
      ['Reyansh Iyer', 'Kiran Iyer', '+919876543216', 'Grade 10'],
      ['Meera Das', 'Sanjay Das', '+919876543217', 'Grade 3'],
      ['Kabir Khan', 'Imran Khan', '+919876543218', 'Grade 11'],
      ['Saanvi Joshi', 'Nitin Joshi', '+919876543219', 'Grade 12'],
    ];

    // Convert to CSV format
    const csvContent = sampleData.map((row: any) => {
      // Escape quotes and wrap in quotes if contains comma
      return row.map((cell: any) => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',');
    }).join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student_import_sample.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };


  const generateLoginCredentials = async () => {
    setIsExporting(true);
    try {
      // Filter students based on selected schools and grades
      const filteredStudentsForExport = students.filter((student: any) => {
        // School filter
        const matchesSchool = exportSelectedSchools.length === 0 || 
           
          student.student_schools?.some((ss: any) => exportSelectedSchools.includes(ss.school_id));
        
        // Grade filter
        const matchesGrade = exportSelectedGrades.length === 0 ||
           
          student.student_schools?.some((ss: any) => exportSelectedGrades.includes(ss.grade));
        
        return matchesSchool && matchesGrade;
      });

      // Generate credentials with school and grade info
      const credentials = filteredStudentsForExport.map((student: any) => {
        const schoolAssignment = student.student_schools?.[0];
        return {
          name: student.full_name,
          email: student.email,
          password: 'temp123', // Default password - in production, you'd need to retrieve actual passwords
          school: schoolAssignment?.schools?.name || 'N/A',
          grade: schoolAssignment?.grade || 'N/A'
        };
      });

      if (credentials.length === 0) {
        alert('No students found matching the selected criteria.');
        setIsExportDialogOpen(false);
        setIsExporting(false);
        return;
      }

      // Generate filename based on filters
      let filename = 'student_credentials';
      if (exportSelectedSchools.length > 0) {
        const schoolNames = exportSelectedSchools
          .map((id: any) => schools.find((s: any) => s.id === id)?.name || id)
          .join('_');
        filename += `_${schoolNames.replace(/\s+/g, '_')}`;
      }
      if (exportSelectedGrades.length > 0) {
        filename += `_${exportSelectedGrades.join('_').replace(/\s+/g, '_')}`;
      }

      if (exportFormat === 'csv') {
        // Create CSV content
        const csvContent = [
          'Name,Email,Password,School,Grade',
          ...credentials.map((c: any) => `"${c.name}","${c.email}","${c.password}","${c.school}","${c.grade}"`)
        ].join('\n');

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else if (exportFormat === 'pdf') {
        // Create PDF using HTML to PDF conversion
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 20px;
              }
              h1 {
                color: #2563eb;
                border-bottom: 2px solid #2563eb;
                padding-bottom: 10px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
              }
              th {
                background-color: #2563eb;
                color: white;
                padding: 12px;
                text-align: left;
                border: 1px solid #1e40af;
              }
              td {
                padding: 10px;
                border: 1px solid #e5e7eb;
              }
              tr:nth-child(even) {
                background-color: #f9fafb;
              }
              .summary {
                margin-top: 20px;
                padding: 15px;
                background-color: #eff6ff;
                border-left: 4px solid #2563eb;
              }
            </style>
          </head>
          <body>
            <h1>Student Credentials Export</h1>
            <div class="summary">
              <p><strong>Total Students:</strong> ${credentials.length}</p>
              <p><strong>Schools:</strong> ${exportSelectedSchools.length === 0 ? 'All Schools' : exportSelectedSchools.map((id: any) => schools.find((s: any) => s.id === id)?.name).filter(Boolean).join(', ')}</p>
              <p><strong>Grades:</strong> ${exportSelectedGrades.length === 0 ? 'All Grades' : exportSelectedGrades.join(', ')}</p>
              <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Password</th>
                  <th>School</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                ${credentials.map((c, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${c.name}</td>
                    <td>${c.email}</td>
                    <td>${c.password}</td>
                    <td>${c.school}</td>
                    <td>${c.grade}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
          </html>
        `;

        // Create a hidden iframe to generate PDF
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();
          
          // Wait for content to load, then print/save as PDF
          setTimeout(() => {
            iframe.contentWindow?.print();
            // Clean up after a delay
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
      }

      // Close dialog and reset filters
      setIsExportDialogOpen(false);
      setExportSelectedSchools([]);
      setExportSelectedGrades([]);
      setExportFormat('csv');
      
      alert(`Successfully exported ${credentials.length} student credentials as ${exportFormat.toUpperCase()}.`);
    } catch (error) {
      console.error('Error generating credentials:', error);
      alert('Failed to export credentials. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenExportDialog = () => {
    // If no filters are set, show dialog; otherwise export directly
    if (exportSelectedSchools.length === 0 && exportSelectedGrades.length === 0) {
      setIsExportDialogOpen(true);
    } else {
      generateLoginCredentials();
    }
  };

  const handleSchoolToggle = (schoolId: string) => {
    setExportSelectedSchools(prev => {
      if (prev.includes(schoolId)) {
        return prev.filter((id: any) => id !== schoolId);
      } else {
        return [...prev, schoolId];
      }
    });
  };

  const handleGradeToggle = (grade: string) => {
    setExportSelectedGrades(prev => {
      if (prev.includes(grade)) {
        return prev.filter((g: any) => g !== grade);
      } else {
        return [...prev, grade];
      }
    });
  };

  // Get all unique grades from students
  const getAllGrades = () => {
    const grades = new Set<string>();
    students.forEach(student => {
       
      student.student_schools?.forEach((ss: any) => {
        if (ss.grade) grades.add(ss.grade);
      });
    });
    return Array.from(grades).sort((a: any, b: any) => {
      // Sort grades naturally (Grade 1, Grade 2, etc.)
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  };

  // Filter students by school and search term
  const filteredStudents = students.filter((student: any) => {
    // School filter
    const matchesSchool = schoolFilter === "all" || 
       
      student.student_schools?.some((assignment: any) => 
        assignment.school_id === schoolFilter
      );

    // Grade filter
    const matchesGrade = gradeFilter === "all" ||
      student.student_schools?.some((assignment: any) =>
        String(assignment.grade || '').trim() === gradeFilter
      );
    
    // Search filter (name only)
    const matchesSearch = !searchTerm.trim() || 
      student.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSchool && matchesGrade && matchesSearch;
  });

  // Clear all filters
  const clearFilters = () => {
    setSchoolFilter("all");
    setGradeFilter("all");
    setSearchTerm("");
  };

  // Real-time derived stats (no dummy values)
  const activeSchoolsWithStudents = (() => {
    const ids = new Set<string>();
    for (const s of students) {
      for (const ss of (s.student_schools || [])) {
        if (ss?.school_id) ids.add(String(ss.school_id));
      }
    }
    return ids.size;
  })();

  return (
    <div className="p-8 bg-white min-h-screen">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Students Management</h1>
            <p className="text-gray-600 mt-2">Manage student accounts, enrollment, and progress</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{students.length}</div>
                <p className="text-xs text-muted-foreground">Enrolled students</p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
                <School className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeSchoolsWithStudents}</div>
                <p className="text-xs text-muted-foreground">With enrolled students</p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Progress</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{studentProgressSummary.average_system_progress}%</div>
                <p className="text-xs text-muted-foreground">Average course progress</p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Graduated</CardTitle>
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{studentProgressSummary.students_completed}</div>
                <p className="text-xs text-muted-foreground">Completed all courses</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="students" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="students">Students</TabsTrigger>
              <TabsTrigger value="import">Bulk Import</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>

            {/* Students Tab */}
            <TabsContent value="students" className="space-y-6">
              {/* Filters and Actions Bar */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  {/* Action Buttons - Moved to Left */}
                  <div className="flex space-x-2 shrink-0">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          onClick={() => {
                            setEditingStudent(null);
                            setFormData({ full_name: "", email: "", password: "", school_id: "", grade: "", parent_name: "", parent_phone: "" });
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Student
                        </Button>
                      </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] bg-white">
                      <DialogHeader>
                        <DialogTitle>Add New Student</DialogTitle>
                        <DialogDescription>
                          Create a new student account and assign to school
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="full_name">Full Name</Label>
                          <Input
                            id="full_name"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            placeholder="Enter full name"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="Enter email"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="password">Temporary Password</Label>
                          <Input
                            id="password"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            placeholder="Enter temporary password"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="school_id">School <span className="text-red-500">*</span></Label>
                          {schools.length === 0 ? (
                            <div className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 text-sm flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading schools...
                            </div>
                          ) : (
                            <Select
                              value={formData.school_id || undefined}
                              onValueChange={(value) => setFormData({ ...formData, school_id: value })}
                            >
                              <SelectTrigger id="school_id" className="w-full">
                                <SelectValue placeholder="Select school" />
                              </SelectTrigger>
                              <SelectContent className="bg-white">
                                {schools.map((school) => (
                                  <SelectItem key={school.id} value={school.id}>
                                    {school.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {schools.length === 0 && (
                            <p className="text-xs text-amber-600 flex items-center gap-1">
                              <School className="h-3 w-3" />
                              No schools available. Please add schools first.
                            </p>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="grade">Grade</Label>
                          <Select
                            value={formData.grade || undefined}
                            onValueChange={(value) => setFormData({ ...formData, grade: value })}
                          >
                            <SelectTrigger id="grade" className="w-full">
                              <SelectValue placeholder="Select grade" />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {availableGrades.map((grade) => (
                                <SelectItem key={grade} value={grade}>
                                  {grade}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="parent_name">Parent&apos;s Name</Label>
                          <Input
                            id="parent_name"
                            value={formData.parent_name}
                            onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                            placeholder="Enter parent's name"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="parent_phone">Parent&apos;s Phone Number</Label>
                          <Input
                            id="parent_phone"
                            type="tel"
                            value={formData.parent_phone}
                            onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                            placeholder="Enter parent's phone number"
                          />
                        </div>
                      </div>
                      {addStudentError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-600">{addStudentError}</p>
                        </div>
                      )}
                      <DialogFooter>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setIsDialogOpen(false);
                            setAddStudentError(null);
                            setFormData({ full_name: "", email: "", password: "", school_id: "", grade: "", parent_name: "", parent_phone: "" });
                          }}
                          disabled={isAddingStudent}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddStudent}
                          disabled={isAddingStudent || !formData.full_name || !formData.email || !formData.password || !formData.school_id}
                          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAddingStudent ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            'Add Student'
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  <Button 
                    onClick={() => {
                      setIsBulkImportDialogOpen(true);
                      setBulkData([]);
                      setUploadFile(null);
                      setBulkImportError(null);
                      setBulkImportResults(null);
                      setSelectedSchoolForImport('');
                      setEmailDomain('');
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Bulk Import
                  </Button>
                  
                  <Button 
                    onClick={handleOpenExportDialog}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Credentials
                  </Button>
                  </div>

                  {/* Search Bar */}
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by Student Name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* School Filter */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor="school-filter" className="whitespace-nowrap text-sm font-medium">
                      Filter by School:
                    </Label>
                    <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                      <SelectTrigger id="school-filter" className="w-[200px]">
                        <SelectValue placeholder="All Schools" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Schools</SelectItem>
                        {schools.map((school) => (
                          <SelectItem key={school.id} value={school.id}>
                            {school.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Grade Filter */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor="grade-filter" className="whitespace-nowrap text-sm font-medium">
                      Filter by Grade:
                    </Label>
                    <Select value={gradeFilter} onValueChange={setGradeFilter}>
                      <SelectTrigger id="grade-filter" className="w-[180px]">
                        <SelectValue placeholder="All Grades" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Grades</SelectItem>
                        {getAllGrades().map((grade) => (
                          <SelectItem key={grade} value={grade}>
                            {grade}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Clear Filters Button */}
                  {(schoolFilter !== "all" || gradeFilter !== "all" || searchTerm.trim()) && (
                    <Button
                      variant="outline"
                      onClick={clearFilters}
                      className="shrink-0"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear Filters
                    </Button>
                  )}
                </div>
              </div>


              {/* Students Table */}
              <Card className="bg-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Students ({filteredStudents.length})</CardTitle>
                      <CardDescription>
                        {schoolFilter !== "all" && schools.find((s: any) => s.id === schoolFilter) && (
                          <span className="text-blue-600 font-medium">
                            Showing students from: {schools.find((s: any) => s.id === schoolFilter)?.name}
                          </span>
                        )}
                        {schoolFilter === "all" && "Manage all student accounts"}
                      </CardDescription>
                    </div>
                    {(schoolFilter !== "all" || searchTerm.trim()) && (
                      <Badge variant="outline" className="text-sm">
                        {filteredStudents.length} result{filteredStudents.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
                      <p className="text-gray-600 mb-4">
                        {schoolFilter !== "all" || searchTerm.trim()
                          ? "Try adjusting your filters or search term."
                          : "No students enrolled yet. Add students to get started."}
                      </p>
                      {(schoolFilter !== "all" || searchTerm.trim()) && (
                        <Button variant="outline" onClick={clearFilters}>
                          <X className="mr-2 h-4 w-4" />
                          Clear All Filters
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Parent Name</TableHead>
                          <TableHead>Parent Phone</TableHead>
                          <TableHead>School</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Courses</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.full_name}</TableCell>
                          <TableCell>{student.email}</TableCell>
                          { }
                          <TableCell>{(student as any).parent_name || '-'}</TableCell>
                          { }
                          <TableCell>{(student as any).parent_phone || '-'}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              { }
                              {student.student_schools?.map((assignment: any, index: number) => (
                                <div key={index} className="font-medium">
                                  {assignment.schools?.name || '-'}
                                </div>
                              ))}
                              {(!student.student_schools || student.student_schools.length === 0) && (
                                <span className="text-gray-400">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              { }
                              {student.student_schools?.map((assignment: any, index: number) => {
                                // Format grade: if it already starts with "Grade", use as-is, otherwise add "Grade" prefix
                                const gradeValue = assignment.grade || '-';
                                const displayGrade = gradeValue === '-' 
                                  ? '-' 
                                  : (gradeValue.toString().trim().toLowerCase().startsWith('grade') 
                                      ? gradeValue 
                                      : `Grade ${gradeValue}`);
                                
                                return (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {displayGrade}
                                  </Badge>
                                );
                              })}
                              {(!student.student_schools || student.student_schools.length === 0) && (
                                <span className="text-gray-400">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              { }
                              {student.student_courses?.slice(0, 2).map((course: any, index: number) => (
                                <div key={index} className="text-sm">
                                  {course.courses?.course_name}
                                </div>
                              ))}
                              {student.student_courses && student.student_courses.length > 2 && (
                                <span className="text-xs text-gray-500">
                                  +{student.student_courses.length - 2} more
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${student.progress || 0}%` }}
                                ></div>
                              </div>
                              <span className="text-sm">{student.progress || 0}%</span>
                            </div>
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
                                onClick={() => handleEditStudent(student)}
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
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* View Student Dialog */}
            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
                <DialogHeader>
                  <DialogTitle>Student Details</DialogTitle>
                  <DialogDescription>
                    View detailed information about the student
                  </DialogDescription>
                </DialogHeader>
                {viewingStudent && (
                  <div className="space-y-6 py-4">
                    {/* Basic Information */}
                    <Card className="bg-white">
                      <CardHeader>
                        <CardTitle className="text-lg">Basic Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Full Name</Label>
                            <p className="text-base font-medium">{viewingStudent.full_name}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Email</Label>
                            <p className="text-base">{viewingStudent.email}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Student ID</Label>
                            <p className="text-base font-mono text-sm">{viewingStudent.id}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Role</Label>
                            <Badge variant="outline">{viewingStudent.role}</Badge>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Created At</Label>
                            <p className="text-base">{new Date(viewingStudent.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* School & Grade Information */}
                    {viewingStudent.student_schools && viewingStudent.student_schools.length > 0 && (
                      <Card className="bg-white">
                        <CardHeader>
                          <CardTitle className="text-lg">School & Grade</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            { }
                            {viewingStudent.student_schools.map((assignment: any, index: number) => (
                              <div key={index} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">{assignment.schools?.name || 'Unknown School'}</p>
                                    <Badge variant="outline" className="mt-1">
                                      {assignment.grade?.toString().trim().toLowerCase().startsWith('grade') 
                                        ? assignment.grade 
                                        : `Grade ${assignment.grade}`}
                                    </Badge>
                                  </div>
                                  <Badge variant={assignment.is_active ? "default" : "secondary"}>
                                    {assignment.is_active ? "Active" : "Inactive"}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Courses Information */}
                    {viewingStudent.student_courses && viewingStudent.student_courses.length > 0 && (
                      <Card className="bg-white">
                        <CardHeader>
                          <CardTitle className="text-lg">Courses</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            { }
                            {viewingStudent.student_courses.map((course: any, index: number) => (
                              <div key={index} className="p-2 border rounded">
                                <p className="font-medium">{course.courses?.course_name || 'Unknown Course'}</p>
                                {course.progress_percentage !== undefined && (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-sm text-gray-600">Progress</span>
                                      <span className="text-sm font-medium">{course.progress_percentage}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                      <div 
                                        className="bg-blue-600 h-2 rounded-full" 
                                        style={{ width: `${course.progress_percentage}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Progress */}
                    <Card className="bg-white">
                      <CardHeader>
                        <CardTitle className="text-lg">Overall Progress</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center space-x-4">
                          <div className="flex-1">
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div 
                                className="bg-blue-600 h-3 rounded-full" 
                                style={{ width: `${viewingStudent.progress || 0}%` }}
                              ></div>
                            </div>
                          </div>
                          <span className="text-lg font-medium">{viewingStudent.progress || 0}%</span>
                        </div>
                      </CardContent>
                    </Card>
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
                setEditingStudent(null);
                setFormData({ full_name: "", email: "", password: "", school_id: "", grade: "", parent_name: "", parent_phone: "" });
                setNewPassword(""); // Reset new password
                setShowNewPassword(false); // Reset new password visibility
                setUpdateStudentError(null);
              }
            }}>
              <DialogContent className="sm:max-w-[425px] bg-white max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle>Edit Student</DialogTitle>
                  <DialogDescription>
                    Update student information and enrollment details
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 overflow-y-auto flex-1 pr-2" style={{ maxHeight: 'calc(90vh - 180px)' }}>
                  <div className="grid gap-2">
                    <Label htmlFor="edit_full_name">Full Name</Label>
                    <Input
                      id="edit_full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit_email">Email</Label>
                    <Input
                      id="edit_email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                  <div>
                    <Label>Change Current Password</Label>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500">
                        Use this to reset the password if the student has forgotten it. A new password will be generated and assigned.
                      </p>
                      <div className="relative">
                        <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="new_password"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password (min 8 chars, uppercase, lowercase, number)"
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
                  <div className="grid gap-2">
                    <Label htmlFor="edit_school_id">School <span className="text-red-500">*</span></Label>
                    {schools.length === 0 ? (
                      <div className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 text-sm flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading schools...
                      </div>
                    ) : (
                      <Select
                        value={formData.school_id || undefined}
                        onValueChange={(value) => setFormData({ ...formData, school_id: value })}
                      >
                        <SelectTrigger id="edit_school_id" className="w-full">
                          <SelectValue placeholder="Select school" />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          {schools.map((school) => (
                            <SelectItem key={school.id} value={school.id}>
                              {school.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit_grade">Grade</Label>
                    <Select
                      value={formData.grade || undefined}
                      onValueChange={(value) => setFormData({ ...formData, grade: value })}
                    >
                      <SelectTrigger id="edit_grade" className="w-full">
                        <SelectValue placeholder="Select grade" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {availableGrades.map((grade) => (
                          <SelectItem key={grade} value={grade}>
                            {grade}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit_parent_name">Parent&apos;s Name</Label>
                    <Input
                      id="edit_parent_name"
                      value={formData.parent_name}
                      onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                      placeholder="Enter parent's name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit_parent_phone">Parent&apos;s Phone Number</Label>
                    <Input
                      id="edit_parent_phone"
                      type="tel"
                      value={formData.parent_phone}
                      onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                      placeholder="Enter parent's phone number"
                    />
                  </div>
                  {updateStudentError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-600">{updateStudentError}</p>
                    </div>
                  )}
                </div>
                <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingStudent(null);
                      setFormData({ full_name: "", email: "", password: "", school_id: "", grade: "", parent_name: "", parent_phone: "" });
                      setUpdateStudentError(null);
                    }}
                    disabled={isUpdatingStudent}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleUpdateStudent}
                    disabled={isUpdatingStudent || !formData.full_name || !formData.email || !formData.school_id}
                    className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdatingStudent ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Student'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Export Credentials Dialog */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
                <DialogHeader>
                  <DialogTitle>Export Student Credentials</DialogTitle>
                  <DialogDescription>
                    Select schools and/or grades to export credentials for specific students. Leave all unchecked to export all students.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* School Selection */}
                  <Card className="bg-white">
                    <CardHeader>
                      <CardTitle className="text-lg">Select Schools</CardTitle>
                      <CardDescription>
                        Select one or more schools. Leave unchecked to include all schools.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-48 overflow-y-auto">
                        <div className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <Checkbox
                            id="export-all-schools"
                            checked={exportSelectedSchools.length === 0}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setExportSelectedSchools([]); // Empty means all
                              } else {
                                setExportSelectedSchools([]);
                              }
                            }}
                          />
                          <Label htmlFor="export-all-schools" className="font-medium cursor-pointer">
                            All Schools
                          </Label>
                        </div>
                        {schools.map((school) => (
                          <div key={school.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                            <Checkbox
                              id={`export-school-${school.id}`}
                              checked={exportSelectedSchools.includes(school.id)}
                              onCheckedChange={() => handleSchoolToggle(school.id)}
                            />
                            <Label htmlFor={`export-school-${school.id}`} className="cursor-pointer">
                              {school.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {exportSelectedSchools.length > 0 && (
                        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            Selected: {exportSelectedSchools.map((id: any) => schools.find((s: any) => s.id === id)?.name).filter(Boolean).join(', ')}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Grade Selection */}
                  <Card className="bg-white">
                    <CardHeader>
                      <CardTitle className="text-lg">Select Grades</CardTitle>
                      <CardDescription>
                        Select one or more grades. Leave unchecked to include all grades.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-48 overflow-y-auto">
                        <div className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <Checkbox
                            id="export-all-grades"
                            checked={exportSelectedGrades.length === 0}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setExportSelectedGrades([]); // Empty means all
                              } else {
                                setExportSelectedGrades([]);
                              }
                            }}
                          />
                          <Label htmlFor="export-all-grades" className="font-medium cursor-pointer">
                            All Grades
                          </Label>
                        </div>
                        {getAllGrades().map((grade) => (
                          <div key={grade} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                            <Checkbox
                              id={`export-grade-${grade}`}
                              checked={exportSelectedGrades.includes(grade)}
                              onCheckedChange={() => handleGradeToggle(grade)}
                            />
                            <Label htmlFor={`export-grade-${grade}`} className="cursor-pointer">
                              {grade}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {exportSelectedGrades.length > 0 && (
                        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            Selected: {exportSelectedGrades.join(', ')}
                          </p>
                        </div>
                      )}
                      {getAllGrades().length === 0 && (
                        <p className="text-sm text-gray-500">No grades found in the database.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Export Format Selection */}
                  <Card className="bg-white">
                    <CardHeader>
                      <CardTitle className="text-lg">Export Format</CardTitle>
                      <CardDescription>
                        Choose the file format for the exported credentials
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col space-y-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="format-csv"
                            name="exportFormat"
                            value="csv"
                            checked={exportFormat === 'csv'}
                            onChange={(e) => setExportFormat(e.target.value as 'csv' | 'pdf')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <Label htmlFor="format-csv" className="cursor-pointer font-medium">
                            CSV (Comma Separated Values)
                          </Label>
                        </div>
                        <p className="text-xs text-gray-500 ml-6">
                          Best for spreadsheet applications like Excel or Google Sheets
                        </p>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="format-pdf"
                            name="exportFormat"
                            value="pdf"
                            checked={exportFormat === 'pdf'}
                            onChange={(e) => setExportFormat(e.target.value as 'csv' | 'pdf')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <Label htmlFor="format-pdf" className="cursor-pointer font-medium">
                            PDF (Portable Document Format)
                          </Label>
                        </div>
                        <p className="text-xs text-gray-500 ml-6">
                          Best for printing or sharing documents. Uses browser&apos;s print dialog to save as PDF
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Export Summary */}
                  <Card className="bg-white">
                    <CardHeader>
                      <CardTitle className="text-lg">Export Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          <strong>Schools:</strong> {exportSelectedSchools.length === 0 ? 'All Schools' : `${exportSelectedSchools.length} selected`}
                        </p>
                        <p className="text-sm text-gray-600">
                          <strong>Grades:</strong> {exportSelectedGrades.length === 0 ? 'All Grades' : `${exportSelectedGrades.length} selected`}
                        </p>
                        <p className="text-sm text-gray-600">
                          <strong>File Format:</strong> {exportFormat.toUpperCase()}
                        </p>
                        <p className="text-sm text-gray-600">
                          <strong>Columns:</strong> Name, Email, Password, School, Grade
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsExportDialogOpen(false);
                      setExportSelectedSchools([]);
                      setExportSelectedGrades([]);
                      setExportFormat('csv');
                    }}
                    disabled={isExporting}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={generateLoginCredentials}
                    disabled={isExporting}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Export Credentials
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Bulk Import Dialog */}
            <Dialog open={isBulkImportDialogOpen} onOpenChange={setIsBulkImportDialogOpen}>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white">
                <DialogHeader>
                  <DialogTitle>Bulk Import Students</DialogTitle>
                  <DialogDescription>
                    Upload a file (CSV or Excel) to import multiple students at once. All students will be assigned to the selected school.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                  {/* Step 1: File Upload */}
                  <Card className="bg-white">
                    <CardHeader>
                      <CardTitle className="text-lg">Step 1: Upload File</CardTitle>
                      <CardDescription>
                        Supported formats: CSV, Excel (.xlsx, .xls). Required columns: Student Name, Father Name, Phone Number, Grade. 
                        Download the sample CSV file below to see the exact format needed.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-medium mb-2">Upload File</h3>
                        <p className="text-gray-600 mb-4 text-sm">
                          Upload a CSV or Excel file with columns: Student Name, Father Name, Phone Number, Grade
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="bulk-file-upload-dialog"
                          />
                          <label
                            htmlFor="bulk-file-upload-dialog"
                            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Choose File
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={downloadSampleCSV}
                            className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download Sample CSV
                          </Button>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                          Click &quot;Download Sample CSV&quot; to get a template file with the correct format and sample rows
                        </p>
                        {uploadFile && (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm text-blue-600 font-medium">
                              ✓ Selected: {uploadFile.name}
                            </p>
                            {isParsingFile && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Parsing file...</span>
                              </div>
                            )}
                            {!isParsingFile && bulkData.length > 0 && (
                              <p className="text-sm text-green-600 font-medium">
                                ✓ Successfully parsed {bulkData.length} student(s)
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {bulkImportError && (
                    <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <X className="h-5 w-5 text-red-600 mt-0.5" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800 mb-1">File Upload Error</p>
                          <p className="text-sm text-red-600">{bulkImportError}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {bulkData.length > 0 && (
                    <>
                      {/* Step 2: School Selection */}
                      <Card className="bg-white">
                        <CardHeader>
                          <CardTitle className="text-lg">Step 2: Select School</CardTitle>
                          <CardDescription>
                            All students in this import will be assigned to the selected school
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {schools.length === 0 ? (
                            <div className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 text-sm flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading schools...
                            </div>
                          ) : (
                            <Select
                              value={selectedSchoolForImport}
                              onValueChange={setSelectedSchoolForImport}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select school for all students" />
                              </SelectTrigger>
                              <SelectContent className="bg-white">
                                {schools.map((school) => (
                                  <SelectItem key={school.id} value={school.id}>
                                    {school.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </CardContent>
                      </Card>

                      {/* Step 3: Email & Password Assignment */}
                      <Card className="bg-white">
                        <CardHeader>
                          <CardTitle className="text-lg">Step 3: Assign Emails & Passwords</CardTitle>
                          <CardDescription>
                            Assign emails and passwords to students before import. Each student will get a unique email generated from their last name.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800">
                              <strong>Individual Assignment Mode:</strong> Each student will get a unique email generated from their last name and the email domain you specify below.
                            </p>
                          </div>

                          {/* Email Domain Field */}
                          <div className="space-y-2 p-4 border rounded-lg bg-blue-50">
                            <Label className="font-medium">Email Domain <span className="text-red-500">*</span></Label>
                            <Input
                              type="text"
                              value={emailDomain}
                              onChange={(e) => setEmailDomain(e.target.value)}
                              placeholder="@rosebuds.edu or rosebuds.edu"
                              className="w-full bg-white"
                            />
                            <div className="space-y-1">
                              <p className="text-xs text-gray-600">
                                Enter the email domain (e.g., &quot;@rosebuds.edu&quot; or &quot;rosebuds.edu&quot;). 
                              </p>
                              <p className="text-xs text-gray-600 font-medium">
                                Email format: {"{student_last_name}"}{emailDomain ? (emailDomain.startsWith('@') ? emailDomain : `@${emailDomain}`) : "@domain.edu"}
                              </p>
                              {selectedSchoolForImport && !emailDomain && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const schoolName = schools.find((s: any) => s.id === selectedSchoolForImport)?.name?.toLowerCase().replace(/\s+/g, '') || '';
                                    setEmailDomain(`@${schoolName}.edu`);
                                  }}
                                  className="text-xs mt-2 bg-white"
                                >
                                  <School className="mr-1 h-3 w-3" />
                                  Use School Name: {schools.find((s: any) => s.id === selectedSchoolForImport)?.name?.toLowerCase().replace(/\s+/g, '')}.edu
                                </Button>
                              )}
                              {emailDomain && (
                                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                                  <strong>Example:</strong> For student &quot;John Smith&quot;, email will be: <code className="bg-white px-1 rounded">smith{emailDomain.startsWith('@') ? emailDomain : `@${emailDomain}`}</code>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Default Password Field */}
                          <div className="space-y-2">
                            <Label>Default Password (for all students):</Label>
                            <div className="relative">
                              <Input
                                type={showDefaultPassword ? "text" : "password"}
                                value={defaultPassword}
                                onChange={(e) => setDefaultPassword(e.target.value)}
                                placeholder="Enter default password"
                                className="pr-10"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowDefaultPassword(!showDefaultPassword)}
                                title={showDefaultPassword ? "Hide password" : "Show password"}
                              >
                                {showDefaultPassword ? (
                                  <EyeOff className="h-4 w-4 text-gray-500" />
                                ) : (
                                  <Eye className="h-4 w-4 text-gray-400" />
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-gray-500">
                              This password will be used if no specific password is assigned
                            </p>
                          </div>

                          <Button
                            type="button"
                            onClick={assignEmailsAndPasswords}
                            variant="outline"
                            className="w-full"
                            disabled={!emailDomain && !selectedSchoolForImport}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Assign Emails & Passwords to All Students
                          </Button>
                          {!emailDomain && !selectedSchoolForImport && (
                            <p className="text-xs text-red-500 text-center">
                              Please select a school or enter an email domain to generate emails
                            </p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Step 4: Data Preview Table */}
                      <Card className="bg-white">
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <div>
                              <CardTitle className="text-lg">Step 4: Review & Edit ({bulkData.length} students)</CardTitle>
                              <CardDescription>
                                Review and edit student information before importing. Click on any field to edit.
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="max-h-96 overflow-y-auto border rounded-lg">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">#</TableHead>
                                  <TableHead>Student Name</TableHead>
                                  <TableHead>Father Name</TableHead>
                                  <TableHead>Phone</TableHead>
                                  <TableHead>Grade</TableHead>
                                  <TableHead>Email</TableHead>
                                  <TableHead>Password</TableHead>
                                  <TableHead className="w-16">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bulkData.map((student, index) => (
                                  <TableRow key={student.id || index}>
                                    <TableCell className="font-medium">{index + 1}</TableCell>
                                    <TableCell>
                                      <Input
                                        value={student.student_name}
                                        onChange={(e) => handleEditBulkData(student.id || `temp-${index}`, 'student_name', e.target.value)}
                                        className="h-8 text-sm"
                                        placeholder="Required"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={student.father_name || ''}
                                        onChange={(e) => handleEditBulkData(student.id || `temp-${index}`, 'father_name', e.target.value)}
                                        className="h-8 text-sm"
                                        placeholder="Optional"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={student.phone_number || ''}
                                        onChange={(e) => handleEditBulkData(student.id || `temp-${index}`, 'phone_number', e.target.value)}
                                        className="h-8 text-sm"
                                        placeholder="Optional"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Select
                                        value={student.grade || ''}
                                        onValueChange={(value) => handleEditBulkData(student.id || `temp-${index}`, 'grade', value)}
                                      >
                                        <SelectTrigger className="h-8 text-sm w-full">
                                          <SelectValue placeholder="Select Grade" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white max-h-60">
                                          {availableGrades.map((grade) => (
                                            <SelectItem key={grade} value={grade}>
                                              {grade}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="email"
                                        value={student.email || ''}
                                        onChange={(e) => handleEditBulkData(student.id || `temp-${index}`, 'email', e.target.value)}
                                        className="h-8 text-sm"
                                        placeholder="Required"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="relative">
                                        <Input
                                          type={showStudentPasswords[student.id || `temp-${index}`] ? "text" : "password"}
                                          value={student.password || ''}
                                          onChange={(e) => handleEditBulkData(student.id || `temp-${index}`, 'password', e.target.value)}
                                          className="h-8 text-sm pr-10"
                                          placeholder="Required"
                                        />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="absolute right-0 top-0 h-full px-2 py-1 hover:bg-transparent"
                                          onClick={() => {
                                            const studentId = student.id || `temp-${index}`;
                                            setShowStudentPasswords({ ...showStudentPasswords, [studentId]: !showStudentPasswords[studentId] });
                                          }}
                                          title={showStudentPasswords[student.id || `temp-${index}`] ? "Hide password" : "Show password"}
                                        >
                                          {showStudentPasswords[student.id || `temp-${index}`] ? (
                                            <EyeOff className="h-3 w-3 text-gray-500" />
                                          ) : (
                                            <Eye className="h-3 w-3 text-gray-400" />
                                          )}
                                        </Button>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteBulkDataRow(student.id || `temp-${index}`)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                                        title="Remove student"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Import Results */}
                      {bulkImportResults && (
                        <Card className="bg-white">
                          <CardHeader>
                            <CardTitle className="text-lg">Import Results</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              <div className="flex items-center space-x-4">
                                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                  <p className="text-lg font-bold text-green-600">{bulkImportResults.success}</p>
                                  <p className="text-xs text-green-600">Success</p>
                                </div>
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                  <p className="text-lg font-bold text-red-600">{bulkImportResults.failed}</p>
                                  <p className="text-xs text-red-600">Failed</p>
                                </div>
                              </div>
                              {bulkImportResults.errors.length > 0 && (
                                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                  <p className="text-sm font-medium text-red-800 mb-2">Errors:</p>
                                  <ul className="text-xs text-red-600 space-y-1 max-h-32 overflow-y-auto">
                                    {bulkImportResults.errors.map((error, idx) => (
                                      <li key={idx}>• {error}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>

                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsBulkImportDialogOpen(false);
                      setBulkData([]);
                      setUploadFile(null);
                      setBulkImportError(null);
                      setBulkImportResults(null);
                      setSelectedSchoolForImport('');
                      setDefaultPassword('TempPass123!');
                      setEmailDomain('');
                    }}
                    disabled={isBulkImporting}
                  >
                    {bulkData.length > 0 ? 'Cancel' : 'Close'}
                  </Button>
                  {bulkData.length > 0 && (
                    <Button 
                      onClick={handleBulkImport}
                      disabled={isBulkImporting || !selectedSchoolForImport || bulkData.some((item: any) => !item.student_name || !item.grade || !item.email || !item.password)}
                      className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                    >
                      {isBulkImporting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing Students...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Import {bulkData.length} Student{bulkData.length !== 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Bulk Import Tab */}
            <TabsContent value="import" className="space-y-6">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle>Bulk Import Students</CardTitle>
                  <CardDescription>Import multiple students from CSV file</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium mb-2">Upload CSV File</h3>
                    <p className="text-gray-600 mb-4">
                      Upload a CSV file with columns: Name, Email, Grade, School
                    </p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label
                      htmlFor="csv-upload"
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Choose CSV File
                    </label>
                  </div>

                  {bulkData.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-lg font-medium">Preview Data ({bulkData.length} students)</h4>
                        <Button 
                          onClick={handleBulkImport}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Import Students
                        </Button>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Grade</TableHead>
                              <TableHead>School</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bulkData.map((student, index) => (
                              <TableRow key={index}>
                                <TableCell>{student.student_name}</TableCell>
                                <TableCell>{student.email || 'Not assigned'}</TableCell>
                                <TableCell>{student.grade}</TableCell>
                                <TableCell>
                                  {student.school_name ||
                                    schools.find((s: any) => s.id === selectedSchoolForImport)?.name ||
                                    'Not assigned'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports" className="space-y-6">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle>Student Reports</CardTitle>
                  <CardDescription>Generate and download student reports</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button variant="outline" className="h-20 flex flex-col">
                      <Download className="h-6 w-6 mb-2" />
                      <span>Enrollment Report</span>
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col">
                      <Download className="h-6 w-6 mb-2" />
                      <span>Progress Report</span>
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col">
                      <Download className="h-6 w-6 mb-2" />
                      <span>Grade-wise Report</span>
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col">
                      <Download className="h-6 w-6 mb-2" />
                      <span>School-wise Report</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
    </div>
  );
}

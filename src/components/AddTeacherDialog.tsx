"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "./ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "./ui/select";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle 
} from "./ui/card";
import { 
  Badge 
} from "./ui/badge";
import { 
  Checkbox 
} from "./ui/checkbox";
import { 
  Plus,
  X,
  User,
  Mail,
  Phone,
  GraduationCap,
  Briefcase,
  School,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Copy
} from "lucide-react";
import { validatePasswordClient } from "../lib/password-validation";
import { fetchWithCsrf } from "../lib/csrf-client";
import { useAutoSaveForm } from "../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../lib/form-persistence";

interface AddTeacherDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface School {
  id: string;
  name: string;
  grades_offered: string[];
}

interface SchoolAssignment {
  school_id: string;
  school_name: string;
  grades_assigned: string[];
  subjects: string[];
  working_days_per_week: number;
  max_students_per_session: number;
  is_primary: boolean;
}

interface TeacherFormData {
  // Basic Information
  full_name: string;
  email: string;
  phone: string;
  address: string;
  qualification: string;
  experience_years: number;
  specialization: string;
  temp_password: string;
  
  // School & Grade Assignment
  selected_schools: string[];
  school_assignments: SchoolAssignment[];
}

const availableGrades = [
  "Pre-K", "Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"
];

const availableSubjects = [
  "Robotics", "Coding", "AI/ML", "Python"
];

export default function AddTeacherDialog({ isOpen, onClose, onSuccess }: AddTeacherDialogProps) {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [customSubjectInputs, setCustomSubjectInputs] = useState<Record<string, string>>({});
  
  // Load saved form data
  const savedFormData = typeof window !== 'undefined' && isOpen
    ? loadFormData<TeacherFormData>('add-teacher-dialog-form')
    : null;

  const initialFormData: TeacherFormData = {
    // Basic Information
    full_name: "",
    email: "",
    phone: "",
    address: "",
    qualification: "",
    experience_years: 0,
    specialization: "",
    temp_password: "",
    
    // School & Grade Assignment
    selected_schools: [],
    school_assignments: []
  };
  
  const [formData, setFormData] = useState<TeacherFormData>(savedFormData || initialFormData);

  // Auto-save form data while dialog is open
  const { clearSavedData } = useAutoSaveForm({
    formId: 'add-teacher-dialog-form',
    formData,
    autoSave: isOpen, // Only auto-save when dialog is open
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && isOpen && !savedFormData) {
        setFormData(data);
      }
    },
    markDirty: true,
  });

  // Load schools only once when dialog opens - DISABLED automatic loading to prevent form refresh
  const schoolsLoadedRef = useRef(false);
  
  useEffect(() => {
    if (isOpen && !schoolsLoadedRef.current) {
      loadSchools();
      schoolsLoadedRef.current = true;
      
      // Load saved form data when dialog opens
      const saved = loadFormData<TeacherFormData>('add-teacher-dialog-form');
      if (saved) {
        setFormData(saved);
      } else {
        setFormData(initialFormData);
      }
    }
    // Reset flag when dialog closes so schools load again next time
    if (!isOpen) {
      schoolsLoadedRef.current = false;
    }
     
  }, [isOpen]);

  const loadSchools = async () => {
    try {
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json();
      
      if (response.ok) {
        setSchools(data.schools || []);
      } else {
        console.error('Failed to load schools:', data.error);
      }
    } catch (error) {
      console.error('Error loading schools:', error);
    }
  };

   
  const handleInputChange = (field: keyof TeacherFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ""
      }));
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, temp_password: password }));
    setErrors(prev => ({ ...prev, temp_password: '' }));
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(formData.temp_password);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  const handleSchoolSelection = (schoolId: string, checked: boolean) => {
    const school = schools.find((s: any) => s.id === schoolId);
    if (!school) return;

    if (checked) {
      // Add school to selection
      const newSelectedSchools = [...formData.selected_schools, schoolId];
      const newAssignment: SchoolAssignment = {
        school_id: schoolId,
        school_name: school.name,
        grades_assigned: [],
        subjects: [],
        working_days_per_week: 5,
        max_students_per_session: 30,
        is_primary: formData.school_assignments.length === 0 // First school is primary
      };
      
    setFormData(prev => ({
      ...prev,
        selected_schools: newSelectedSchools,
        school_assignments: [...prev.school_assignments, newAssignment]
    }));
    } else {
      // Remove school from selection
      const newSelectedSchools = formData.selected_schools.filter((id: any) => id !== schoolId);
      const newAssignments = formData.school_assignments.filter((a: any) => a.school_id !== schoolId);

      // If we removed the primary school, make the first remaining one primary
      if (newAssignments.length > 0) {
        newAssignments[0].is_primary = true;
      }

    setFormData(prev => ({
      ...prev,
        selected_schools: newSelectedSchools,
        school_assignments: newAssignments
    }));
    }
  };

  const handleGradeSelection = (schoolId: string, grade: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      school_assignments: prev.school_assignments.map((assignment: any) => {
        if (assignment.school_id === schoolId) {
          if (checked) {
            return {
              ...assignment,
              grades_assigned: [...assignment.grades_assigned, grade]
            };
          } else {
            return {
              ...assignment,
              grades_assigned: assignment.grades_assigned.filter((g: any) => g !== grade)
            };
          }
        }
        return assignment;
      })
    }));
  };

  const handleSubjectSelection = (schoolId: string, subject: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      school_assignments: prev.school_assignments.map((assignment: any) => {
        if (assignment.school_id === schoolId) {
          if (checked) {
            return {
              ...assignment,
              subjects: [...assignment.subjects, subject]
            };
          } else {
            return {
              ...assignment,
              subjects: assignment.subjects.filter((s: any) => s !== subject)
            };
          }
        }
        return assignment;
      })
    }));
  };

  const handleAddCustomSubject = (schoolId: string) => {
    const customSubject = customSubjectInputs[schoolId]?.trim();
    if (!customSubject) {
      return;
    }

    // Check if subject already exists (case-insensitive)
    const assignment = formData.school_assignments.find((a: any) => a.school_id === schoolId);
    if (assignment) {
      const subjectExists = assignment.subjects.some(
        s => s.toLowerCase() === customSubject.toLowerCase()
      );
      if (subjectExists) {
        setErrors(prev => ({
          ...prev,
          [`custom_subject_${schoolId || 'undefined'}`]: 'This subject is already added'
        }));
        return;
      }
    }

    // Add custom subject
    handleSubjectSelection(schoolId, customSubject, true);
    
    // Clear input
    setCustomSubjectInputs(prev => ({
      ...prev,
      [schoolId]: ''
    }));
    
    // Clear error
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`custom_subject_${schoolId || 'undefined'}`];
      return newErrors;
    });
  };

   
  const handleAssignmentChange = (schoolId: string, field: keyof SchoolAssignment, value: any) => {
    setFormData(prev => ({
      ...prev,
      school_assignments: prev.school_assignments.map((assignment: any) => {
        if (assignment.school_id === schoolId) {
          return {
            ...assignment,
            [field]: value
          };
        }
        return assignment;
      })
    }));
  };

  const setPrimarySchool = (schoolId: string) => {
    setFormData(prev => ({
      ...prev,
      school_assignments: prev.school_assignments.map((assignment: any) => ({
        ...assignment,
        is_primary: assignment.school_id === schoolId || undefined }))
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Basic Information validation
    if (!formData.full_name.trim()) newErrors.full_name = 'Full name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    if (!formData.qualification.trim()) newErrors.qualification = 'Qualification is required';
    if (!formData.temp_password.trim()) newErrors.temp_password = 'Temporary password is required';
    else {
      // Validate password strength (8+ chars, uppercase, lowercase, number)
      const passwordError = validatePasswordClient(formData.temp_password);
      if (passwordError) {
        newErrors.temp_password = passwordError;
      }
    }
    
    // School Assignment validation
    if (formData.selected_schools.length === 0) {
      newErrors.schools = 'At least one school must be selected';
    }
    
    // Check if each selected school has at least one grade
    formData.school_assignments.forEach(assignment => {
      if (assignment.grades_assigned.length === 0) {
        newErrors[`grades_${assignment.school_id}`] = 'At least one grade must be selected for each school';
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWithCsrf('/api/admin/teachers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Teacher created successfully, triggering refresh...');
        // Call onSuccess first to refresh the list
        // Clear saved form data after successful creation
        clearFormData('add-teacher-dialog-form');
        clearSavedData();

        onSuccess();
        // Then reset form
        resetForm();
        // Show success message after a short delay to let the list refresh
        setTimeout(() => {
          alert('Teacher added successfully!');
        }, 100);
      } else {
        // Show detailed validation errors if available
        let errorMessage = data.error || 'Unknown error';
        if (data.message) {
          errorMessage = data.message;
        }
        if (data.details && Array.isArray(data.details)) {
          const detailedErrors = data.details.map((issue: any) => `${issue.path?.join('.') || 'field'}: ${issue.message}`).join('\n');
          console.error('Validation errors:', detailedErrors);
          errorMessage = `Validation failed:\n${detailedErrors}`;
        }
        alert(`Failed to add teacher: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error adding teacher:', error);
      alert('Error adding teacher');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: "",
      email: "",
      phone: "",
      address: "",
      qualification: "",
      experience_years: 0,
      specialization: "",
      temp_password: "",
      selected_schools: [],
      school_assignments: []
    });
    setErrors({});
  };

  const handleClose = () => {
    // Optionally clear saved data when manually closing (or keep for recovery)
    // clearFormData('add-teacher-dialog-form');
    resetForm();
    setCustomSubjectInputs({});
    onClose();
  };

        return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Only reset when closing, not when opening
      if (!open) {
        handleClose();
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Add New Teacher
          </DialogTitle>
          <DialogDescription>
            Create a new teacher account and assign to schools with specific grades.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
              <CardDescription>Enter the teacher&apos;s personal and professional details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
              <div>
                  <Label htmlFor="full_name">Full Name <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="full_name"
                  value={formData.full_name}
                      onChange={(e) => handleInputChange('full_name', e.target.value)}
                      placeholder="Enter full name"
                      className={`pl-10 ${errors.full_name ? 'border-red-500' : ''}`}
                />
              </div>
                  {errors.full_name && <p className="text-sm text-red-500 mt-1">{errors.full_name}</p>}
                </div>

              <div>
                  <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="Enter email address"
                      className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                />
              </div>
                  {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
              <div>
                  <Label htmlFor="phone">Phone <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="phone"
                  value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="Enter phone number"
                      className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                />
              </div>
                  {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
              </div>

              <div>
                  <Label htmlFor="qualification">Qualification <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <GraduationCap className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="qualification"
                  value={formData.qualification}
                      onChange={(e) => handleInputChange('qualification', e.target.value)}
                      placeholder="Enter qualification"
                      className={`pl-10 ${errors.qualification ? 'border-red-500' : ''}`}
                />
                  </div>
                  {errors.qualification && <p className="text-sm text-red-500 mt-1">{errors.qualification}</p>}
              </div>
            </div>

              <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="experience_years">Experience (Years)</Label>
                <Input
                  id="experience_years"
                  type="number"
                  value={formData.experience_years}
                    onChange={(e) => handleInputChange('experience_years', parseInt(e.target.value) || 0)}
                    placeholder="Enter years of experience"
                    min="0"
                />
              </div>

              <div>
                  <Label htmlFor="specialization">Specialization</Label>
                <Input
                  id="specialization"
                  value={formData.specialization}
                    onChange={(e) => handleInputChange('specialization', e.target.value)}
                    placeholder="Enter specialization"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Enter address"
                  rows={2}
              />
            </div>

            <div>
                <Label htmlFor="temp_password">Temporary Password <span className="text-red-500">*</span></Label>
                <div className="space-y-2">
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                      id="temp_password"
                      type={showPassword ? "text" : "password"}
                      value={formData.temp_password}
                      onChange={(e) => handleInputChange('temp_password', e.target.value)}
                      placeholder="Enter password (min 8: uppercase, lowercase, number)"
                      className={`pl-10 pr-20 ${errors.temp_password ? 'border-red-500' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                        </div>
                        <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                      onClick={generatePassword}
                      className="flex items-center gap-1"
                            >
                      <RefreshCw className="h-3 w-3" />
                      Generate
                            </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                      onClick={copyPassword}
                      disabled={!formData.temp_password}
                      className="flex items-center gap-1"
                          >
                      <Copy className="h-3 w-3" />
                      Copy
                          </Button>
                        </div>
                      </div>
                {errors.temp_password && <p className="text-sm text-red-500 mt-1">{errors.temp_password}</p>}
              </div>
            </CardContent>
          </Card>

          {/* School Assignment */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <School className="h-5 w-5" />
                School Assignment
              </CardTitle>
              <CardDescription>Assign the teacher to schools and select grades for each school</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* School Selection */}
                        <div>
                <Label>Assign Schools <span className="text-red-500">*</span></Label>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                  {schools.map((school) => (
                    <div key={school.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`school-${school.id}`}
                        checked={formData.selected_schools.includes(school.id)}
                        onCheckedChange={(checked) => handleSchoolSelection(school.id, checked as boolean)}
                      />
                      <Label htmlFor={`school-${school.id}`} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <School className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{school.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {school.grades_offered?.length || 0} grades
                          </Badge>
                        </div>
                      </Label>
                        </div>
                          ))}
                        </div>
                {errors.schools && <p className="text-sm text-red-500 mt-1">{errors.schools}</p>}
                      </div>

              {/* Grade Selection for Each School */}
              {formData.school_assignments.map((assignment) => (
                <Card key={assignment.school_id} className="border-l-4 border-l-blue-500 bg-white">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        {assignment.school_name}
                        {assignment.is_primary && (
                          <Badge variant="default" className="text-xs">Primary</Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {!assignment.is_primary && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPrimarySchool(assignment.school_id)}
                          >
                            Set Primary
                          </Button>
              )}
            </div>
          </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Grade Selection */}
              <div>
                      <Label>Select Grades <span className="text-red-500">*</span></Label>
                      <div className="mt-2 grid grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
                        {(() => {
                          // Get the school's grades_offered
                          const school = schools.find((s: any) => s.id === assignment.school_id);
                          const schoolGrades = school?.grades_offered || [];
                          
                          // Helper function to normalize grade format for comparison
                          // Converts both "4" and "Grade 4" to a common format for comparison
                          const normalizeGradeForComparison = (grade: string): string => {
                            if (!grade) return '';
                            // Remove "Grade " prefix and trim
                            const normalized = grade.replace(/^Grade\s+/i, '').trim();
                            
                            // Handle special cases first
                            const lower = normalized.toLowerCase();
                            if (lower === 'pre-k' || lower === 'prek' || lower === 'pre-kg') {
                              return 'pre-k';
                            }
                            if (lower === 'k' || lower === 'kindergarten' || lower === 'kg') {
                              return 'kindergarten';
                            }
                            
                            // Handle numeric grades - return as number string for comparison
                            if (/^\d+$/.test(normalized)) {
                              return normalized; // Return just the number (e.g., "4")
                            }
                            
                            // Return lowercase for case-insensitive comparison
                            return normalized.toLowerCase();
                          };
                          
                          // Filter available grades to only show those offered by the school
                          const filteredGrades = availableGrades.filter((grade: any) => {
                            // If school has no grades_offered, show all grades (fallback)
                            if (!schoolGrades || schoolGrades.length === 0) {
                              return true;
                            }
                            
                            // Normalize the available grade for comparison
                            const normalizedAvailableGrade = normalizeGradeForComparison(grade);
                            
                            // Check if this grade is in the school's grades_offered
                            return schoolGrades.some((schoolGrade: any) => {
                              const normalizedSchoolGrade = normalizeGradeForComparison(schoolGrade);
                              return normalizedSchoolGrade === normalizedAvailableGrade;
                            });
                          });
                          
                          // If no grades match, show all grades (fallback)
                          const gradesToShow = filteredGrades.length > 0 ? filteredGrades : availableGrades;
                          
                          return gradesToShow.map((grade) => (
                            <div key={grade} className="flex items-center space-x-2">
                              <Checkbox
                                id={`grade-${assignment.school_id}-${grade}`}
                                checked={assignment.grades_assigned.includes(grade)}
                                onCheckedChange={(checked) => handleGradeSelection(assignment.school_id, grade, checked as boolean)}
                              />
                              <Label htmlFor={`grade-${assignment.school_id}-${grade}`} className="text-sm cursor-pointer">
                                {grade}
                              </Label>
                            </div>
                          ));
                        })()}
              </div>
                      {errors[`grades_${assignment.school_id}`] && (
                        <p className="text-sm text-red-500 mt-1">{errors[`grades_${assignment.school_id}`]}</p>
                      )}
            </div>

                    {/* Subject Selection */}
            <div>
                      <Label>Select Subjects</Label>
                      <div className="mt-2 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
                        {availableSubjects.map((subject) => (
                          <div key={subject} className="flex items-center space-x-2">
                            <Checkbox
                              id={`subject-${assignment.school_id}-${subject}`}
                              checked={assignment.subjects.includes(subject)}
                              onCheckedChange={(checked) => handleSubjectSelection(assignment.school_id, subject, checked as boolean)}
                            />
                            <Label htmlFor={`subject-${assignment.school_id}-${subject}`} className="text-sm cursor-pointer">
                              {subject}
                            </Label>
                          </div>
                        ))}
                        {/* Display custom subjects */}
                        {assignment.subjects
                          .filter((subject: any) => !availableSubjects.includes(subject))
                          .map((subject) => (
                            <div key={subject} className="flex items-center space-x-2">
                              <Checkbox
                                id={`subject-${assignment.school_id}-${subject}`}
                                checked={assignment.subjects.includes(subject)}
                                onCheckedChange={(checked) => handleSubjectSelection(assignment.school_id, subject, checked as boolean)}
                              />
                              <Label htmlFor={`subject-${assignment.school_id}-${subject}`} className="text-sm cursor-pointer">
                                {subject}
                              </Label>
                            </div>
                          ))}
                      </div>
                      {/* Add Custom Subject */}
                      <div className="mt-2 flex gap-2">
                        <Input
                          placeholder="Enter custom subject"
                          value={customSubjectInputs[assignment.school_id] || ''}
                          onChange={(e) => setCustomSubjectInputs(prev => ({
                            ...prev,
                            [assignment.school_id]: e.target.value
                          }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomSubject(assignment.school_id);
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddCustomSubject(assignment.school_id)}
                          className="flex items-center gap-1"
                        >
                          <Plus className="h-4 w-4" />
                          Add
                        </Button>
                      </div>
                      {errors[`custom_subject_${assignment.school_id}`] && (
                        <p className="text-sm text-red-500 mt-1">
                          {errors[`custom_subject_${assignment.school_id}`]}
                        </p>
                      )}
            </div>

                    {/* Working Details */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`working_days_${assignment.school_id}`}>Working Days per Week</Label>
                        <Input
                          id={`working_days_${assignment.school_id}`}
                          type="number"
                          value={assignment.working_days_per_week}
                          onChange={(e) => handleAssignmentChange(assignment.school_id, 'working_days_per_week', parseInt(e.target.value) || 5)}
                          min="1"
                          max="7"
                        />
              </div>
                <div>
                        <Label htmlFor={`max_students_${assignment.school_id}`}>Max Students per Session</Label>
                  <Input
                          id={`max_students_${assignment.school_id}`}
                          type="number"
                          value={assignment.max_students_per_session}
                          onChange={(e) => handleAssignmentChange(assignment.school_id, 'max_students_per_session', parseInt(e.target.value) || 30)}
                          min="1"
                  />
                </div>
                  </div>
                </CardContent>
              </Card>
              ))}
                </CardContent>
              </Card>
                  </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Adding Teacher...' : 'Add Teacher'}
                </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

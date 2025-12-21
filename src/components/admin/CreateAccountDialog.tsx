"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Checkbox } from "../../components/ui/checkbox";

import { validatePasswordClient } from '../../lib/password-validation';
import { fetchWithCsrf } from '../../lib/csrf-client';
import {
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  X,
  School,
  User,
  GraduationCap,
  Shield,
  UserCog,
} from "lucide-react";

interface School {
  id: string;
  name: string;
}

interface SchoolAssignment {
  school_id: string;
  grades_assigned: string[];
  subjects: string[];
}

interface CreateAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const availableGrades = [
  "Pre-K", "Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"
];

const availableSubjects = [
  "Robotics", "Coding", "AI/ML", "Python", "Mathematics", "Science", "English"
];

export default function CreateAccountDialog({
  isOpen,
  onClose,
  onSuccess,
}: CreateAccountDialogProps) {
  const [role, setRole] = useState<'student' | 'teacher' | 'school_admin' | 'admin'>('student');
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form data
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    // Student fields
    school_id: "",
    grade: "",
    parent_name: "",
    parent_phone: "",
    // Teacher fields
    qualification: "",
    experience_years: 0,
    specialization: "",
    school_assignments: [] as SchoolAssignment[],
    // School Admin fields
    permissions: {} as Record<string, any>,
    // Admin fields
    is_super_admin: false,
  });

  const schoolsLoadedRef = useRef(false);

  useEffect(() => {
    if (isOpen && !schoolsLoadedRef.current) {
      loadSchools();
      schoolsLoadedRef.current = true;
    }
    if (!isOpen) {
      schoolsLoadedRef.current = false;
      resetForm();
    }
  }, [isOpen]);

  const loadSchools = async () => {
    setLoadingSchools(true);
    try {
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json();
      
      if (response.ok && data.schools) {
        setSchools(data.schools || []);
      } else {
        console.error('Failed to load schools:', data.error);
      }
    } catch (error) {
      console.error('Error loading schools:', error);
    } finally {
      setLoadingSchools(false);
    }
  };

  const resetForm = () => {
    setRole('student');
    setFormData({
      full_name: "",
      email: "",
      password: "",
      phone: "",
      address: "",
      school_id: "",
      grade: "",
      parent_name: "",
      parent_phone: "",
      qualification: "",
      experience_years: 0,
      specialization: "",
      school_assignments: [],
      permissions: {},
      is_super_admin: false,
    });
    setError("");
    setSuccess(false);
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Common fields
    if (!formData.full_name.trim()) {
      newErrors.full_name = "Full name is required";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else {
      // Validate password strength (8+ chars, uppercase, lowercase, number)
      const passwordError = validatePasswordClient(formData.password);
      if (passwordError) {
        newErrors.password = passwordError;
      }
    }

    // Role-specific validation
    if (role === 'student') {
      if (!formData.school_id) {
        newErrors.school_id = "School is required";
      }
      if (!formData.grade) {
        newErrors.grade = "Grade is required";
      }
    }

    if (role === 'teacher') {
      if (formData.school_assignments.length === 0) {
        newErrors.school_assignments = "At least one school assignment is required";
      }
    }

    if (role === 'school_admin') {
      if (!formData.school_id) {
        newErrors.school_id = "School is required";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Build request body based on role
       
      const requestBody: any = {
        role,
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        password: formData.password,
      };

      // Add role-specific fields
      if (role === 'student') {
        requestBody.school_id = formData.school_id;
        requestBody.grade = formData.grade;
        if (formData.phone) requestBody.phone = formData.phone;
        if (formData.address) requestBody.address = formData.address;
        if (formData.parent_name) requestBody.parent_name = formData.parent_name;
        if (formData.parent_phone) requestBody.parent_phone = formData.parent_phone;
      }

      if (role === 'teacher') {
        requestBody.school_assignments = formData.school_assignments;
        if (formData.phone) requestBody.phone = formData.phone;
        if (formData.address) requestBody.address = formData.address;
        if (formData.qualification) requestBody.qualification = formData.qualification;
        if (formData.experience_years) requestBody.experience_years = formData.experience_years;
        if (formData.specialization) requestBody.specialization = formData.specialization;
      }

      if (role === 'school_admin') {
        requestBody.school_id = formData.school_id;
        if (formData.phone) requestBody.phone = formData.phone;
        if (Object.keys(formData.permissions).length > 0) {
          requestBody.permissions = formData.permissions;
        }
      }

      if (role === 'admin') {
        if (formData.is_super_admin) {
          requestBody.is_super_admin = true;
        }
        if (Object.keys(formData.permissions).length > 0) {
          requestBody.permissions = formData.permissions;
        }
      }

      // Get session token for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        setError("Authentication error. Please log in again.");
        setLoading(false);
        return;
      }

      const response = await fetchWithCsrf('/api/admin/create-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          resetForm();
          onClose();
        }, 1500);
      } else {
        setError(result.error || "Failed to create account. Please try again.");
      }
    } catch (error) {
      console.error('Error creating account:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const addSchoolAssignment = () => {
    setFormData(prev => ({
      ...prev,
      school_assignments: [
        ...prev.school_assignments,
        {
          school_id: "",
          grades_assigned: [],
          subjects: [],
        },
      ],
    }));
  };

  const removeSchoolAssignment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      school_assignments: prev.school_assignments.filter((_, i) => i !== index),
    }));
  };

  const updateSchoolAssignment = (index: number, field: keyof SchoolAssignment, value: any) => {
    setFormData(prev => ({
      ...prev,
      school_assignments: prev.school_assignments.map((assignment, i) =>
        i === index ? { ...assignment, [field]: value } : assignment
      ),
    }));
  };

  const getRoleIcon = () => {
    switch (role) {
      case 'student':
        return <GraduationCap className="h-5 w-5" />;
      case 'teacher':
        return <User className="h-5 w-5" />;
      case 'school_admin':
        return <School className="h-5 w-5" />;
      case 'admin':
        return <Shield className="h-5 w-5" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getRoleIcon()}
            Create New Account
          </DialogTitle>
          <DialogDescription>
            Create a new account for a student, teacher, school admin, or system admin
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Account created successfully!
              </AlertDescription>
            </Alert>
          )}

          {/* Role Selection */}
          <div>
            <Label>Account Type *</Label>
            <Select value={role} onValueChange={(value: any) => {
              setRole(value);
              setErrors({});
              // Reset role-specific fields
              setFormData(prev => ({
                ...prev,
                school_id: "",
                grade: "",
                school_assignments: [],
              }));
            }}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Student
                  </div>
                </SelectItem>
                <SelectItem value="teacher">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Teacher
                  </div>
                </SelectItem>
                <SelectItem value="school_admin">
                  <div className="flex items-center gap-2">
                    <School className="h-4 w-4" />
                    School Admin
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    System Admin
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Common Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Enter full name"
                className="mt-1"
                required
              />
              {errors.full_name && (
                <p className="text-sm text-red-600 mt-1">{errors.full_name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter email address"
                className="mt-1"
                required
              />
              {errors.email && (
                <p className="text-sm text-red-600 mt-1">{errors.email}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="password">Password *</Label>
            <div className="relative mt-1">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder={role === 'admin' ? "Min 8 characters" : "Min 6 characters"}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-600 mt-1">{errors.password}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {role === 'admin' ? 'Must be at least 8 characters' : 'Must be at least 6 characters'}
            </p>
          </div>

          {/* Student Fields */}
          {role === 'student' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="school_id">School *</Label>
                  <Select
                    value={formData.school_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, school_id: value }))}
                    disabled={loadingSchools}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select school" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.map((school) => (
                        <SelectItem key={school.id} value={school.id}>
                          {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.school_id && (
                    <p className="text-sm text-red-600 mt-1">{errors.school_id}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="grade">Grade *</Label>
                  <Select
                    value={formData.grade}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, grade: value }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGrades.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.grade && (
                    <p className="text-sm text-red-600 mt-1">{errors.grade}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone (Optional)</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="parent_name">Parent Name (Optional)</Label>
                  <Input
                    id="parent_name"
                    value={formData.parent_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, parent_name: e.target.value }))}
                    placeholder="Enter parent name"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="parent_phone">Parent Phone (Optional)</Label>
                  <Input
                    id="parent_phone"
                    value={formData.parent_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, parent_phone: e.target.value }))}
                    placeholder="Enter parent phone"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="address">Address (Optional)</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Enter address"
                    className="mt-1"
                  />
                </div>
              </div>
            </>
          )}

          {/* Teacher Fields */}
          {role === 'teacher' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="qualification">Qualification (Optional)</Label>
                  <Input
                    id="qualification"
                    value={formData.qualification}
                    onChange={(e) => setFormData(prev => ({ ...prev, qualification: e.target.value }))}
                    placeholder="e.g., M.Ed, B.Sc"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="experience_years">Experience (Years) (Optional)</Label>
                  <Input
                    id="experience_years"
                    type="number"
                    min="0"
                    value={formData.experience_years}
                    onChange={(e) => setFormData(prev => ({ ...prev, experience_years: parseInt(e.target.value) || 0 }))}
                    placeholder="Years of experience"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="specialization">Specialization (Optional)</Label>
                <Input
                  id="specialization"
                  value={formData.specialization}
                  onChange={(e) => setFormData(prev => ({ ...prev, specialization: e.target.value }))}
                  placeholder="e.g., Mathematics, Science"
                  className="mt-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>School Assignments *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSchoolAssignment}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Assignment
                  </Button>
                </div>
                {errors.school_assignments && (
                  <p className="text-sm text-red-600 mb-2">{errors.school_assignments}</p>
                )}
                {formData.school_assignments.map((assignment, index) => (
                  <div key={index} className="border rounded-lg p-4 mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Assignment {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSchoolAssignment(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <Label>School *</Label>
                      <Select
                        value={assignment.school_id}
                        onValueChange={(value) => updateSchoolAssignment(index, 'school_id', value)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select school" />
                        </SelectTrigger>
                        <SelectContent>
                          {schools.map((school) => (
                            <SelectItem key={school.id} value={school.id}>
                              {school.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Grades Assigned</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {availableGrades.map((grade) => (
                          <div key={grade} className="flex items-center space-x-2">
                            <Checkbox
                              id={`grade-${index}-${grade}`}
                              checked={assignment.grades_assigned.includes(grade)}
                              onCheckedChange={(checked) => {
                                const newGrades = checked
                                  ? [...assignment.grades_assigned, grade]
                                  : assignment.grades_assigned.filter((g) => g !== grade);
                                updateSchoolAssignment(index, 'grades_assigned', newGrades);
                              }}
                            />
                            <Label htmlFor={`grade-${index}-${grade}`} className="text-sm font-normal cursor-pointer">
                              {grade}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Subjects</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {availableSubjects.map((subject) => (
                          <div key={subject} className="flex items-center space-x-2">
                            <Checkbox
                              id={`subject-${index}-${subject}`}
                              checked={assignment.subjects.includes(subject)}
                              onCheckedChange={(checked) => {
                                const newSubjects = checked
                                  ? [...assignment.subjects, subject]
                                  : assignment.subjects.filter((s) => s !== subject);
                                updateSchoolAssignment(index, 'subjects', newSubjects);
                              }}
                            />
                            <Label htmlFor={`subject-${index}-${subject}`} className="text-sm font-normal cursor-pointer">
                              {subject}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* School Admin Fields */}
          {role === 'school_admin' && (
            <div>
              <Label htmlFor="school_admin_school_id">School *</Label>
              <Select
                value={formData.school_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, school_id: value }))}
                disabled={loadingSchools}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.school_id && (
                <p className="text-sm text-red-600 mt-1">{errors.school_id}</p>
              )}
            </div>
          )}

          {/* Admin Fields */}
          {role === 'admin' && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_super_admin"
                checked={formData.is_super_admin}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, is_super_admin: checked as boolean }))
                }
              />
              <Label htmlFor="is_super_admin" className="text-sm font-normal cursor-pointer">
                Super Admin (Full system access)
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


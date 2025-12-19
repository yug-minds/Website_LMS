"use client";

import { useState, useEffect } from "react";
import { useAutoSaveForm } from "../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../lib/form-persistence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { 
  School,
  User,
  Key,
  CheckCircle,
  AlertCircle,
  Loader2
} from "lucide-react";

interface ValidationResult {
  valid: boolean;
  school_id?: string;
  school_name?: string;
  grade?: string;
  expires_at?: string;
  error?: string;
}

export default function StudentRegistration() {
  const [joiningCode, setJoiningCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  
  // Load saved registration data (but NOT passwords for security)
  const savedStudentData = typeof window !== 'undefined'
    ? loadFormData<{
        full_name: string;
        email: string;
        joiningCode: string;
      }>('student-registration-form')
    : null;

  const [studentData, setStudentData] = useState({
    full_name: savedStudentData?.full_name || "",
    email: savedStudentData?.email || "",
    password: "", // Never save password
    confirmPassword: "" // Never save password
  });
  const [registrationResult, setRegistrationResult] = useState<any>(null);

  // Load joining code if saved
  useEffect(() => {
    if (savedStudentData?.joiningCode) {
      setJoiningCode(savedStudentData.joiningCode);
    }
  }, [savedStudentData]);

  // Auto-save registration form (excluding passwords)
  const { clearSavedData } = useAutoSaveForm({
    formId: 'student-registration-form',
    formData: {
      full_name: studentData.full_name,
      email: studentData.email,
      joiningCode: joiningCode,
      // Intentionally exclude passwords
    },
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: true, // Use sessionStorage for registration
    onLoad: (data) => {
      if (data && !savedStudentData) {
        if (data.full_name) setStudentData(prev => ({ ...prev, full_name: data.full_name }));
        if (data.email) setStudentData(prev => ({ ...prev, email: data.email }));
        if (data.joiningCode) setJoiningCode(data.joiningCode);
      }
    },
    markDirty: true,
  });

  const validateJoiningCode = async () => {
    if (!joiningCode.trim()) {
      setValidationResult({ valid: false, error: "Please enter a joining code" });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await fetch(`/api/validate-joining-code?code=${encodeURIComponent(joiningCode)}`);
      const result = await response.json();

      setValidationResult(result);
    } catch (error) {
      console.error('Error validating joining code:', error);
      setValidationResult({ 
        valid: false, 
        error: "Failed to validate joining code. Please try again." 
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleStudentRegistration = async () => {
    if (!validationResult?.valid) {
      return;
    }

    // Validate form data
    if (!studentData.full_name || !studentData.email || !studentData.password) {
      setRegistrationResult({ 
        success: false, 
        error: "Please fill in all required fields" 
      });
      return;
    }

    if (studentData.password !== studentData.confirmPassword) {
      setRegistrationResult({ 
        success: false, 
        error: "Passwords do not match" 
      });
      return;
    }

    setIsRegistering(true);
    setRegistrationResult(null);

    try {
      const response = await fetch('/api/validate-joining-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: joiningCode,
          studentData: {
            full_name: studentData.full_name,
            email: studentData.email,
            password: studentData.password
          }
        }),
      });

      const result = await response.json();

      if (result.success) {
        setRegistrationResult({
          success: true,
          message: `Welcome to ${result.school_name}! You have been enrolled in ${result.grade}.`,
          student_id: result.student_id
        });
        
        // Clear saved form data after successful registration
        clearFormData('student-registration-form');
        clearSavedData();

        // Reset form
        setStudentData({
          full_name: "",
          email: "",
          password: "",
          confirmPassword: ""
        });
        setJoiningCode("");
        setValidationResult(null);
      } else {
        setRegistrationResult({
          success: false,
          error: result.error || "Registration failed"
        });
      }
    } catch (error) {
      console.error('Error registering student:', error);
      setRegistrationResult({ 
        success: false, 
        error: "Registration failed. Please try again." 
      });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <School className="mx-auto h-12 w-12 text-blue-600" />
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Student Registration</h1>
          <p className="mt-2 text-gray-600">
            Register using your school&apos;s joining code
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Step 1: Enter Joining Code
            </CardTitle>
            <CardDescription>
              Enter the joining code provided by your school
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="joiningCode">Joining Code</Label>
              <div className="flex gap-2">
                <Input
                  id="joiningCode"
                  autoComplete="off"
                  value={joiningCode}
                  onChange={(e) => setJoiningCode(e.target.value.toUpperCase())}
                  placeholder="Enter your joining code"
                  className="font-mono"
                />
                <Button 
                  onClick={validateJoiningCode}
                  disabled={isValidating}
                  className="px-6"
                >
                  {isValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Validate"
                  )}
                </Button>
              </div>
            </div>

            {validationResult && (
              <Alert className={validationResult.valid ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                {validationResult.valid ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription className={validationResult.valid ? "text-green-800" : "text-red-800"}>
                  {validationResult.valid ? (
                    <>
                      <div className="font-semibold">Valid Joining Code!</div>
                      <div className="text-sm mt-1">
                        School: {validationResult.school_name}<br />
                        Grade: {validationResult.grade}
                      </div>
                    </>
                  ) : (
                    validationResult.error
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {validationResult?.valid && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Step 2: Student Information
              </CardTitle>
              <CardDescription>
                Provide your personal information to complete registration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  autoComplete="name"
                  value={studentData.full_name}
                  onChange={(e) => setStudentData({ ...studentData, full_name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={studentData.email}
                  onChange={(e) => setStudentData({ ...studentData, email: e.target.value })}
                  placeholder="Enter your email address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={studentData.password}
                  onChange={(e) => setStudentData({ ...studentData, password: e.target.value })}
                  placeholder="Create a password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={studentData.confirmPassword}
                  onChange={(e) => setStudentData({ ...studentData, confirmPassword: e.target.value })}
                  placeholder="Confirm your password"
                />
              </div>

              <Button 
                onClick={handleStudentRegistration}
                disabled={isRegistering}
                className="w-full"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <User className="mr-2 h-4 w-4" />
                    Complete Registration
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {registrationResult && (
          <Alert className={registrationResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            {registrationResult.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={registrationResult.success ? "text-green-800" : "text-red-800"}>
              {registrationResult.success ? (
                <>
                  <div className="font-semibold">Registration Successful!</div>
                  <div className="text-sm mt-1">{registrationResult.message}</div>
                  <div className="text-sm mt-2">
                    You can now log in with your email and password.
                  </div>
                </>
              ) : (
                registrationResult.error
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}








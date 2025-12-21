"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { CheckCircle, AlertCircle, Loader2, School, ArrowLeft } from "lucide-react";

interface ValidationResult {
  is_valid: boolean;
  school_id?: string;
  school_name?: string;
  grade?: string;
  expires_at?: string;
  message?: string;
}

export default function SignupPage() {
  const [step, setStep] = useState<'code' | 'form'>('code');
  const [joiningCode, setJoiningCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  // Step 1: Validate Joining Code
  const validateJoiningCode = async () => {
    if (!joiningCode.trim()) {
      setError("Please enter a joining code");
      return;
    }

    setIsValidating(true);
    setError("");
    setValidationResult(null);

    try {
      const response = await fetch('/api/validate-joining-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: joiningCode.trim().toUpperCase() }),
      });

      const result = await response.json();

      if (result.is_valid) {
        setValidationResult(result);
        setStep('form');
      } else {
        setError(result.message || 'Invalid or expired joining code');
        setValidationResult({ is_valid: false, message: result.message });
      }
    } catch (error) {
      console.error('Error validating joining code:', error);
      setError("Failed to validate joining code. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  // Step 2: Register Student
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    // Validation
    if (!fullName.trim()) {
      setError("Full name is required");
      setLoading(false);
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    // Validate password strength (8+ chars, uppercase, lowercase, number)
    const { validatePasswordClient } = await import('../../../lib/password-validation');
    const passwordError = validatePasswordClient(password);
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }

    if (!validationResult?.is_valid) {
      setError("Please validate your joining code first");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/validate-joining-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: joiningCode.trim().toUpperCase(),
          studentData: {
            full_name: fullName.trim(),
            email: email.trim(),
            password: password,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage(`Welcome to ${validationResult.school_name}! Your account has been created successfully.`);
        
        // Redirect to login after a short delay
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError(result.error || result.message || "Registration failed. Please try again.");
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <School className="mx-auto h-12 w-12 text-blue-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Join the Student Portal with your joining code
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 'code' ? 'Enter Joining Code' : 'Student Registration'}
            </CardTitle>
            <CardDescription>
              {step === 'code' 
                ? 'Enter the joining code provided by your school'
                : `Registering for ${validationResult?.school_name || 'your school'}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'code' ? (
              // Step 1: Joining Code Validation
              <div className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div>
                  <Label htmlFor="joiningCode">Joining Code</Label>
                  <Input
                    id="joiningCode"
                    type="text"
                    value={joiningCode}
                    onChange={(e) => setJoiningCode(e.target.value.toUpperCase())}
                    placeholder="Enter your joining code"
                    className="mt-1 uppercase"
                    disabled={isValidating}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        validateJoiningCode();
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Get this code from your school administrator
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={validateJoiningCode}
                  className="w-full"
                  disabled={isValidating || !joiningCode.trim()}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Validate Code'
                  )}
                </Button>
              </div>
            ) : (
              // Step 2: Registration Form
              <form onSubmit={handleSignup} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {message && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">{message}</AlertDescription>
                  </Alert>
                )}

                {/* School Info Display */}
                {validationResult?.is_valid && (
                  <Alert className="bg-blue-50 border-blue-200">
                    <School className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      <div className="font-semibold">{validationResult.school_name}</div>
                      {validationResult.grade && (
                        <div className="text-sm">Grade: {validationResult.grade}</div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="mt-1"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1"
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="mt-1"
                    placeholder="Enter your password"
                    minLength={6}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Must be at least 6 characters
                  </p>
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="mt-1"
                    placeholder="Confirm your password"
                    minLength={6}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStep('code');
                      setError("");
                      setMessage("");
                    }}
                    className="flex-1"
                    disabled={loading}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </div>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

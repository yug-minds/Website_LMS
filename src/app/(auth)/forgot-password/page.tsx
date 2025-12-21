"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { AlertCircle, CheckCircle, Mail, Clock, Shield, ArrowLeft } from "lucide-react";
import { withCsrfToken } from "../../../lib/csrf-client";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      // Get CSRF token and include it in the request
      const requestOptions = await withCsrfToken({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const response = await fetch('/api/auth/password-reset-request', requestOptions);

      const data = await response.json();

      if (!response.ok) {
        // Show detailed error message if available
        let errorMessage = data.error || data.message || 'Failed to submit password reset request. Please try again.';
        if (data.details && data.details !== errorMessage) {
          errorMessage += ` (${data.details})`;
        }
        setError(errorMessage);
        return;
      }

      // Success - request submitted
      setMessage(data.message || 'Password reset request submitted successfully.');
      setSubmitted(true);
     
    } catch (error: any) {
      console.error('Error submitting password reset request:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Forgot your password?
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Submit a password reset request. An administrator will review and approve it.
          </p>
        </div>

        <Card className="shadow-lg border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Request Password Reset
            </CardTitle>
            <CardDescription>
              {submitted 
                ? "Your request has been submitted and will be reviewed by an administrator."
                : "Enter your email address to submit a password reset request"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800 font-semibold">Request Submitted Successfully</AlertTitle>
                  <AlertDescription className="text-green-700 mt-2">
                    Your password reset request has been submitted. An administrator will review your request and approve it.
                    Once approved, you will receive a notification with a temporary password that you can use to log in and set a new password.
                  </AlertDescription>
                </Alert>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
                      <ol className="list-decimal list-inside space-y-1.5 text-sm text-blue-800">
                        <li>Your request will be reviewed by an administrator</li>
                        <li>You&apos;ll receive a notification when your request is approved</li>
                        <li>The notification will contain a temporary password</li>
                        <li>Log in with the temporary password</li>
                        <li>You&apos;ll be prompted to set a new password</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSubmitted(false);
                      setEmail("");
                      setMessage("");
                    }}
                  >
                    Submit Another Request
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => router.push('/login')}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {message && !submitted && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">Success</AlertTitle>
                    <AlertDescription className="text-green-700">{message}</AlertDescription>
                  </Alert>
                )}

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
                    placeholder="Enter your email address"
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Enter the email address associated with your account
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Submitting Request...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Submit Reset Request
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center border-t pt-4">
              <Link
                href="/login"
                className="text-sm text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

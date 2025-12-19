"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { SignInPage, Testimonial } from "../../../components/ui/sign-in";
import ResizableNavbar from "../../../components/ResizableNavbar";
import { AlertCircle } from "lucide-react";
import { markFreshLogin } from "../../../hooks/useSessionValidation";
import { shortenUserId } from "../../../lib/utils";
import { waitForSession } from "../../../lib/session-utils";
import { addCsrfTokenToHeaders } from "../../../lib/csrf-client";

const sampleTestimonials: Testimonial[] = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@sarahdigital",
    text: "Amazing platform! The user experience is seamless and the features are exactly what I needed."
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "Marcus Johnson",
    handle: "@marcustech",
    text: "This service has transformed how I work. Clean design, powerful features, and excellent support."
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "David Martinez",
    handle: "@davidcreates",
    text: "I've tried many platforms, but this one stands out. Intuitive, reliable, and genuinely helpful for productivity."
  },
];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const ROLE_HOME: Record<string, string> = {
    admin: '/admin',
    super_admin: '/admin',
    school_admin: '/school-admin',
    teacher: '/teacher',
    student: '/student',
  };

  // This will never let the page go blank on error
  function ErrorMessage() {
    if (!error) return null;
    // error is already a string, so we can use it directly
    // Split by newlines to handle multi-line error messages
    const errorLines = error.split('\n');
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-50 border-2 border-red-300 text-red-700 px-6 py-4 rounded-lg text-sm z-50 shadow-lg max-w-md w-full mx-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            {errorLines.map((line, idx) => (
              <p key={idx} className={idx === 0 ? "font-medium" : ""}>
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Check Supabase connectivity before attempting login
  const checkSupabaseConnection = async (): Promise<{ connected: boolean; error?: string }> => {
    try {
      // Try a simple health check - get the current session (which will fail gracefully if not connected)
      const { error } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ error: { message: string } }>((_, reject) =>
          setTimeout(() => reject({ error: { message: 'Connection timeout' } }), 5000)
        )
      ]) as any;
      
      // If we get a network error, connection is down
      if (error && (
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('CORS') ||
        error.message?.includes('522') ||
        error.message?.includes('ERR_FAILED')
      )) {
        return { connected: false, error: error.message };
      }
      
      // Connection seems OK (even if no session, that's fine)
      return { connected: true };
    } catch (err: any) {
      // Network error or timeout
      if (err?.error?.message?.includes('timeout') || 
          err?.message?.includes('Failed to fetch') ||
          err?.message?.includes('CORS')) {
        return { connected: false, error: 'Unable to reach authentication server' };
      }
      // Other errors might be OK (like no session), so assume connected
      return { connected: true };
    }
  };

  // Correct event-based handler (for SignInPage)
  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    let loginTimeout: NodeJS.Timeout | null = null;
    try {
      const formData = new FormData(event.currentTarget);
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;
      
      console.log('Attempting login with email:', email);
      
      if (!email || !password) {
        setLoading(false);
        setError("Email and password are required.");
        return;
      }
      
      // Check Supabase connection before attempting login
      console.log('🔍 Checking Supabase connection...');
      const connectionCheck = await checkSupabaseConnection();
      if (!connectionCheck.connected) {
        setLoading(false);
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'not configured';
        console.error('❌ Supabase connection check failed:', connectionCheck.error);
        console.error('🔧 Supabase URL:', supabaseUrl);
        setError(`Unable to connect to the authentication server.\n\nPossible causes:\n• Server is temporarily unavailable (522 error)\n• Network connectivity issues\n• CORS configuration problems\n• Incorrect Supabase URL configuration\n\nPlease verify your internet connection and try again. If the problem persists, the Supabase instance may be down.`);
        return;
      }
      console.log('✅ Supabase connection OK');
      
      // Add timeout to prevent infinite loading - increased to 60 seconds to allow for retries
      loginTimeout = setTimeout(() => {
        setLoading(false);
        setError("Login is taking too long. The authentication server may be experiencing issues. Please try again in a few moments.");
      }, 60000); // 60 seconds to allow for retries in supabase client

      let loginResult: any = null;
      let loginError: any = null;
      
      try {
        // The supabase client now has built-in retry logic, so we don't need Promise.race
        // Just call signInWithPassword directly and let the client handle retries
        console.log('🔐 Starting login with retry-enabled Supabase client...');
        loginResult = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });
        
        loginError = loginResult?.error;
        if (loginTimeout) clearTimeout(loginTimeout);
      } catch (networkError: any) {
        if (loginTimeout) clearTimeout(loginTimeout);
        console.error('Network error during login:', networkError);
        setLoading(false);
        
        // Handle timeout errors
        if (networkError.message?.includes('timeout') || 
            networkError.message?.includes('Timeout') ||
            networkError.message?.includes('took too long')) {
          setError("The authentication server is taking too long to respond. This could indicate:\n• Server is temporarily unavailable\n• Network connectivity issues\n• High server load\n\nPlease try again in a few moments.");
          return;
        }
        
        // Handle network/CORS errors with more specific messages
        if (networkError.message?.includes('CORS') || 
            networkError.message?.includes('Failed to fetch') ||
            networkError.message?.includes('522') ||
            networkError.message?.includes('ERR_FAILED') ||
            networkError.message?.includes('Network error') ||
            networkError.name === 'AuthRetryableFetchError') {
          setError("Unable to connect to authentication server. This could be due to:\n• Server is temporarily unavailable\n• Network connectivity issues\n• CORS configuration problems\n\nPlease check your internet connection and try again in a few moments.");
          return;
        }
        
        // For other errors, show the actual error message
        setError(networkError.message || "An error occurred during login. Please try again.");
        return;
      }
      
      // Track login attempt (failure)
      if (loginError) {
        console.error('Login error:', loginError);
        
        setLoading(false); // Always clear loading on error
        
        // Track failed login attempt (non-blocking)
        addCsrfTokenToHeaders({
          'Content-Type': 'application/json',
        }).then(headers => {
          return fetch('/api/auth/track-login', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              email: email.trim(),
              success: false,
              failure_reason: loginError.message,
              ip_address: null, // Could be extracted from request headers if needed
              user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null
            })
          });
        }).catch(trackError => {
          console.error('Error tracking login attempt:', trackError);
          // Don't show error to user - tracking is non-critical
        });
        
        // Provide more specific error messages
        if (loginError.message?.includes('Invalid login credentials') || 
            loginError.message?.includes('Email not confirmed') ||
            loginError.message?.includes('Invalid login')) {
          setError("Invalid login credentials. Please check your email and password.");
        } else if (loginError.message?.includes('email') || loginError.message?.includes('not found')) {
          setError("Email address not found. Please check your email or create an account.");
        } else {
          setError(loginError.message || "Login failed. Please check your credentials.");
        }
        setLoading(false);
        return;
      }
      
      const data = loginResult?.data;
      
      if (!data || !data.user) {
        // Track failed login attempt (non-blocking)
        addCsrfTokenToHeaders({
          'Content-Type': 'application/json',
        }).then(headers => {
          return fetch('/api/auth/track-login', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              email: email.trim(),
              success: false,
              failure_reason: 'No user found',
              ip_address: null,
              user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null
            })
          });
        }).catch(trackError => {
          console.error('Error tracking login attempt:', trackError);
          // Don't show error to user - tracking is non-critical
        });
        
        setError("No user found. Please check your credentials.");
        setLoading(false);
        return;
      }
      
      console.log('Login successful for user:', shortenUserId(data.user.id));
      
      // Wait for session to be confirmed before redirecting
      // This ensures the session is persisted in localStorage/cookies
      console.log('⏳ Waiting for session to be confirmed...');
      const sessionResult = await waitForSession(3, 500);
      
      if (!sessionResult || !sessionResult.session) {
        console.error('❌ Session not available after login, retrying...');
        // Try one more time with longer delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryResult = await waitForSession(2, 500);
        
        if (!retryResult || !retryResult.session) {
          console.error('❌ Session still not available after retry');
          setError("Session could not be established. Please try logging in again.");
          setLoading(false);
          return;
        }
      }
      
      console.log('✅ Session confirmed, proceeding with redirect');
      
      // Track successful login attempt (non-blocking)
      addCsrfTokenToHeaders({
        'Content-Type': 'application/json',
      }).then(headers => {
        return fetch('/api/auth/track-login', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: data.user.id,
            email: email.trim(),
            success: true,
            ip_address: null,
            user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null
          })
        });
      }).catch(trackError => {
        console.error('Error tracking login attempt:', trackError);
        // Don't show error to user - tracking is non-critical
      });
      
      // Attempt to get user's role (from metadata first, then profile)
      // Normalize role from metadata if present
      let userRole: string | null = (data.user.user_metadata?.role as string) || null;
      if (userRole) {
        userRole = userRole.trim().toLowerCase();
      }
      
      if (!userRole) {
        try {
          console.log('Fetching role from API for userId:', shortenUserId(data.user.id));
          
          // Use the session we just confirmed to get the access token
          const sessionToUse = sessionResult?.session || data.session;
          
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };
          
          // Include authorization header with the access token from the session
          if (sessionToUse?.access_token) {
            headers['Authorization'] = `Bearer ${sessionToUse.access_token}`;
            console.log('✅ Including authorization header with session token');
          } else {
            console.warn('⚠️ No access token available in session, API will use admin fallback');
          }
          
          const resp = await fetch(`/api/get-role?userId=${data.user.id}`, { 
            cache: 'no-store',
            method: 'GET',
            headers
          });
          
          if (!resp.ok) {
            // Check if it's an inactive account error (403)
            if (resp.status === 403) {
              try {
                const json = await resp.json();
                if (json.isActive === false) {
                  setError(json.error || 'Your account has been deactivated. Please contact your administrator.');
                  setLoading(false);
                  // Sign out the user since they can't access
                  await supabase.auth.signOut();
                  return;
                }
              } catch (e) {
                // If JSON parsing fails, continue with normal error handling
                console.error('Error parsing 403 response:', e);
              }
            }
            // For other errors, try to get error message
            let errorText = '';
            try {
              const errorJson = await resp.json();
              errorText = errorJson.error || errorJson.message || '';
            } catch (e) {
              errorText = await resp.text().catch(() => 'Unknown error');
            }
            console.error('Role API error:', resp.status, errorText);
            throw new Error(errorText || `Failed to fetch role: ${resp.status}`);
          }
          
          const json = await resp.json();
          console.log('🔍 Login: Role API response:', json);
          
          if (json.error) {
            throw new Error(json.error);
          }
          
          userRole = json?.role || null;
          const forcePasswordChange = json?.force_password_change || false;
          
          console.log(`🔍 Login: Role from API response - raw="${userRole}"`);
          
          // Normalize role: trim and lowercase for consistency
          if (userRole) {
            const roleBeforeNormalize = userRole;
            userRole = userRole.trim().toLowerCase();
            console.log(`🔄 Login: Role normalization - before="${roleBeforeNormalize}", after="${userRole}"`);
          } else {
            console.error('❌ Login: Role is null or undefined from API');
          }
          
          console.log('✅ Login: User role from API (normalized):', userRole, 'force_password_change:', forcePasswordChange);
          
          // Pass role and force_password_change to redirect API to avoid duplicate query
          if (userRole) {
            // Mark that we just logged in - this prevents the session validation hook
            // from immediately invalidating the session on the new page
            markFreshLogin();
            
            // Determine redirect path client-side as well (for verification)
            const roleRoutes: Record<string, string> = {
              admin: '/admin',
              super_admin: '/admin',
              school_admin: '/school-admin',
              teacher: '/teacher',
              student: '/student',
            };
            const expectedPath = roleRoutes[userRole] || '/login';
            console.log(`✅ Login: User role="${userRole}", expected redirect path="${expectedPath}"`);
            
            // Mark that we're redirecting (for dashboard layouts to detect)
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('_redirecting', 'true');
            }
            
            // Redirect to server-side API route with role parameter
            // The API will verify role from database and redirect accordingly
            const redirectUrl = `/api/auth/redirect?userId=${data.user.id}&role=${encodeURIComponent(userRole)}&force_password_change=${forcePasswordChange}`;
            console.log('✅ Redirecting via server-side API:', redirectUrl);
            console.log('✅ Expected final destination:', expectedPath);
            
            // Minimal delay to ensure session is persisted before redirect
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Use window.location.href for full page redirect (bypasses Next.js router)
            window.location.href = redirectUrl;
            return; // Exit early to prevent further execution
          }
         
        } catch (e: any) {
          console.error('Error fetching role:', e);
          setError(`Could not fetch your user profile: ${e?.message || 'unknown error'}`);
          setLoading(false);
          return;
        }
      }
      
      if (!userRole) {
        setError("User role not found. Please contact support.");
        setLoading(false);
        return;
      }
      
      // Normalize role for comparison
      userRole = userRole.trim().toLowerCase();
      
      // Determine redirect path based on role
      let redirectPath = '/';
      switch (userRole) {
        case "super_admin":
        case "admin":
          redirectPath = "/admin";
          break;
        case "school_admin":
          redirectPath = "/school-admin";
          break;
        case "teacher":
          redirectPath = "/teacher";
          break;
        case "student":
          redirectPath = "/student";
          break;
        default:
          console.error('Unknown user role:', userRole);
          setError("Unknown user role. Please contact support.");
          setLoading(false);
          return;
      }
      
      // Use server-side redirect API to set cookie properly
      // This ensures the cookie is set on the server and middleware can read it
      console.log('✅ User role:', userRole);
      console.log('✅ Redirecting via server-side API to set cookie properly');
      
      // Mark that we just logged in - this prevents the session validation hook
      // from immediately invalidating the session on the new page
      markFreshLogin();
      
      // Redirect to server-side API route that will set the cookie and redirect
      window.location.href = `/api/auth/redirect?userId=${data.user.id}&role=${encodeURIComponent(userRole)}`;
      
     
    } catch (err: any) {
      // Ensure loading is always cleared on any error
      setLoading(false);
      
      // Clear timeout if it exists
      if (loginTimeout) {
        clearTimeout(loginTimeout);
      }
      
      console.error('Unexpected error during login:', err);
      
      // Handle network errors that weren't caught earlier
      if (err.message?.includes('CORS') || 
          err.message?.includes('Failed to fetch') ||
          err.message?.includes('525') ||
          err.message?.includes('ERR_FAILED') ||
          err.name === 'AuthRetryableFetchError') {
        setError("Unable to connect to authentication server. Please check your internet connection or try again later.");
        return;
      }
      
      setError(err.message || "An unexpected error occurred. Please try again.");
      console.error('Unexpected login error:', err);
      setError(err?.message || "Unexpected error during login");
      setLoading(false);
    }
  };

  const handleResetPassword = () => {
    router.push('/forgot-password');
  };
  const handleCreateAccount = () => {
    router.push('/signup');
  };

  return (
    <div className="bg-background min-h-screen min-w-full text-foreground flex flex-col">
      <ResizableNavbar />
      <SignInPage
        onSignIn={handleSignIn}
        testimonials={sampleTestimonials}
        onResetPassword={handleResetPassword}
        onCreateAccount={handleCreateAccount}
        heroImageSrc="/image.png"
      />
      {/* Test Credentials Box - Only shown in development mode */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 right-4 md:left-4 md:right-auto md:bottom-auto md:top-1/2 md:-translate-y-1/2 bg-blue-50 border-2 border-blue-300 text-blue-900 px-5 py-4 rounded-xl text-sm md:max-w-xs z-50 shadow-lg backdrop-blur-sm max-h-[40vh] overflow-y-auto md:max-h-none">
          <h3 className="font-bold mb-3 text-blue-900 text-base flex justify-between items-center">
            Test Credentials
            <span className="md:hidden text-xs bg-blue-200 px-2 py-1 rounded">Scroll for more</span>
          </h3>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-blue-800">Admin: admin@yugminds.com / admin123</span>
              <button 
                onClick={() => {
                  const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
                  const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
                  if (emailInput && passwordInput) {
                    emailInput.value = 'admin@yugminds.com';
                    passwordInput.value = 'admin123';
                    // Trigger input events to ensure form state updates
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }}
                className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >Fill</button>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-blue-800">Teacher: teacher@yugminds.com / TempPass</span>
              <button 
                onClick={() => {
                  const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
                  const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
                  if (emailInput && passwordInput) {
                    emailInput.value = 'teacher@yugminds.com';
                    passwordInput.value = 'TempPass';
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }}
                className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >Fill</button>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-blue-800">Student: student@yugminds.com / pass123</span>
              <button 
                onClick={() => {
                  const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
                  const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
                  if (emailInput && passwordInput) {
                    emailInput.value = 'student@yugminds.com';
                    passwordInput.value = 'pass123';
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }}
                className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >Fill</button>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-blue-800">School Admin: schooladmin@yugminds.com / pass123</span>
              <button 
                onClick={() => {
                  const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
                  const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
                  if (emailInput && passwordInput) {
                    emailInput.value = 'schooladmin@yugminds.com';
                    passwordInput.value = 'pass123';
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }}
                className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >Fill</button>
            </div>
          </div>
        </div>
      )}
      {/* Universal error message boundary */}
      <ErrorMessage />
      {loading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Signing in...</p>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { Sidebar } from "../../components/ui/modern-side-bar";
import { useStudentProfile, useStudentAssignments, useStudentNotifications } from "../../hooks/useStudentData";
import { useSessionValidation } from "../../hooks/useSessionValidation";
import { startActivityTracking, stopActivityTracking } from "../../lib/activity-tracker";

import { useAppStore, type AppState } from "../../store/app-store";
import { useBrowserNavigation } from "../../hooks/useBrowserNavigation";

export default function StudentLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: profile } = useStudentProfile();
  const { data: assignments } = useStudentAssignments();
  const { data: notifications } = useStudentNotifications();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Get sidebar state from store
  const sidebarCollapsed = useAppStore((state: AppState) => state.sidebarCollapsed);

  // Refs for concurrency protection and preventing loops
  const getUserInProgressRef = useRef(false);
  const isInitialMountRef = useRef(true);
  const userLoadedRef = useRef(false);

  // Memoize getStateToSave callback to prevent unnecessary re-runs
  // Add guard to prevent state saving during initial load when user is null
  const getStateToSave = useCallback(() => {
    try {
      // Don't save state during initial load or when user is not loaded
      if (isInitialMountRef.current || !user) {
        return {};
      }
      return {
        sidebarCollapsed: sidebarCollapsed ?? false,
        userEmail: user?.email ?? null,
      };
    } catch (error) {
      console.warn('Error getting state to save:', error);
      return {};
    }
  }, [sidebarCollapsed, user]);

  // Use browser navigation hook to preserve state
  // Note: warnOnUnsavedChanges is false because layout state (sidebar collapse) is not "unsaved changes"
  useBrowserNavigation({
    componentId: 'student-layout',
    getStateToSave,
    warnOnUnsavedChanges: false, // Layout state preservation shouldn't trigger unsaved changes warning
  });

  // Use session validation hook for automatic session management
  const { logout } = useSessionValidation({
    checkInterval: 30000, // Check every 30 seconds
    showAlert: true,
    redirectOnInvalid: true,
    onSessionInvalid: (reason, message) => {
      console.log(`Session invalidated: ${reason} - ${message}`);
    }
  });

  useEffect(() => {
    let mounted = true;

    const getUser = async () => {
      // Concurrency protection: prevent multiple simultaneous calls
      if (getUserInProgressRef.current) {
        console.log('⏸️ Student layout: getUser already in progress, skipping...');
        return;
      }

      // If user is already loaded, don't reload unless explicitly needed
      if (userLoadedRef.current && !isInitialMountRef.current) {
        console.log('⏸️ Student layout: User already loaded, skipping getUser...');
        return;
      }

      getUserInProgressRef.current = true;
      
      try {
        setLoading(true);
        
        // Robust session check with improved timeout handling
        console.log('🔍 Student layout: Checking for session...');
        
        let session = null;
        let sessionError = null;
        
        try {
          // Try to get session with extended timeout for better reliability
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session check timeout')), 20000) // Increased to 20 seconds
          );
          
          const result = await Promise.race([sessionPromise, timeoutPromise]) as any;
          session = result.data?.session;
          sessionError = result.error;
          
        } catch (error: any) {
          console.warn('⚠️ Session check failed:', error.message);
          
          // If it's a timeout or network error, try to continue with localStorage session
          if (error.message.includes('timeout') || error.message.includes('took too long') || error.message.includes('AbortError')) {
            console.log('🔄 Attempting to recover session from localStorage...');
            
            try {
              // Try to get session from localStorage directly
              const storedSession = localStorage.getItem('sb-xyaxjscxqcyqesmmlybh-auth-token');
              if (storedSession) {
                const parsedSession = JSON.parse(storedSession);
                if (parsedSession && parsedSession.access_token && parsedSession.user) {
                  console.log('✅ Recovered session from localStorage');
                  // Create a proper session object
                  session = {
                    access_token: parsedSession.access_token,
                    refresh_token: parsedSession.refresh_token,
                    expires_at: parsedSession.expires_at,
                    user: parsedSession.user
                  };
                }
              }
            } catch (storageError) {
              console.warn('⚠️ Could not recover from localStorage:', storageError);
            }
          }
          
          if (!session) {
            sessionError = error;
          }
        }
        
        if (sessionError || !session) {
          console.error('❌ Student layout: No session found:', sessionError?.message);
          if (mounted) {
            setLoading(false);
          }
          return;
        }
        console.log('✅ Student layout: Session found, user ID:', session.user.id);
        
        // Quick session expiry check
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
          console.error('❌ Student layout: Session is expired');
          if (mounted) {
            setLoading(false);
          }
          return;
        }
        
        // Get user from session (more reliable than getUser() call)
        const authUser = session.user;
        
        if (!authUser) {
          console.error('❌ Student layout: No user in session');
          if (mounted) {
            setLoading(false);
          }
          return;
        }
        
        // Skip role check here - let the profile hook handle role verification
        // This reduces network calls during initial authentication and improves reliability
        console.log('⏸️ Student layout: Skipping role check, will be verified by profile hook');
        
        if (mounted) {
          setUser(authUser);
          setLoading(false);
          isInitialMountRef.current = false; // Mark initial mount as complete
          userLoadedRef.current = true; // Mark user as loaded
          console.log('✅ Student layout: User loaded successfully');
        } else {
          console.warn('⚠️ Student layout: Component unmounted before user could be set');
        }
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error('❌ Student layout: Error getting user:', error);
        
        // Handle timeout errors specifically
        if (errorMessage.includes('timeout') || errorMessage.includes('took too long')) {
          console.warn('⚠️ Student layout: Timeout error detected, will let timeout handler manage redirect');
        }
        
        if (mounted) {
          setLoading(false); // Stop loading even on error
          // Don't redirect here - let the timeout handler do it
        }
      } finally {
        // Always clear the in-progress flag
        if (mounted) {
          getUserInProgressRef.current = false;
        }
        isInitialMountRef.current = false;
        // Note: userLoadedRef is only set to true on success, so we don't clear it here
        // It will be cleared on SIGNED_OUT
      }
    };

    getUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        if (mounted) {
          getUserInProgressRef.current = false;
          userLoadedRef.current = false;
          setUser(null);
          router.push('/login');
        }
      } else if (event === 'SIGNED_IN' && session) {
        // Only re-check user when signed in if user is not already loaded
        // This prevents infinite loops when getUser() completes and triggers SIGNED_IN
        // Use ref to check current state (not stale closure value)
        if (!userLoadedRef.current && !getUserInProgressRef.current) {
          console.log('🔄 Student layout: SIGNED_IN event, reloading user...');
          getUser();
        } else {
          console.log('⏸️ Student layout: SIGNED_IN event ignored (user already loaded or getUser in progress)');
        }
      }
    });

    return () => {
      mounted = false;
      getUserInProgressRef.current = false;
      // Don't reset userLoadedRef here - it should persist across re-renders
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array - router is stable in Next.js 13+

  // Start activity tracking when user is authenticated
  useEffect(() => {
    if (user && !loading) {
      startActivityTracking();
      
      return () => {
        stopActivityTracking();
      };
    }
  }, [user, loading]);

  useEffect(() => {
    // Role verification when profile loads (primary role check)
    if (profile && user) {
      const normalizedRole = profile.role?.trim().toLowerCase();
      console.log('🔍 Student layout: Profile loaded, checking role:', profile.role, 'Normalized:', normalizedRole);
      
      if (normalizedRole !== 'student') {
        console.error('❌ Student layout: Profile role check failed! Role:', profile.role, 'Normalized:', normalizedRole);
        console.log('🔄 Redirecting to appropriate dashboard...');
        router.push('/redirect');
      } else {
        console.log('✅ Student layout: Role verification passed - user is a student');
      }
    }
  }, [profile, user, router]);

  const handleLogout = async () => {
    await logout();
  };

  // Add timeout to prevent infinite loading - reduced timeout for faster recovery
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading && !user) {
        console.warn('⚠️ Loading timeout - taking too long to load user');
        setLoadingTimeout(true);
        setLoading(false); // Stop loading immediately
      }
    }, 15000); // Increased to 15 seconds to allow for slower network conditions

    return () => clearTimeout(timeout);
  }, [loading, user]);

  // Handle redirect on timeout - must be in useEffect, not render
  useEffect(() => {
    if (loadingTimeout && !user && !loading) {
      console.error('❌ User not loaded after timeout, redirecting to login');
      router.push('/login');
    }
  }, [loadingTimeout, user, loading, router]);

  // Only block on user loading, not profile loading (profile can load in background)
  if (loading && !loadingTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading student dashboard...</p>
        </div>
      </div>
    );
  }

  // If timeout occurred but user exists, render anyway
  if (loadingTimeout && loading && user) {
    console.warn('⚠️ Loading timeout but user exists - rendering dashboard');
  }
  
  // If timeout occurred and no user, show redirecting message
  if (loadingTimeout && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Get user's full name from profile, fallback to email
  const userName = profile?.full_name || user?.email?.split('@')[0] || 'Student';
  const userEmail = user?.email || profile?.email || '';

  // Calculate real-time badge counts
  const pendingAssignmentsCount = Array.isArray(assignments) 
    ? (assignments as any[]).filter((a: any) => 
        a.status === 'not_started' || a.status === 'in_progress' || a.status === 'overdue'
      ).length 
    : 0;
  
  const unreadNotificationsCount = notifications?.filter((n: any) => !n.is_read).length || 0;

  return (
    <div className="flex h-screen bg-gray-50" style={{ backgroundColor: '#f9fafb' }}>
      <Sidebar 
        userRole="student"
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
        assignmentBadgeCount={pendingAssignmentsCount}
        notificationBadgeCount={unreadNotificationsCount}
      />
      
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { Sidebar } from "../../components/ui/modern-side-bar";
import { useSessionValidation } from "../../hooks/useSessionValidation";
import { startActivityTracking, stopActivityTracking } from "../../lib/activity-tracker";
import { waitForSession } from "../../lib/session-utils";
import { useAppStore, type AppState } from "../../store/app-store";
import { useBrowserNavigation } from "../../hooks/useBrowserNavigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // Get sidebar state from store
  const sidebarCollapsed = useAppStore((state: AppState) => state.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((state: AppState) => state.setSidebarCollapsed);

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
    componentId: 'admin-layout',
    getStateToSave,
    warnOnUnsavedChanges: false, // Layout state preservation shouldn't trigger unsaved changes warning
  });

  // Use session validation hook for automatic session management
  const { logout, isValid: sessionValid } = useSessionValidation({
    checkInterval: 30000, // Check every 30 seconds
    showAlert: true,
    redirectOnInvalid: true,
    onSessionInvalid: (reason, message) => {
      console.log(`Session invalidated: ${reason} - ${message}`);
    }
  });

  useEffect(() => {
    let mounted = true;
    let overallTimeoutId: NodeJS.Timeout | null = null;

    const getUser = async () => {
      // Concurrency protection: prevent multiple simultaneous calls
      if (getUserInProgressRef.current) {
        console.log('⏸️ Admin layout: getUser already in progress, skipping...');
        return;
      }

      // If user is already loaded, don't reload unless explicitly needed
      if (userLoadedRef.current && !isInitialMountRef.current) {
        console.log('⏸️ Admin layout: User already loaded, skipping getUser...');
        return;
      }

      getUserInProgressRef.current = true;
      
      try {
        setLoading(true);
        
        // Add overall timeout to prevent infinite hanging (10 seconds max - reduced from 15)
        overallTimeoutId = setTimeout(() => {
          if (mounted) {
            console.error('❌ Admin layout: Overall timeout - redirecting to login');
            setLoading(false);
            router.push('/login');
          }
        }, 10000);
        
        // Check if we're coming from a redirect (give time for session to be available)
        const isFromRedirect = typeof window !== 'undefined' && 
          (document.referrer.includes('/api/auth/redirect') || 
           sessionStorage.getItem('_redirecting') === 'true');
        
        if (isFromRedirect) {
          console.log('🔄 Admin layout: Detected redirect, waiting for session to settle...');
          await new Promise(resolve => setTimeout(resolve, 500));
          sessionStorage.removeItem('_redirecting');
        }
        
        // Check session with retry logic (reduced attempts to prevent hanging)
        console.log('🔍 Admin layout: Checking for session...');
        let sessionResult = await waitForSession(3, 400);
        
        // If no session found, try one more time with delay
        if (!sessionResult || !sessionResult.session) {
          console.log('⏳ Admin layout: No session found, waiting and retrying...');
          await new Promise(resolve => setTimeout(resolve, 500));
          sessionResult = await waitForSession(2, 500);
        }
        
        if (!sessionResult || !sessionResult.session) {
          console.error('❌ Admin layout: No session found after retries, redirecting to login');
          if (mounted && overallTimeoutId) {
            clearTimeout(overallTimeoutId);
          }
          if (mounted) {
            setLoading(false);
            router.push('/login');
          }
          return;
        }
        
        const session = sessionResult.session;
        console.log('✅ Admin layout: Session found, user ID:', session.user.id);
        console.log('✅ Admin layout: Session expires at:', new Date(session.expires_at * 1000).toISOString());
        
        // Verify session is valid and not expired
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
          console.error('❌ Admin layout: Session is expired');
          if (mounted) {
            setLoading(false);
            router.push('/login');
          }
          return;
        }
        
        // Get user (session is already confirmed, so this should work)
        let userResult = await supabase.auth.getUser();
        let user = userResult.data.user;
        
        if (userResult.error || !user) {
          console.error('Error getting user:', userResult.error);
          // Try one more time after a short delay
          await new Promise(resolve => setTimeout(resolve, 500));
          userResult = await supabase.auth.getUser();
          user = userResult.data.user;
          
          if (userResult.error || !user) {
            if (mounted) {
              setLoading(false);
              router.push('/login');
            }
            return;
          }
        }
        
        console.log('✅ Admin layout: User found:', user.email);
        
        // IMMEDIATELY check role from database before allowing access
        try {
          // Include authorization header with session token
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };
          
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
          
          console.log('🔍 Admin layout: Fetching role for user:', user.id);
          
          // Add timeout to prevent hanging (5 seconds - reduced from 10)
          const controller = new AbortController();
          const roleCheckTimeoutId = setTimeout(() => controller.abort(), 5000);
          
          let roleResp: Response;
          try {
            roleResp = await fetch(`/api/get-role?userId=${user.id}`, {
              cache: 'no-store',
              method: 'GET',
              headers,
              signal: controller.signal
            });
            clearTimeout(roleCheckTimeoutId);
          } catch (fetchError: any) {
            clearTimeout(roleCheckTimeoutId);
            if (fetchError.name === 'AbortError') {
              throw new Error('Request timeout - role check took too long');
            }
            throw fetchError;
          }
          
          if (roleResp.ok) {
            const roleData = await roleResp.json();
            const userRole = roleData?.role?.trim().toLowerCase();
            
            console.log('Admin layout: Checking role immediately. Role:', userRole, 'User ID:', user.id);
            
            // If user is not an admin, redirect immediately
            if (userRole !== 'admin' && userRole !== 'super_admin') {
              console.error('❌ Admin layout: User is not an admin! Role:', userRole, 'Email:', user.email);
              if (mounted) {
                setLoading(false);
                router.push('/redirect');
              }
              return;
            }
            
            console.log('✅ Admin layout: User is admin, allowing access');
            
            // Clear overall timeout since we succeeded
            if (overallTimeoutId) {
              clearTimeout(overallTimeoutId);
              overallTimeoutId = null;
            }
            
            // Set user and loading state immediately after role verification
            // This allows the dashboard to render faster
            if (mounted) {
              setUser(user);
              setLoading(false);
              isInitialMountRef.current = false; // Mark initial mount as complete
              userLoadedRef.current = true; // Mark user as loaded
            }
          } else {
            console.error('Failed to fetch role, redirecting to login');
            if (mounted) {
              setLoading(false);
              router.push('/login');
            }
            return;
          }
        } catch (roleError: any) {
          console.error('❌ Error checking role:', roleError);
          console.error('❌ Role error details:', {
            message: roleError?.message,
            name: roleError?.name,
            stack: roleError?.stack
          });
          if (mounted) {
            setLoading(false);
            // If it's a timeout, show a more helpful error
            if (roleError?.message === 'Request timeout') {
              console.error('❌ Role check timed out - this might indicate a database connection issue');
            }
            router.push('/login');
          }
          return;
        }
        
        // Get profile via API route (bypasses RLS) for display purposes
        // Fetch in background after dashboard is already rendered
        (async () => {
          try {
            const profileHeaders: HeadersInit = {
              'Content-Type': 'application/json',
            };
            
            if (session?.access_token) {
              profileHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
            
            const profileResponse = await fetch(`/api/profile?userId=${user.id}`, {
              cache: 'no-store',
              method: 'GET',
              headers: profileHeaders
            });
            
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              if (mounted) {
                setUserProfile(profileData.profile);
              }
            } else {
              console.warn('Failed to fetch profile for display, continuing anyway');
            }
          } catch (err) {
            console.warn('Error fetching profile for display:', err);
            // Continue even if profile fetch fails - we already verified role
          }
        })();
      } catch (error) {
        console.error('Error loading user data:', error);
        if (overallTimeoutId) {
          clearTimeout(overallTimeoutId);
          overallTimeoutId = null;
        }
        if (mounted) {
          setLoading(false);
          router.push('/login');
        }
      } finally {
        // Always clear the in-progress flag
        getUserInProgressRef.current = false;
        isInitialMountRef.current = false;
        // Note: userLoadedRef is only set to true on success, so we don't clear it here
        // It will be cleared on SIGNED_OUT
      }
    };

    getUser();
    
    // Set up session listener
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
          console.log('🔄 Admin layout: SIGNED_IN event, reloading user...');
          getUser();
        } else {
          console.log('⏸️ Admin layout: SIGNED_IN event ignored (user already loaded or getUser in progress)');
        }
      }
    });

    return () => {
      mounted = false;
      getUserInProgressRef.current = false;
      // Don't reset userLoadedRef here - it should persist across re-renders
      if (overallTimeoutId) {
        clearTimeout(overallTimeoutId);
      }
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

  const handleLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f9fafb' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50" style={{ backgroundColor: '#f9fafb' }}>
      <Sidebar 
        userRole="admin"
        userName={userProfile?.full_name || user?.email || "Admin User"}
        userEmail={user?.email || "admin@example.com"}
        onLogout={handleLogout}
      />
      
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  );
}

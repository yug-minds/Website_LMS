"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { Sidebar } from "../../components/ui/modern-side-bar";
import { SchoolAdminProvider } from "../../contexts/SchoolAdminContext";
import { useSessionValidation } from "../../hooks/useSessionValidation";
import { startActivityTracking, stopActivityTracking } from "../../lib/activity-tracker";
import { waitForSession } from "../../lib/session-utils";
import { useAppStore, type AppState } from "../../store/app-store";
import { useBrowserNavigation } from "../../hooks/useBrowserNavigation";

export default function SchoolAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  
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
    componentId: 'school-admin-layout',
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
    let timeoutId: NodeJS.Timeout | null = null;

    const getUser = async () => {
      // Concurrency protection: prevent multiple simultaneous calls
      if (getUserInProgressRef.current) {
        console.log('⏸️ School Admin layout: getUser already in progress, skipping...');
        return;
      }

      // If user is already loaded, don't reload unless explicitly needed
      if (userLoadedRef.current && !isInitialMountRef.current) {
        console.log('⏸️ School Admin layout: User already loaded, skipping getUser...');
        return;
      }

      getUserInProgressRef.current = true;
      
      try {
        setLoading(true);
        
        // Check if we're coming from a redirect (give extra time for session to be available)
        const isFromRedirect = typeof window !== 'undefined' && 
          (document.referrer.includes('/api/auth/redirect') || 
           sessionStorage.getItem('_redirecting') === 'true');
        
        if (isFromRedirect) {
          console.log('🔄 School Admin layout: Detected redirect, waiting for session to settle...');
          await new Promise(resolve => setTimeout(resolve, 1500));
          sessionStorage.removeItem('_redirecting');
        }
        
        // Check session with retry logic (important after redirect from login)
        console.log('🔍 School Admin layout: Checking for session...');
        let sessionResult = await waitForSession(6, 600);
        
        // If no session found, try one more time with longer delay
        if (!sessionResult || !sessionResult.session) {
          console.log('⏳ School Admin layout: No session found, waiting and retrying...');
          await new Promise(resolve => setTimeout(resolve, 1500));
          sessionResult = await waitForSession(5, 600);
        }
        
        // Last attempt with even longer delay
        if (!sessionResult || !sessionResult.session) {
          console.log('⏳ School Admin layout: Still no session, final retry attempt...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          sessionResult = await waitForSession(4, 800);
        }
        
        if (!sessionResult || !sessionResult.session) {
          console.error('❌ School Admin layout: No session found after all retries, redirecting to login');
          console.error('❌ This might indicate a session persistence issue');
          if (mounted) {
            router.push('/login');
          }
          return;
        }
        
        const session = sessionResult.session;
        console.log('✅ School Admin layout: Session found, user ID:', session.user.id);
        console.log('✅ School Admin layout: Session expires at:', new Date(session.expires_at * 1000).toISOString());
        
        // Verify session is valid and not expired
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
          console.error('❌ School Admin layout: Session is expired');
          if (mounted) {
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
              router.push('/login');
            }
            return;
          }
        }
        
        console.log('✅ School Admin layout: User found:', user.email);
        
        // Get profile + school in parallel via API routes (bypass RLS)
        let profile = null;
        let school = null;
        try {
          // Use the session we already have
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };
          
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }

          const [profileRes, schoolRes] = await Promise.all([
            fetch(`/api/profile?userId=${user.id}`, { 
              cache: 'no-store', 
              method: 'GET',
              headers
            }),
            fetch(`/api/school-admin/school`, { 
              cache: 'no-store', 
              headers
            })
          ]);

          if (!profileRes.ok) {
            const errorText = await profileRes.text();
            throw new Error(`Failed to fetch profile: ${profileRes.status} ${errorText}`);
          }
          const profileJson = await profileRes.json();
          if (profileJson.error) throw new Error(profileJson.error);
          profile = profileJson.profile;
          if (!profile) throw new Error('Profile not found in API response');

          // Handle school response with better error logging
          if (schoolRes.ok) {
            try {
              const schoolJson = await schoolRes.json();
              school = schoolJson.school || null;
              if (school) {
                console.log('✅ School loaded successfully:', school.name);
              } else {
                console.warn('⚠️ School API returned ok but no school data');
              }
            } catch (parseError) {
              console.error('❌ Error parsing school response:', parseError);
            }
          } else {
            const errorText = await schoolRes.text();
            console.error(`❌ Failed to fetch school: ${schoolRes.status}`, errorText);
            // Don't throw - allow layout to continue without school
            // The school might not be critical for initial load
          }
         
        } catch (err: any) {
          console.error('Error loading bootstrap data:', err?.message || err);
          if (mounted) router.push('/login');
          return;
        }
          
        if (!profile) {
          console.error('Profile not found after all attempts');
          if (mounted) {
            router.push('/login');
          }
          return;
        }
        
        console.log('✅ Profile found:', profile.role);
        
        // Normalize role for comparison
        const normalizedRole = profile?.role?.trim().toLowerCase();
        if (normalizedRole !== 'school_admin') {
          console.log('User is not a school admin, redirecting. Role:', profile.role, 'Normalized:', normalizedRole);
          if (mounted) {
            router.push('/redirect');
          }
          return;
        }

        // Check if school admin is active
        // Note: This check is also performed in getSchoolAdminSchoolId which requires is_active=true
        // So if we get past that point, the admin is active. This is just a redundant check.
        // We'll skip it here to avoid RLS issues and rely on the API route checks.

        if (!school && profile.school_id) {
          console.warn('School not loaded from API, but school_id exists.');
        }
        
        if (mounted) {
          setUser(user);
          setUserProfile(profile);
          setSchoolInfo(school);
          setLoading(false);
          isInitialMountRef.current = false; // Mark initial mount as complete
          userLoadedRef.current = true; // Mark user as loaded
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        if (mounted) {
          setLoading(false);
          // Don't redirect immediately on error, give it a moment
          timeoutId = setTimeout(() => {
            if (mounted) {
              router.push('/login');
            }
          }, 1000);
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
          console.log('🔄 School Admin layout: SIGNED_IN event, reloading user...');
          getUser();
        } else {
          console.log('⏸️ School Admin layout: SIGNED_IN event ignored (user already loaded or getUser in progress)');
        }
      }
    });

    return () => {
      mounted = false;
      getUserInProgressRef.current = false;
      // Don't reset userLoadedRef here - it should persist across re-renders
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, [router]); // Include router for consistency, even though it's stable in Next.js 13+

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading school admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <SchoolAdminProvider>
      <div className="flex h-screen bg-gray-50" style={{ backgroundColor: '#f9fafb' }}>
        <Sidebar 
          userRole="school_admin"
          userName={userProfile?.full_name || user?.email || "School Admin"}
          userEmail={user?.email || "admin@school.com"}
          onLogout={handleLogout}
        />
        
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
          {children}
        </div>
      </div>
    </SchoolAdminProvider>
  );
}

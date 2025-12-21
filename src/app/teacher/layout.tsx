"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { Sidebar } from "../../components/ui/modern-side-bar";
import { TeacherSchoolContext } from "./context";
import { useSessionValidation } from "../../hooks/useSessionValidation";
import { startActivityTracking, stopActivityTracking } from "../../lib/activity-tracker";
import { waitForSession } from "../../lib/session-utils";
import { fetchWithCsrf, addTokensToHeaders } from "../../lib/csrf-client";
import { useAppStore, type AppState } from "../../store/app-store";
import { useBrowserNavigation } from "../../hooks/useBrowserNavigation";

/**
 * Teacher Dashboard Layout
 * 
 * Provides authentication, school selection, and consistent layout
 * consistent with School Admin and Admin dashboards
 */
export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
   
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
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
        selectedSchoolId: selectedSchool?.id ?? null,
      };
    } catch (error) {
      console.warn('Error getting state to save:', error);
      return {};
    }
  }, [sidebarCollapsed, user, selectedSchool]);

  // Use browser navigation hook to preserve state
  // Note: warnOnUnsavedChanges is false because layout state (sidebar collapse) is not "unsaved changes"
  useBrowserNavigation({
    componentId: 'teacher-layout',
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

    const getUser = async () => {
      // Concurrency protection: prevent multiple simultaneous calls
      if (getUserInProgressRef.current) {
        console.log('⏸️ Teacher layout: getUser already in progress, skipping...');
        return;
      }

      // If user is already loaded, don't reload unless explicitly needed
      if (userLoadedRef.current && !isInitialMountRef.current) {
        console.log('⏸️ Teacher layout: User already loaded, skipping getUser...');
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
          console.log('🔄 Teacher layout: Detected redirect, waiting for session to settle...');
          await new Promise(resolve => setTimeout(resolve, 1500));
          sessionStorage.removeItem('_redirecting');
        }
        
        // Check session with retry logic (important after redirect from login)
        console.log('🔍 Teacher layout: Checking for session...');
        let sessionResult = await waitForSession(6, 600);
        
        // If no session found, try one more time with longer delay
        if (!sessionResult || !sessionResult.session) {
          console.log('⏳ Teacher layout: No session found, waiting and retrying...');
          await new Promise(resolve => setTimeout(resolve, 1500));
          sessionResult = await waitForSession(5, 600);
        }
        
        // Last attempt with even longer delay
        if (!sessionResult || !sessionResult.session) {
          console.log('⏳ Teacher layout: Still no session, final retry attempt...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          sessionResult = await waitForSession(4, 800);
        }
        
        if (!sessionResult || !sessionResult.session) {
          console.error('❌ Teacher layout: No session found after all retries, redirecting to login');
          console.error('❌ This might indicate a session persistence issue');
          if (mounted) {
            router.push('/login');
          }
          return;
        }
        
        const session = sessionResult.session;
        console.log('✅ Teacher layout: Session found, user ID:', session.user.id);
        console.log('✅ Teacher layout: Session expires at:', new Date(session.expires_at * 1000).toISOString());
        
        // Verify session is valid and not expired
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
          console.error('❌ Teacher layout: Session is expired');
          if (mounted) {
            router.push('/login');
          }
          return;
        }

        // Get user profile via API (bypasses RLS)
        let profile = null;
        try {
          // Include authorization header with session token
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };
          
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
          
          const profileResponse = await fetch(`/api/profile?userId=${session.user.id}`, {
            cache: 'no-store',
            method: 'GET',
            headers
          });

          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            profile = profileData.profile;
          }
        } catch (err) {
          console.error('Error loading profile:', err);
          if (mounted) router.push('/login');
          return;
        }

        if (!profile) {
          if (mounted) router.push('/login');
          return;
        }

        // Verify role (normalize role for comparison)
        const normalizedRole = profile.role?.trim().toLowerCase();
        if (normalizedRole !== 'teacher') {
          console.log('Teacher layout: User is not a teacher! Role:', profile.role, 'Normalized:', normalizedRole);
          if (mounted) router.push('/redirect');
          return;
        }

        // Get teacher's assigned schools via API route (bypasses RLS securely)
         
        let schoolsData: any[] = [];
        try {
          const schoolsResponse = await fetchWithCsrf('/api/teacher/schools', {
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (schoolsResponse.ok) {
            const schoolsResult = await schoolsResponse.json();
            schoolsData = schoolsResult.schools || [];
          } else {
            console.error('Failed to fetch schools:', await schoolsResponse.json());
          }
        } catch (err) {
          console.error('Error fetching schools:', err);
        }

        if (mounted) {
          setUser(session.user);
          setUserProfile(profile);
          setSchools(schoolsData);
          
          // Restore selected school from sessionStorage if available, otherwise use first school
          if (schoolsData.length > 0) {
            let schoolToSelect = schoolsData[0];
            
            // Try to restore from sessionStorage
            if (typeof window !== 'undefined') {
              try {
                const savedSchoolId = sessionStorage.getItem('selectedSchoolId');
                if (savedSchoolId) {
                  const savedSchool = schoolsData.find((s: any) => s.id === savedSchoolId);
                  if (savedSchool) {
                    schoolToSelect = savedSchool;
                  }
                }
              } catch (err) {
                console.warn('Error reading from sessionStorage:', err);
              }
            }
            
            setSelectedSchool(schoolToSelect);
            // Store in sessionStorage for persistence
            if (typeof window !== 'undefined') {
              try {
                sessionStorage.setItem('selectedSchoolId', schoolToSelect.id);
              } catch (err) {
                console.warn('Error writing to sessionStorage:', err);
              }
            }
          }
          setLoading(false);
          isInitialMountRef.current = false; // Mark initial mount as complete
          userLoadedRef.current = true; // Mark user as loaded
        }
      } catch (error) {
        console.error('Error loading user data:', error);
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
          console.log('🔄 Teacher layout: SIGNED_IN event, reloading user...');
          getUser();
        } else {
          console.log('⏸️ Teacher layout: SIGNED_IN event ignored (user already loaded or getUser in progress)');
        }
      }
    });

    // Listen for profile updates from settings page
    const handleProfileUpdate = async (event: Event) => {
       
      const customEvent = event as CustomEvent<{ profile: any }>;
      console.log('🔄 Profile updated event received:', customEvent.detail);
      if (mounted && customEvent.detail?.profile) {
        const updatedProfile = customEvent.detail.profile;
        console.log('🔄 Updating layout profile with:', updatedProfile);
        
        // Update the profile state immediately
        setUserProfile(updatedProfile);
        
        // Also refresh from server to ensure consistency
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const profileHeaders = await addTokensToHeaders();
            const profileResponse = await fetch(`/api/profile?userId=${authUser.id}&t=${Date.now()}`, {
              cache: 'no-store',
              method: 'GET',
              headers: profileHeaders
            });
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              if (profileData.profile) {
                setUserProfile(profileData.profile);
                console.log('✅ Layout profile refreshed from server:', profileData.profile);
              }
            }
          }
        } catch (err) {
          console.error('Error refreshing profile in layout:', err);
        }
      }
    };

    window.addEventListener('teacherProfileUpdated', handleProfileUpdate);

    return () => {
      mounted = false;
      getUserInProgressRef.current = false;
      // Don't reset userLoadedRef here - it should persist across re-renders
      if (subscription) {
        subscription.unsubscribe();
      }
      window.removeEventListener('teacherProfileUpdated', handleProfileUpdate as EventListener);
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
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('selectedSchoolId');
      } catch (err) {
        console.warn('Error removing from sessionStorage:', err);
      }
    }
    await logout();
  };

   
  const handleSchoolChange = (school: any) => {
    setSelectedSchool(school);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('selectedSchoolId', school.id);
      } catch (err) {
        console.warn('Error writing to sessionStorage:', err);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading teacher dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50" style={{ backgroundColor: '#f9fafb' }}>
      <Sidebar 
        userRole="teacher"
        userName={userProfile?.full_name || user?.email || "Teacher"}
        userEmail={user?.email || "teacher@example.com"}
        onLogout={handleLogout}
      />
      
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {/* School Selector Topbar */}
        {schools.length > 1 && (
          <div className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700">Active School:</span>
                <select
                  value={selectedSchool?.id || ''}
                  onChange={(e) => {
                    const school = schools.find((s: any) => s.id === e.target.value);
                    if (school) handleSchoolChange(school);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name} {school.school_code ? `(${school.school_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Store selected school in context for child components */}
        <TeacherSchoolContext.Provider value={{ selectedSchool, schools, onSchoolChange: handleSchoolChange }}>
          <div className="p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </TeacherSchoolContext.Provider>
      </div>
    </div>
  );
}

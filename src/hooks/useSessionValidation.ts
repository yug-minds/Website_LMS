"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { getInactivityTimeout, getInactivityWarningTime } from '../lib/activity-tracker';
import { addTokensToHeaders } from '../lib/csrf-client';

// Key used to mark that a fresh login just happened
const FRESH_LOGIN_KEY = 'fresh_login_timestamp';
const FRESH_LOGIN_GRACE_PERIOD = 300000; // 5 minutes grace period after login (300 seconds)
// This long grace period ensures that normal page loads and React re-renders
// don't trigger false "logged in from another device" alerts.
// The session validation will only kick in after 5 minutes of being logged in,
// which is enough time to properly detect actual multi-device login scenarios.

interface SessionValidationOptions {
  checkInterval?: number; // Interval in milliseconds to check session validity
  onSessionInvalid?: (reason: string, message: string) => void;
  redirectOnInvalid?: boolean;
  showAlert?: boolean;
}

interface SessionValidationResult {
  isValid: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  checkSession: () => Promise<boolean>;
  logout: () => Promise<void>;
}

// Check if user just logged in recently (within grace period)
function isWithinLoginGracePeriod(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const loginTimestamp = sessionStorage.getItem(FRESH_LOGIN_KEY);
    if (!loginTimestamp) return false;
    
    const loginTime = parseInt(loginTimestamp, 10);
    const now = Date.now();
    const elapsed = now - loginTime;
    
    // If within grace period, don't validate yet
    if (elapsed < FRESH_LOGIN_GRACE_PERIOD) {
      console.log(`Session validation: within grace period (${elapsed}ms since login)`);
      return true;
    }
    
    // Grace period expired, clear the flag
    sessionStorage.removeItem(FRESH_LOGIN_KEY);
    return false;
  } catch (e) {
    return false;
  }
}

// Mark that a fresh login just happened (call this from login success)
export function markFreshLogin(): void {
  if (typeof window === 'undefined') return;
  
  try {
    sessionStorage.setItem(FRESH_LOGIN_KEY, Date.now().toString());
  } catch (e) {
    console.warn('Could not mark fresh login:', e);
  }
}

// Clear the fresh login marker
export function clearFreshLoginMarker(): void {
  if (typeof window === 'undefined') return;
  
  try {
    sessionStorage.removeItem(FRESH_LOGIN_KEY);
  } catch (e) {
    // Ignore
  }
}

export function useSessionValidation(options: SessionValidationOptions = {}): SessionValidationResult {
  const {
    checkInterval = 60000, // Default: check every 60 seconds
    onSessionInvalid,
    redirectOnInvalid = true,
    showAlert = true
  } = options;

  const [isValid, setIsValid] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const router = useRouter();
  const checkInProgressRef = useRef(false);
  const hasShownAlertRef = useRef(false);
  const isFirstCheckRef = useRef(true);

  const handleInvalidSession = useCallback((reason: string, message: string) => {
    setIsValid(false);
    
    if (onSessionInvalid) {
      onSessionInvalid(reason, message);
    }
    
    // SECURITY: Session token cookie is httpOnly, so it can't be cleared client-side
    // The server-side validation endpoint already clears it when invalidating
    // Just sign out from Supabase - cookie will be cleared on next request or by server
    
    // Sign out from Supabase
    supabase.auth.signOut().catch((err) => {
      console.error('Error signing out:', err);
    });
    
    if (showAlert && !hasShownAlertRef.current) {
      hasShownAlertRef.current = true;
      
      // Build a more descriptive message based on reason
      const alertMessage = reason === 'SESSION_SUPERSEDED' 
        ? 'You have been logged out because you logged in from another device. For security reasons, only one active session is allowed at a time.'
        : message;
      
      // Show alert and redirect after user acknowledges
      if (typeof window !== 'undefined') {
        alert(alertMessage);
      }
    }
    
    if (redirectOnInvalid) {
      // Small delay to ensure alert is shown
      setTimeout(() => {
        router.push('/login');
      }, 100);
    }
  }, [onSessionInvalid, redirectOnInvalid, showAlert, router]);

  const checkSession = useCallback(async (): Promise<boolean> => {
    // Prevent concurrent checks
    if (checkInProgressRef.current) {
      return isValid;
    }

    try {
      checkInProgressRef.current = true;
      setIsChecking(true);

      // Skip validation during login grace period (fresh login)
      if (isWithinLoginGracePeriod()) {
        console.log('Skipping session validation - within login grace period');
        setIsValid(true);
        setLastChecked(new Date());
        return true;
      }

      // Get current user from Supabase auth
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.warn('Auth error during session check:', authError.message);
        // Don't immediately invalidate on auth errors - might be temporary
        return isValid;
      }
      
      if (!user) {
        // No user - but don't show error if we're on login-related pages
        const currentPath = window.location.pathname;
        if (currentPath === '/login' || currentPath === '/signup' || currentPath.startsWith('/auth')) {
          return true; // It's fine to not have a user on auth pages
        }
        
        // No user - redirect to login silently
        // SECURITY: Can't check session_token cookie client-side (httpOnly), but that's fine
        // - If user just logged in, Supabase auth state will update soon
        // - If no valid session, redirect to login
        if (redirectOnInvalid) {
          router.push('/login');
        }
        return false;
      }

      // NOTE: Using Supabase sessions only - no custom session validation needed
      // Supabase handles session validation automatically
      // The session is validated by checking if user exists and is authenticated
      
      // Check inactivity timeout
      try {
        const headers = await addTokensToHeaders();
        const activityResponse = await fetch('/api/auth/activity', {
          method: 'GET',
          headers,
          credentials: 'include',
        });

        if (activityResponse.ok) {
          const activityData = await activityResponse.json();
          const lastActivity = activityData.last_activity;
          
          // If no activity data (user not authenticated), skip inactivity check
          if (lastActivity) {
            const lastActivityTime = new Date(lastActivity).getTime();
            const now = Date.now();
            const timeSinceActivity = now - lastActivityTime;
            const inactivityTimeout = getInactivityTimeout();
            const inactivityWarning = getInactivityWarningTime();

            // Check if session has expired due to inactivity
            if (timeSinceActivity > inactivityTimeout) {
              console.log(`Session expired due to inactivity (${Math.round(timeSinceActivity / 60000)} minutes)`);
              handleInvalidSession(
                'SESSION_INACTIVE',
                'Your session has expired due to inactivity. Please log in again.'
              );
              return false;
            }

            // Show warning if approaching timeout (but not too frequently)
            if (timeSinceActivity > inactivityWarning && !hasShownAlertRef.current) {
              const minutesRemaining = Math.round((inactivityTimeout - timeSinceActivity) / 60000);
              if (minutesRemaining > 0 && minutesRemaining <= 5) {
                console.log(`Warning: Session will expire in ${minutesRemaining} minutes due to inactivity`);
                // Optionally show a warning to the user
                // You can customize this behavior
              }
            }
          } else {
            console.log('No activity data available, skipping inactivity check');
            // Continue with session validation - don't fail just because activity tracking isn't available
          }
        } else if (activityResponse.status === 401) {
          // 401 is expected if user is not authenticated - don't treat as error
          console.log('Activity endpoint returned 401 - user may not be authenticated, skipping inactivity check');
        } else {
          // Other errors - log but don't fail session check
          console.warn('Activity check returned non-ok status:', activityResponse.status);
        }
      } catch (activityError) {
        // Don't fail session check if activity check fails
        console.warn('Error checking activity:', activityError);
      }
      
      // Mark first check as done
      isFirstCheckRef.current = false;

      setIsValid(true);
      setLastChecked(new Date());
      hasShownAlertRef.current = false; // Reset alert flag on valid session
      return true;
    } catch (error) {
      console.error('Error checking session:', error);
      // Don't invalidate on network errors - just log and continue
      return isValid;
    } finally {
      setIsChecking(false);
      checkInProgressRef.current = false;
    }
  }, [handleInvalidSession, isValid, redirectOnInvalid, router]);

  const logout = useCallback(async () => {
    try {
      // Sign out from Supabase (this handles all session management)
      // Supabase automatically clears its own session cookies
      await supabase.auth.signOut();

      // Clear any local storage
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('supabase.auth.token');
          sessionStorage.clear();
        } catch (e) {
          console.log('Could not clear storage:', e);
        }
      }

      // Redirect to login
      window.location.href = '/login';
    } catch (error) {
      console.error('Error during logout:', error);
      // Force redirect even on error
      window.location.href = '/login';
    }
  }, []);

  // Set up periodic session validation
  useEffect(() => {
    // Reset first check ref on mount
    isFirstCheckRef.current = true;
    
    // Initial check after component mounts (with a longer delay to allow cookies to settle)
    // This is especially important after a redirect from login
    const initialCheck = setTimeout(() => {
      // If within grace period, skip this check entirely
      if (isWithinLoginGracePeriod()) {
        console.log('Initial session check skipped - within grace period');
        return;
      }
      checkSession();
    }, 5000); // 5 second delay for initial check

    // Set up interval for periodic checks (less aggressive - every 2 minutes)
    const intervalId = setInterval(() => {
      // Always check grace period before any validation
      if (isWithinLoginGracePeriod()) {
        console.log('Periodic session check skipped - within grace period');
        return;
      }
      checkSession();
    }, Math.max(checkInterval, 120000)); // At least 2 minutes between checks

    // Track last check time to prevent excessive checks on tab switches
    let lastFocusCheck = 0;
    let lastVisibilityCheck = 0;
    const MIN_CHECK_INTERVAL = 60000; // Minimum 1 minute between focus/visibility checks

    // Also check when the window regains focus (but not during grace period)
    // Throttled to prevent excessive checks when rapidly switching tabs
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusCheck < MIN_CHECK_INTERVAL) {
        return; // Skip if checked recently
      }
      lastFocusCheck = now;

      // Add a small delay when focusing to avoid race conditions
      setTimeout(() => {
        if (!isWithinLoginGracePeriod()) {
          checkSession();
        }
      }, 2000); // Increased delay to reduce race conditions
    };

    // Check when the page becomes visible again (but not during grace period)
    // Throttled to prevent excessive checks when rapidly switching tabs
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastVisibilityCheck < MIN_CHECK_INTERVAL) {
          return; // Skip if checked recently
        }
        lastVisibilityCheck = now;

        // Add a small delay when becoming visible
        setTimeout(() => {
          if (!isWithinLoginGracePeriod()) {
            checkSession();
          }
        }, 2000); // Increased delay to reduce race conditions
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(initialCheck);
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkSession, checkInterval]);

  return {
    isValid,
    isChecking,
    lastChecked,
    checkSession,
    logout
  };
}

// Hook for checking if user has a valid role for the current dashboard
export function useRoleValidation(requiredRole: string | string[]) {
  const [isValidRole, setIsValidRole] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const validateRole = async () => {
      try {
        setIsLoading(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          router.push('/login');
          return;
        }

        // Get role from API
        const headers = await addTokensToHeaders();
        const response = await fetch(`/api/get-role?userId=${user.id}`, {
          headers
        });
        const data = await response.json();

        if (data.error) {
          console.error('Error getting role:', data.error);
          router.push('/login');
          return;
        }

        const role = data.role;
        setUserRole(role);

        // Check if user has required role
        const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        const hasValidRole = requiredRoles.includes(role) || 
          (requiredRoles.includes('admin') && role === 'super_admin');

        if (!hasValidRole) {
          setIsValidRole(false);
          router.push('/redirect');
          return;
        }

        setIsValidRole(true);
      } catch (error) {
        console.error('Error validating role:', error);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    validateRole();
  }, [requiredRole, router]);

  return { isValidRole, isLoading, userRole };
}


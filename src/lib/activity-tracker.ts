import { addTokensToHeaders, getAuthToken } from './csrf-client';
/**
 * Activity Tracker Utility
 * 
 * Tracks user activity (mouse, keyboard, scroll, touch) and updates
 * last_activity timestamp to prevent inactivity timeout.
 */

// Configuration
const ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // Update every 5 minutes
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes default
const INACTIVITY_WARNING_MS = 25 * 60 * 1000; // 25 minutes (show warning 5 min before)

let activityUpdateTimer: NodeJS.Timeout | null = null;
let lastActivityUpdate: number = 0;
let isTracking = false;
let handleFocusActivityRef: (() => void) | null = null;
let handleVisibilityActivityRef: (() => void) | null = null;
let lastFocusActivity = 0;
let lastVisibilityActivity = 0;
let pendingUpdate: Promise<void> | null = null; // Track pending update to prevent concurrent requests
let lastRateLimitError: number = 0; // Track when we last got rate limited
const FOCUS_ACTIVITY_THROTTLE = 30000; // 30 seconds
const VISIBILITY_ACTIVITY_THROTTLE = 30000; // 30 seconds
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes backoff after rate limit

/**
 * Update last activity timestamp on server
 */
async function updateActivityOnServer(): Promise<void> {
  // If there's already a pending update, wait for it instead of starting a new one
  if (pendingUpdate) {
    return pendingUpdate;
  }

  // Check if we're in rate limit backoff period
  const now = Date.now();
  if (lastRateLimitError > 0 && (now - lastRateLimitError) < RATE_LIMIT_BACKOFF_MS) {
    // Still in backoff period, skip this update
    return;
  }

  // Update timestamp immediately to prevent race conditions
  // This ensures concurrent calls won't all pass the throttle check
  lastActivityUpdate = now;

  // Create the update promise
  pendingUpdate = (async () => {
    try {
      // Check if user has a valid session before making the request
      const authToken = await getAuthToken();
      if (!authToken) {
        // No valid session, skip the update silently
        // This is expected when user is not logged in or session expired
        return;
      }

      const headers = await addTokensToHeaders({
        'Content-Type': 'application/json',
      });
      
      // Double-check that authorization header was added
      // addTokensToHeaders always returns a Headers object
      if (!headers || !(headers instanceof Headers) || !headers.has('Authorization')) {
        console.warn('⚠️ No authorization header available, skipping activity update');
        return;
      }
      
      const response = await fetch('/api/auth/activity', {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        // If unauthorized, stop tracking (session likely expired)
        if (response.status === 401) {
          console.warn('⚠️ Activity update unauthorized, session may have expired');
          stopActivityTracking();
        } else if (response.status === 429) {
          // Rate limited - set backoff and don't log as error (expected behavior)
          lastRateLimitError = Date.now();
          // Reset lastActivityUpdate to allow retry after backoff
          lastActivityUpdate = 0;
        } else {
          console.warn('Failed to update activity:', response.status);
        }
      }
      // Success - lastActivityUpdate was already set above
    } catch (error) {
      // On error, reset lastActivityUpdate to allow retry
      lastActivityUpdate = 0;
      console.warn('Error updating activity:', error);
      // Don't throw - activity tracking should not break the app
    } finally {
      // Clear pending update
      pendingUpdate = null;
    }
  })();

  return pendingUpdate;
}

/**
 * Handle user activity - called on user interactions
 */
function handleActivity(): void {
  const now = Date.now();
  
  // Only update if enough time has passed since last update (throttle)
  if (now - lastActivityUpdate >= ACTIVITY_UPDATE_INTERVAL_MS) {
    updateActivityOnServer();
  }
}

/**
 * Start tracking user activity
 */
export function startActivityTracking(): void {
  if (isTracking) {
    return; // Already tracking
  }

  isTracking = true;
  lastActivityUpdate = Date.now();

  // Initial update
  updateActivityOnServer();

  // Set up periodic updates
  activityUpdateTimer = setInterval(() => {
    updateActivityOnServer();
  }, ACTIVITY_UPDATE_INTERVAL_MS);

  // Track mouse movements
  document.addEventListener('mousemove', handleActivity, { passive: true });
  
  // Track keyboard input
  document.addEventListener('keydown', handleActivity, { passive: true });
  
  // Track scroll events
  document.addEventListener('scroll', handleActivity, { passive: true });
  
  // Track touch events (mobile)
  document.addEventListener('touchstart', handleActivity, { passive: true });
  document.addEventListener('touchmove', handleActivity, { passive: true });
  
  // Track window focus (throttled to prevent excessive updates)
  handleFocusActivityRef = () => {
    const now = Date.now();
    if (now - lastFocusActivity >= FOCUS_ACTIVITY_THROTTLE) {
      lastFocusActivity = now;
      handleActivity();
    }
  };
  
  window.addEventListener('focus', handleFocusActivityRef);
  
  // Track page visibility changes (throttled to prevent excessive updates)
  handleVisibilityActivityRef = () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - lastVisibilityActivity >= VISIBILITY_ACTIVITY_THROTTLE) {
        lastVisibilityActivity = now;
        handleActivity();
      }
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityActivityRef);

  console.log('✅ Activity tracking started');
}

/**
 * Stop tracking user activity
 */
export function stopActivityTracking(): void {
  if (!isTracking) {
    return;
  }

  isTracking = false;

  // Clear interval
  if (activityUpdateTimer) {
    clearInterval(activityUpdateTimer);
    activityUpdateTimer = null;
  }

  // Clear pending update
  pendingUpdate = null;

  // Remove event listeners
  document.removeEventListener('mousemove', handleActivity);
  document.removeEventListener('keydown', handleActivity);
  document.removeEventListener('scroll', handleActivity);
  document.removeEventListener('touchstart', handleActivity);
  document.removeEventListener('touchmove', handleActivity);
  
  // Remove throttled focus and visibility listeners
  if (typeof window !== 'undefined' && handleFocusActivityRef) {
    window.removeEventListener('focus', handleFocusActivityRef);
    handleFocusActivityRef = null;
  }
  
  if (handleVisibilityActivityRef) {
    document.removeEventListener('visibilitychange', handleVisibilityActivityRef);
    handleVisibilityActivityRef = null;
  }
  
  // Reset throttle timers
  lastFocusActivity = 0;
  lastVisibilityActivity = 0;
  lastRateLimitError = 0;

  console.log('🛑 Activity tracking stopped');
}

/**
 * Get inactivity timeout configuration
 */
export function getInactivityTimeout(): number {
  // Check environment variable or use default
  if (typeof window !== 'undefined') {
    const envTimeout = process.env.NEXT_PUBLIC_INACTIVITY_TIMEOUT_MS;
    if (envTimeout) {
      return parseInt(envTimeout, 10);
    }
  }
  return INACTIVITY_TIMEOUT_MS;
}

/**
 * Get inactivity warning time
 */
export function getInactivityWarningTime(): number {
  // Check environment variable or use default
  if (typeof window !== 'undefined') {
    const envWarning = process.env.NEXT_PUBLIC_INACTIVITY_WARNING_MS;
    if (envWarning) {
      return parseInt(envWarning, 10);
    }
  }
  return INACTIVITY_WARNING_MS;
}

/**
 * Check if activity tracking is active
 */
export function isActivityTracking(): boolean {
  return isTracking;
}








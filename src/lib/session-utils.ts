/**
 * Session Utilities
 * 
 * Helper functions for managing and verifying Supabase sessions
 */

import { supabase } from './supabase';

/**
 * Wait for session to be available with retry logic
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param delayMs - Delay between attempts in milliseconds (default: 300)
 * @returns Promise<Session | null> - The session if found, null otherwise
 */
export async function waitForSession(
  maxAttempts: number = 3,
  delayMs: number = 300
): Promise<{ session: any; error: any } | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        const errorMessage = error.message || String(error);
        // Check if it's a timeout error - don't retry immediately for timeouts
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('took too long');
        
        if (isTimeout) {
          console.warn(`⚠️ Session check attempt ${attempt}/${maxAttempts} timed out, waiting longer before retry...`);
          // Wait longer for timeout errors
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs * 2));
            continue;
          }
        } else {
          console.warn(`Session check attempt ${attempt}/${maxAttempts} failed:`, error.message);
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
        }
        return { session: null, error };
      }
      
      if (data?.session) {
        console.log(`✅ Session confirmed on attempt ${attempt}/${maxAttempts}`);
        return { session: data.session, error: null };
      }
      
      // No session yet, wait and retry
      if (attempt < maxAttempts) {
        console.log(`⏳ No session found on attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('took too long');
      
      if (isTimeout) {
        console.warn(`⚠️ Session check attempt ${attempt}/${maxAttempts} timed out:`, errorMessage);
        // Wait longer for timeout errors before retrying
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * 2));
          continue;
        }
      } else {
        console.error(`Session check attempt ${attempt}/${maxAttempts} threw error:`, err);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
      return { session: null, error: err };
    }
  }
  
  console.warn(`❌ No session found after ${maxAttempts} attempts`);
  return { session: null, error: new Error('Session not available after retries') };
}

/**
 * Verify session exists and is valid
 * @returns Promise<boolean> - True if session exists and is valid
 */
export async function verifySession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && !!data?.session;
  } catch (err) {
    console.error('Error verifying session:', err);
    return false;
  }
}




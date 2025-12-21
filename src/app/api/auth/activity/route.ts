import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { getAuthenticatedUserId } from '../../../../lib/auth-utils';
import { ensureCsrfToken, validateCsrf } from '../../../../lib/csrf-middleware';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/auth/activity
 * 
 * Updates the last_activity timestamp for the authenticated user.
 * Called periodically from client-side to prevent inactivity timeout.
 */
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting (more lenient for activity updates)
  const rateLimitResult = await rateLimit(request, {
    ...RateLimitPresets.WRITE,
    maxRequests: 20, // Allow more frequent updates (every 5 min = 12/hour, so 20 is safe)
    windowSeconds: 60 * 60, // 1 hour window
  });

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

  try {
    // Get authenticated user ID
    const userId = await getAuthenticatedUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Update last_activity timestamp in database
     
    const { error: updateError } = await ((supabaseAdmin as any)
      .from('profiles')
       
      .update({ last_activity: new Date().toISOString() } as any)
       
      .eq('id', userId)) as any;

    if (updateError) {
      logger.error('Error updating last_activity', {
        endpoint: '/api/auth/activity',
        userId,
      }, updateError);
      
      return NextResponse.json(
        { error: 'Failed to update activity' },
        { status: 500 }
      );
    }

    // Return success with CSRF token
    const successResponse = NextResponse.json({
      success: true,
      timestamp: new Date().toISOString()
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;

  } catch (error) {
    logger.error('Unexpected error in POST /api/auth/activity', {
      endpoint: '/api/auth/activity',
    }, error instanceof Error ? error : new Error(String(error)));

    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/auth/activity' },
      'Failed to update activity'
    );

    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

/**
 * GET /api/auth/activity
 * 
 * Returns the last_activity timestamp for the authenticated user.
 * Used to check inactivity status.
 */
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

  try {
    // Get authenticated user ID (suppress warning for optional auth check)
    const userId = await getAuthenticatedUserId(request, true);

    if (!userId) {
      // Return empty activity data instead of 401 to prevent error spam
      // The client will handle the case where there's no activity data
      return NextResponse.json({
        last_activity: null,
        timestamp: new Date().toISOString(),
        message: 'No authenticated user'
      });
    }

    // Get last_activity from database
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('last_activity')
      .eq('id', userId)
       
      .single() as any;

    if (fetchError || !profile) {
      logger.error('Error fetching last_activity', {
        endpoint: '/api/auth/activity',
        userId,
      }, fetchError);
      
      return NextResponse.json(
        { error: 'Failed to fetch activity' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      last_activity: profile.last_activity,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Unexpected error in GET /api/auth/activity', {
      endpoint: '/api/auth/activity',
    }, error instanceof Error ? error : new Error(String(error)));

    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/auth/activity' },
      'Failed to fetch activity'
    );

    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


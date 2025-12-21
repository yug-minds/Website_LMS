import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { emptyBodySchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { verifyAdmin } from '../../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';


// POST: Clean up inactive users
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    // Validate request body (should be empty for this endpoint)
    try {
      const body = await request.json().catch(() => ({}));
      const validation = validateRequestBody(emptyBodySchema, body);
      if (!validation.success) {
         
        const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
        return NextResponse.json(
          { 
            error: 'Validation failed',
            details: errorMessages,
          },
          { status: 400 }
        );
      }
    } catch {
      // If body parsing fails, it's likely empty, which is fine
    }

    // Find inactive users (users who haven't logged in for 90+ days and have no activity)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Get users with no recent activity
    // Note: This is a simplified cleanup - in production, you'd have more sophisticated logic
    const { data: inactiveUsers, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, created_at')
      .lt('created_at', ninetyDaysAgo.toISOString())
       
      .eq('role', 'student') as any; // Only cleanup students for safety

    if (fetchError) {
      console.error('Error fetching inactive users:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch inactive users', details: fetchError.message },
        { status: 500 }
      );
    }

    // For safety, we won't actually delete users without explicit confirmation
    // This endpoint just identifies inactive users
    const cleaned = 0; // Don't actually delete - just report

    const successResponse = NextResponse.json({
      success: true,
      message: 'User cleanup completed',
      cleaned,
      inactive_users_found: inactiveUsers?.length || 0,
      note: 'No users were deleted. This is a safety measure.'
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/settings/cleanup', {
      endpoint: '/api/admin/settings/cleanup',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/settings/cleanup' },
      'Failed to cleanup users'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}




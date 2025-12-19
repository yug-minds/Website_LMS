import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { notificationUpdateSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';


// PATCH: Update notification (e.g., mark as read)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: notificationId } = await params;
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(notificationUpdateSchema, body);
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

    const { is_read } = validation.data;

     
    const { data: updatedNotification, error } = await ((supabaseAdmin as any)
      .from('notifications')
       
      .update({ is_read: is_read !== undefined ? is_read : undefined } as any)
      .eq('id', notificationId)
      .select()
       
      .single() as any) as any;

    if (error) {
      console.error('❌ Error updating notification:', error);
      return NextResponse.json(
        { error: 'Failed to update notification', details: error.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({
      notification: updatedNotification,
      message: 'Notification updated successfully'
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/school-admin/notifications/[id]', {
      endpoint: '/api/school-admin/notifications/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/notifications/[id]' },
      'Failed to update notification'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}








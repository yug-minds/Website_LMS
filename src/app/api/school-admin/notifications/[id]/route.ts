import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { notificationUpdateSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';


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
    
    console.log('🔍 [API] Received school-admin notification update request:', {
      notificationId,
      body: body,
      is_read: body?.is_read
    });
    
    // Validate request body
    const validation = validateRequestBody(notificationUpdateSchema, body);
    if (!validation.success) {
      // Extract error messages from ZodError
      let errorMessages = validation.error || 'Invalid request data';
      if (validation.details && validation.details.issues && Array.isArray(validation.details.issues)) {
        type ZodIssue = { path?: (string | number)[]; message?: string; code?: string };
        const formattedErrors = validation.details.issues.map((e: ZodIssue) => {
          const path = Array.isArray(e.path) ? e.path.join('.') : String(e.path || 'unknown');
          return `${path}: ${e.message || 'Invalid value'}`;
        });
        errorMessages = formattedErrors.length > 0 ? formattedErrors.join(', ') : errorMessages;
      }
      
      logger.warn('Validation failed for school-admin notification update', {
        endpoint: '/api/school-admin/notifications/[id]',
        notificationId,
        body: body,
        errors: errorMessages,
        validationDetails: validation.details?.issues ? validation.details.issues.map((e: ZodIssue) => ({
          path: e.path,
          message: e.message,
          code: e.code
        })) : 'none'
      });
      
      console.error('❌ [API] Validation failed:', {
        errorMessages,
        body,
        notificationId
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages || 'Invalid request data',
        },
        { status: 400 }
      );
    }

    const { is_read } = validation.data;

    // Update notification
    const { data: updatedNotification, error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: is_read !== undefined ? is_read : undefined } as never)
      .eq('id', notificationId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating school-admin notification:', updateError);
      logger.error('Failed to update school-admin notification', {
        endpoint: '/api/school-admin/notifications/[id]',
        notificationId,
        error: updateError
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to update notification', 
          details: updateError.message || 'Database update failed'
        },
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








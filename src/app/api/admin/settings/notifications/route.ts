import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { notificationPreferencesSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';


// GET: Retrieve notification preferences for admin user
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
    // Get user ID from auth token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to get from user_preferences table
    const { data: preferences } = await supabaseAdmin
      .from('user_preferences')
      .select('notification_preferences')
      .eq('user_id', user.id)
       
      .single() as any;

    if (preferences && preferences.notification_preferences) {
      return NextResponse.json({ notifications: preferences.notification_preferences });
    }

    // Return defaults if no preferences found
    return NextResponse.json({
      notifications: {
        new_user_registration: true,
        teacher_leave_requests: true,
        system_alerts: true,
        weekly_reports: true,
        monthly_analytics: true
      }
    });
  } catch (error) {
    logger.warn('Error fetching notification settings, returning defaults', {
      endpoint: '/api/admin/settings/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    return NextResponse.json({
      notifications: {
        new_user_registration: true,
        teacher_leave_requests: true,
        system_alerts: true,
        weekly_reports: true,
        monthly_analytics: true
      }
    });
  }
}

// POST: Save notification preferences
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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(notificationPreferencesSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for notification preferences', {
        endpoint: '/api/admin/settings/notifications',
        errors: errorMessages,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { user_id, ...notificationPrefs } = validation.data;

    // Try to upsert user preferences
    const { error } = await (supabaseAdmin
      .from('user_preferences')
      .upsert({
        user_id: user_id,
        notification_preferences: notificationPrefs,
        updated_at: new Date().toISOString()
       
      } as any, {
        onConflict: 'user_id'
       
      }) as any);

    if (error && error.code !== '42P01') { // 42P01 = table doesn't exist
      logger.warn('Error saving notification preferences (non-critical)', {
        endpoint: '/api/admin/settings/notifications',
      }, error);
    }

    const successResponse = NextResponse.json({
      success: true,
      message: 'Notification preferences saved successfully',
      notifications: notificationPrefs
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/settings/notifications', {
      endpoint: '/api/admin/settings/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/settings/notifications' },
      'Failed to save notification preferences'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}




import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { trackLoginSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken, validateCsrf } from '../../../../lib/csrf-middleware';

// POST: Track login attempt (success or failure)
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.AUTH);
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
    // Check if supabaseAdmin is available
    if (!supabaseAdmin) {
      console.error('supabaseAdmin is not available');
      return NextResponse.json({ success: true }); // Don't break login flow
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(trackLoginSchema, body);
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

    const { 
      user_id, 
      email, 
      success, 
      failure_reason,
      ip_address,
      user_agent 
    } = validation.data;

    // Record login attempt - wrap in try-catch to handle table not existing
    try {
      const { error: insertError } = await (supabaseAdmin
        .from('login_attempts')
        .insert({
          user_id: user_id || null,
          email: email,
          success: success || false,
          failure_reason: failure_reason || null,
          ip_address: ip_address || null,
          user_agent: user_agent || null,
          attempted_at: new Date().toISOString()
         
        } as any) as any);

      if (insertError) {
        console.error('Error recording login attempt:', insertError);
        // If table doesn't exist, that's okay - don't break login flow
        if (insertError.message?.includes('does not exist') || insertError.code === '42P01') {
          console.warn('login_attempts table does not exist. Please run migrations.');
        }
      }
     
    } catch (insertErr: any) {
      logger.warn('Exception recording login attempt (non-critical)', {
        endpoint: '/api/auth/track-login',
      }, insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
      // Continue - don't break login flow
    }

    // If login was successful and user_id is provided, update last_login
    if (success && user_id) {
      try {
         
        const { error: updateError } = await ((supabaseAdmin as any)
          .from('profiles')
           
          .update({ last_login: new Date().toISOString() } as any)
           
          .eq('id', user_id)) as any;

        if (updateError) {
          logger.warn('Error updating last_login (non-critical)', {
            endpoint: '/api/auth/track-login',
          }, updateError);
          // Don't fail the request if update fails
        }
       
      } catch (updateErr: any) {
        logger.warn('Exception updating last_login (non-critical)', {
          endpoint: '/api/auth/track-login',
        }, updateErr instanceof Error ? updateErr : new Error(String(updateErr)));
        // Continue - don't break login flow
      }
    }

    const successResponse = NextResponse.json({ success: true });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.warn('Error in POST /api/auth/track-login', {
      endpoint: '/api/auth/track-login',
    }, error instanceof Error ? error : new Error(String(error)));
    
    // Return success even if tracking fails to not break login flow
    const errorResponse = NextResponse.json({ success: true });
    ensureCsrfToken(errorResponse, request);
    return errorResponse;
  }
}


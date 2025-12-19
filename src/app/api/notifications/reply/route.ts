import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { validateRequestBody, notificationReplySchema, notificationDeleteReplySchema } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


// POST: Send a reply to a notification
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
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
    const validation = validateRequestBody(notificationReplySchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for notification reply', {
        endpoint: '/api/notifications/reply',
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

    const { notification_id, user_id, reply_text } = validation.data;

    // Verify notification belongs to user
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('user_id, title, message')
      .eq('id', notification_id)
      .eq('user_id', user_id)
       
      .single() as any;

    if (fetchError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found or access denied' },
        { status: 404 }
      );
    }

    // Check if user already replied to this notification
    const { data: existingReply } = await supabaseAdmin
      .from('notification_replies')
      .select('id')
      .eq('notification_id', notification_id)
      .eq('user_id', user_id)
       
      .single() as any;

    let replyData;

    if (existingReply) {
      // Update existing reply
       
      const { data: updatedReply, error: updateError } = await ((supabaseAdmin as any)
        .from('notification_replies')
        .update({
          reply_text: reply_text.trim(),
          updated_at: new Date().toISOString()
         
        } as any)
        .eq('id', existingReply.id)
        .select()
         
        .single() as any) as any;

      if (updateError) {
        console.error('❌ Error updating reply:', updateError);
        return NextResponse.json(
          { error: 'Failed to update reply', details: updateError.message },
          { status: 500 }
        );
      }

      replyData = updatedReply;
    } else {
      // Create new reply
      const { data: newReply, error: insertError } = await (supabaseAdmin
        .from('notification_replies')
        .insert({
          notification_id,
          user_id,
          reply_text: reply_text.trim()
         
        } as any)
        .select()
         
        .single() as any);

      if (insertError) {
        console.error('❌ Error creating reply:', insertError);
        return NextResponse.json(
          { error: 'Failed to create reply', details: insertError.message },
          { status: 500 }
        );
      }

      replyData = newReply;
    }

    const successResponse = NextResponse.json({
      success: true,
      message: existingReply ? 'Reply updated successfully' : 'Reply sent successfully',
      reply: replyData
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/notifications/reply', {
      endpoint: '/api/notifications/reply',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/notifications/reply' },
      'Failed to send reply'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// GET: Get replies for a notification
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
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('notification_id');

    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      );
    }

    const { data: replies, error } = await supabaseAdmin
      .from('notification_replies')
      .select(`
        id,
        notification_id,
        user_id,
        reply_text,
        created_at,
        updated_at,
        profiles:user_id (
          id,
          full_name,
          email,
          role
        )
      `)
      .eq('notification_id', notificationId)
       
      .order('created_at', { ascending: false }) as any;

    if (error) {
      console.error('❌ Error fetching replies:', error);
      return NextResponse.json(
        { error: 'Failed to fetch replies', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      replies: replies || []
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/notifications/reply', {
      endpoint: '/api/notifications/reply',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/notifications/reply' },
      'Failed to fetch replies'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE: Delete a reply
export async function DELETE(request: NextRequest) {
  const { ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  
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
    const validation = validateRequestBody(notificationDeleteReplySchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for notification reply deletion', {
        endpoint: '/api/notifications/reply',
        method: 'DELETE',
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

    const { reply_id, user_id } = validation.data;

    // Verify reply belongs to user
    const { data: reply, error: fetchError } = await supabaseAdmin
      .from('notification_replies')
      .select('user_id')
      .eq('id', reply_id)
      .eq('user_id', user_id)
       
      .single() as any;

    if (fetchError || !reply) {
      return NextResponse.json(
        { error: 'Reply not found or access denied' },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('notification_replies')
      .delete()
      .eq('id', reply_id)
      .eq('user_id', user_id);

    if (deleteError) {
      console.error('❌ Error deleting reply:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete reply', details: deleteError.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({
      success: true,
      message: 'Reply deleted successfully'
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/notifications/reply', {
      endpoint: '/api/notifications/reply',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/notifications/reply' },
      'Failed to delete reply'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { validateRequestBody, notificationMarkReadSchema } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { parseCursorParams, applyCursorPagination, createCursorResponse } from '../../../../lib/pagination';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';

// GET: Fetch notifications for the current user (receiving notifications)
export async function GET(request: NextRequest) {
  ensureCsrfToken(request);
  
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
    const userId = searchParams.get('user_id');
    const filter = searchParams.get('filter'); // 'all', 'read', 'unread'
    
    // Support both cursor and offset pagination for backward compatibility
    const useCursor = searchParams.get('use_cursor') === 'true' || searchParams.has('cursor');
    const cursorParams = parseCursorParams(request);
    const limit = cursorParams.limit || parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('notifications')
      .select(`
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        created_at
      `)
      .eq('user_id', userId);

    // Apply read/unread filter
    if (filter === 'read') {
      query = query.eq('is_read', true);
    } else if (filter === 'unread') {
      query = query.eq('is_read', false);
    }

    // Apply pagination
    if (useCursor && cursorParams.cursor) {
      query = applyCursorPagination(query, cursorParams.cursor, cursorParams.direction);
      query = query.limit(limit + 1); // Fetch one extra to check if there's more
    } else {
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    }

    // Fetch notifications
    const { data: notifications, error } = await query;

    if (error) {
      console.error('❌ Error fetching user notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notifications', details: error.message },
        { status: 500 }
      );
    }

    // Fetch counts in parallel - use id field for count queries (more efficient)
    const [
      { count: totalCount },
      { count: unreadCount }
    ] = await Promise.all([
      supabaseAdmin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
    ]);

    // For cursor pagination, create response with cursor
    let cursorResponse;
    if (useCursor) {
      cursorResponse = createCursorResponse(
        (notifications || []) as Array<{ created_at: string; id: string }>,
        limit
      );
    }

    // Fetch all replies for all notifications in a single query (fixes N+1 problem)
    type Notification = {
      id: string;
      user_id?: string;
      title?: string | null;
      message?: string | null;
      type?: string | null;
      is_read?: boolean | null;
      created_at?: string | null;
    };
    type NotificationReply = {
      id: string;
      notification_id: string;
      user_id: string;
      reply_text?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      profiles?: {
        id: string;
        full_name?: string | null;
        email?: string | null;
        role?: string | null;
      } | null;
    };
    const notificationIds = ((notifications || []) as Notification[]).map((n) => n.id);
     
    let allReplies: NotificationReply[] = [];
    
    if (notificationIds.length > 0) {
      const { data: repliesData, error: repliesError } = await supabaseAdmin
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
        .in('notification_id', notificationIds)
        .order('created_at', { ascending: false });

      if (repliesError) {
        console.error('❌ Error fetching notification replies:', repliesError);
        // Continue without replies rather than failing
      } else {
        allReplies = repliesData || [];
      }
    }

    // Group replies by notification_id for efficient lookup
    const repliesByNotification = new Map<string, NotificationReply[]>();
     
    allReplies.forEach((reply) => {
      const notificationId = reply.notification_id;
      if (!repliesByNotification.has(notificationId)) {
        repliesByNotification.set(notificationId, []);
      }
      repliesByNotification.get(notificationId)!.push(reply);
    });

    // Map notifications with their replies
    const notificationsWithReplies = ((notifications || []) as Notification[]).map((notification) => {
      const replies = repliesByNotification.get(notification.id) || [];
       
      const userReply = replies.find((r) => r.user_id === userId) || null;

      return {
        ...notification,
        replies: replies,
        user_reply: userReply
      };
    });

      // Use cursor response data if available, otherwise use original notifications
      const finalNotifications = useCursor && cursorResponse 
        ? notificationsWithReplies.slice(0, cursorResponse.data.length)
        : notificationsWithReplies;

      const responseData = {
        notifications: finalNotifications || [],
        pagination: useCursor && cursorResponse ? {
          nextCursor: cursorResponse.nextCursor,
          prevCursor: cursorResponse.prevCursor,
          hasMore: cursorResponse.hasMore
        } : {
          offset,
          limit,
          total: totalCount || 0
        },
        counts: {
          total: totalCount || 0,
          unread: unreadCount || 0
        }
      };

      const requestStartTime = Date.now();
      const response = NextResponse.json(responseData);

      // Add HTTP caching headers (short cache for notifications - user-specific, frequently updated)
      addCacheHeaders(response, responseData, {
        ...CachePresets.USER_DASHBOARD,
        maxAge: 30, // 30 seconds for notifications
        staleWhileRevalidate: 60,
        lastModified: new Date()
      });

      // Check ETag for 304 Not Modified
      const etag = response.headers.get('ETag');
      if (etag && checkETag(request, etag)) {
        const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
        recordHttpCacheOperation({
          endpoint: '/api/notifications/user',
          statusCode: 304,
          is304: true,
          hasETag: true,
          cacheControl: response.headers.get('Cache-Control') || undefined,
          responseSize: 0,
          duration: Date.now() - requestStartTime
        });
        return new NextResponse(null, { status: 304 });
      }

      // Track 200 response
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/notifications/user',
        statusCode: 200,
        is304: false,
        hasETag: !!etag,
        cacheControl: response.headers.get('Cache-Control') || undefined,
        responseSize: JSON.stringify(responseData).length,
        duration: Date.now() - requestStartTime
      });

      return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/notifications/user', {
      endpoint: '/api/notifications/user',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/notifications/user' },
      'Failed to fetch user notifications'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PATCH: Mark notification as read/unread
export async function PATCH(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf } = await import('../../../../lib/csrf-middleware');
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
    
    console.log('🔍 [API] Received mark as read request:', {
      body: body,
      notification_id: body?.notification_id,
      user_id: body?.user_id,
      is_read: body?.is_read
    });
    
    // Validate request body
    const validation = validateRequestBody(notificationMarkReadSchema, body);
    if (!validation.success) {
      // Extract error messages from ZodError
      let errorMessages = validation.error || 'Invalid request data';
      if (validation.details && validation.details.issues && Array.isArray(validation.details.issues)) {
        type ZodIssue = { path?: unknown; message?: string; code?: string };
        const formattedErrors = (validation.details.issues as ZodIssue[]).map((e: ZodIssue) => {
          const path = Array.isArray(e.path) ? e.path.join('.') : String(e.path || 'unknown');
          return `${path}: ${e.message || 'Invalid value'}`;
        });
        errorMessages = formattedErrors.length > 0 ? formattedErrors.join(', ') : errorMessages;
      }
      
      logger.warn('Validation failed for notification mark read', {
        endpoint: '/api/notifications/user',
        method: 'PATCH',
        body: body,
        errors: errorMessages,
        validationDetails: validation.details?.issues ? (validation.details.issues as ZodIssue[]).map((e: ZodIssue) => ({
          path: e.path,
          message: e.message,
          code: e.code
        })) : 'none'
      });
      
      console.error('❌ [API] Validation failed:', {
        errorMessages,
        body,
        validationDetails: validation.details?.issues
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages || 'Invalid request data',
          received: {
            notification_id: body?.notification_id,
            user_id: body?.user_id,
            is_read: body?.is_read
          }
        },
        { status: 400 }
      );
    }

    const { notification_id, user_id, is_read } = validation.data;

    // Verify notification belongs to user
    type NotifRow = { user_id?: string };
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('user_id')
      .eq('id', notification_id)
      .eq('user_id', user_id)
      .single() as { data: NotifRow | null; error: unknown };

    if (fetchError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found or access denied' },
        { status: 404 }
      );
    }

    // Update notification
     
    const { data: updatedNotification, error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: is_read !== undefined ? is_read : true } as never)
      .eq('id', notification_id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating notification:', updateError);
      return NextResponse.json(
        { error: 'Failed to update notification', details: updateError.message },
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
    logger.error('Unexpected error in PATCH /api/notifications/user', {
      endpoint: '/api/notifications/user',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/notifications/user' },
      'Failed to update notification'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


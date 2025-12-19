import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { validateRequestBody, createNotificationSchema } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


// GET: Fetch notifications (sent by admin or received by admin)
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
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const userId = searchParams.get('user_id'); // Filter by specific user
    const mode = searchParams.get('mode') || 'all'; // 'sent', 'received', or 'all'

    // Get current admin user ID
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;
    let currentAdminId: string | null = null;
    
    if (token) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
             
            .single() as any;
          
          if (profile && (profile.role === 'admin' || profile.role === 'super_admin')) {
            currentAdminId = user.id;
          }
        }
      } catch (e) {
        logger.warn('Error getting admin user (non-critical)', {
          endpoint: '/api/admin/notifications',
        }, e instanceof Error ? e : new Error(String(e)));
        // Ignore auth errors
      }
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
        created_at,
        profiles:user_id (
          id,
          full_name,
          email,
          role,
          school_id
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by mode
    if (mode === 'received' && currentAdminId) {
      // Show notifications received by current admin
      query = query.eq('user_id', currentAdminId);
    } else if (mode === 'sent') {
      // Show all notifications (sent by admin) - original behavior
      // No filter needed
    } else if (mode === 'all') {
      // Show all notifications, but prioritize received ones if admin ID is available
      if (currentAdminId) {
        // We'll handle this by sorting received notifications first
      }
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: notifications, error } = await query;

    if (error) {
      logger.error('Error fetching notifications', {
        endpoint: '/api/admin/notifications',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/notifications' },
        'Failed to fetch notifications'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Get unique recipients count
    const { data: recipientsData } = await supabaseAdmin
      .from('notifications')
      .select('user_id')
       
      .order('created_at', { ascending: false }) as any;

    const uniqueRecipients = new Set(recipientsData?.map((n: { user_id: string }) => n.user_id) || []).size;

    return NextResponse.json({
      notifications: notifications || [],
      total: recipientsData?.length || 0,
      uniqueRecipients,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/notifications', {
      endpoint: '/api/admin/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/notifications' },
      'Failed to fetch notifications'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST: Send notifications to users
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
    const validation = validateRequestBody(createNotificationSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for notification creation', {
        endpoint: '/api/admin/notifications',
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

    const { title, message, type = 'general', recipientType, recipients } = validation.data;

    if (!title || !message) {
      return NextResponse.json(
        { error: 'Title and message are required' },
        { status: 400 }
      );
    }

    if (!recipientType || !recipients || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipient type and recipients are required' },
        { status: 400 }
      );
    }

    // recipientType can be: 'all', 'role', 'school', 'individual'
    // recipients can be: ['all'] or ['admin', 'teacher', 'student'] or ['school_id1', 'school_id2'] or ['user_id1', 'user_id2']

    let userIds: string[] = [];

    if (recipientType === 'all') {
      // Get all user IDs from profiles
      const { data: allProfiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
         
        .select('id') as any;

      if (profilesError) {
        console.error('❌ Error fetching all profiles:', profilesError);
        return NextResponse.json(
          { error: 'Failed to fetch users', details: profilesError.message },
          { status: 500 }
        );
      }

      userIds = allProfiles?.map((p: { id: string }) => p.id) || [];
    } else if (recipientType === 'role') {
      // Get user IDs by role
      const { data: profilesByRole, error: roleError } = await supabaseAdmin
        .from('profiles')
        .select('id')
         
        .in('role', recipients) as any;

      if (roleError) {
        console.error('❌ Error fetching profiles by role:', roleError);
        return NextResponse.json(
          { error: 'Failed to fetch users by role', details: roleError.message },
          { status: 500 }
        );
      }

      userIds = profilesByRole?.map((p: { id: string }) => p.id) || [];
    } else if (recipientType === 'school') {
      // Get user IDs by school
      const { data: profilesBySchool, error: schoolError } = await supabaseAdmin
        .from('profiles')
        .select('id')
         
        .in('school_id', recipients) as any;

      if (schoolError) {
        console.error('❌ Error fetching profiles by school:', schoolError);
        return NextResponse.json(
          { error: 'Failed to fetch users by school', details: schoolError.message },
          { status: 500 }
        );
      }

      userIds = profilesBySchool?.map((p: { id: string }) => p.id) || [];
    } else if (recipientType === 'individual') {
      // Use provided user IDs directly
      userIds = recipients;
    }

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: 'No recipients found matching the criteria' },
        { status: 400 }
      );
    }

    // Create notifications for all recipients
    const notificationsToInsert = userIds.map((userId: any) => ({
      user_id: userId,
      title,
      message,
      type,
      is_read: false
    }));

    const { data: insertedNotifications, error: insertError } = await (supabaseAdmin
      .from('notifications')
       
      .insert(notificationsToInsert as any)
       
      .select() as any);

    if (insertError) {
      console.error('❌ Error inserting notifications:', insertError);
      return NextResponse.json(
        { error: 'Failed to send notifications', details: insertError.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({
      success: true,
      message: `Successfully sent ${insertedNotifications?.length || 0} notifications`,
      sent: insertedNotifications?.length || 0,
      recipients: userIds.length
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/notifications', {
      endpoint: '/api/admin/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/notifications' },
      'Failed to send notifications'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


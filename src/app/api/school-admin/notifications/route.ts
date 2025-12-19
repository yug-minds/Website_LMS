import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createNotificationSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// GET: Fetch notifications sent by school admin
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
    console.log('🔍 [Notifications API] Starting GET request');
    console.log('🔍 [Notifications API] Request URL:', request.url);
    console.log('🔍 [Notifications API] Request headers:', {
      authorization: request.headers.get('authorization') ? 'Present' : 'Missing',
      cookie: request.headers.get('cookie') ? 'Present' : 'Missing',
      allHeaders: Object.fromEntries(request.headers.entries())
    });
    
    // Get the school admin's school_id from authentication (secure)
    const schoolId = await getSchoolAdminSchoolId(request);
    
    console.log('🔍 [Notifications API] School ID result:', schoolId ? `Found: ${schoolId || 'undefined'}` : 'NULL - Authentication failed');
    
    if (!schoolId) {
      console.error('❌ [Notifications API] Authentication failed - no school_id');
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const userId = searchParams.get('user_id');

    // Get school admin's user ID from school
    const { data: schoolData, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('school_admin_id')
      .eq('id', schoolId)
       
      .single() as any;

    if (schoolError || !schoolData) {
      return NextResponse.json(
        { error: 'School not found', details: schoolError?.message },
        { status: 404 }
      );
    }

    // Get all users in this school to find notifications sent to them
    const { data: schoolUsers, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('id')
       
      .eq('school_id', schoolId) as any;

    if (usersError) {
      return NextResponse.json(
        { error: 'Failed to fetch school users', details: usersError.message },
        { status: 500 }
      );
    }

    const userIds = schoolUsers?.map((u: { id: string }) => u.id) || [];
    
    // Get current school admin user ID
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;
    let currentSchoolAdminId: string | null = null;
    
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) {
            base64 += '=';
          }
          const payloadJson = Buffer.from(base64, 'base64').toString('utf-8');
          const payload = JSON.parse(payloadJson);
          if (payload && payload.sub) {
            const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('role')
              .eq('id', payload.sub)
               
              .single() as any;
            
            if (profile && profile.role === 'school_admin') {
              currentSchoolAdminId = payload.sub;
            }
          }
        }
      } catch (e) {
        logger.warn('Error decoding JWT (non-critical)', {
          endpoint: '/api/school-admin/notifications',
        }, e instanceof Error ? e : new Error(String(e)));
        // Ignore decode errors
      }
    }

    const mode = searchParams.get('mode') || 'all'; // 'sent', 'received', or 'all'
    
    let query;
    
    if (mode === 'received' && currentSchoolAdminId) {
      // Show notifications received by current school admin
      query = supabaseAdmin
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
        .eq('user_id', currentSchoolAdminId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    } else {
      // Show notifications sent to school users (original behavior)
      if (userIds.length === 0) {
        return NextResponse.json({
          notifications: [],
          total: 0,
          limit,
          offset
        });
      }

      query = supabaseAdmin
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
        .in('user_id', userIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (userId) {
        query = query.eq('user_id', userId);
      }
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error('❌ Error fetching notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notifications', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      notifications: notifications || [],
      total: notifications?.length || 0,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/notifications', {
      endpoint: '/api/school-admin/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/notifications' },
      'Failed to fetch notifications'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST: Send notifications from school admin
export async function POST(request: NextRequest) {
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
    // Get the school admin's school_id from authentication (secure)
    const schoolId = await getSchoolAdminSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createNotificationSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for school admin notification creation', {
        endpoint: '/api/school-admin/notifications',
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

    let userIds: string[] = [];

    if (recipientType === 'role') {
      // Get user IDs by role within this school (using authenticated school_id)
      const { data: profilesByRole, error: roleError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('school_id', schoolId)
         
        .in('role', recipients) as any;

      if (roleError) {
        console.error('❌ Error fetching profiles by role:', roleError);
        return NextResponse.json(
          { error: 'Failed to fetch users by role', details: roleError.message },
          { status: 500 }
        );
      }

      userIds = profilesByRole?.map((p: { id: string }) => p.id) || [];
    } else if (recipientType === 'individual') {
      // Verify all user IDs belong to this school (using authenticated school_id)
      const { data: profilesData, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('school_id', schoolId)
         
        .in('id', recipients) as any;

      if (profilesError) {
        console.error('❌ Error fetching profiles:', profilesError);
        return NextResponse.json(
          { error: 'Failed to verify users', details: profilesError.message },
          { status: 500 }
        );
      }

      userIds = profilesData?.map((p: { id: string }) => p.id) || [];
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

    return NextResponse.json({
      success: true,
      message: `Successfully sent ${insertedNotifications?.length || 0} notifications`,
      sent: insertedNotifications?.length || 0,
      recipients: userIds.length
    });
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/notifications', {
      endpoint: '/api/school-admin/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/notifications' },
      'Failed to send notifications'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


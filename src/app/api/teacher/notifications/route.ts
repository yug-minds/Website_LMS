import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { validateTeacherSchoolAccess } from '../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { validateRequestBody, createNotificationSchema } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// GET: Fetch notifications sent by teacher
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
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const schoolId = searchParams.get('school_id');
    const userId = searchParams.get('user_id');

    if (!schoolId) {
      return NextResponse.json(
        { error: 'School ID is required' },
        { status: 400 }
      );
    }

    // Validate that teacher is assigned to this school
    const hasAccess = await validateTeacherSchoolAccess(schoolId, request);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Teacher is not assigned to this school' },
        { status: 403 }
      );
    }

    // Get all students in this school to find notifications sent to them
    const { data: schoolStudents, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('school_id', schoolId)
       
      .eq('role', 'student') as any;

    if (studentsError) {
      return NextResponse.json(
        { error: 'Failed to fetch school students', details: studentsError.message },
        { status: 500 }
      );
    }

    const userIds = schoolStudents?.map((u: { id: string }) => u.id) || [];
    
    if (userIds.length === 0) {
      return NextResponse.json({
        notifications: [],
        total: 0,
        limit,
        offset
      });
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
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq('user_id', userId);
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
    logger.error('Unexpected error in GET /api/teacher/notifications', {
      endpoint: '/api/teacher/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/notifications' },
      'Failed to fetch notifications'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST: Send notifications from teacher
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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createNotificationSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for teacher notification creation', {
        endpoint: '/api/teacher/notifications',
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
     
    const school_id = (body as any).school_id; // school_id is required for teachers but not in base schema

    if (!title || !message) {
      return NextResponse.json(
        { error: 'Title and message are required' },
        { status: 400 }
      );
    }

    if (!school_id) {
      return NextResponse.json(
        { error: 'School ID is required' },
        { status: 400 }
      );
    }

    // Validate that teacher is assigned to this school
    const hasAccess = await validateTeacherSchoolAccess(school_id, request);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Teacher is not assigned to this school' },
        { status: 403 }
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
      // Teachers can only send to students
      const allowedRoles = ['student'];
      const validRoles = recipients.filter((r: string) => allowedRoles.includes(r));
      
      if (validRoles.length === 0) {
        return NextResponse.json(
          { error: 'Teachers can only send notifications to students' },
          { status: 400 }
        );
      }

      // Get user IDs by role within this school (only students)
      const { data: profilesByRole, error: roleError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('school_id', school_id)
         
        .in('role', validRoles) as any;

      if (roleError) {
        console.error('❌ Error fetching profiles by role:', roleError);
        return NextResponse.json(
          { error: 'Failed to fetch students', details: roleError.message },
          { status: 500 }
        );
      }

      userIds = profilesByRole?.map((p: { id: string }) => p.id) || [];
    } else if (recipientType === 'individual') {
      // Verify all user IDs are students in this school
      const { data: profilesData, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('school_id', school_id)
        .eq('role', 'student')
         
        .in('id', recipients) as any;

      if (profilesError) {
        console.error('❌ Error fetching profiles:', profilesError);
        return NextResponse.json(
          { error: 'Failed to verify students', details: profilesError.message },
          { status: 500 }
        );
      }

      userIds = profilesData?.map((p: { id: string }) => p.id) || [];
    }

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: 'No students found matching the criteria' },
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

     
    const { data: insertedNotifications, error: insertError } = await ((supabaseAdmin as any)
      .from('notifications')
      .insert(notificationsToInsert)
       
      .select()) as any;

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
    logger.error('Unexpected error in POST /api/teacher/notifications', {
      endpoint: '/api/teacher/notifications',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/notifications' },
      'Failed to send notifications'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

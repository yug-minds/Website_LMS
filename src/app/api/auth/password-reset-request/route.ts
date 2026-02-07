import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { passwordResetRequestSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { validateCsrf } from '../../../../lib/csrf-middleware';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface Profile {
  id?: string;
  email?: string;
  school_id?: string;
  role?: string;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface PasswordResetRequest {
  id?: string;
  user_id?: string;
  email?: string;
  status?: string;
  [key: string]: unknown;
}

interface RequestData {
  user_id: string;
  email: string;
  status: string;
  requested_at: string;
}

interface Notification {
  user_id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface SchoolAdmin {
  id?: string;
  email?: string;
  [key: string]: unknown;
}

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST: Submit a password reset request
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const { ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  
  ensureCsrfToken(request);

  // Apply rate limiting (more lenient for password reset - 10 requests per 5 minutes)
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 10,
    windowSeconds: 300, // 5 minutes
  });
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
    const validation = validateRequestBody(passwordResetRequestSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e) => {
        const issue = e as { path?: (string | number)[]; message?: string };
        const path = Array.isArray(issue.path) ? issue.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number').join('.') : '';
        return `${path ? path + ': ' : ''}${issue.message || ''}`;
      }).join(', ') || validation.error || 'Invalid request data';
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { email } = validation.data;

        // Find the user profile by email
        // Retry lookup in case profile was just created
        type Profile = {
          id: string;
          email?: string | null;
          role?: string | null;
          school_id?: string | null;
          full_name?: string | null;
        };
        let profile: Profile | null = null;
         
        let profileError: unknown = null;
        
        for (let retry = 0; retry < 3; retry++) {
          if (retry > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retry));
          }
          
          const { data: profileData, error: error } = await supabaseAdmin
            .from('profiles')
            .select('id, email, role, school_id, full_name')
            .eq('email', email.toLowerCase().trim())
             
            .single();
          
          if (!error && profileData) {
            profile = profileData;
            profileError = null;
            break;
          } else {
            profileError = error;
          }
        }

        if (profileError || !profile) {
          // Don't reveal if email exists or not for security
          return NextResponse.json(
            { message: 'If an account exists with this email, a password reset request has been submitted.' },
            { status: 200 }
          );
        }
        
        const typedProfile = profile as { id?: string; role?: string; school_id?: string; full_name?: string; email?: string };
        console.log(`✅ Found profile: id=${typedProfile.id}, role=${typedProfile.role}, school_id=${typedProfile.school_id || 'null'}`);

    // Check if there's already a pending request
    const { data: existingRequest } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id')
      .eq('user_id', typedProfile.id || '')
      .eq('status', 'pending')
       
      .single();

    if (existingRequest) {
      return NextResponse.json(
        { message: 'A password reset request is already pending. Please wait for approval.' },
        { status: 200 }
      );
    }

        // Create the password reset request
        // Ensure school_id is set correctly
        const requestData: RequestData & { user_role?: string; school_id?: string } = {
          user_id: typedProfile.id || '',
          email: typedProfile.email || '',
          user_role: typedProfile.role,
          status: 'pending',
          requested_at: new Date().toISOString()
        };
        
        // Only set school_id if it exists (some users like main admins might not have a school_id)
        if (typedProfile.school_id) {
          requestData.school_id = typedProfile.school_id;
        }
        
        console.log('📝 Attempting to insert password reset request with data:', JSON.stringify(requestData, null, 2));
        
        const { data: resetRequest, error: insertError } = await supabaseAdmin
          .from('password_reset_requests')
          .insert(requestData as never)
          .select()
          .single();

    if (insertError) {
      console.error('❌ Error creating password reset request:', {
        error: insertError,
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        requestData: requestData
      });
      
      // Provide more detailed error information
      let errorMessage = 'Failed to create password reset request';
      if (insertError.message) {
        errorMessage += `: ${insertError.message}`;
      }
      if (insertError.details) {
        errorMessage += ` (${insertError.details})`;
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to create password reset request',
          message: errorMessage,
          details: insertError.message || insertError.details || 'Unknown database error',
          code: insertError.code
        },
        { status: 500 }
      );
    }
    
    console.log('✅ Successfully created password reset request:', resetRequest?.id);

    // Send notifications based on user role:
    // - If student: notify school admin AND admin
    // - If teacher/school_admin: notify admin only
    const notificationsToInsert: Notification[] = [];

    // Always notify main admin (admin or super_admin role)
    const { data: mainAdmins } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .in('role', ['admin', 'super_admin']);

    if (mainAdmins && mainAdmins.length > 0) {
      mainAdmins.forEach((admin: { id: string; email?: string; full_name?: string }) => {
        const profileForNotification = profile as { full_name?: string; email?: string; role?: string };
        notificationsToInsert.push({
          user_id: admin.id,
          title: 'Password Reset Request',
          message: `A password reset request has been submitted by ${profileForNotification.full_name || profileForNotification.email} (${profileForNotification.role}). Please review and approve or reject the request.`,
          type: 'info',
          is_read: false,
          created_at: new Date().toISOString()
        } as Notification);
      });
      console.log(`✅ Added ${mainAdmins.length} main admin(s) to notification list`);
    }

    // If the requesting user is a STUDENT, also notify school admin
    if (typedProfile.role === 'student' && typedProfile.school_id) {
      console.log(`🔍 Looking for school admins for student's school_id: ${typedProfile.school_id}`);
      
      let schoolAdmins: Array<{ id?: string }> = [];
      let schoolAdminError: unknown = null;
      
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          await new Promise(resolve => setTimeout(resolve, 500 * retry));
        }
        
        const { data: admins, error: error } = await supabaseAdmin
          .from('profiles')
          .select('id, email, full_name, school_id')
          .eq('role', 'school_admin')
          .eq('school_id', typedProfile.school_id || '');

        if (!error && admins && admins.length > 0) {
          schoolAdmins = admins as Array<{ id?: string }>;
          schoolAdminError = null;
          break;
        } else {
          schoolAdminError = error;
        }
      }

      if (schoolAdminError) {
        console.error('❌ Error fetching school admins:', schoolAdminError);
      } else if (schoolAdmins && schoolAdmins.length > 0) {
        console.log(`✅ Found ${schoolAdmins.length} school admin(s) for school_id ${typedProfile.school_id}`);
        schoolAdmins.forEach((admin: { id?: string }) => {
          if (admin.id) {
            notificationsToInsert.push({
              user_id: admin.id,
              title: 'Password Reset Request',
              message: `A password reset request has been submitted by ${typedProfile.full_name || typedProfile.email} (${typedProfile.role}) from your school. Please review and approve or reject the request.`,
              type: 'info',
              is_read: false,
              created_at: new Date().toISOString()
            } as Notification);
          }
        });
        console.log(`✅ Added ${schoolAdmins.length} school admin(s) to notification list`);
      } else {
        console.log(`⚠️ No school admin found for school_id: ${typedProfile.school_id}`);
      }
    } else {
      if (typedProfile.role !== 'student') {
        console.log(`ℹ️ User role is '${typedProfile.role}', not 'student' - only notifying main admin (not school admin)`);
      } else if (!typedProfile.school_id) {
        console.log(`⚠️ Student has no school_id, skipping school admin notification`);
      }
    }

    // Insert all notifications
    if (notificationsToInsert.length > 0) {
      const { data: insertedNotifications, error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert(notificationsToInsert as never)
        .select();

      if (notificationError) {
        console.error('❌ Error creating notifications:', notificationError);
        // Don't fail the request if notifications fail
      } else {
        console.log(`✅ Created ${insertedNotifications?.length || 0} notifications for password reset request`);
      }
    }

    // Return success response with CSRF token cookie
    const resetRequestData = resetRequest as { id?: string };
    const successResponse = NextResponse.json({
      message: 'Password reset request submitted successfully. An administrator will review your request.',
      requestId: resetRequestData.id
    });
    // Ensure CSRF token is set in response
    const { ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/auth/password-reset-request', {
      endpoint: '/api/auth/password-reset-request',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/auth/password-reset-request' },
      'Failed to submit password reset request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


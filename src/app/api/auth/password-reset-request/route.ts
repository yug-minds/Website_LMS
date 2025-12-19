import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { passwordResetRequestSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { validateCsrf } from '../../../../lib/csrf-middleware';


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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(passwordResetRequestSchema, body);
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

    const { email } = validation.data;

        // Find the user profile by email
        // Retry lookup in case profile was just created
         
        let profile: any = null;
         
        let profileError: any = null;
        
        for (let retry = 0; retry < 3; retry++) {
          if (retry > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retry));
          }
          
          const { data: profileData, error: error } = await supabaseAdmin
            .from('profiles')
            .select('id, email, role, school_id, full_name')
            .eq('email', email.toLowerCase().trim())
             
            .single() as any;
          
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
        
        console.log(`✅ Found profile: id=${profile.id}, role=${profile.role}, school_id=${profile.school_id || 'null'}`);

    // Check if there's already a pending request
    const { data: existingRequest } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id')
      .eq('user_id', profile.id)
      .eq('status', 'pending')
       
      .single() as any;

    if (existingRequest) {
      return NextResponse.json(
        { message: 'A password reset request is already pending. Please wait for approval.' },
        { status: 200 }
      );
    }

        // Create the password reset request
        // Ensure school_id is set correctly
         
        const requestData: any = {
          user_id: profile.id,
          email: profile.email,
          user_role: profile.role,
          status: 'pending',
          requested_at: new Date().toISOString()
        };
        
        // Only set school_id if it exists (some users like main admins might not have a school_id)
        if (profile.school_id) {
          requestData.school_id = profile.school_id;
        }
        
        console.log('📝 Attempting to insert password reset request with data:', JSON.stringify(requestData, null, 2));
        
        const { data: resetRequest, error: insertError } = await supabaseAdmin
          .from('password_reset_requests')
          .insert(requestData)
          .select()
          .single() as any;

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

    // Send notifications to main admin and school admin
     
    const notificationsToInsert: any[] = [];

    // Find main admin (admin or super_admin role)
    const { data: mainAdmins } = await supabaseAdmin
      .from('profiles')
      .select('id')
       
      .in('role', ['admin', 'super_admin']) as any;

    if (mainAdmins && mainAdmins.length > 0) {
      mainAdmins.forEach((admin: { id: string }) => {
        notificationsToInsert.push({
          user_id: admin.id,
          title: 'Password Reset Request',
          message: `A password reset request has been submitted by ${profile.full_name || profile.email} (${profile.role}). Please review and approve or reject the request.`,
          type: 'info',
          is_read: false
        });
      });
    }

    // Find school admin if user has a school_id
    if (profile.school_id) {
      console.log(`🔍 Looking for school admins for school_id: ${profile.school_id}`);
      
      // Retry fetching school admins in case they were just created
       
      let schoolAdmins: any[] = [];
       
      let schoolAdminError: any = null;
      
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          await new Promise(resolve => setTimeout(resolve, 500 * retry));
        }
        
        const { data: admins, error: error } = await supabaseAdmin
          .from('profiles')
          .select('id, email, full_name, school_id')
          .eq('role', 'school_admin')
           
          .eq('school_id', profile.school_id) as any;

        if (!error && admins && admins.length > 0) {
          schoolAdmins = admins;
          schoolAdminError = null;
          break;
        } else {
          schoolAdminError = error;
        }
      }

      if (schoolAdminError) {
        console.error('❌ Error fetching school admins:', schoolAdminError);
      } else if (schoolAdmins && schoolAdmins.length > 0) {
        console.log(`✅ Found ${schoolAdmins.length} school admin(s) for school_id ${profile.school_id}:`, 
          schoolAdmins.map((a: any) => `${a.full_name || a.email} (${a.id})`).join(', '));
        schoolAdmins.forEach(admin => {
          notificationsToInsert.push({
            user_id: admin.id,
            title: 'Password Reset Request',
            message: `A password reset request has been submitted by ${profile.full_name || profile.email} (${profile.role}) from your school. Please review and approve or reject the request.`,
            type: 'info',
            is_read: false
          });
        });
        console.log(`✅ Added ${schoolAdmins.length} school admin(s) to notification list`);
      } else {
        // Debug: Check if there are any school admins at all, and what schools they're in
        const { data: allSchoolAdmins } = await supabaseAdmin
          .from('profiles')
          .select('id, email, full_name, school_id')
          .eq('role', 'school_admin')
           
          .limit(10) as any;
        
        console.log(`⚠️ No school admin found for school_id: ${profile.school_id}`);
        if (allSchoolAdmins && allSchoolAdmins.length > 0) {
          console.log(`   Available school admins in system:`, 
            allSchoolAdmins.map((a: { full_name?: string; email?: string; school_id?: string }) => `${a.full_name || a.email} (school_id: ${a.school_id})`).join(', '));
        } else {
          console.log(`   No school admins found in the system at all`);
        }
      }
    } else {
      console.log(`⚠️ User has no school_id, skipping school admin notification`);
    }

    // Insert all notifications
    if (notificationsToInsert.length > 0) {
      const { data: insertedNotifications, error: notificationError } = await (supabaseAdmin
        .from('notifications')
         
        .insert(notificationsToInsert as any)
         
        .select() as any);

      if (notificationError) {
        console.error('❌ Error creating notifications:', notificationError);
        // Don't fail the request if notifications fail
      } else {
        console.log(`✅ Created ${insertedNotifications?.length || 0} notifications for password reset request`);
      }
    }

    // Return success response with CSRF token cookie
    const successResponse = NextResponse.json({
      message: 'Password reset request submitted successfully. An administrator will review your request.',
      requestId: resetRequest.id
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


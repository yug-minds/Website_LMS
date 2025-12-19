import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { passwordResetRequestUpdateSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Fetch password reset requests for school admin's school
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
    // Try JWT decoding first (more reliable for tokens from signInWithPassword)
    let schoolId: string | null = null;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || '';
    
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
              .select('role, school_id')
              .eq('id', payload.sub)
               
              .single() as any;
            
            if (profile && profile.role === 'school_admin' && profile.school_id) {
              schoolId = profile.school_id;
            }
          }
        }
      } catch (e) {
        logger.warn('JWT decode failed (non-critical)', {
          endpoint: '/api/school-admin/password-reset-requests',
        }, e instanceof Error ? e : new Error(String(e)));
        // JWT decode failed, try helper function
      }
    }
    
    // Fallback to helper function if JWT decoding didn't work
    if (!schoolId) {
      schoolId = await getSchoolAdminSchoolId(request);
    }
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized - School admin access required' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin
      .from('password_reset_requests')
      .select(`
        id,
        user_id,
        email,
        user_role,
        status,
        requested_at,
        approved_at,
        approved_by,
        school_id,
        notes,
        created_at,
        updated_at,
        profiles:user_id (
          id,
          full_name,
          email,
          role,
          school_id
        ),
        schools:school_id (
          id,
          name
        )
      `)
      .eq('school_id', schoolId)
      .neq('user_role', 'school_admin') // School admins can't approve other school admins
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: requests, error } = await query;

    if (error) {
      logger.error('Error fetching password reset requests', {
        endpoint: '/api/school-admin/password-reset-requests',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/school-admin/password-reset-requests' },
        'Failed to fetch password reset requests'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Get total count
    let countQuery = supabaseAdmin
      .from('password_reset_requests')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .neq('user_role', 'school_admin');

    if (status !== 'all') {
      countQuery = countQuery.eq('status', status);
    }

    const { count } = await countQuery;

    return NextResponse.json({
      requests: requests || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/password-reset-requests', {
      endpoint: '/api/school-admin/password-reset-requests',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/password-reset-requests' },
      'Failed to fetch password reset requests'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PATCH: Update password reset request status (approve/reject)
export async function PATCH(request: NextRequest) {
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
    // Try JWT decoding first (more reliable for tokens from signInWithPassword)
    let schoolId: string | null = null;
    let userId: string | null = null;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || '';
    
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
            userId = payload.sub;
            // Retry profile lookup multiple times (for newly created profiles)
            for (let retry = 0; retry < 5; retry++) {
              if (retry > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000 * retry));
              }
              
              const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('role, school_id')
                .eq('id', payload.sub)
                 
                .single() as any;
              
              if (profile && profile.role === 'school_admin' && profile.school_id) {
                schoolId = profile.school_id;
                console.log(`✅ Found school admin profile: user_id=${payload.sub}, school_id=${profile.school_id}`);
                break;
              } else if (profileError) {
                console.warn(`Profile lookup failed (attempt ${retry + 1}):`, profileError.message);
              } else if (profile) {
                console.warn(`Profile found but invalid: role=${profile.role}, school_id=${profile.school_id || 'null'}`);
              } else {
                console.warn(`Profile not found for user_id: ${payload.sub} (attempt ${retry + 1})`);
              }
            }
          }
        }
       
      } catch (e: any) {
        logger.warn('JWT decode failed (non-critical)', {
          endpoint: '/api/school-admin/password-reset-requests',
        }, e instanceof Error ? e : new Error(String(e)));
        // JWT decode failed, try helper function
      }
    }
    
    // Fallback to helper function if JWT decoding didn't work
    if (!schoolId) {
      schoolId = await getSchoolAdminSchoolId(request);
      
      // Get user ID from token if we have schoolId
      if (schoolId && !userId && token) {
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
              userId = payload.sub;
            }
          }
        } catch (e) {
          logger.warn('JWT decode failed, trying admin client (non-critical)', {
            endpoint: '/api/school-admin/password-reset-requests',
          }, e instanceof Error ? e : new Error(String(e)));
          // JWT decode failed, try with admin client
          try {
            const { data: { user } } = await supabaseAdmin.auth.getUser(token);
            userId = user?.id || null;
          } catch (authError) {
            logger.warn('Admin client getUser also failed (non-critical)', {
              endpoint: '/api/school-admin/password-reset-requests',
            }, authError instanceof Error ? authError : new Error(String(authError)));
          }
        }
      }
    }
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized - School admin access required' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError);
      return NextResponse.json(
        { 
          error: 'Invalid request body',
          details: 'Request body must be valid JSON',
        },
        { status: 400 }
      );
    }
    
    // Log the incoming request for debugging
    console.log('📥 School admin password reset request update - Incoming request:');
    console.log('  Raw body:', JSON.stringify(body, null, 2));
    console.log('  Body type:', typeof body);
    console.log('  Body keys:', Object.keys(body || {}));
    console.log('  id value:', body?.id, '(type:', typeof body?.id, ')');
    console.log('  status value:', body?.status, '(type:', typeof body?.status, ')');
    console.log('  approved_by value:', body?.approved_by, '(type:', typeof body?.approved_by, ')');
    console.log('  notes value:', body?.notes, '(type:', typeof body?.notes, ')');
    
    // Validate request body
    const validation = validateRequestBody(passwordResetRequestUpdateSchema, body);
    if (!validation.success) {
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      
      // Log detailed validation errors
      console.error('❌ Validation failed for school admin password reset request update');
      console.error('  Request body received:', JSON.stringify(body, null, 2));
      console.error('  Validation error count:', validation.details?.issues?.length || 0);
      console.error('  Validation issues:');
      if (validation.details?.issues) {
        validation.details.issues.forEach((issue: any, index: number) => {
          console.error(`    ${index + 1}. Path: [${issue.path.join('.')}]`);
          console.error(`       Message: ${issue.message}`);
          console.error(`       Code: ${issue.code}`);
          console.error(`       Input: ${JSON.stringify(issue.input)}`);
        });
      }
      console.error('  Combined error messages:', errorMessages);
      
      logger.warn('Validation failed for school admin password reset request update', {
        endpoint: '/api/school-admin/password-reset-requests',
        errors: errorMessages,
        requestBody: body,
        validationIssues: validation.details?.issues,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
          validationIssues: validation.details?.issues?.map((issue: any) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code
          }))
        },
        { status: 400 }
      );
    }

    const { id, status, approved_by, notes } = validation.data;
    
    console.log('✅ Validation passed. Data:', { id, status, approved_by: approved_by || 'undefined', notes: notes || 'undefined' });

    // Get user ID from authenticated session if approved_by is not provided
    let finalApprovedBy = approved_by;
    if (status === 'approved' && !finalApprovedBy) {
      console.log('⚠️ approved_by not provided, using authenticated user ID...');
      
      if (userId) {
        finalApprovedBy = userId;
        console.log('✅ Using authenticated user ID as approved_by:', finalApprovedBy);
      } else {
        console.error('❌ No authenticated user ID available');
        return NextResponse.json(
          { 
            error: 'Validation failed',
            details: 'approved_by is required when status is approved. Please provide approved_by in the request body or ensure you are authenticated.',
          },
          { status: 400 }
        );
      }
    }
    
    console.log('✅ Final approved_by:', finalApprovedBy || 'N/A (not approving)');

    // Get the request first and verify it belongs to the school admin's school
    console.log('🔍 Looking for password reset request with ID:', id, '(type:', typeof id, ')', 'for school:', schoolId);
    
    const { data: resetRequest, error: fetchError } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id, user_id, email, status, requested_at, approved_at, approved_by, school_id, user_role, notes, created_at, updated_at')
      .eq('id', id)
      .eq('school_id', schoolId)
      .maybeSingle() as any;

    if (fetchError) {
      console.error('❌ Error fetching password reset request:', fetchError);
      logger.error('Error fetching password reset request', {
        endpoint: '/api/school-admin/password-reset-requests',
        requestId: id,
        schoolId: schoolId,
        error: fetchError
      });
      return NextResponse.json(
        { 
          error: 'Failed to fetch password reset request',
          details: fetchError.message 
        },
        { status: 500 }
      );
    }

    if (!resetRequest) {
      console.error('❌ Password reset request not found with ID:', id, 'for school:', schoolId);
      
      // Debug: Check if any requests exist for this school
      const { data: schoolRequests, error: debugError } = await supabaseAdmin
        .from('password_reset_requests')
        .select('id, email, status, school_id')
        .eq('school_id', schoolId)
        .limit(5) as any;
      
      console.log('🔍 Debug: Found', schoolRequests?.length || 0, 'password reset requests for school', schoolId);
      if (schoolRequests && schoolRequests.length > 0) {
        console.log('🔍 Debug: Sample request IDs for this school:', schoolRequests.map((r: any) => r.id));
      }
      
      // Check if the ID format is correct
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return NextResponse.json(
          { 
            error: 'Invalid request ID format',
            details: 'The provided ID is not a valid UUID format'
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Password reset request not found or access denied',
          details: `No password reset request found with ID: ${id} for your school. Please refresh the page and try again.`
        },
        { status: 404 }
      );
    }

    console.log('✅ Found password reset request:', {
      id: resetRequest.id,
      email: resetRequest.email,
      status: resetRequest.status,
      school_id: resetRequest.school_id
    });

    // Verify it's not a school admin request (school admins can't approve other school admins)
    if (resetRequest.user_role === 'school_admin') {
      return NextResponse.json(
        { error: 'School admins cannot approve password reset requests for other school admins' },
        { status: 403 }
      );
    }

    // Update the request
     
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'approved' && finalApprovedBy) {
      updateData.approved_at = new Date().toISOString();
      updateData.approved_by = finalApprovedBy;
    }

    if (notes) {
      updateData.notes = notes;
    }

    const { data: updatedRequest, error: updateError } = await ((supabaseAdmin as any)
      .from('password_reset_requests')
       
      .update(updateData as any)
      .eq('id', id)
      .select()
       
      .single() as any) as any;

    if (updateError) {
      logger.error('Error updating password reset request', {
        endpoint: '/api/school-admin/password-reset-requests',
      }, updateError);
      
      const errorInfo = await handleApiError(
        updateError,
        { endpoint: '/api/school-admin/password-reset-requests' },
        'Failed to update password reset request'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // If approved, reset the password
    let tempPassword: string | null = null;
    if (status === 'approved' && resetRequest.user_id) {
      try {
        // Generate a temporary password
        tempPassword = `TempPass${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        
        // Update password in Supabase Auth
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
          resetRequest.user_id,
          { password: tempPassword }
        );

        if (authError) {
          logger.error('Error resetting password', {
            endpoint: '/api/school-admin/password-reset-requests',
          }, authError);
          
          const errorInfo = await handleApiError(
            authError,
            { endpoint: '/api/school-admin/password-reset-requests' },
            'Failed to reset password'
          );
          return NextResponse.json(errorInfo, { status: errorInfo.status });
        }

        // Set force_password_change flag on profile
         
        await ((supabaseAdmin as any)
          .from('profiles')
           
          .update({ force_password_change: true } as any)
           
          .eq('id', resetRequest.user_id)) as any;

        // Update the request with the temp password in notes
         
        await ((supabaseAdmin as any)
          .from('password_reset_requests')
          .update({ 
            notes: `Password reset completed. Temporary password: ${tempPassword}`,
            status: 'completed'
           
          } as any)
           
          .eq('id', id)) as any;

        // Send notification to the user
        await (supabaseAdmin
          .from('notifications')
          .insert({
            user_id: resetRequest.user_id,
            title: 'Password Reset Approved',
            message: `Your password reset request has been approved. Your temporary password is: ${tempPassword}. Please log in and change your password immediately.`,
            type: 'success',
            is_read: false
           
          } as any) as any);
       
      } catch (authError: any) {
        logger.error('Error in password reset', {
          endpoint: '/api/school-admin/password-reset-requests',
        }, authError instanceof Error ? authError : new Error(String(authError)));
        
        const errorInfo = await handleApiError(
          authError,
          { endpoint: '/api/school-admin/password-reset-requests' },
          'Failed to reset password'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }
    }

    return NextResponse.json({
      request: updatedRequest,
      message: 'Password reset request updated successfully',
      ...(tempPassword && { tempPassword })
    });
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/school-admin/password-reset-requests', {
      endpoint: '/api/school-admin/password-reset-requests',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/password-reset-requests' },
      'Failed to update password reset request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


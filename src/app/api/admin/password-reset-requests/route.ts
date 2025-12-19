import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { passwordResetRequestUpdateSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';

import { verifyAdmin } from '../../../../lib/auth-utils';
import fs from 'fs';
import path from 'path';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Fetch all password reset requests
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
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: requests, error } = await query;

    if (error) {
      console.error('❌ Error fetching password reset requests:', error);
      return NextResponse.json(
        { error: 'Failed to fetch password reset requests', details: error.message },
        { status: 500 }
      );
    }

    // Get total count
    let countQuery = supabaseAdmin
      .from('password_reset_requests')
      .select('id', { count: 'exact', head: true });

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
    logger.error('Unexpected error in GET /api/admin/password-reset-requests', {
      endpoint: '/api/admin/password-reset-requests',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/password-reset-requests' },
      'Failed to fetch password reset requests'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PATCH: Update password reset request status (approve/reject)
export async function PATCH(request: NextRequest) {
  ensureCsrfToken(request);
  
  // Verify admin access and get user ID
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return adminCheck.response;
  }
  const authenticatedUserId = adminCheck.userId;
  
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
    console.log('📥 Password reset request update - Incoming request:');
    console.log('  Raw body:', JSON.stringify(body, null, 2));
    console.log('  Body type:', typeof body);
    console.log('  Body keys:', Object.keys(body || {}));
    console.log('  id value:', body?.id, '(type:', typeof body?.id, ')');
    console.log('  status value:', body?.status, '(type:', typeof body?.status, ')');
    console.log('  approved_by value:', body?.approved_by, '(type:', typeof body?.approved_by, ')');
    console.log('  notes value:', body?.notes, '(type:', typeof body?.notes, ')');
    
    // #region agent log
    try {
      const logPath = path.join(process.cwd(), '.cursor', 'debug.log');
      const logEntry = JSON.stringify({location:'route.ts:163',message:'Server: Request body received before validation',data:{body,bodyType:typeof body,bodyKeys:Object.keys(body||{}),idValue:body?.id,idType:typeof body?.id,statusValue:body?.status,statusType:typeof body?.status,approvedByValue:body?.approved_by,approvedByType:typeof body?.approved_by,notesValue:body?.notes,notesType:typeof body?.notes},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E,F'}) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) {}
    // #endregion
    
    // Validate request body
    const validation = validateRequestBody(passwordResetRequestUpdateSchema, body);
    
    // #region agent log
    try {
      const logPath = path.join(process.cwd(), '.cursor', 'debug.log');
      const logEntry = JSON.stringify({location:'route.ts:165',message:'Server: Validation result',data:{success:validation.success,errorCount:validation.success?0:validation.details?.issues?.length||0,issues:validation.success?[]:validation.details?.issues?.map((i:any)=>({path:i.path.join('.'),message:i.message,code:i.code,input:i.input}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E,F'}) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) {}
    // #endregion
    if (!validation.success) {
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      
      // Log detailed validation errors
      console.error('❌ Validation failed for password reset request update');
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
      
      // #region agent log
      try {
        const logPath = path.join(process.cwd(), '.cursor', 'debug.log');
        const logEntry = JSON.stringify({location:'route.ts:190',message:'Server: Validation failed - returning error',data:{errorMessages,issues:validation.details?.issues?.map((i:any)=>({path:i.path.join('.'),message:i.message,code:i.code,input:i.input})),body},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E,F'}) + '\n';
        fs.appendFileSync(logPath, logEntry);
      } catch (e) {}
      // #endregion
      
      logger.warn('Validation failed for password reset request update', {
        endpoint: '/api/admin/password-reset-requests',
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
    
    // #region agent log
    try {
      const logPath = path.join(process.cwd(), '.cursor', 'debug.log');
      const logEntry = JSON.stringify({location:'route.ts:200',message:'Server: Validation passed - extracted data',data:{id,status,approved_by:approved_by||'undefined',notes:notes||'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E,F'}) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) {}
    // #endregion

    // Get user ID from authenticated session if approved_by is not provided
    let finalApprovedBy = approved_by;
    if (status === 'approved' && !finalApprovedBy) {
      console.log('⚠️ approved_by not provided, using authenticated user ID...');
      
      if (authenticatedUserId) {
        finalApprovedBy = authenticatedUserId;
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

    // Get the request first
    console.log('🔍 Looking for password reset request with ID:', id, '(type:', typeof id, ')');
    
    // First, try to find the request
    const { data: resetRequest, error: fetchError } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id, user_id, email, status, requested_at, approved_at, approved_by, school_id, notes, created_at, updated_at')
      .eq('id', id)
      .maybeSingle() as any;

    if (fetchError) {
      console.error('❌ Error fetching password reset request:', fetchError);
      logger.error('Error fetching password reset request', {
        endpoint: '/api/admin/password-reset-requests',
        requestId: id,
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
      console.error('❌ Password reset request not found with ID:', id);
      
      // Debug: Check if any requests exist at all
      const { data: allRequests, error: debugError } = await supabaseAdmin
        .from('password_reset_requests')
        .select('id, email, status')
        .limit(5) as any;
      
      console.log('🔍 Debug: Found', allRequests?.length || 0, 'password reset requests in database');
      if (allRequests && allRequests.length > 0) {
        console.log('🔍 Debug: Sample request IDs:', allRequests.map((r: any) => r.id));
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
          error: 'Password reset request not found',
          details: `No password reset request found with ID: ${id}. Please refresh the page and try again.`
        },
        { status: 404 }
      );
    }

    console.log('✅ Found password reset request:', {
      id: resetRequest.id,
      email: resetRequest.email,
      status: resetRequest.status
    });

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
      console.error('❌ Error updating password reset request:', updateError);
      return NextResponse.json(
        { error: 'Failed to update password reset request', details: updateError.message },
        { status: 500 }
      );
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
          console.error('❌ Error resetting password:', authError);
          return NextResponse.json(
            { error: 'Failed to reset password', details: authError.message },
            { status: 500 }
          );
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
          endpoint: '/api/admin/password-reset-requests',
        }, authError instanceof Error ? authError : new Error(String(authError)));
        
        const errorInfo = await handleApiError(
          authError,
          { endpoint: '/api/admin/password-reset-requests' },
          'Failed to reset password'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }
    }

    // #region agent log
    try {
      const logPath = path.join(process.cwd(), '.cursor', 'debug.log');
      const logEntry = JSON.stringify({location:'route.ts:400',message:'Server: Success response being sent',data:{id,status,approved_by:finalApprovedBy||'undefined',hasUpdatedRequest:!!updatedRequest,tempPassword:tempPassword?'SET':'NOT SET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E,F'}) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) {}
    // #endregion
    
    return NextResponse.json({
      request: updatedRequest,
      message: 'Password reset request updated successfully',
      ...(tempPassword && { tempPassword })
    });
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/admin/password-reset-requests', {
      endpoint: '/api/admin/password-reset-requests',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/password-reset-requests' },
      'Failed to update password reset request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE: Delete a password reset request
export async function DELETE(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('password_reset_requests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error deleting password reset request:', error);
      return NextResponse.json(
        { error: 'Failed to delete password reset request', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Password reset request deleted successfully'
    });
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/admin/password-reset-requests', {
      endpoint: '/api/admin/password-reset-requests',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/password-reset-requests' },
      'Failed to delete password reset request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


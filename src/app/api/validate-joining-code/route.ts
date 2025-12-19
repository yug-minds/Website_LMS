import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';
import { validatePasswordClient } from '../../../lib/password-validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    
    // If studentData is provided, this is a registration request
    if (body.studentData) {
      return await handleStudentRegistration(body);
    } else {
      // This is just a code validation request
      return await handleCodeValidation(body);
    }
  } catch (error) {
    logger.error('Unexpected error in POST /api/validate-joining-code', {
      endpoint: '/api/validate-joining-code',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/validate-joining-code' },
      'Failed to process joining code request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

async function handleCodeValidation(body: any) {
  const { code } = body;
  
  if (!code || typeof code !== 'string') {
    return NextResponse.json({
      is_valid: false,
      message: 'Joining code is required'
    }, { status: 400 });
  }

  try {
    // Look up the joining code
    const { data: joinCode, error } = await supabaseAdmin
      .from('join_codes')
      .select(`
        *,
        schools!join_codes_school_id_fkey (
          id,
          name,
          city,
          state
        )
      `)
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !joinCode) {
      logger.warn('Invalid joining code attempted', {
        endpoint: '/api/validate-joining-code',
        code: code.substring(0, 3) + '***', // Log partial code for security
      });
      
      return NextResponse.json({
        is_valid: false,
        message: 'Invalid or expired joining code'
      });
    }

    // Check if code has expired
    if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
      return NextResponse.json({
        is_valid: false,
        message: 'This joining code has expired'
      });
    }

    // Check if code has reached max uses
    if (joinCode.max_uses && joinCode.times_used >= joinCode.max_uses) {
      return NextResponse.json({
        is_valid: false,
        message: 'This joining code has reached its maximum number of uses'
      });
    }

    logger.info('Joining code validated successfully', {
      endpoint: '/api/validate-joining-code',
      schoolId: joinCode.school_id,
      grade: joinCode.grade,
    });

    return NextResponse.json({
      is_valid: true,
      school_id: joinCode.school_id,
      school_name: joinCode.schools?.name,
      grade: joinCode.grade,
      expires_at: joinCode.expires_at,
      message: 'Valid joining code'
    });

  } catch (error) {
    logger.error('Error validating joining code', {
      endpoint: '/api/validate-joining-code',
    }, error instanceof Error ? error : new Error(String(error)));
    
    return NextResponse.json({
      is_valid: false,
      message: 'Failed to validate joining code. Please try again.'
    }, { status: 500 });
  }
}

async function handleStudentRegistration(body: any) {
  try {
    logger.info('Starting student registration', {
      endpoint: '/api/validate-joining-code',
      hasCode: !!body.code,
      hasStudentData: !!body.studentData,
    });

    // Simple validation without complex schema
    const { code, studentData } = body;
    
    if (!code || !studentData) {
      return NextResponse.json({
        success: false,
        error: 'Code and student data are required'
      }, { status: 400 });
    }

    const { full_name, email, password } = studentData;
    
    if (!full_name || !email || !password) {
      return NextResponse.json({
        success: false,
        error: 'Full name, email, and password are required'
      }, { status: 400 });
    }

    logger.info('Basic validation passed, proceeding with registration', {
      endpoint: '/api/validate-joining-code',
      code: code.substring(0, 3) + '***',
      email: email.substring(0, 3) + '***',
    });

    // Validate password strength
    const passwordError = validatePasswordClient(password);
    if (passwordError) {
      return NextResponse.json({
        success: false,
        error: passwordError
      }, { status: 400 });
    }

    // First validate the joining code again
    const { data: joinCode, error: codeError } = await supabaseAdmin
      .from('join_codes')
      .select(`
        *,
        schools!join_codes_school_id_fkey (
          id,
          name,
          city,
          state
        )
      `)
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (codeError || !joinCode) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or expired joining code'
      }, { status: 400 });
    }

    // Check if code has expired
    if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
      return NextResponse.json({
        success: false,
        error: 'This joining code has expired'
      }, { status: 400 });
    }

    // Check if code has reached max uses
    if (joinCode.max_uses && joinCode.times_used >= joinCode.max_uses) {
      return NextResponse.json({
        success: false,
        error: 'This joining code has reached its maximum number of uses'
      }, { status: 400 });
    }

    // Check if email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((user: any) => user.email === email);
    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'An account with this email already exists'
      }, { status: 400 });
    }

    // Create the user account
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true, // Auto-confirm email for joining code registrations
      user_metadata: {
        full_name: full_name.trim(),
        role: 'student'
      }
    });

    if (authError || !authUser.user) {
      logger.error('Failed to create auth user', {
        endpoint: '/api/validate-joining-code',
        error: authError?.message,
      });
      
      return NextResponse.json({
        success: false,
        error: authError?.message || 'Failed to create user account'
      }, { status: 500 });
    }

    // Update the student profile (created automatically by trigger)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        school_id: joinCode.school_id
      })
      .eq('id', authUser.user.id);

    if (profileError) {
      // If profile update fails, clean up the auth user
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      
      logger.error('Failed to update student profile', {
        endpoint: '/api/validate-joining-code',
        error: profileError.message,
        userId: authUser.user.id,
      });
      
      return NextResponse.json({
        success: false,
        error: 'Failed to update student profile'
      }, { status: 500 });
    }

    // Create the student-school relationship
    const { error: studentSchoolError } = await supabaseAdmin
      .from('student_schools')
      .insert({
        student_id: authUser.user.id,
        school_id: joinCode.school_id,
        grade: joinCode.grade,
        joining_code: code.trim().toUpperCase(),
        is_active: true,
        enrolled_at: new Date().toISOString()
      });

    if (studentSchoolError) {
      // If student-school creation fails, clean up the auth user and profile
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      
      logger.error('Failed to create student-school relationship', {
        endpoint: '/api/validate-joining-code',
        error: studentSchoolError.message,
        userId: authUser.user.id,
      });
      
      return NextResponse.json({
        success: false,
        error: 'Failed to create student enrollment'
      }, { status: 500 });
    }

    // Update the joining code usage count
    const { error: updateError } = await supabaseAdmin
      .from('join_codes')
      .update({ 
        times_used: joinCode.times_used + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', joinCode.id);

    if (updateError) {
      logger.warn('Failed to update joining code usage count', {
        endpoint: '/api/validate-joining-code',
        error: updateError.message,
        codeId: joinCode.id,
      });
      // Don't fail the registration for this
    }

    logger.info('Student registered successfully', {
      endpoint: '/api/validate-joining-code',
      userId: authUser.user.id,
      schoolId: joinCode.school_id,
      grade: joinCode.grade,
    });

    return NextResponse.json({
      success: true,
      message: 'Student account created successfully',
      user_id: authUser.user.id,
      school_name: joinCode.schools?.name
    });

  } catch (error) {
    logger.error('Error during student registration', {
      endpoint: '/api/validate-joining-code',
    }, error instanceof Error ? error : new Error(String(error)));
    
    return NextResponse.json({
      success: false,
      error: 'An unexpected error occurred during registration'
    }, { status: 500 });
  }
}
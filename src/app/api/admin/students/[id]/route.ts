import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '@/lib/rate-limit';
import { updateStudentSchema, validateRequestBody } from '@/lib/validation-schemas';
import { supabaseAdmin } from '@/lib/supabase';
import { logger, handleApiError } from '@/lib/logger';


// PATCH - Update a student
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
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
    const { id: studentId } = await params;
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(updateStudentSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e) => `${(e.path as (string | number)[]).join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages
        },
        { status: 400 }
      );
    }

    const {
      full_name,
      email,
      password,
      school_id,
      grade,
      section,
      joining_code,
      phone,
      address,
      parent_name,
      parent_phone
    } = validation.data;

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    // Build profile update data (only include fields that are provided)
    type ProfileUpdateData = {
      full_name?: string;
      email?: string;
      phone?: string | null;
      address?: string | null;
      parent_name?: string | null;
      parent_phone?: string | null;
    };
    const profileUpdateData: ProfileUpdateData = {};

    if (full_name !== undefined) profileUpdateData.full_name = full_name;
    if (email !== undefined) profileUpdateData.email = email;
    if (phone !== undefined) profileUpdateData.phone = phone;
    if (address !== undefined) profileUpdateData.address = address;
    if (parent_name !== undefined) profileUpdateData.parent_name = parent_name;
    if (parent_phone !== undefined) profileUpdateData.parent_phone = parent_phone;

    // Update password if provided (separate from transaction as it's auth operation)
    if (password) {
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        studentId,
        { password: password }
      );

      if (passwordError) {
        console.error('Error updating password:', passwordError);
        // Don't fail the entire request if password update fails
      }
    }

    // Use transaction function to atomically update profile and enrollment
    // This prevents race conditions and ensures data consistency
    const { data: transactionResult, error: transactionError } = await supabaseAdmin
      .rpc('update_student_enrollment', {
        p_student_id: studentId,
        p_full_name: full_name,
        p_email: email,
        p_phone: phone,
        p_address: address,
        p_parent_name: parent_name,
        p_parent_phone: parent_phone,
        p_school_id: school_id || null,
        p_grade: grade,
        p_section: section,
        p_joining_code: joining_code
      } as never);

    interface TransactionResult {
      success?: boolean;
      error?: string;
    }
    
    const result = transactionResult as TransactionResult | null;
    if (transactionError || !result?.success) {
      console.error('Error updating student:', transactionError || result?.error);
      return NextResponse.json(
        { 
          error: result?.error || transactionError?.message || 'Failed to update student',
          details: result?.error || transactionError?.message
        },
        { status: 500 }
      );
    }

    // Fetch updated student with relationships
    const { data: student, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        role,
        created_at,
        updated_at,
        student_schools (
          school_id,
          grade,
          section,
          is_active,
          schools (
            id,
            name
          )
        )
      `)
      .eq('id', studentId)
      .single();

    if (fetchError) {
      console.error('Error fetching updated student:', fetchError);
    }

    const response = NextResponse.json({
      student: student || { id: studentId },
      message: 'Student updated successfully'
    }, { status: 200 });
    // Add rate limit headers
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    ensureCsrfToken(response, request);
    return response;
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/admin/students/[id]', {
      endpoint: '/api/admin/students/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/students/[id]' },
      'Failed to update student'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE - Delete a student
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  try {
    const { id: studentId } = await params;

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    console.log('🗑️ Deleting student:', studentId);

    // Step 1: Delete student course enrollments
    console.log('   Step 1: Deleting student course enrollments...');
    const { error: coursesError } = await supabaseAdmin
      .from('student_courses')
      .delete()
      .eq('student_id', studentId);

    if (coursesError) {
      console.warn('   ⚠️ Failed to delete student courses:', coursesError.message);
    } else {
      console.log('   ✅ Student course enrollments deleted');
    }

    // Step 2: Delete student school enrollments
    console.log('   Step 2: Deleting student school enrollments...');
    const { error: schoolsError } = await supabaseAdmin
      .from('student_schools')
      .delete()
      .eq('student_id', studentId);

    if (schoolsError) {
      console.warn('   ⚠️ Failed to delete student school enrollments:', schoolsError.message);
    } else {
      console.log('   ✅ Student school enrollments deleted');
    }

    // Step 3: Delete notifications for this student
    console.log('   Step 3: Deleting notifications...');
    const { error: notificationsError } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('user_id', studentId);

    if (notificationsError && !notificationsError.message.includes('does not exist')) {
      console.warn('   ⚠️ Failed to delete notifications:', notificationsError.message);
    } else {
      console.log('   ✅ Notifications deleted');
    }

    // Step 4: Delete the profile
    console.log('   Step 4: Deleting student profile...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', studentId);

    if (profileError) {
      console.error('   ❌ Failed to delete profile:', profileError.message);
      return NextResponse.json(
        { error: `Failed to delete student profile: ${profileError.message}` },
        { status: 500 }
      );
    } else {
      console.log('   ✅ Student profile deleted');
    }

    // Step 5: Delete the auth user
    console.log('   Step 5: Deleting auth user...');
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(studentId);

    if (authError) {
      console.warn('   ⚠️ Failed to delete auth user:', authError.message);
      // Don't fail here - profile is already deleted
    } else {
      console.log('   ✅ Auth user deleted');
    }

    console.log('✅ Student deleted successfully:', studentId);

    const successResponse = NextResponse.json({
      success: true,
      message: 'Student deleted successfully'
    }, { status: 200 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/admin/students/[id]', {
      endpoint: '/api/admin/students/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/students/[id]' },
      'Failed to delete student'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


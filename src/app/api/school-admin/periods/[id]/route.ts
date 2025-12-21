import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { periodSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// PUT /api/school-admin/periods/[id]
// Update a period
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    // Handle both async and sync params (Next.js 14+ uses async params)
    const resolvedParams = await Promise.resolve(params);
    const periodId = resolvedParams.id;

    // Verify period belongs to this school
    const { data: existingPeriod } = await supabaseAdmin
      .from('periods')
      .select('id, school_id')
      .eq('id', periodId)
       
      .single() as any;

    if (!existingPeriod) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      );
    }

    if (existingPeriod.school_id !== schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: Period does not belong to your school' },
        { status: 403 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(periodSchema, body);
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

    const { period_number, start_time, end_time, is_active } = { ...validation.data, ...body };

    // Update period
     
    const updateData: any = {
      period_number,
      start_time,
      end_time
    };

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

     
    const { data: period, error } = await ((supabaseAdmin as any)
      .from('periods')
       
      .update(updateData as any)
      .eq('id', periodId)
      .select()
       
      .single() as any) as any;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update period', details: error.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({ period });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/school-admin/periods/[id]', {
      endpoint: '/api/school-admin/periods/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/periods/[id]' },
      'Failed to update period'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE /api/school-admin/periods/[id]
// Delete a period
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    // Handle both async and sync params (Next.js 14+ uses async params)
    const resolvedParams = await Promise.resolve(params);
    const periodId = resolvedParams.id;

    // Verify period belongs to this school
    const { data: existingPeriod } = await supabaseAdmin
      .from('periods')
      .select('id, school_id')
      .eq('id', periodId)
       
      .single() as any;

    if (!existingPeriod) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      );
    }

    if (existingPeriod.school_id !== schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: Period does not belong to your school' },
        { status: 403 }
      );
    }

    // Check if period is used in any schedules
    const { data: schedules } = await supabaseAdmin
      .from('class_schedules')
      .select('id')
      .eq('period_id', periodId)
      .eq('is_active', true)
       
      .limit(1) as any;

    if (schedules && schedules.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete period', details: 'Period is assigned to active schedules. Please remove assignments first.' },
        { status: 400 }
      );
    }

    // Delete period
    const { error } = await supabaseAdmin
      .from('periods')
      .delete()
      .eq('id', periodId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete period', details: error.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({ success: true });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/school-admin/periods/[id]', {
      endpoint: '/api/school-admin/periods/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/periods/[id]' },
      'Failed to delete period'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


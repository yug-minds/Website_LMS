import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { updateJoiningCodeSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// Get joining codes for a school or all codes
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
    const schoolId = searchParams.get('schoolId');

    let query = supabaseAdmin
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
      .order('grade');

    // If schoolId is provided, filter by school
    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { data: codes, error } = await query;

    if (error) {
      console.error('Joining codes fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch joining codes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ codes: codes || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/joining-codes', {
      endpoint: '/api/admin/joining-codes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/joining-codes' },
      'Failed to fetch joining codes'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Regenerate a joining code
export async function PUT(request: NextRequest) {
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
    const validation = validateRequestBody(updateJoiningCodeSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for joining code update', {
        endpoint: '/api/admin/joining-codes',
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

    const { code, schoolId, grade, manualCode, usageType, maxUses } = validation.data;

    // First, deactivate the old code
     
    const { error: deactivateError } = await ((supabaseAdmin as any)
      .from('join_codes')
       
      .update({ is_active: false } as any)
       
      .eq('code', code)) as any;

    if (deactivateError) {
      console.warn('Failed to deactivate old code:', deactivateError.message);
    }

    // Generate new code directly
    let newCode: string;
    let attempts = 0;
    
    do {
      const schoolNameShort = 'SCH'; // Default prefix
      const gradeAbbr = grade.replace('Grade ', 'G').replace('Pre-K', 'PK').replace('Kindergarten', 'K');
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      newCode = `${schoolNameShort}-${gradeAbbr}-${randomNum}`;
      attempts++;
    } while (attempts < 10); // Prevent infinite loop

    // Insert the new code into the database
    const { error: insertError } = await (supabaseAdmin
      .from('join_codes')
      .insert({
        code: newCode,
        school_id: schoolId,
        grade,
        is_active: true,
        usage_type: usageType || 'multiple',
        times_used: 0,
        max_uses: maxUses || null,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year from now
       
      } as any) as any);

    if (insertError) {
      console.error('Code insertion error:', insertError);
      return NextResponse.json(
        { error: insertError.message || 'Failed to generate new code' },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({ 
      success: true, 
      new_code: newCode,
      message: 'Code regenerated successfully' 
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/admin/joining-codes', {
      endpoint: '/api/admin/joining-codes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/joining-codes' },
      'Failed to regenerate joining code'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Toggle code status (activate/deactivate) or Update code properties
export async function PATCH(request: NextRequest) {
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
    
    // Check if this is a status toggle or code update
    if ('isActive' in body || 'is_active' in body) {
      // Toggle status logic
      const { code, isActive } = body;

      if (!code || typeof isActive !== 'boolean') {
        return NextResponse.json(
          { error: 'Code and isActive status are required' },
          { status: 400 }
        );
      }

      const { data, error } = await (supabaseAdmin
         
        .rpc('toggle_joining_code_status' as any, {
           
          code_param: code as any,
          activate_param: isActive
         
        } as any) as any);

      if (error) {
        console.error('Toggle code status error:', error);
        return NextResponse.json(
          { error: error.message || 'Failed to toggle code status' },
          { status: 500 }
        );
      }

      const successResponse = NextResponse.json({ 
        success: true, 
        message: `Code ${isActive ? 'activated' : 'deactivated'} successfully` 
      });
      ensureCsrfToken(successResponse, request);
      return successResponse;
    } else {
      // Update code properties (code value, usage type, max uses, etc.)
      const { codeId, code, usageType, maxUses, expiresAt } = body;

      if (!codeId) {
        return NextResponse.json(
          { error: 'Code ID is required' },
          { status: 400 }
        );
      }

       
      const updateData: any = {};
      if (code) updateData.code = code;
      if (usageType) updateData.usage_type = usageType;
      if (maxUses !== undefined) updateData.max_uses = maxUses;
      if (expiresAt) updateData.expires_at = expiresAt;

       
      const { error } = await ((supabaseAdmin as any)
        .from('join_codes')
         
        .update(updateData as any)
         
        .eq('id', codeId)) as any;

      if (error) {
        console.error('Update code error:', error);
        return NextResponse.json(
          { error: error.message || 'Failed to update code' },
          { status: 500 }
        );
      }

      const successResponse = NextResponse.json({ 
        success: true, 
        message: 'Code updated successfully' 
      });
      ensureCsrfToken(successResponse, request);
      return successResponse;
    }
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/admin/joining-codes', {
      endpoint: '/api/admin/joining-codes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/joining-codes' },
      'Failed to update joining code'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Create new joining codes for a school
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
    const { schoolId, grades, usageType, maxUses, manualCodes } = body;

    if (!schoolId || !grades || grades.length === 0) {
      return NextResponse.json(
        { error: 'School ID and at least one grade are required' },
        { status: 400 }
      );
    }

    // Get school name for code prefix
    const { data: school } = await supabaseAdmin
      .from('schools')
      .select('name, grades_offered')
      .eq('id', schoolId)
       
      .single() as any;

    if (!school) {
      return NextResponse.json(
        { error: 'School not found' },
        { status: 404 }
      );
    }

    const schoolNameShort = school.name.split(' ').map((word: string) => word[0]).join('').toUpperCase().substring(0, 3) || 'SCH';
    const generatedCodes: Record<string, string> = {};

    for (const grade of grades) {
      let code: string;
      
      // Use manual code if provided, otherwise generate
      if (manualCodes && manualCodes[grade]) {
        code = manualCodes[grade];
      } else {
        let attempts = 0;
        do {
          const gradeAbbr = grade.replace('Grade ', 'G').replace('Pre-K', 'PK').replace('Kindergarten', 'K');
          const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          code = `${schoolNameShort}-${gradeAbbr}-${randomNum}`;
          attempts++;
          
          // Check if code already exists
          const { data: existing } = await supabaseAdmin
            .from('join_codes')
            .select('code')
            .eq('code', code)
             
            .single() as any;
          
          if (!existing) break; // Code is unique
        } while (attempts < 10);
      }

      // Insert the code
      const { error: insertError } = await (supabaseAdmin
        .from('join_codes')
        .insert({
          code,
          school_id: schoolId,
          grade,
          is_active: true,
          usage_type: usageType || 'multiple',
          times_used: 0,
          max_uses: maxUses || null,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
         
        } as any) as any);

      if (insertError) {
        console.error(`Failed to create code for ${grade}:`, insertError);
        continue;
      }

      generatedCodes[grade] = code;
    }

    const successResponse = NextResponse.json({ 
      success: true, 
      codes: generatedCodes,
      message: 'Joining codes created successfully' 
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/joining-codes', {
      endpoint: '/api/admin/joining-codes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/joining-codes' },
      'Failed to create joining codes'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Delete a joining code
export async function DELETE(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Code is required' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('join_codes')
      .delete()
      .eq('code', code);

    if (error) {
      console.error('Delete code error:', error);
      const errorResponse = NextResponse.json(
        { error: error.message || 'Failed to delete code' },
        { status: 500 }
      );
      ensureCsrfToken(errorResponse, request);
      return errorResponse;
    }

    const successResponse = NextResponse.json({ 
      success: true, 
      message: 'Code deleted successfully' 
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/admin/joining-codes', {
      endpoint: '/api/admin/joining-codes',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/joining-codes' },
      'Failed to delete joining code'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
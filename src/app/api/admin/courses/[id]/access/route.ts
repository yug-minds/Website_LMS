import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { courseAccessSchema, validateRequestBody } from '../../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../../lib/logger';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET - Get all course access entries for a course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const courseId = id;

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 });
    }

    // Fetch course_access entries
    const { data: courseAccess, error: accessError } = await supabaseAdmin
      .from('course_access')
      .select(`
        id,
        course_id,
        school_id,
        grade,
        created_at,
        updated_at,
        schools (
          id,
          name
        )
      `)
      .eq('course_id', courseId)
       
      .order('grade', { ascending: true }) as any;

    if (accessError) {
      console.error('Error fetching course access:', accessError);
      return NextResponse.json({ 
        error: 'Failed to fetch course access', 
        details: accessError.message 
      }, { status: 500 });
    }

    return NextResponse.json({ course_access: courseAccess || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/courses/[id]/access', {
      endpoint: '/api/admin/courses/[id]/access',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/access' },
      'Failed to fetch course access'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST - Add new course access entries
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../../lib/csrf-middleware');
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
    const courseId = id;
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(courseAccessSchema, body);
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

    const { school_ids, grades } = validation.data;

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 });
    }

    if (!grades || !Array.isArray(grades) || grades.length === 0) {
      return NextResponse.json({ 
        error: 'At least one grade is required' 
      }, { status: 400 });
    }

    // Verify course exists
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id')
      .eq('id', courseId)
       
      .single() as any;

    if (courseError || !course) {
      return NextResponse.json({ 
        error: 'Course not found', 
        details: courseError?.message 
      }, { status: 404 });
    }

    // Validate school_ids exist
    const { data: existingSchools, error: schoolsCheckError } = await supabaseAdmin
      .from('schools')
      .select('id')
       
      .in('id', school_ids) as any;

    if (schoolsCheckError) {
      console.error('Error validating schools:', schoolsCheckError);
      return NextResponse.json({ 
        error: 'Failed to validate schools', 
        details: schoolsCheckError.message 
      }, { status: 500 });
    }

    const validSchoolIds = existingSchools?.map((s: { id: string }) => s.id) || [];
    const invalidSchoolIds = school_ids.filter(id => !validSchoolIds.includes(id));
    
    if (invalidSchoolIds.length > 0) {
      return NextResponse.json({ 
        error: 'Invalid school IDs provided', 
        details: `The following school IDs are invalid: ${invalidSchoolIds.join(', ')}` 
      }, { status: 400 });
    }

    // Helper function to normalize grade to display format
    const normalizeGradeToDisplay = (grade: string): string => {
      if (!grade) return '';
      const trimmed = typeof grade === 'string' ? grade.trim() : String(grade).trim();
      
      if (/^Grade\s+\d+$/i.test(trimmed)) {
        return trimmed;
      }
      
      const normalized = trimmed.replace(/^grade\s*/i, '').trim();
      
      const lower = normalized.toLowerCase();
      if (lower === 'pre-k' || lower === 'prek' || lower === 'pre-kg') {
        return 'Pre-K';
      }
      if (lower === 'k' || lower === 'kindergarten' || lower === 'kg') {
        return 'Kindergarten';
      }
      
      const numMatch = normalized.match(/(\d{1,2})/);
      if (numMatch) {
        return `Grade ${numMatch[1]}`;
      }
      
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    };

    // Filter out any null/undefined/empty grades
    const validGrades = grades.filter(g => g && g.trim().length > 0);
    
    if (validGrades.length === 0) {
      return NextResponse.json({ 
        error: 'No valid grades provided' 
      }, { status: 400 });
    }

    // Create access entries
    const accessEntries = [];
    const seenEntries = new Set<string>();
    
    for (const schoolId of validSchoolIds) {
      for (const grade of validGrades) {
        const gradeValue = normalizeGradeToDisplay(grade);
        
        if (gradeValue) {
          const entryKey = `${courseId}-${schoolId}-${gradeValue}`;
          
          if (!seenEntries.has(entryKey)) {
            seenEntries.add(entryKey);
            accessEntries.push({
              course_id: courseId,
              school_id: schoolId,
              grade: gradeValue
            });
          }
        }
      }
    }

    if (accessEntries.length === 0) {
      return NextResponse.json({ 
        error: 'No valid access entries to create' 
      }, { status: 400 });
    }

    // Insert entries (use upsert to handle duplicates gracefully)
    const { data: insertedAccess, error: accessError } = await (supabaseAdmin
      .from('course_access')
       
      .upsert(accessEntries as any, { 
        onConflict: 'course_id,school_id,grade',
        ignoreDuplicates: false 
       
      }) as any)
      .select();

    if (accessError) {
      console.error('Error creating course access:', accessError);
      return NextResponse.json({ 
        error: 'Failed to create course access', 
        details: accessError.message,
        hint: accessError.code === '23503' ? 'One or more school IDs may not exist' : 
              accessError.code === '23505' ? 'Some entries already exist' : 
              'Check that all school IDs are valid and grades are properly formatted'
      }, { status: 500 });
    }

    const successResponse = NextResponse.json({ 
      course_access: insertedAccess,
      message: `Successfully created ${insertedAccess?.length || 0} course access entries`
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/courses/[id]/access', {
      endpoint: '/api/admin/courses/[id]/access',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/access' },
      'Failed to create course access'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE - Delete course access entries
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../../lib/csrf-middleware');
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
    const courseId = id;
    const { searchParams } = new URL(request.url);
    const accessId = searchParams.get('access_id');
    const schoolId = searchParams.get('school_id');
    const grade = searchParams.get('grade');

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 });
    }

    // If access_id is provided, delete that specific entry
    if (accessId) {
      const { error: deleteError } = await supabaseAdmin
        .from('course_access')
        .delete()
        .eq('id', accessId)
        .eq('course_id', courseId);

      if (deleteError) {
        console.error('Error deleting course access:', deleteError);
        const errorResponse = NextResponse.json({ 
          error: 'Failed to delete course access', 
          details: deleteError.message 
        }, { status: 500 });
        ensureCsrfToken(errorResponse, request);
        return errorResponse;
      }

      const successResponse = NextResponse.json({ 
        message: 'Course access entry deleted successfully' 
      });
      ensureCsrfToken(successResponse, request);
      return successResponse;
    }

    // If school_id and grade are provided, delete entries matching those criteria
    if (schoolId && grade) {
      const { error: deleteError } = await supabaseAdmin
        .from('course_access')
        .delete()
        .eq('course_id', courseId)
        .eq('school_id', schoolId)
        .eq('grade', grade);

      if (deleteError) {
        console.error('Error deleting course access:', deleteError);
        return NextResponse.json({ 
          error: 'Failed to delete course access', 
          details: deleteError.message 
        }, { status: 500 });
      }

      return NextResponse.json({ 
        message: 'Course access entries deleted successfully' 
      });
    }

    // If only school_id is provided, delete all entries for that school
    if (schoolId) {
      const { error: deleteError } = await supabaseAdmin
        .from('course_access')
        .delete()
        .eq('course_id', courseId)
        .eq('school_id', schoolId);

      if (deleteError) {
        console.error('Error deleting course access:', deleteError);
        const errorResponse = NextResponse.json({ 
          error: 'Failed to delete course access', 
          details: deleteError.message 
        }, { status: 500 });
        ensureCsrfToken(errorResponse, request);
        return errorResponse;
      }

      const successResponse = NextResponse.json({ 
        message: 'Course access entries deleted successfully' 
      });
      ensureCsrfToken(successResponse, request);
      return successResponse;
    }

    // If no specific criteria, delete all entries for the course
    const { error: deleteError } = await supabaseAdmin
      .from('course_access')
      .delete()
      .eq('course_id', courseId);

    if (deleteError) {
      console.error('Error deleting course access:', deleteError);
      const errorResponse = NextResponse.json({ 
        error: 'Failed to delete course access', 
        details: deleteError.message 
      }, { status: 500 });
      ensureCsrfToken(errorResponse, request);
      return errorResponse;
    }

    const successResponse = NextResponse.json({ 
      message: 'All course access entries deleted successfully' 
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/admin/courses/[id]/access', {
      endpoint: '/api/admin/courses/[id]/access',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/access' },
      'Failed to delete course access'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}




import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { createChapterSchema, validateRequestBody } from '../../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../../lib/csrf-middleware';


// POST: Add a chapter to an existing course
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: courseId } = await params;
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createChapterSchema, body);
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

    const {
      order_number,
      name,
      title,
      learning_outcomes,
      description
    } = validation.data;

    if (!courseId) {
      return NextResponse.json(
        { error: 'Course ID is required' },
        { status: 400 }
      );
    }

    // Check if course exists
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id')
      .eq('id', courseId)
       
      .single() as any;

    if (courseError || !course) {
      return NextResponse.json(
        { error: 'Course not found', details: courseError?.message },
        { status: 404 }
      );
    }

    // Determine the table name (could be 'chapters' or 'course_chapters')
    // Try chapters first (most common schema)
     
    const chapterData: any = {
      course_id: courseId,
      title: title || name,
      description: description || null,
      order_index: order_number || 1,
      is_published: true
    };

    // Add learning_outcomes if the table supports it (as JSONB)
    if (learning_outcomes && Array.isArray(learning_outcomes) && learning_outcomes.length > 0) {
      chapterData.learning_outcomes = learning_outcomes;
    }

    // Insert into chapters table (course_chapters is deprecated)
    const { data: insertedChapter, error: insertError } = await (supabaseAdmin
      .from('chapters')
       
      .insert([chapterData] as any)
      .select()
       
      .single() as any);

    if (insertError) {
      console.error('❌ Error inserting chapter:', insertError);
      return NextResponse.json(
        { error: 'Failed to create chapter', details: insertError.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({
      chapter: insertedChapter,
      message: 'Chapter created successfully'
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/courses/[id]/chapters', {
      endpoint: '/api/admin/courses/[id]/chapters',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/chapters' },
      'Failed to create chapter'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// GET: Get all chapters for a course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: courseId } = await params;

    if (!courseId) {
      return NextResponse.json(
        { error: 'Course ID is required' },
        { status: 400 }
      );
    }

    // Fetch from chapters table (course_chapters is deprecated)
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .select('id, course_id, title, description, order_index, video_url, duration, created_at, updated_at')
      .eq('course_id', courseId)
       
      .order('order_index', { ascending: true, nullsFirst: false }) as any;

    if (chaptersError) {
      return NextResponse.json(
        { error: 'Failed to fetch chapters', details: chaptersError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ chapters: chapters || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/courses/[id]/chapters', {
      endpoint: '/api/admin/courses/[id]/chapters',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/chapters' },
      'Failed to fetch chapters'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}








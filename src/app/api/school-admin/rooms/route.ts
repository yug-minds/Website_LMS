import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { roomSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET /api/school-admin/rooms
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    const { data: rooms, error } = await supabaseAdmin
      .from('rooms')
      .select('id, school_id, room_number, room_name, capacity, location, facilities, is_active, created_at, updated_at')
      .eq('school_id', schoolId)
       
      .order('room_number', { ascending: true }) as any;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch rooms', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ rooms: rooms || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/rooms', {
      endpoint: '/api/school-admin/rooms',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/rooms' },
      'Failed to fetch rooms'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST /api/school-admin/rooms
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(roomSchema, body);
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

    const { room_number, room_name, capacity, location, facilities, is_active } = { ...validation.data, ...body };

    if (!room_number) {
      return NextResponse.json(
        { error: 'Missing required fields', details: 'room_number is required' },
        { status: 400 }
      );
    }

    const { data: room, error } = await (supabaseAdmin
      .from('rooms')
      .insert({
        school_id: schoolId,
        room_number,
        room_name: room_name || null,
        capacity: capacity || null,
        location: location || null,
        facilities: facilities || [],
        is_active: is_active !== undefined ? is_active : true
       
      } as any)
      .select()
       
      .single() as any);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create room', details: error.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({ room }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/rooms', {
      endpoint: '/api/school-admin/rooms',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/rooms' },
      'Failed to process room request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}







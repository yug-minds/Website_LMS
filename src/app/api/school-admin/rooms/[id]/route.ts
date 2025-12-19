import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { roomSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// PUT /api/school-admin/rooms/[id]
// Update a room
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
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
    const roomId = resolvedParams.id;

    // Verify room belongs to this school
    const { data: existingRoom } = await supabaseAdmin
      .from('rooms')
      .select('id, school_id')
      .eq('id', roomId)
       
      .single() as any;

    if (!existingRoom) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    if (existingRoom.school_id !== schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: Room does not belong to your school' },
        { status: 403 }
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

    // Update room
     
    const updateData: any = {
      room_number,
      room_name: room_name || null,
      capacity: capacity || null,
      location: location || null,
      facilities: facilities || [],
    };

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

     
    const { data: room, error } = await ((supabaseAdmin as any)
      .from('rooms')
       
      .update(updateData as any)
      .eq('id', roomId)
      .select()
       
      .single() as any) as any;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update room', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ room });
  } catch (error) {
    logger.error('Unexpected error in PUT /api/school-admin/rooms/[id]', {
      endpoint: '/api/school-admin/rooms/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/rooms/[id]' },
      'Failed to update room'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE /api/school-admin/rooms/[id]
// Delete a room
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
    const roomId = resolvedParams.id;

    // Verify room belongs to this school
    const { data: existingRoom } = await supabaseAdmin
      .from('rooms')
      .select('id, school_id')
      .eq('id', roomId)
       
      .single() as any;

    if (!existingRoom) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    if (existingRoom.school_id !== schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: Room does not belong to your school' },
        { status: 403 }
      );
    }

    // Check if room is used in any schedules
    const { data: schedules } = await supabaseAdmin
      .from('class_schedules')
      .select('id')
      .eq('room_id', roomId)
      .eq('is_active', true)
       
      .limit(1) as any;

    if (schedules && schedules.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete room', details: 'Room is assigned to active schedules. Please remove assignments first.' },
        { status: 400 }
      );
    }

    // Delete room
    const { error } = await supabaseAdmin
      .from('rooms')
      .delete()
      .eq('id', roomId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete room', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/school-admin/rooms/[id]', {
      endpoint: '/api/school-admin/rooms/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/rooms/[id]' },
      'Failed to delete room'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


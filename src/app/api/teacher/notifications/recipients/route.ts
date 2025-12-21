import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { validateTeacherSchoolAccess } from '../../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// GET: Get list of potential recipients for teacher (only students)
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
    const schoolId = searchParams.get('school_id');

    if (!schoolId) {
      return NextResponse.json(
        { error: 'School ID is required' },
        { status: 400 }
      );
    }

    // Validate that teacher is assigned to this school
    const hasAccess = await validateTeacherSchoolAccess(schoolId, request);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Teacher is not assigned to this school' },
        { status: 403 }
      );
    }

     
    const results: any = {
      roles: [],
      users: []
    };

    // Teachers can only send to students
    const { data: studentsData, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, school_id')
      .eq('school_id', schoolId)
      .eq('role', 'student')
      .limit(200)
       
      .order('full_name', { ascending: true }) as any;

    if (!studentsError && studentsData) {
      // Add student role option
      results.roles = [{
        id: 'student',
        name: 'Student',
        count: studentsData.length
      }];

      // Add students as individual users
       
      results.users = studentsData.map((user: any) => ({
        id: user.id,
        name: user.full_name || user.email,
        email: user.email,
        role: user.role,
        schoolId: user.school_id
      }));
    }

    return NextResponse.json(results);
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/notifications/recipients', {
      endpoint: '/api/teacher/notifications/recipients',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/notifications/recipients' },
      'Failed to fetch notification recipients'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}



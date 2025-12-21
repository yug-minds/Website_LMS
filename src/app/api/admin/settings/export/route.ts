import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { emptyBodySchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { verifyAdmin } from '../../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// POST: Export system data
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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    // Get access token for authenticated client
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const accessToken = authHeader.replace('Bearer ', '');
    
    // Create authenticated client with RLS - admin policies will allow access
    const supabase = await createAuthenticatedClient(accessToken);

    // Validate request body (should be empty for this endpoint)
    try {
      const body = await request.json().catch(() => ({}));
      const validation = validateRequestBody(emptyBodySchema, body);
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
    } catch {
      // If body parsing fails, it's likely empty, which is fine
    }

    // Export key system data using authenticated client with RLS
    // RLS policies will automatically allow admin access to all data
    const [schoolsResult, teachersResult, studentsResult, coursesResult, reportsResult] = await Promise.all([
      supabase.from('schools').select('*'),
      supabase.from('profiles').select('*').eq('role', 'teacher'),
      supabase.from('profiles').select('*').eq('role', 'student'),
      supabase.from('courses').select('*'),
      supabase.from('teacher_reports').select('*').limit(1000) // Limit reports to prevent huge exports
    ]);

    const schools = schoolsResult.data || [];
    const teachers = teachersResult.data || [];
    const students = studentsResult.data || [];
    const courses = coursesResult.data || [];
    const reports = reportsResult.data || [];

    const exportData = {
      export_date: new Date().toISOString(),
      schools: schools,
      teachers: teachers,
      students: students,
      courses: courses,
      reports: reports,
      summary: {
        total_schools: schools.length,
        total_teachers: teachers.length,
        total_students: students.length,
        total_courses: courses.length,
        total_reports: reports.length
      }
    };

    // Return as JSON blob
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="data-export-${new Date().toISOString().split('T')[0]}.json"`
      }
    });
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/settings/export', {
      endpoint: '/api/admin/settings/export',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/settings/export' },
      'Failed to export data'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';


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

// Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return adminCheck.response;
  }

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get('type');

  try {
    let reportData = {};
    let filename = '';

    switch (reportType) {
      case 'schools':
        const { data: schools } = await supabaseAdmin
          .from('schools')
          .select('id, name, address, phone, email, principal_name, created_at, updated_at')
           
          .order('created_at', { ascending: false }) as any;
        
        reportData = {
          type: 'School Report',
          generatedAt: new Date().toISOString(),
          totalSchools: schools?.length || 0,
          schools: schools || []
        };
        filename = `school-report-${new Date().toISOString().split('T')[0]}.json`;
        break;

      case 'teachers':
        const { data: teachers } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, email, phone, role, school_id, created_at, updated_at')
          .eq('role', 'teacher')
           
          .order('created_at', { ascending: false }) as any;
        
        reportData = {
          type: 'Teacher Performance Report',
          generatedAt: new Date().toISOString(),
          totalTeachers: teachers?.length || 0,
          teachers: teachers || []
        };
        filename = `teacher-report-${new Date().toISOString().split('T')[0]}.json`;
        break;

      case 'students':
        const { data: students } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, email, phone, role, parent_name, parent_phone, created_at, updated_at')
          .eq('role', 'student')
           
          .order('created_at', { ascending: false }) as any;
        
        reportData = {
          type: 'Student Enrollment Report',
          generatedAt: new Date().toISOString(),
          totalStudents: students?.length || 0,
          students: students || []
        };
        filename = `student-report-${new Date().toISOString().split('T')[0]}.json`;
        break;

      case 'courses':
        const { data: courses } = await supabaseAdmin
          .from('courses')
          .select('id, course_name, title, description, subject, grade, status, is_published, school_id, created_at, updated_at')
           
          .order('created_at', { ascending: false }) as any;
        
        reportData = {
          type: 'Course Progress Report',
          generatedAt: new Date().toISOString(),
          totalCourses: courses?.length || 0,
          courses: courses || []
        };
        filename = `course-report-${new Date().toISOString().split('T')[0]}.json`;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        );
    }

    // Return the report data as JSON
    return NextResponse.json(reportData, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/reports', {
      endpoint: '/api/admin/reports',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/reports' },
      'Failed to generate report'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}













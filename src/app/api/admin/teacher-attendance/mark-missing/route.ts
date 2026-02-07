import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../../lib/logger';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { verifyAdmin } from '../../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { ensureCsrfToken, validateCsrf } from '../../../../../lib/csrf-middleware';
import { z } from 'zod';

// Validation schema for request body
const markMissingAttendanceSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  school_id: z.string().uuid().optional(),
  teacher_id: z.string().uuid().optional(),
});

// POST - Mark missing attendance for date range
export async function POST(request: NextRequest) {
  // Verify admin access FIRST
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    logger.warn('Unauthorized access attempt to mark missing attendance', {
      endpoint: '/api/admin/teacher-attendance/mark-missing',
      method: 'POST',
    });
    return adminCheck.response;
  }

  // Validate CSRF token
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
    logger.info('Marking missing attendance', {
      endpoint: '/api/admin/teacher-attendance/mark-missing',
      method: 'POST',
      userId: adminCheck.userId,
    });

    const body = await request.json();
    
    // Validate request body
    const validation = markMissingAttendanceSchema.safeParse(body);
    if (!validation.success) {
      logger.warn('Validation failed for mark missing attendance', {
        endpoint: '/api/admin/teacher-attendance/mark-missing',
        errors: validation.error.issues,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        },
        { status: 400 }
      );
    }

    const {
      start_date,
      end_date,
      school_id,
      teacher_id,
    } = validation.data;

    // Set default date range if not provided (last 30 days up to yesterday)
    const defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() - 1); // Yesterday
    const defaultStartDate = new Date(defaultEndDate);
    defaultStartDate.setDate(defaultStartDate.getDate() - 30); // 30 days ago

    const startDate = start_date || defaultStartDate.toISOString().split('T')[0];
    const endDate = end_date || defaultEndDate.toISOString().split('T')[0];

    logger.info('Calling mark_missing_attendance_for_date_range function', {
      endpoint: '/api/admin/teacher-attendance/mark-missing',
      startDate,
      endDate,
      schoolId: school_id,
      teacherId: teacher_id,
    });

    // Call the database function
    const { data, error } = await supabaseAdmin.rpc(
      'mark_missing_attendance_for_date_range',
      {
        p_start_date: startDate,
        p_end_date: endDate,
        p_school_id: school_id || null,
        p_teacher_id: teacher_id || null,
      } as never
    );

    if (error) {
      logger.error('Failed to mark missing attendance', {
        endpoint: '/api/admin/teacher-attendance/mark-missing',
        startDate,
        endDate,
        error: error.message,
        errorCode: error.code,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/teacher-attendance/mark-missing', startDate, endDate },
        'Failed to mark missing attendance'
      );
      
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Count total records created
    type MarkMissingResult = {
      records_created?: number;
      teacher_id?: string;
      date?: string;
    };
    const recordsCreated = ((data || []) as MarkMissingResult[]).reduce((sum: number, record) => {
      return sum + (record.records_created || 0);
    }, 0);

    // Get unique teachers and dates affected
    const uniqueTeachers = new Set(((data || []) as MarkMissingResult[]).map((r) => r.teacher_id).filter(Boolean));
    const uniqueDates = new Set(((data || []) as MarkMissingResult[]).map((r) => r.date).filter(Boolean));

    logger.info('Missing attendance marked successfully', {
      endpoint: '/api/admin/teacher-attendance/mark-missing',
      recordsCreated,
      teachersAffected: uniqueTeachers.size,
      datesAffected: uniqueDates.size,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully marked missing attendance`,
      summary: {
        records_created: recordsCreated,
        teachers_affected: uniqueTeachers.size,
        dates_affected: uniqueDates.size,
        date_range: {
          start_date: startDate,
          end_date: endDate,
        },
      },
      details: data || [],
    });
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/teacher-attendance/mark-missing', {
      endpoint: '/api/admin/teacher-attendance/mark-missing',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teacher-attendance/mark-missing' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../../../lib/auth-utils';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { revertToVersionSchema, validateRequestBody } from '../../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../../lib/csrf-middleware';

// GET: Fetch version history
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

  // Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return (adminCheck as { success: false; response: NextResponse }).response;
  }

  try {
    const { id: courseId } = await params;

    // Fetch versions with published_by user info
    const { data: versions, error } = await supabaseAdmin
      .from('course_versions')
      .select(`
        id,
        course_id,
        version_number,
        published_at,
        published_by,
        changes_summary,
        course_data,
        created_at,
        profiles:published_by (
          id,
          full_name
        )
      `)
      .eq('course_id', courseId)
      .order('version_number', { ascending: false });

    if (error) {
      logger.error('Failed to fetch course versions', {
        endpoint: '/api/admin/courses/[id]/versions',
        courseId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/courses/[id]/versions', courseId },
        'Failed to fetch course versions'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Transform to include published_by_name
    const versionsWithNames = (versions || []).map((v: any) => ({
      id: v.id,
      course_id: v.course_id,
      version_number: v.version_number,
      published_at: v.published_at,
      published_by: v.published_by,
      published_by_name: v.profiles?.full_name || null,
      changes_summary: v.changes_summary,
      course_data: v.course_data,
      created_at: v.created_at,
    }));

    return NextResponse.json({
      success: true,
      versions: versionsWithNames,
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/courses/[id]/versions', {
      endpoint: '/api/admin/courses/[id]/versions',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/versions' },
      'Failed to fetch versions'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PATCH: Revert to a specific version
export async function PATCH(
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

  // Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return (adminCheck as { success: false; response: NextResponse }).response;
  }

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
    const validation = validateRequestBody(revertToVersionSchema, {
      ...body,
      course_id: courseId,
    });
    if (!validation.success) {
      const errorMessages = ('details' in validation ? validation.details?.issues?.map((e: any) => 
        `${e.path.join('.')}: ${e.message}`
      ).join(', ') : null) || ('error' in validation ? validation.error : null) || 'Invalid request data';
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { version_number, create_new_version } = validation.data;

    // Fetch the version to revert to
    const { data: version, error: versionError } = await supabaseAdmin
      .from('course_versions')
      .select('*')
      .eq('course_id', courseId)
      .eq('version_number', version_number)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    // Get current user ID
    const authHeader = request.headers.get('authorization');
    const publishedBy = authHeader ? authHeader.replace('Bearer ', '') : null;

    // Restore course data from version
    const courseData = version.course_data;
    if (!courseData) {
      return NextResponse.json(
        { error: 'Version data not available' },
        { status: 400 }
      );
    }

    // Update course with version data (excluding id and timestamps)
    const { id, created_at, updated_at, ...restoredData } = courseData;
    
    const updateData = {
      ...restoredData,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedCourse, error: updateError } = await supabaseAdmin
      .from('courses')
      .update(updateData)
      .eq('id', courseId)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to revert course version', {
        endpoint: '/api/admin/courses/[id]/versions',
        courseId,
        version_number,
      }, updateError);
      
      const errorInfo = await handleApiError(
        updateError,
        { endpoint: '/api/admin/courses/[id]/versions', courseId },
        'Failed to revert course version'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // If create_new_version is true, create a new version from the reverted state
    if (create_new_version) {
      try {
        // Get next version number
        const { data: maxVersion } = await supabaseAdmin
          .from('course_versions')
          .select('version_number')
          .eq('course_id', courseId)
          .order('version_number', { ascending: false })
          .limit(1)
          .single();

        const nextVersion = maxVersion?.version_number 
          ? maxVersion.version_number + 1 
          : 1;

        // Create new version record
        await supabaseAdmin
          .from('course_versions')
          .insert({
            course_id: courseId,
            version_number: nextVersion,
            published_at: new Date().toISOString(),
            published_by: publishedBy,
            changes_summary: `Reverted to version ${version_number}`,
            course_data: updatedCourse,
          });
      } catch (versionErr) {
        logger.warn('Failed to create new version after revert (non-critical)', {
          endpoint: '/api/admin/courses/[id]/versions',
          courseId,
        }, versionErr instanceof Error ? versionErr : new Error(String(versionErr)));
        // Don't fail the revert if version creation fails
      }
    }

    logger.info('Course version reverted', {
      endpoint: '/api/admin/courses/[id]/versions',
      courseId,
      version_number,
    });

    return NextResponse.json({
      success: true,
      course: updatedCourse,
      message: `Course reverted to version ${version_number}`,
    });
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/admin/courses/[id]/versions', {
      endpoint: '/api/admin/courses/[id]/versions',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/versions' },
      'Failed to revert version'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


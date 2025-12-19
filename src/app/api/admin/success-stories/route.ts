import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { validateCsrf } from '../../../../lib/csrf-middleware';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { CacheKeys, invalidateCache } from '../../../../lib/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.READ, endpoint: '/api/admin/success-stories' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });

    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('success_story_sections')
      .select('id, title, body_primary, body_secondary, body_tertiary, image_url, background, image_position, order_index, is_published, created_at, updated_at')
      .order('order_index', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ sections: data || [] }, { status: 200, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/success-stories' }, 'Failed to list sections');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function POST(request: NextRequest) {
  // Declare variables outside try block to ensure they're accessible in catch
  let title: string = '';
  let body_primary: string = '';
  let body_secondary: string | null = null;
  let body_tertiary: string | null = null;
  let file: File | null = null;
  let order_index: number = 0;
  let is_published: boolean = false;
  let headers: HeadersInit = {};
  let authUserId: string | null = null;
  let storage_path: string | null = null;
  
  // Helper function to create safe error response
  const createErrorResponse = (error: string, details?: string, status: number = 500): NextResponse => {
    const response: any = { error, status };
    if (details) response.details = details;
    // Ensure response is JSON-serializable
    try {
      // Ensure headers exist, use empty object if not initialized
      const responseHeaders = headers && Object.keys(headers).length > 0 ? headers : {};
      return NextResponse.json(response, { status, headers: responseHeaders });
    } catch (err) {
      console.error('Error creating error response:', err);
      // Ultimate fallback
      return NextResponse.json({ error: 'Internal server error', status: 500 }, { status: 500 });
    }
  };

  // Helper function to safely extract error info
  const extractErrorInfo = (error: any): { message: string; code?: string; details?: string; hint?: string } => {
    if (!error) return { message: 'Unknown error' };
    
    const info: any = {
      message: error?.message || String(error) || 'Unknown error'
    };
    
    // Safely extract Supabase error properties
    if (error?.code && typeof error.code === 'string') info.code = error.code;
    if (error?.details && typeof error.details === 'string') info.details = error.details;
    if (error?.hint && typeof error.hint === 'string') info.hint = error.hint;
    
    return info;
  };
  
  // UUID validation regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  try {
    // Step 1: Rate limiting
    let rl;
    try {
      rl = await rateLimit(request, { ...RateLimitPresets.WRITE, endpoint: '/api/admin/success-stories' });
      headers = createRateLimitHeaders(rl);
      if (!rl.success) {
        return createErrorResponse('Rate limit exceeded', 'Too many requests. Please try again later.', 429);
      }
    } catch (rateLimitError: any) {
      logger.error('Rate limit check failed', { endpoint: '/api/admin/success-stories' }, rateLimitError);
      return createErrorResponse('Rate limit check failed', 'Unable to verify rate limits', 500);
    }

    // Step 2: CSRF validation
    try {
      const csrfError = await validateCsrf(request);
      if (csrfError) return csrfError;
    } catch (csrfErr: any) {
      logger.error('CSRF validation failed', { endpoint: '/api/admin/success-stories' }, csrfErr);
      return createErrorResponse('CSRF validation failed', 'Security check failed. Please refresh and try again.', 403);
    }

    // Step 3: Authentication
    try {
      const auth = await verifyAdmin(request);
      if (!auth.success) return auth.response;
      
      if (!auth.userId) {
        logger.error('Admin verification succeeded but userId is missing', { endpoint: '/api/admin/success-stories' });
        return createErrorResponse('Authentication error', 'User ID not found after authentication', 401);
      }
      
      // Validate userId is a valid UUID format
      if (!uuidRegex.test(auth.userId)) {
        logger.error('Invalid userId format', { endpoint: '/api/admin/success-stories', userId: auth.userId });
        return createErrorResponse('Invalid user ID format', 'User ID is not in valid format', 401);
      }
      
      authUserId = auth.userId;
      logger.info('Authentication successful', { endpoint: '/api/admin/success-stories', userId: authUserId });
    } catch (authErr: any) {
      logger.error('Authentication failed', { endpoint: '/api/admin/success-stories' }, authErr);
      return createErrorResponse('Authentication failed', 'Unable to verify admin access', 401);
    }

    // Step 4: Parse form data with error handling
    let form: FormData;
    try {
      form = await request.formData();
      logger.info('Form data parsed successfully', { endpoint: '/api/admin/success-stories' });
    } catch (formErr: any) {
      logger.error('Form data parsing failed', { endpoint: '/api/admin/success-stories' }, formErr);
      return createErrorResponse('Invalid form data', 'Unable to parse request data', 400);
    }

    // Step 5: Extract and validate form fields
    let background: 'blue' | 'white' = 'white';
    let image_position: 'left' | 'right' = 'left';
    
    try {
      title = String(form.get('title') || '').trim();
      body_primary = String(form.get('body_primary') || '').trim();
      const body_secondary_raw = form.get('body_secondary');
      body_secondary = body_secondary_raw ? String(body_secondary_raw).trim() : null;
      const body_tertiary_raw = form.get('body_tertiary');
      body_tertiary = body_tertiary_raw ? String(body_tertiary_raw).trim() : null;
      const background_raw = form.get('background');
      background = (String(background_raw || 'white') === 'blue') ? 'blue' : 'white';
      const image_position_raw = form.get('image_position');
      image_position = (String(image_position_raw || 'left') === 'right') ? 'right' : 'left';
      const order_index_raw = form.get('order_index');
      order_index = Number(order_index_raw) || 0;
      if (isNaN(order_index) || order_index < 0) {
        order_index = 0;
      }
      const is_published_raw = form.get('is_published');
      is_published = String(is_published_raw || 'false') === 'true';
      const fileInput = form.get('image');
      file = fileInput instanceof File ? fileInput : null;
      
      logger.info('Form fields extracted', { 
        endpoint: '/api/admin/success-stories',
        hasTitle: !!title,
        hasBodyPrimary: !!body_primary,
        hasImage: !!file,
        order_index,
        is_published
      });
    } catch (extractErr: any) {
      logger.error('Form field extraction failed', { endpoint: '/api/admin/success-stories' }, extractErr);
      return createErrorResponse('Form field extraction failed', 'Unable to extract form data', 400);
    }

    // Step 6: Validate required fields
    if (!title || title.length === 0) {
      logger.warn('Title is missing', { endpoint: '/api/admin/success-stories' });
      return createErrorResponse('Title is required', 'Please provide a title for the success story section', 400);
    }
    
    if (!body_primary || body_primary.length === 0) {
      logger.warn('Primary body text is missing', { endpoint: '/api/admin/success-stories' });
      return createErrorResponse('Primary content is required', 'Please provide primary text for the success story section', 400);
    }

  // Step 7: Validate and process media (image or video)
  let image_url: string | null = null;
    
    if (!file) {
      logger.warn('Media missing for new section', { endpoint: '/api/admin/success-stories' });
      return createErrorResponse('Media is required', 'Please upload an image or video for the success story section', 400);
    }

    // Validate media type
    const mime = file.type || '';
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    if (!mime || (!isImage && !isVideo)) {
      logger.warn('Invalid media type', { endpoint: '/api/admin/success-stories', mime, size: file.size });
      return createErrorResponse(
        'Unsupported media type',
        `Supported formats: images (PNG, JPG, WebP, SVG) and videos (MP4, WebM, MOV, etc). Received: ${mime || 'unknown'}`,
        400
      );
    }
    
    // Check bucket configuration and validate file size
    let bucketSizeLimit: number | null = null;
    try {
      const { data: buckets, error: bucketError } = await supabaseAdmin.storage.listBuckets();
      if (bucketError) {
        logger.warn('Failed to list buckets', { endpoint: '/api/admin/success-stories', error: bucketError.message });
      } else {
        const schoolLogosBucket = buckets?.find((b: any) => b.name === 'school-logos');
        if (schoolLogosBucket) {
          bucketSizeLimit = schoolLogosBucket.file_size_limit || null;
          logger.info('Bucket configuration retrieved', { 
            endpoint: '/api/admin/success-stories', 
            bucketLimit: bucketSizeLimit ? `${(bucketSizeLimit / 1024 / 1024).toFixed(2)}MB` : 'unlimited'
          });
        } else {
          logger.warn('School-logos bucket not found', { endpoint: '/api/admin/success-stories' });
        }
      }
    } catch (bucketCheckErr: any) {
      logger.warn('Error checking bucket configuration', { endpoint: '/api/admin/success-stories' }, bucketCheckErr);
    }

    // Validate file size against bucket limit or defaults
    // Images default to 5MB, videos default to 100MB (bucket limit still overrides if set).
    const defaultLimit = isVideo ? (100 * 1024 * 1024) : (5 * 1024 * 1024);
    const maxSize = bucketSizeLimit || defaultLimit;
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
    
    if (file.size === 0) {
      logger.warn('Media file is empty', { endpoint: '/api/admin/success-stories' });
      return createErrorResponse('Media file is empty', 'Please upload a valid image or video file', 400);
    }
    
    if (file.size > maxSize) {
      logger.warn('Media size exceeds limit', { 
        endpoint: '/api/admin/success-stories', 
        fileSize: file.size,
        maxSize,
        bucketLimit: bucketSizeLimit
      });
      const sizeError = `File size (${fileSizeMB}MB) exceeds the maximum allowed size (${maxSizeMB}MB)`;
      const details = bucketSizeLimit 
        ? `The storage bucket has a limit of ${maxSizeMB}MB. Please compress or resize your image.`
        : `Maximum file size is ${maxSizeMB}MB. Please compress your file or use a smaller one.`;
      return createErrorResponse(sizeError, details, 400);
    }

    // Process upload with error recovery
    try {
      logger.info('Processing media upload', { 
        endpoint: '/api/admin/success-stories', 
        mime, 
        fileSize: file.size,
        fileSizeMB,
        maxSizeMB
      });
      
      const arrayBuffer = await file.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('File is empty or could not be read');
      }
      
      const buffer = Buffer.from(arrayBuffer);
      
      // Verify buffer size matches file size (sanity check)
      if (buffer.length !== file.size) {
        logger.warn('Buffer size mismatch', { 
          endpoint: '/api/admin/success-stories',
          fileSize: file.size,
          bufferSize: buffer.length
        });
      }
      
      const extFromMime = (m: string) => {
        if (m === 'image/png') return 'png';
        if (m === 'image/jpeg') return 'jpg';
        if (m === 'image/webp') return 'webp';
        if (m === 'image/svg+xml') return 'svg';
        if (m === 'video/mp4') return 'mp4';
        if (m === 'video/webm') return 'webm';
        if (m === 'video/quicktime') return 'mov';
        if (m === 'video/ogg') return 'ogv';
        // Fallback: use subtype if reasonable, else bin
        const subtype = m.split('/')[1] || '';
        return subtype && subtype.length <= 10 ? subtype : 'bin';
      };

      const ext = extFromMime(mime);
      const path = `success-stories/${authUserId}/${Date.now()}.${ext}`;
      storage_path = path;
      
      logger.info('Uploading media to storage', { 
        endpoint: '/api/admin/success-stories', 
        path, 
        bufferSize: buffer.length,
        bufferSizeMB: (buffer.length / 1024 / 1024).toFixed(2)
      });
      
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('school-logos')
        .upload(path, buffer, { cacheControl: '3600', upsert: false, contentType: mime });
      
      if (uploadError) {
        logger.error('Media upload failed', { 
          endpoint: '/api/admin/success-stories', 
          path, 
          error: uploadError.message,
          code: uploadError.statusCode,
          fileSize: file.size,
          fileSizeMB,
          bufferSize: buffer.length,
          bucketLimit: bucketSizeLimit
        });
        
        // Try to clean up if file was partially uploaded
        if (uploadData?.path) {
          try {
            await supabaseAdmin.storage.from('school-logos').remove([uploadData.path]);
          } catch (cleanupErr) {
            logger.warn('Failed to clean up partial upload', { endpoint: '/api/admin/success-stories', path: uploadData.path });
          }
        }
        
        // Provide more helpful error message for size-related errors
        let errorMessage = uploadError.message || 'Unknown storage error';
        if (errorMessage.toLowerCase().includes('size') || errorMessage.toLowerCase().includes('exceeded')) {
          errorMessage = `File size (${fileSizeMB}MB) exceeds the storage bucket limit (${maxSizeMB}MB). Please compress or resize your image to under ${maxSizeMB}MB.`;
        }
        
        throw new Error(`Upload failed: ${errorMessage}`);
      }
      
      const { data: urlData } = await supabaseAdmin.storage.from('school-logos').getPublicUrl(path);
      image_url = urlData?.publicUrl || null;
      
      if (!image_url) {
        throw new Error('Failed to generate file URL after upload');
      }
      
      logger.info('Media uploaded successfully', { endpoint: '/api/admin/success-stories', path, image_url });
    } catch (uploadErr: any) {
      logger.error('Media processing failed', { endpoint: '/api/admin/success-stories' }, uploadErr);
      const errorInfo = extractErrorInfo(uploadErr);
      return createErrorResponse(
        'Upload failed',
        errorInfo.message || 'Failed to process and upload file',
        400
      );
    }

    // Step 8: Prepare insert data with validation
    const insertData: any = {
      title: title.trim(),
      body_primary: body_primary.trim(),
      body_secondary: body_secondary ? body_secondary.trim() : null,
      body_tertiary: body_tertiary ? body_tertiary.trim() : null,
      background,
      image_position,
      order_index: Math.max(0, Math.floor(order_index)), // Ensure non-negative integer
      image_url,
      storage_path,
      created_by: authUserId,
      is_published: Boolean(is_published)
    };

    // If publishing, set published_at timestamp
    if (is_published) {
      insertData.published_at = new Date().toISOString();
    }

    // Step 9: Validate insert data before database operation
    if (!insertData.title || insertData.title.length === 0) {
      return createErrorResponse('Title is required', 'Title cannot be empty', 400);
    }
    
    if (!insertData.body_primary || insertData.body_primary.length === 0) {
      return createErrorResponse('Primary content is required', 'Primary body text cannot be empty', 400);
    }
    
    if (!insertData.image_url) {
      return createErrorResponse('File URL is missing', 'File was uploaded but URL is not available', 500);
    }
    
    if (!insertData.created_by || !uuidRegex.test(insertData.created_by)) {
      return createErrorResponse('Invalid user ID', 'User ID is not valid', 400);
    }

    logger.info('Prepared insert data', { 
      endpoint: '/api/admin/success-stories', 
      hasImage: !!image_url,
      hasStoragePath: !!storage_path,
      order_index: insertData.order_index,
      is_published: insertData.is_published,
      userId: insertData.created_by,
      titleLength: insertData.title.length,
      bodyPrimaryLength: insertData.body_primary.length
    });
    
    // Step 10: Database insert with comprehensive error handling
    let inserted: any;
    try {
      const { data: insertResult, error: dbError } = await supabaseAdmin
        .from('success_story_sections')
        .insert(insertData)
        .select('id, title, body_primary, body_secondary, body_tertiary, image_url, background, image_position, order_index, is_published, published_at, created_at, updated_at')
        .single();
      
      if (dbError) {
        const errorInfo = extractErrorInfo(dbError);
        logger.error('Database insert failed', { 
          endpoint: '/api/admin/success-stories', 
          error: errorInfo.message,
          code: errorInfo.code,
          details: errorInfo.details,
          hint: errorInfo.hint,
          insertDataKeys: Object.keys(insertData)
        });
        
        // Handle specific database error codes
        if (errorInfo.code === '23505') { // Unique constraint violation
          return createErrorResponse(
            'Duplicate entry',
            'A section with this configuration already exists. Please check the order index or other unique fields.',
            409
          );
        } else if (errorInfo.code === '23503') { // Foreign key violation
          return createErrorResponse(
            'Invalid reference',
            'One or more referenced records do not exist. Please check the user ID and other foreign key references.',
            400
          );
        } else if (errorInfo.code === '23502') { // Not null violation
          return createErrorResponse(
            'Missing required field',
            errorInfo.details || 'A required field is missing',
            400
          );
        } else if (errorInfo.code === '23514') { // Check constraint violation
          return createErrorResponse(
            'Invalid data',
            errorInfo.details || 'Data does not meet validation requirements',
            400
          );
        }
        
        // Generic database error
        return createErrorResponse(
          'Database error',
          errorInfo.details || errorInfo.message || 'Failed to save to database',
          500
        );
      }
      
      if (!insertResult) {
        logger.error('Database insert returned no data', { 
          endpoint: '/api/admin/success-stories',
          insertDataKeys: Object.keys(insertData)
        });
        
        // Attempt to clean up uploaded image if insert failed
        if (storage_path) {
          try {
            await supabaseAdmin.storage.from('school-logos').remove([storage_path]);
            logger.info('Cleaned up image after failed insert', { endpoint: '/api/admin/success-stories', path: storage_path });
          } catch (cleanupErr) {
            logger.warn('Failed to clean up image after failed insert', { endpoint: '/api/admin/success-stories', path: storage_path });
          }
        }
        
        return createErrorResponse(
          'Insert failed',
          'Database insert succeeded but no data was returned',
          500
        );
      }
      
      inserted = insertResult;
      logger.info('Success story section created', { 
        endpoint: '/api/admin/success-stories',
        sectionId: inserted.id,
        order_index: inserted.order_index
      });
    } catch (dbErr: any) {
      logger.error('Database operation exception', { endpoint: '/api/admin/success-stories' }, dbErr);
      
      // Clean up uploaded image on error
      if (storage_path) {
        try {
          await supabaseAdmin.storage.from('school-logos').remove([storage_path]);
          logger.info('Cleaned up image after database error', { endpoint: '/api/admin/success-stories', path: storage_path });
        } catch (cleanupErr) {
          logger.warn('Failed to clean up image after database error', { endpoint: '/api/admin/success-stories', path: storage_path });
        }
      }
      
      const errorInfo = extractErrorInfo(dbErr);
      return createErrorResponse(
        'Database operation failed',
        errorInfo.details || errorInfo.message || 'An error occurred while saving to database',
        500
      );
    }

    // Step 11: Create version snapshot if publishing (non-critical, log but don't fail)
    if (is_published && inserted) {
      try {
        const snapshot = {
          id: inserted.id,
          title: inserted.title,
          body_primary: inserted.body_primary,
          body_secondary: inserted.body_secondary,
          body_tertiary: (inserted as any).body_tertiary,
          image_url: inserted.image_url,
          background: inserted.background,
          image_position: inserted.image_position,
          order_index: inserted.order_index,
          is_published: inserted.is_published,
          published_at: inserted.published_at,
        };
        
        const { error: vErr } = await supabaseAdmin
          .from('success_story_versions')
          .insert({ 
            section_id: inserted.id, 
            version_number: 1, 
            snapshot, 
            created_by: authUserId 
          });
        
        if (vErr) {
          logger.warn('Version insert error (non-critical)', { 
            endpoint: '/api/admin/success-stories',
            sectionId: inserted.id,
            error: vErr.message
          });
        } else {
          logger.info('Version snapshot created', { 
            endpoint: '/api/admin/success-stories',
            sectionId: inserted.id
          });
        }
      } catch (versionErr: any) {
        // Version creation is non-critical, log but don't fail the request
        logger.warn('Version creation exception (non-critical)', { 
          endpoint: '/api/admin/success-stories',
          sectionId: inserted.id
        }, versionErr);
      }
    }

    // Step 12: Invalidate cache
    try {
      await invalidateCache(CacheKeys.successStories());
      logger.info('Cache invalidated', { endpoint: '/api/admin/success-stories' });
    } catch (cacheErr: any) {
      // Cache invalidation is non-critical, log but don't fail
      logger.warn('Cache invalidation failed (non-critical)', { endpoint: '/api/admin/success-stories' }, cacheErr);
    }

    // Step 13: Return success response
    logger.info('Success story section creation completed', { 
      endpoint: '/api/admin/success-stories',
      sectionId: inserted.id,
      is_published
    });
    
    return NextResponse.json({ section: inserted }, { status: 201, headers });
  } catch (error: any) {
    // Final catch-all error handler - should rarely be reached due to defensive handling above
    let errorInfo: { message: string; code?: string; details?: string; hint?: string };
    
    try {
      errorInfo = extractErrorInfo(error);
    } catch (extractErr) {
      // If we can't extract error info, create a safe default
      errorInfo = { 
        message: error?.message || String(error) || 'An unexpected error occurred',
        details: 'Unable to extract detailed error information'
      };
    }
    
    // Log error with context - use console.error as fallback if logger fails
    const logContext = {
      endpoint: '/api/admin/success-stories',
      hasTitle: !!title,
      hasBodyPrimary: !!body_primary,
      hasImage: !!file,
      fileSize: file?.size,
      order_index,
      is_published,
      hasStoragePath: !!storage_path,
      errorMessage: errorInfo.message,
      errorCode: errorInfo.code
    };
    
    try {
      logger.error('Unexpected error in success story creation', logContext, error instanceof Error ? error : new Error(String(error)));
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
      console.error('Original error:', error);
      console.error('Error context:', logContext);
    }
    
    console.error('❌ Unexpected error creating success story section:', {
      message: errorInfo.message,
      code: errorInfo.code,
      details: errorInfo.details,
      hint: errorInfo.hint,
      errorType: error?.constructor?.name,
      errorString: String(error)
    });
    
    // Clean up uploaded image if it exists
    if (storage_path) {
      try {
        await supabaseAdmin.storage.from('school-logos').remove([storage_path]);
        console.log('Cleaned up image after unexpected error:', storage_path);
      } catch (cleanupErr) {
        console.warn('Failed to clean up image after unexpected error:', cleanupErr);
      }
    }
    
    // Determine appropriate status code
    let statusCode = 500;
    if (errorInfo.code === '23505') statusCode = 409; // Unique constraint
    else if (errorInfo.code === '23503') statusCode = 400; // Foreign key
    else if (errorInfo.code === '23502') statusCode = 400; // Not null
    else if (errorInfo.message?.toLowerCase().includes('image')) statusCode = 400;
    else if (errorInfo.message?.toLowerCase().includes('auth')) statusCode = 401;
    else if (errorInfo.message?.toLowerCase().includes('size') || errorInfo.message?.toLowerCase().includes('exceeded')) statusCode = 400;
    
    // Build safe error response - ensure all values are serializable
    const response: any = {
      error: errorInfo.message || 'Failed to create section',
      status: statusCode
    };
    
    // Add details if available and safe (string only)
    if (errorInfo.details && typeof errorInfo.details === 'string') {
      response.details = errorInfo.details.substring(0, 500); // Limit length
    }
    if (errorInfo.hint && typeof errorInfo.hint === 'string') {
      response.hint = errorInfo.hint.substring(0, 500); // Limit length
    }
    if (errorInfo.code && typeof errorInfo.code === 'string') {
      response.code = errorInfo.code;
    }
    
    // In development, add stack trace (safely and limited)
    if (process.env.NODE_ENV === 'development') {
      if (error?.stack && typeof error.stack === 'string') {
        response.stack = error.stack.substring(0, 1000); // Limit stack trace length
      }
      // Also include error type for debugging
      if (error?.constructor?.name) {
        response.errorType = error.constructor.name;
      }
    }
    
    // Return error response with multiple fallbacks
    try {
      // Return error response without rate limit headers (this is not a rate limit error)
      return NextResponse.json(response, { status: statusCode });
    } catch (responseErr) {
      console.error('Failed to create error response:', responseErr);
      try {
        // Fallback - minimal response
        return NextResponse.json(
          { 
            error: errorInfo.message || 'Internal server error',
            status: statusCode,
            details: 'An error occurred while processing your request. Please check the server logs for details.'
          },
          { status: statusCode }
        );
      } catch (responseErr2) {
        console.error('Failed to create error response at all:', responseErr2);
        // Ultimate fallback - minimal response
        return NextResponse.json(
          { 
            error: errorInfo.message || 'Internal server error',
            status: statusCode
          },
          { status: statusCode }
        );
      }
    }
  }
}


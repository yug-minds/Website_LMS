import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { fileUploadSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../lib/logger';


export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Verify admin access first (before rate limiting)
  // This allows us to apply more lenient rate limits for authenticated admin users
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return adminCheck.response;
  }

  // Apply rate limiting with more lenient settings for admin uploads
  // Admin users get 50 requests per minute (vs 30 for regular uploads)
  const adminUploadLimit = {
    maxRequests: 50,
    windowSeconds: 60,
  };
  const rateLimitResult = await rateLimit(request, adminUploadLimit);
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
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'video' or 'material'
    const chapterIndex = formData.get('chapterIndex') as string;
    const courseId = formData.get('courseId') as string;
    const chapterId = formData.get('chapterId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate FormData fields using schema
    const validation = validateRequestBody(fileUploadSchema, {
      type,
      courseId: courseId && courseId !== 'undefined' ? courseId : undefined,
      chapterId: chapterId && chapterId !== 'undefined' ? chapterId : undefined,
      chapterIndex: chapterIndex || undefined,
    });
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

    const { type: validatedType, courseId: validatedCourseId, chapterId: validatedChapterId } = validation.data;

    // Validate file type and size based on upload type
    if (validatedType === 'video') {
      const validVideoTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm'];
      if (!validVideoTypes.includes(file.type)) {
        return NextResponse.json({ error: 'Invalid video file type. Must be .mp4, .mov, .avi, or .webm' }, { status: 400 });
      }
      const maxSize = 500 * 1024 * 1024; // 500MB
      if (file.size > maxSize) {
        return NextResponse.json({ error: 'Video file size must be less than 500MB' }, { status: 400 });
      }
    } else if (validatedType === 'material') {
      const validExtensions = ['.pdf', '.docx', '.pptx', '.txt', '.doc', '.ppt', '.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png'];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(fileExt)) {
        return NextResponse.json({ error: 'Invalid material file type.' }, { status: 400 });
      }
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        return NextResponse.json({ error: 'Material file size must be less than 50MB' }, { status: 400 });
      }
    } else if (validatedType === 'thumbnail') {
      // Validate thumbnail (image only)
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!validImageTypes.includes(file.type)) {
        return NextResponse.json({ error: 'Invalid thumbnail file type. Must be an image (JPEG, PNG, GIF, or WebP)' }, { status: 400 });
      }
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return NextResponse.json({ error: 'Thumbnail file size must be less than 5MB' }, { status: 400 });
      }
    }

    // Generate file path
    const fileExt = file.name.split('.').pop();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    const fileName = `${timestamp}_${sanitizedName}`;
    
    // Construct organized path: /courses/{courseId}/chapters/{chapterId}/{type}/...
    let filePath = '';
    
    if (validatedType === 'thumbnail') {
      // Thumbnails go in course root
      if (validatedCourseId) {
        filePath = `courses/${validatedCourseId}/thumbnails/${fileName}`;
      } else {
        filePath = `course-thumbnails/${timestamp}/${fileName}`;
      }
    } else if (validatedCourseId && validatedChapterId) {
      // Use structured path if IDs are available
      const folderType = validatedType === 'video' ? 'videos' : 'materials';
      filePath = `courses/${validatedCourseId}/chapters/${validatedChapterId}/${folderType}/${fileName}`;
    } else {
      // Fallback to flat structure for backward compatibility or if IDs missing
      const folder = validatedType === 'video' ? 'course-videos' : 'course-materials';
      filePath = `${folder}/${timestamp}/${fileName}`;
    }

    console.log('Uploading file:', { fileName, filePath, size: file.size, type: file.type });

    // Check if bucket exists first
    const { data: buckets, error: bucketError } = await supabaseAdmin.storage.listBuckets();
    if (bucketError) {
      console.error('Error listing buckets:', bucketError);
    } else {
       
      const courseFilesBucket = buckets?.find((b: any) => b.id === 'course-files');
      if (!courseFilesBucket) {
        return NextResponse.json({ 
          error: 'Storage bucket "course-files" not found. Please create it in Supabase Dashboard > Storage.',
          details: 'The bucket needs to be created before uploading files.'
        }, { status: 400 });
      }
      console.log('Bucket found:', courseFilesBucket);
    }

    // Convert File to Buffer for Node.js
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload using admin client (bypasses RLS)
    console.log('Attempting upload to:', filePath);
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('course-files')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || (validatedType === 'video' ? 'video/mp4' : 'application/octet-stream')
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      console.error('Error details:', JSON.stringify(uploadError, null, 2));
      
      // Check for specific error types
      let errorMessage = 'Failed to upload file';
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('does not exist')) {
        errorMessage = 'Storage bucket "course-files" not found. Please create it in Supabase Dashboard > Storage.';
      } else if (uploadError.message?.includes('permission') || uploadError.message?.includes('policy') || uploadError.message?.includes('denied')) {
        errorMessage = 'Permission denied. Please check storage bucket policies.';
      } else if (uploadError.message) {
        errorMessage = `Upload failed: ${uploadError.message}`;
      }
      
      return NextResponse.json({ 
        error: errorMessage, 
        details: uploadError.message || 'Unknown error'
      }, { status: 500 });
    }

    if (!uploadData) {
      return NextResponse.json({ error: 'Upload failed: No data returned' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('course-files')
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return NextResponse.json({ error: 'Failed to get file URL after upload' }, { status: 500 });
    }

    // Determine content type for chapter_contents (skip for thumbnails)
    let contentType = 'file';
    if (validatedType === 'video') {
      contentType = 'video';
    } else if (file.type === 'application/pdf') {
      contentType = 'pdf';
    } else if (file.type.startsWith('image/')) {
      contentType = 'image';
    } else if (file.type.startsWith('audio/')) {
      contentType = 'audio';
    }

    // If chapterId is provided, optionally save to chapter_contents table
    // This allows the frontend to choose whether to save immediately or later
    // Skip for thumbnails (they're course-level, not chapter-level)
    let chapterContentId = null;
    if (validatedChapterId && validatedType !== 'thumbnail') {
      try {
        // Get the next order_index for this chapter
        const { data: existingContent } = await supabaseAdmin
          .from('chapter_contents')
          .select('order_index')
          .eq('chapter_id', validatedChapterId)
          .order('order_index', { ascending: false })
          .limit(1)
           
          .single() as any;

        const nextOrderIndex = existingContent?.order_index ? existingContent.order_index + 1 : 0;

        // Insert into chapter_contents
        const { data: insertedContent, error: contentError } = await (supabaseAdmin
          .from('chapter_contents')
          .insert({
            chapter_id: validatedChapterId,
            content_type: contentType,
            title: file.name,
            content_url: urlData.publicUrl,
            storage_path: filePath,
            content_metadata: {
              file_name: file.name,
              file_size: file.size,
              mime_type: file.type,
              uploaded_at: new Date().toISOString()
            },
            order_index: nextOrderIndex,
            is_published: true
           
          } as any)
           
          .select('id') as any)
           
          .single() as any;

        if (contentError) {
          console.error('Warning: Failed to save to chapter_contents:', contentError);
          // Don't fail the upload if chapter_contents insert fails
        } else {
          chapterContentId = insertedContent?.id;
          console.log('✅ Saved to chapter_contents:', chapterContentId);
        }
      } catch (error) {
        logger.warn('Error saving to chapter_contents (non-critical)', {
          endpoint: '/api/admin/upload',
        }, error instanceof Error ? error : new Error(String(error)));
        // Continue even if chapter_contents insert fails
      }
    }

    const successResponse = NextResponse.json({
      success: true,
      file: {
        path: filePath, // storage_path for Supabase Storage
        url: urlData.publicUrl,
        name: file.name,
        size: file.size,
        type: file.type,
        content_type: contentType
      },
      storage_path: filePath, // Explicitly include storage_path for frontend
      chapter_content_id: chapterContentId // Return the chapter_contents ID if created
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/upload', {
      endpoint: '/api/admin/upload',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/upload' },
      'Failed to upload file'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


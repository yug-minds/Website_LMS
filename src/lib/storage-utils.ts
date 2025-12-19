/**
 * Storage Utilities for Course File Management
 * Handles collection and deletion of course-related storage files
 */

import { supabaseAdmin } from './supabase';
import { logger } from './logger';

export interface CourseStoragePaths {
  thumbnailPaths: string[];
  chapterContentPaths: string[];
  materialPaths: string[];
  videoPaths: string[];
  allPaths: string[];
}

/**
 * Collects all storage paths associated with a course
 * @param courseId - The course ID
 * @returns Object containing arrays of storage paths by type
 */
export async function collectCourseStoragePaths(courseId: string): Promise<CourseStoragePaths> {
  const paths: CourseStoragePaths = {
    thumbnailPaths: [],
    chapterContentPaths: [],
    materialPaths: [],
    videoPaths: [],
    allPaths: [],
  };

  try {
    // 1. Get course thumbnail path
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('thumbnail_url')
      .eq('id', courseId)
      .single();

    if (!courseError && course?.thumbnail_url) {
      const thumbnailPath = extractStoragePathFromUrl(course.thumbnail_url);
      if (thumbnailPath) {
        paths.thumbnailPaths.push(thumbnailPath);
      }
    }

    // 2. Get all chapters for this course
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .eq('course_id', courseId);

    if (chaptersError) {
      logger.warn('Error fetching chapters for storage cleanup', {
        courseId,
        error: chaptersError.message,
      });
      return paths;
    }

    const chapterIds = chapters?.map((ch: any) => ch.id) || [];

    if (chapterIds.length === 0) {
      logger.debug('No chapters found for course', { courseId });
      return paths;
    }

    // 3. Get chapter_contents storage paths
    const { data: chapterContents, error: contentsError } = await supabaseAdmin
      .from('chapter_contents')
      .select('storage_path, thumbnail_url')
      .in('chapter_id', chapterIds);

    if (!contentsError && chapterContents) {
      chapterContents.forEach((content: any) => {
        if (content.storage_path) {
          paths.chapterContentPaths.push(content.storage_path);
        }
        if (content.thumbnail_url) {
          const thumbPath = extractStoragePathFromUrl(content.thumbnail_url);
          if (thumbPath) {
            paths.chapterContentPaths.push(thumbPath);
          }
        }
      });
    }

    // 4. Get materials storage paths
    const { data: materials, error: materialsError } = await supabaseAdmin
      .from('materials')
      .select('file_url')
      .in('chapter_id', chapterIds);

    if (!materialsError && materials) {
      materials.forEach((material: any) => {
        if (material.file_url) {
          const materialPath = extractStoragePathFromUrl(material.file_url);
          if (materialPath) {
            paths.materialPaths.push(materialPath);
          }
        }
      });
    }

    // 5. Get videos storage paths (only if stored locally, not external URLs)
    const { data: videos, error: videosError } = await supabaseAdmin
      .from('videos')
      .select('video_url')
      .in('chapter_id', chapterIds);

    if (!videosError && videos) {
      videos.forEach((video: any) => {
        if (video.video_url) {
          const videoPath = extractStoragePathFromUrl(video.video_url);
          // Only add if it's a local storage path (not YouTube/external)
          if (videoPath && !isExternalUrl(video.video_url)) {
            paths.videoPaths.push(videoPath);
          }
        }
      });
    }

    // Combine all paths
    paths.allPaths = [
      ...paths.thumbnailPaths,
      ...paths.chapterContentPaths,
      ...paths.materialPaths,
      ...paths.videoPaths,
    ];

    // Remove duplicates
    paths.allPaths = [...new Set(paths.allPaths)];

    logger.info('Collected course storage paths', {
      courseId,
      thumbnailCount: paths.thumbnailPaths.length,
      chapterContentCount: paths.chapterContentPaths.length,
      materialCount: paths.materialPaths.length,
      videoCount: paths.videoPaths.length,
      totalCount: paths.allPaths.length,
    });

    return paths;
  } catch (error) {
    logger.error('Error collecting course storage paths', {
      courseId,
    }, error instanceof Error ? error : new Error(String(error)));
    return paths;
  }
}

/**
 * Extracts storage path from a Supabase Storage URL
 * @param url - The full URL or storage path
 * @returns The storage path relative to bucket root, or null if not a storage URL
 */
function extractStoragePathFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // If it's already a path (doesn't start with http), return as-is
  if (!url.startsWith('http')) {
    return url;
  }

  // Extract path from Supabase Storage URL
  // Format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
  const storageUrlPattern = /\/storage\/v1\/object\/public\/[^/]+\/(.+)$/;
  const match = url.match(storageUrlPattern);
  
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }

  // Also check for direct bucket path format
  const bucketPathPattern = /\/public\/[^/]+\/(.+)$/;
  const bucketMatch = url.match(bucketPathPattern);
  
  if (bucketMatch && bucketMatch[1]) {
    return decodeURIComponent(bucketMatch[1]);
  }

  return null;
}

/**
 * Checks if a URL is external (not Supabase Storage)
 * @param url - The URL to check
 * @returns true if external, false if Supabase Storage
 */
function isExternalUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check for common external video platforms
  const externalPatterns = [
    /youtube\.com/,
    /youtu\.be/,
    /vimeo\.com/,
    /dailymotion\.com/,
    /drive\.google\.com/,
    /onedrive\.live\.com/,
    /dropbox\.com/,
  ];

  return externalPatterns.some((pattern: any) => pattern.test(url));
}

/**
 * Deletes storage files from Supabase Storage bucket
 * @param bucketName - The storage bucket name
 * @param paths - Array of storage paths to delete
 * @returns Object with success count and failed paths
 */
export async function deleteStorageFiles(
  bucketName: string,
  paths: string[]
): Promise<{ successCount: number; failedPaths: string[] }> {
  if (paths.length === 0) {
    return { successCount: 0, failedPaths: [] };
  }

  const failedPaths: string[] = [];

  try {
    // Remove files from storage
    const { data, error } = await supabaseAdmin.storage
      .from(bucketName)
      .remove(paths);

    if (error) {
      logger.error('Error deleting storage files', {
        bucketName,
        pathCount: paths.length,
        error: error.message,
      });
      // If bulk delete fails, try individual deletes
      for (const path of paths) {
        try {
          const { error: singleError } = await supabaseAdmin.storage
            .from(bucketName)
            .remove([path]);
          if (singleError) {
            failedPaths.push(path);
            logger.warn('Failed to delete individual file', {
              bucketName,
              path,
              error: singleError.message,
            });
          }
        } catch (err) {
          failedPaths.push(path);
          logger.warn('Exception deleting individual file', {
            bucketName,
            path,
          }, err instanceof Error ? err : new Error(String(err)));
        }
      }
    } else {
      // Check if any files failed to delete
      if (data && Array.isArray(data)) {
        data.forEach((item: any) => {
          if (item.error || !item.name) {
            failedPaths.push(item.name || 'unknown');
          }
        });
      }
    }

    const successCount = paths.length - failedPaths.length;

    logger.info('Storage files deletion completed', {
      bucketName,
      totalPaths: paths.length,
      successCount,
      failedCount: failedPaths.length,
    });

    return { successCount, failedPaths };
  } catch (error) {
    logger.error('Exception deleting storage files', {
      bucketName,
      pathCount: paths.length,
    }, error instanceof Error ? error : new Error(String(error)));
    
    // Mark all as failed on exception
    return { successCount: 0, failedPaths: paths };
  }
};

/**
 * Deletes all storage files associated with a course
 * @param courseId - The course ID
 * @param bucketName - The storage bucket name (default: 'course-files')
 * @returns Object with deletion results
 */
export async function cleanupCourseStorage(
  courseId: string,
  bucketName: string = 'course-files'
): Promise<{ success: boolean; deletedCount: number; failedPaths: string[] }> {
  try {
    logger.info('Starting course storage cleanup', { courseId, bucketName });

    // Collect all storage paths
    const storagePaths = await collectCourseStoragePaths(courseId);

    if (storagePaths.allPaths.length === 0) {
      logger.info('No storage files found for course', { courseId });
      return { success: true, deletedCount: 0, failedPaths: [] };
    }

    // Delete all files
    const result = await deleteStorageFiles(bucketName, storagePaths.allPaths);

    // Also try to delete entire course folder structure (if bucket supports folder deletion)
    // This is a fallback for any files that might not have been tracked
    try {
      const courseFolderPath = `courses/${courseId}`;
      const { error: folderError } = await supabaseAdmin.storage
        .from(bucketName)
        .remove([courseFolderPath]);
      
      if (folderError) {
        // Folder deletion might fail if folder doesn't exist or doesn't support it
        // This is non-critical, so we just log it
        logger.debug('Folder deletion attempt (non-critical)', {
          courseId,
          folderPath: courseFolderPath,
          error: folderError.message,
        });
      }
    } catch (folderErr) {
      // Non-critical, continue
      logger.debug('Exception during folder deletion (non-critical)', {
        courseId,
        error: folderErr instanceof Error ? folderErr.message : String(folderErr)
      });
    }

    const success = result.failedPaths.length === 0;

    logger.info('Course storage cleanup completed', {
      courseId,
      bucketName,
      success,
      deletedCount: result.successCount,
      failedCount: result.failedPaths.length,
    });

    return {
      success,
      deletedCount: result.successCount,
      failedPaths: result.failedPaths,
    };
  } catch (error) {
    logger.error('Exception during course storage cleanup', {
      courseId,
      bucketName,
    }, error instanceof Error ? error : new Error(String(error)));
    
    return {
      success: false,
      deletedCount: 0,
      failedPaths: [],
    };
  }
}


/**
 * Course Synchronization Utilities
 * 
 * Handles real-time synchronization between course builder and student view
 */

import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface CourseSyncConfig {
  courseId: string;
  onCourseUpdate?: (payload: any) => void;
  onChapterUpdate?: (payload: any) => void;
  onContentUpdate?: (payload: any) => void;
  onMaterialUpdate?: (payload: any) => void;
  onAssignmentUpdate?: (payload: any) => void;
}

export interface SyncChannel {
  channel: RealtimeChannel | null;
  unsubscribe: () => void;
}

/**
 * Create real-time subscriptions for course changes
 */
export function createCourseSyncChannel(config: CourseSyncConfig): SyncChannel {
  // Validate courseId before creating channel
  if (!config.courseId || config.courseId.trim() === '') {
    console.warn('⚠️ [createCourseSyncChannel] Invalid courseId, skipping channel creation');
    // Return a dummy channel that does nothing
    const dummyChannel = {
      channel: null as any,
      unsubscribe: () => {},
    };
    return dummyChannel;
  }

  const channelName = `course-sync-${config.courseId}`;
  console.log(`🔄 [createCourseSyncChannel] Creating channel: ${channelName}`);

  try {
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'courses',
          filter: `id=eq.${config.courseId}`,
        },
        (payload) => {
          console.log('📡 Course updated:', payload);
          config.onCourseUpdate?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapters',
          filter: `course_id=eq.${config.courseId}`,
        },
        (payload) => {
          console.log('📡 Chapter updated:', payload);
          config.onChapterUpdate?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapter_contents',
        },
        (payload) => {
          // Check if the content belongs to a chapter in this course
          console.log('📡 Content updated:', payload);
          config.onContentUpdate?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'materials',
        },
        (payload) => {
          console.log('📡 Material updated:', payload);
          config.onMaterialUpdate?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments',
          filter: `course_id=eq.${config.courseId}`,
        },
        (payload) => {
          console.log('📡 Assignment updated:', payload);
          config.onAssignmentUpdate?.(payload);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Course sync channel subscribed: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          // Log error details but don't throw - this is non-critical
          console.warn('⚠️ Course sync channel error (non-critical):', {
            channel: channelName,
            courseId: config.courseId,
            error: err,
            status
          });
          // Don't log as error - this is expected in some cases (e.g., RLS blocking, connection issues)
        } else if (status === 'TIMED_OUT') {
          console.warn(`⚠️ Course sync channel timed out: ${channelName}`);
        } else if (status === 'CLOSED') {
          console.log(`ℹ️ Course sync channel closed: ${channelName}`);
        } else {
          console.log(`ℹ️ Course sync channel status: ${status} for ${channelName}`);
        }
      });

    return {
      channel,
      unsubscribe: () => {
        try {
          console.log(`🔄 [createCourseSyncChannel] Unsubscribing from channel: ${channelName}`);
          supabase.removeChannel(channel);
        } catch (error) {
          console.warn('⚠️ Error unsubscribing from course sync channel:', error);
        }
      },
    };
  } catch (error) {
    console.error('❌ [createCourseSyncChannel] Error creating channel:', {
      channel: channelName,
      courseId: config.courseId,
      error
    });
    // Return a dummy channel that does nothing
    return {
      channel: null as any,
      unsubscribe: () => {},
    };
  }
}

/**
 * Debounce function for rapid updates
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Optimistic update with rollback capability
 */
export interface OptimisticUpdate<T> {
  optimisticData: T;
  rollback: () => void;
  commit: () => void;
}

export function createOptimisticUpdate<T extends Record<string, any>>(
  currentData: T,
  updateFn: (data: T) => T
): OptimisticUpdate<T> {
  const originalData = { ...currentData };
  const optimisticData = updateFn(currentData);
  
  return {
    optimisticData,
    rollback: () => {
      Object.assign(currentData, originalData);
    },
    commit: () => {
      // Update is confirmed, no rollback needed
    },
  };
}


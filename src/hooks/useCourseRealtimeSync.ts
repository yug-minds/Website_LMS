/**
 * Real-time Course Synchronization Hook
 * 
 * Provides real-time updates for course content changes
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createCourseSyncChannel, debounce, CourseSyncConfig } from '../lib/course-sync';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface UseCourseRealtimeSyncOptions {
  courseId: string;
  enabled?: boolean;
  debounceMs?: number;
}

export function useCourseRealtimeSync({
  courseId,
  enabled = true,
  debounceMs = 500,
}: UseCourseRealtimeSyncOptions) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof createCourseSyncChannel> | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const invalidateQueries = useMemo(
    () => debounce((queryKeys: string[][]) => {
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }, debounceMs),
    [queryClient, debounceMs]
  );

  useEffect(() => {
    // Don't create channel if disabled or courseId is invalid
    if (!enabled || !courseId || courseId.trim() === '') {
      console.log('ℹ️ [useCourseRealtimeSync] Skipping channel creation:', {
        enabled,
        courseId,
        reason: !enabled ? 'disabled' : !courseId || courseId.trim() === '' ? 'invalid courseId' : 'unknown'
      });
      return;
    }

    const config: CourseSyncConfig = {
      courseId,
      onCourseUpdate: (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('🔄 Course data changed, invalidating queries');
        invalidateQueries([
          ['studentCourse', courseId],
          ['studentCourses'],
        ]);
      },
      onChapterUpdate: (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('🔄 Chapter data changed, invalidating queries');
        invalidateQueries([
          ['courseChapters', courseId],
          ['studentCourse', courseId],
        ]);
      },
      onContentUpdate: (payload: RealtimePostgresChangesPayload<any>) => {
        // Check if content belongs to this course's chapters
        console.log('🔄 Content data changed, invalidating queries');
        invalidateQueries([
          ['courseChapters', courseId],
          ['chapterContents'],
        ]);
      },
      onMaterialUpdate: (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('🔄 Material data changed, invalidating queries');
        invalidateQueries([
          ['courseMaterials', courseId],
        ]);
      },
      onAssignmentUpdate: (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('🔄 Assignment data changed, invalidating queries');
        invalidateQueries([
          ['studentAssignments'],
          ['courseAssignments', courseId],
        ]);
      },
    };

    const syncChannel = createCourseSyncChannel(config);
    channelRef.current = syncChannel;

    // Track connection status (only if channel exists)
    const checkConnection = () => {
      if (syncChannel.channel) {
        setIsConnected(syncChannel.channel.state === 'joined');
      } else {
        setIsConnected(false);
      }
    };

    // Initial check
    checkConnection();

    // Set up periodic check for connection status
    const connectionInterval = setInterval(checkConnection, 1000);

    return () => {
      clearInterval(connectionInterval);
      if (syncChannel && syncChannel.unsubscribe) {
        syncChannel.unsubscribe();
      }
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [courseId, enabled, invalidateQueries]);

  return {
    isConnected,
  };
}



















/**
 * Reusable hook for realtime notifications using Supabase Realtime
 * Replaces polling with WebSocket connections for instant updates
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { frontendLogger } from '../lib/frontend-logger';

export interface UseRealtimeNotificationsOptions {
  userId?: string;
  schoolId?: string;
  role?: 'student' | 'teacher' | 'school_admin' | 'admin';
  queryKey: string | string[];
  enabled?: boolean;
  onNotification?: (payload: any) => void;
}

/**
 * Hook to set up realtime subscription for notifications
 * Automatically invalidates React Query cache when notifications change
 */
export function useRealtimeNotifications(options: UseRealtimeNotificationsOptions) {
  const queryClient = useQueryClient();
  const channelRef = useRef<any>(null);
  const { userId, schoolId, role, queryKey, enabled = true, onNotification } = options;

  useEffect(() => {
    if (!enabled) return;

    let channel: any = null;

    const setupSubscription = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          frontendLogger.debug('Realtime notifications: No authenticated user', {
            component: 'useRealtimeNotifications',
            error: authError?.message
          });
          return;
        }

        // Determine the filter based on role and provided IDs
        const filter = `user_id=eq.${userId || user.id}`;
        
        // For school admin, also filter by school_id if provided
        if (role === 'school_admin' && schoolId) {
          // School admin notifications might be filtered by school_id in the API
          // The realtime subscription will catch all notifications for the user
          // and the API will filter by school_id
        }

        // Create channel name based on user and role
        const channelName = `notifications:${user.id}:${role || 'user'}`;

        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*', // INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'notifications',
              filter: filter,
            },
            (payload: any) => {
              frontendLogger.debug('Realtime notification update received', {
                component: 'useRealtimeNotifications',
                event: payload.eventType,
                notificationId: payload.new?.id || payload.old?.id
              });

              // Invalidate React Query cache to refetch notifications
              const queryKeyArray = Array.isArray(queryKey) ? queryKey : [queryKey];
              queryClient.invalidateQueries({ queryKey: queryKeyArray });

              // Call custom callback if provided
              if (onNotification) {
                onNotification(payload);
              }
            }
          )
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              frontendLogger.debug('Realtime notifications subscribed', {
                component: 'useRealtimeNotifications',
                channel: channelName
              });
            } else if (status === 'CHANNEL_ERROR') {
              frontendLogger.warn('Realtime notifications subscription error', {
                component: 'useRealtimeNotifications',
                channel: channelName
              });
            }
          });

        channelRef.current = channel;
      } catch (error) {
        frontendLogger.error('Error setting up realtime notifications', {
          component: 'useRealtimeNotifications',
        }, error instanceof Error ? error : new Error(String(error)));
      }
    };

    setupSubscription();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        frontendLogger.debug('Realtime notifications unsubscribed', {
          component: 'useRealtimeNotifications'
        });
      }
    };
  }, [userId, schoolId, role, queryKey, enabled, queryClient, onNotification]);

  const [isSubscribed, setIsSubscribed] = useState(false);
  
  // Update subscription state when channel changes
  useEffect(() => {
    setIsSubscribed(channelRef.current !== null);
  }, [enabled]);

  return {
    isSubscribed
  };
}

/**
 * Hook specifically for student notifications
 */
export function useStudentRealtimeNotifications(userId?: string) {
  return useRealtimeNotifications({
    userId,
    role: 'student',
    queryKey: 'studentNotifications',
    enabled: true
  });
}

/**
 * Hook specifically for teacher notifications
 */
export function useTeacherRealtimeNotifications(userId?: string, schoolId?: string) {
  return useRealtimeNotifications({
    userId,
    schoolId,
    role: 'teacher',
    queryKey: ['teacher', 'notifications', schoolId || ''],
    enabled: true
  });
}

/**
 * Hook specifically for school admin notifications
 */
export function useSchoolAdminRealtimeNotifications(userId?: string, schoolId?: string) {
  return useRealtimeNotifications({
    userId,
    schoolId,
    role: 'school_admin',
    queryKey: ['school-admin', 'notifications', schoolId || ''],
    enabled: true
  });
}

/**
 * Hook specifically for admin notifications
 */
export function useAdminRealtimeNotifications() {
  return useRealtimeNotifications({
    role: 'admin',
    queryKey: ['admin', 'notifications'],
    enabled: true
  });
}



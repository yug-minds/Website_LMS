'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellRing } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import NotificationCenter from './NotificationCenter';
import { useStudentRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { supabase } from '../../lib/supabase';
import { frontendLogger } from '../../lib/frontend-logger';

interface NotificationBellProps {
  userId?: string;
  className?: string;
}

export default function NotificationBell({ userId, className = '' }: NotificationBellProps) {
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);

  // Set up realtime notifications
  useStudentRealtimeNotifications(userId);

  // Fetch unread notification count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['studentNotifications', 'unreadCount'],
    queryFn: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return 0;

        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false);

        if (error) throw error;
        return count || 0;
      } catch (error) {
        frontendLogger.error('Error fetching unread notification count', { error });
        return 0;
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={`relative ${className}`}
        onClick={() => setIsNotificationCenterOpen(true)}
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
        
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0 min-w-[20px]"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      <NotificationCenter
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        userId={userId}
      />
    </>
  );
}
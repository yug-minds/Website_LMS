'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Bell, 
  BellRing, 
  BookOpen, 
  CheckCircle, 
  X, 
  ExternalLink,
  Clock,
  AlertCircle,
  Info,
  Award,
  Users
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
// import { ScrollArea } from '../ui/scroll-area'; // Component doesn't exist
// import { Separator } from '../ui/separator'; // Component doesn't exist
import { useStudentRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { supabase } from '../../lib/supabase';
import { frontendLogger } from '../../lib/frontend-logger';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'course_enrollment' | 'assignment_due' | 'grade_posted' | 'system_alert' | 'achievement' | 'general';
  is_read: boolean;
  created_at: string;
  course_id?: string;
  enrollment_id?: string;
  notification_data?: {
    course_name?: string;
    course_id?: string;
    enrollment_date?: string;
    auto_enrolled?: boolean;
    grade?: string;
    school_name?: string;
    assignment_id?: string;
    due_date?: string;
    achievement_type?: string;
    [key: string]: any;
  };
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
}

export default function NotificationCenter({ isOpen, onClose, userId }: NotificationCenterProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread' | 'course_enrollment'>('all');

  // Set up realtime notifications
  useStudentRealtimeNotifications(userId);

  // Fetch notifications
  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ['studentNotifications'],
    queryFn: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user found');

        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        return data as Notification[];
      } catch (error) {
        frontendLogger.error('Error fetching notifications', { error });
        throw error;
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds as backup to realtime
  });

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentNotifications'] });
    },
    onError: (error) => {
      frontendLogger.error('Error marking notification as read', { error });
    }
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentNotifications'] });
    },
    onError: (error) => {
      frontendLogger.error('Error marking all notifications as read', { error });
    }
  });

  // Delete notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentNotifications'] });
    },
    onError: (error) => {
      frontendLogger.error('Error deleting notification', { error });
    }
  });

  // Filter notifications
  const filteredNotifications = notifications?.filter((notification: any) => {
    switch (filter) {
      case 'unread':
        return !notification.is_read;
      case 'course_enrollment':
        return notification.type === 'course_enrollment';
      default:
        return true;
    }
  }) || [];

  const unreadCount = notifications?.filter((n: any) => !n.is_read).length || 0;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'course_enrollment':
        return <BookOpen className="w-5 h-5 text-blue-600" />;
      case 'assignment_due':
        return <Clock className="w-5 h-5 text-orange-600" />;
      case 'grade_posted':
        return <Award className="w-5 h-5 text-green-600" />;
      case 'system_alert':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'achievement':
        return <Award className="w-5 h-5 text-purple-600" />;
      default:
        return <Info className="w-5 h-5 text-gray-600" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'course_enrollment':
        return 'border-l-blue-500 bg-blue-50';
      case 'assignment_due':
        return 'border-l-orange-500 bg-orange-50';
      case 'grade_posted':
        return 'border-l-green-500 bg-green-50';
      case 'system_alert':
        return 'border-l-red-500 bg-red-50';
      case 'achievement':
        return 'border-l-purple-500 bg-purple-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if not already read
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }

    // Navigate based on notification type
    if (notification.type === 'course_enrollment' && notification.course_id) {
      router.push(`/student/courses/${notification.course_id}`);
      onClose();
    } else if (notification.notification_data?.assignment_id) {
      router.push(`/student/assignments/${notification.notification_data.assignment_id}`);
      onClose();
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-start justify-end">
      <div className="bg-white w-full max-w-md h-full shadow-xl">
        <Card className="h-full rounded-none border-0">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5" />
                <CardTitle className="text-lg">Notifications</CardTitle>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Filter buttons */}
            <div className="flex gap-2 mt-3">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All
              </Button>
              <Button
                variant={filter === 'unread' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('unread')}
              >
                Unread ({unreadCount})
              </Button>
              <Button
                variant={filter === 'course_enrollment' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('course_enrollment')}
              >
                Courses
              </Button>
            </div>

            {/* Action buttons */}
            {unreadCount > 0 && (
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Mark all read
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            <div className="h-[calc(100vh-200px)] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-sm text-gray-600">Loading notifications...</span>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <Bell className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 text-center">
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                  </p>
                  <p className="text-sm text-gray-500 text-center mt-1">
                    {filter === 'unread' 
                      ? 'All caught up!' 
                      : 'New course enrollments and updates will appear here'
                    }
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors border-l-4 ${
                        !notification.is_read ? getNotificationColor(notification.type) : 'border-l-gray-200'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`text-sm font-medium ${
                              !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {notification.title}
                            </h4>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!notification.is_read && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-red-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotificationMutation.mutate(notification.id);
                                }}
                              >
                                <X className="w-3 h-3 text-gray-400 hover:text-red-600" />
                              </Button>
                            </div>
                          </div>
                          
                          <p className={`text-sm mt-1 ${
                            !notification.is_read ? 'text-gray-800' : 'text-gray-600'
                          }`}>
                            {notification.message}
                          </p>
                          
                          {/* Additional notification details */}
                          {notification.notification_data && (
                            <div className="mt-2 space-y-1">
                              {notification.notification_data.course_name && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <BookOpen className="w-3 h-3" />
                                  {notification.notification_data.course_name}
                                </div>
                              )}
                              {notification.notification_data.grade && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Users className="w-3 h-3" />
                                  Grade {notification.notification_data.grade}
                                </div>
                              )}
                              {notification.notification_data.auto_enrolled && (
                                <Badge variant="outline" className="text-xs">
                                  Auto-enrolled
                                </Badge>
                              )}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {formatTimeAgo(notification.created_at)}
                            </span>
                            
                            {(notification.course_id || notification.notification_data?.assignment_id) && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs">
                                <ExternalLink className="w-3 h-3 mr-1" />
                                View
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
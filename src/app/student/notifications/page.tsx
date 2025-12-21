"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { 
  Bell,
  CheckCircle,
  FileText,
  BookOpen,
  AlertCircle,
  Award,
  Calendar,
  X,
  Check,
  Trash2
} from "lucide-react";
import { useStudentNotifications, useMarkNotificationAsRead } from "../../../hooks/useStudentData";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useStudentNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Use smart refresh for tab switching
  useSmartRefresh({
    queryKeys: [['studentNotifications']],
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead.mutateAsync(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!notifications || notifications.length === 0) return;
    
     
    const unreadNotifications = notifications.filter((n: any) => !n.is_read);
    if (unreadNotifications.length === 0) return;

    try {
      // Mark all unread notifications as read
      await Promise.all(
         
        unreadNotifications.map((notif: any) => markAsRead.mutateAsync(notif.id))
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'assignment':
        return <FileText className="h-5 w-5 text-orange-600" />;
      case 'grade':
        return <Award className="h-5 w-5 text-green-600" />;
      case 'course':
        return <BookOpen className="h-5 w-5 text-blue-600" />;
      case 'announcement':
        return <Bell className="h-5 w-5 text-purple-600" />;
      case 'attendance':
        return <Calendar className="h-5 w-5 text-yellow-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-600" />;
    }
  };

  const getNotificationColor = (type: string, isRead: boolean) => {
    if (isRead) return 'bg-gray-50 border-gray-200';
    
    switch (type) {
      case 'assignment':
        return 'bg-orange-50 border-orange-200';
      case 'grade':
        return 'bg-green-50 border-green-200';
      case 'course':
        return 'bg-blue-50 border-blue-200';
      case 'announcement':
        return 'bg-purple-50 border-purple-200';
      case 'attendance':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

   
  const filteredNotifications = notifications?.filter((notif: any) => {
    if (filter === 'unread') return !notif.is_read;
    return true;
  }) || [];

   
  const unreadCount = notifications?.filter((n: any) => !n.is_read).length || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 mt-2">Stay updated with your latest activity</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            {unreadCount} Unread
          </Badge>
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAsRead.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {markAsRead.isPending ? 'Marking...' : 'Mark All as Read'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="all" onClick={() => setFilter('all')}>
            All ({notifications?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="unread" onClick={() => setFilter('unread')}>
            Unread ({unreadCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : filteredNotifications.length > 0 ? (
            <div className="space-y-3">
              {filteredNotifications.map((notification: any) => (
                <Card 
                  key={notification.id}
                  className={`transition-all hover:shadow-md ${getNotificationColor(notification.type, notification.is_read)}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`font-semibold ${!notification.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notification.title}
                          </h3>
                          <div className="flex items-center gap-2">
                            {!notification.is_read && (
                              <div className="w-2 h-2 rounded-full bg-blue-600" />
                            )}
                            <Badge variant="outline" className="text-xs capitalize">
                              {notification.type}
                            </Badge>
                          </div>
                        </div>
                        <p className={`text-sm ${!notification.is_read ? 'text-gray-700' : 'text-gray-600'}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(notification.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12">
                <div className="text-center text-gray-500">
                  <Bell className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                  </p>
                  <p className="text-sm mt-2">
                    {filter === 'unread' 
                      ? 'All caught up! You have no unread notifications.'
                      : 'You don\'t have any notifications yet.'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="unread" className="space-y-4">
          {filteredNotifications.length > 0 ? (
            <div className="space-y-3">
              {filteredNotifications.map((notification: any) => (
                <Card 
                  key={notification.id}
                  className={`transition-all hover:shadow-md ${getNotificationColor(notification.type, notification.is_read)}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">
                            {notification.title}
                          </h3>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-600" />
                            <Badge variant="outline" className="text-xs capitalize">
                              {notification.type}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(notification.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12">
                <div className="text-center text-gray-500">
                  <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-300" />
                  <p className="text-lg font-medium">All caught up!</p>
                  <p className="text-sm mt-2">You have no unread notifications.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

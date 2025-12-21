"use client";

import { useState, useEffect, useCallback } from "react";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { useSchoolAdminRealtimeNotifications } from "../../../hooks/useRealtimeNotifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { 
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "../../../components/ui/tabs";
import { 
  Bell, 
  Send, 
  User,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Info,
  RefreshCw,
  Reply,
  MessageSquare
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "../../../components/ui/dialog";
import { useSchoolAdmin } from "../../../contexts/SchoolAdminContext";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "../../../lib/csrf-client";

// Toast function - simple alert replacement
const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  if (type === 'success') {
    alert(`✅ ${message}`);
  } else {
    alert(`❌ ${message}`);
  }
};

interface Reply {
  id: string;
  notification_id: string;
  user_id: string;
  reply_text: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    id: string;
    full_name: string;
    email: string;
    role: string;
  };
}

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    school_id: string;
  };
  replies?: Reply[];
  reply_count?: number;
}

interface RecipientOption {
  id: string;
  name: string;
  count?: number;
  email?: string;
  role?: string;
  isActive?: boolean;
}

export default function SchoolAdminNotifications() {
  const router = useRouter();
  const { schoolInfo } = useSchoolAdmin();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'view'>('view');

  // Send notification form state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('general');
  const [recipientType, setRecipientType] = useState<'role' | 'individual'>('role');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  // Recipients data
  const [roles, setRoles] = useState<RecipientOption[]>([]);
  const [users, setUsers] = useState<RecipientOption[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // View filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'read' | 'unread'>('all');
  // Default to "received" to avoid showing one row per-recipient when admins broadcast.
  const [notificationMode, setNotificationMode] = useState<'all' | 'sent' | 'received'>('received');

  // Reply dialog state
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('🔍 [Notifications Page] Session check:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        tokenLength: session?.access_token?.length || 0,
        error: sessionError?.message
      });
      
      if (sessionError || !session?.access_token) {
        console.error('❌ [Notifications Page] No session or access token available:', sessionError);
        showToast('Authentication error. Please log in again.', 'error');
        setLoading(false);
        return;
      }
      
      console.log('✅ [Notifications Page] Sending request with Authorization header');
      const response = await fetch(`/api/school-admin/notifications?limit=100&school_id=${schoolInfo?.id || ''}&mode=${notificationMode}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      console.log('📡 [Notifications Page] Response status:', response.status);
      const data = await response.json();
      console.log('📡 [Notifications Page] Response data:', data);

      if (response.ok) {
        // Dedupe notifications for "sent/all" views:
        // The DB stores one notification row per recipient (user_id),
        // so a single broadcast looks like many rows in admin views.
        const rawNotifications: Notification[] = data.notifications || [];
        const normalizedNotifications: (Notification & { recipient_count?: number })[] =
          notificationMode === 'received'
            ? rawNotifications
            : (() => {
                const byKey = new Map<string, (Notification & { recipient_count: number })>();
                for (const n of rawNotifications) {
                  const ts = (n.created_at || '').slice(0, 19); // second-level granularity
                  const key = `${n.type}|${n.title}|${n.message}|${ts}`;
                  const existing = byKey.get(key);
                  if (existing) {
                    existing.recipient_count += 1;
                  } else {
                    byKey.set(key, { ...n, recipient_count: 1 });
                  }
                }
                return Array.from(byKey.values());
              })();

        // Load reply counts for each notification
        const { data: { session: replySession } } = await supabase.auth.getSession();
        const notificationsWithReplies = await Promise.all(
          normalizedNotifications.map(async (notif: any) => {
            const repliesResponse = await fetch(`/api/notifications/reply?notification_id=${notif.id}`, {
              credentials: 'include',
              headers: {
                'Authorization': `Bearer ${replySession?.access_token || ''}`
              }
            });
            const repliesData = await repliesResponse.json();
            return {
              ...notif,
              replies: repliesData.replies || [],
              reply_count: repliesData.replies?.length || 0
            };
          })
        );
        setNotifications(notificationsWithReplies);
      } else {
        showToast(`Failed to load notifications: ${data.error || 'Unknown error'}`, 'error');
      }
     
    } catch (error: any) {
      console.error('Error loading notifications:', error);
      showToast(`Error loading notifications: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [notificationMode, schoolInfo?.id]);

  const loadReplies = async (notificationId: string) => {
    try {
      setLoadingReplies(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        showToast('Authentication error. Please log in again.', 'error');
        setLoadingReplies(false);
        return;
      }
      
      const response = await fetch(`/api/notifications/reply?notification_id=${notificationId}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        setReplies(data.replies || []);
      } else {
        showToast(`Failed to load replies: ${data.error || 'Unknown error'}`, 'error');
      }
     
    } catch (error: any) {
      console.error('Error loading replies:', error);
      showToast(`Error loading replies: ${error.message}`, 'error');
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleViewReplies = async (notification: Notification) => {
    setSelectedNotification(notification);
    setReplyDialogOpen(true);
    await loadReplies(notification.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const loadRecipients = useCallback(async () => {
    try {
      setLoadingRecipients(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.warn('No session available for loading recipients');
        setLoadingRecipients(false);
        return;
      }
      
      const response = await fetch(`/api/school-admin/notifications/recipients?school_id=${schoolInfo?.id || ''}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        setRoles(data.roles || []);
        setUsers(data.users || []);
      }
     
    } catch (error: any) {
      console.error('Error loading recipients:', error);
    } finally {
      setLoadingRecipients(false);
    }
  }, [schoolInfo?.id]);

  // Get school admin user ID for realtime notifications
  const [schoolAdminUserId, setSchoolAdminUserId] = useState<string | undefined>();

  useEffect(() => {
    const getSchoolAdminId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setSchoolAdminUserId(user.id);
    };
    getSchoolAdminId();
  }, []);

  // Set up realtime notifications instead of polling
  useSchoolAdminRealtimeNotifications(schoolAdminUserId, schoolInfo?.id);

  useEffect(() => {
    loadNotifications();
    loadRecipients();
  }, [loadNotifications, loadRecipients]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: () => {
      loadNotifications();
      loadRecipients();
    },
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
    hasUnsavedData: () => {
      // Check if form has unsaved data
      return (title.trim() !== '' || message.trim() !== '') && activeTab === 'send';
    },
  });

  const handleSendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      showToast('Title and message are required', 'error');
      return;
    }

    if (selectedRecipients.length === 0) {
      showToast('Please select at least one recipient', 'error');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        showToast('Authentication error. Please log in again.', 'error');
        setSending(false);
        return;
      }
      
      const response = await fetchWithCsrf('/api/school-admin/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          type,
          recipientType,
          recipients: selectedRecipients,
          school_id: schoolInfo?.id
        })
      });

      const data = await response.json();

      if (response.ok) {
        showToast(`Successfully sent ${data.sent || 0} notifications`, 'success');
        setTitle('');
        setMessage('');
        setType('general');
        setRecipientType('role');
        setSelectedRecipients([]);
        // Reload notifications
        await loadNotifications();
        // Switch to view tab
        setActiveTab('view');
      } else {
        showToast(`Failed to send notification: ${data.error || 'Unknown error'}`, 'error');
      }
     
    } catch (error: any) {
      console.error('Error sending notification:', error);
      showToast(`Error sending notification: ${error.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.warn('No session available for marking as read');
        return;
      }
      
      const response = await fetchWithCsrf(`/api/school-admin/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ is_read: true })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setNotifications(prev =>
          prev.map((n: any) => n.id === notificationId ? { ...n, is_read: true } : n)
        );
      } else {
        showToast(`Failed to mark as read: ${data.error || data.details || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      showToast('Failed to mark as read', 'error');
    }
  };

  const handleRecipientToggle = (id: string) => {
    setSelectedRecipients(prev =>
      prev.includes(id)
        ? prev.filter((r: any) => r !== id)
        : [...prev, id]
    );
  };

  const filteredNotifications = notifications.filter((notification: any) => {
    const matchesSearch = !searchQuery || 
      notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.profiles?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'read' && notification.is_read) ||
      (filterStatus === 'unread' && !notification.is_read);

    return matchesSearch && matchesStatus;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'info': return 'bg-blue-100 text-blue-800';
      case 'success': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
        <p className="text-gray-600 mt-2">Send and manage notifications for your school</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'send' | 'view')}>
        <TabsList>
          <TabsTrigger value="send">Send Notification</TabsTrigger>
          <TabsTrigger value="view">View Sent</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Notification
              </CardTitle>
              <CardDescription>
                Send notifications to teachers, students, or specific users in your school
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
                <Input
                  id="title"
                  placeholder="Enter notification title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message <span className="text-red-500">*</span></Label>
                <Textarea
                  id="message"
                  placeholder="Enter notification message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Recipients <span className="text-red-500">*</span></Label>
                <Select value={recipientType} onValueChange={(v) => {
                  setRecipientType(v as 'role' | 'individual');
                  setSelectedRecipients([]);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">By Role (Teachers, Students)</SelectItem>
                    <SelectItem value="individual">Individual Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recipientType === 'role' && (
                <div className="space-y-2">
                  <Label>Select Roles</Label>
                  {loadingRecipients ? (
                    <p className="text-sm text-gray-500">Loading roles...</p>
                  ) : (
                    <div className="space-y-2 border rounded-lg p-4 max-h-48 overflow-y-auto">
                      {roles.map((role) => (
                        <label key={role.id} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedRecipients.includes(role.id)}
                            onChange={() => handleRecipientToggle(role.id)}
                            className="rounded border-gray-300 text-blue-600"
                          />
                          <span className="text-sm">
                            {role.name} {role.count && `(${role.count})`}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {recipientType === 'individual' && (
                <div className="space-y-2">
                  <Label>Select Users</Label>
                  {loadingRecipients ? (
                    <p className="text-sm text-gray-500">Loading users...</p>
                  ) : (
                    <div className="space-y-2 border rounded-lg p-4 max-h-48 overflow-y-auto">
                      {users.map((user) => (
                        <label key={user.id} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedRecipients.includes(user.id)}
                            onChange={() => handleRecipientToggle(user.id)}
                            className="rounded border-gray-300 text-blue-600"
                          />
                          <span className="text-sm">
                            {user.name} {user.email && `(${user.email})`}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleSendNotification}
                disabled={sending || !title.trim() || !message.trim() || selectedRecipients.length === 0}
                className="w-full"
              >
                {sending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Notification
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="view" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    {notificationMode === 'sent' ? 'Sent Notifications' : 
                     notificationMode === 'received' ? 'Received Notifications' : 
                     'All Notifications'}
                  </CardTitle>
                  <CardDescription>
                    {notificationMode === 'sent' ? 'View all notifications you\'ve sent' :
                     notificationMode === 'received' ? 'View all notifications you\'ve received' :
                     'View all notifications'}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadNotifications}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search notifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as 'all' | 'read' | 'unread')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={notificationMode} onValueChange={(v) => setNotificationMode(v as 'all' | 'sent' | 'received')}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Received by Me</SelectItem>
                    <SelectItem value="sent">Sent (Grouped)</SelectItem>
                    <SelectItem value="all">All (Grouped)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500">Loading notifications...</p>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500">No notifications found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`border rounded-lg p-4 ${notification.is_read ? 'bg-gray-50' : 'bg-white border-blue-200'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getTypeIcon(notification.type)}
                            <h3 
                              className={`font-semibold ${!notification.is_read ? 'font-bold' : ''} text-gray-900 cursor-pointer hover:text-blue-600`}
                              onClick={() => {
                                if (notification.title.toLowerCase().includes('password reset request')) {
                                  router.push('/school-admin/password-reset-requests');
                                }
                              }}
                            >
                              {notification.title}
                            </h3>
                            <Badge className={getTypeColor(notification.type)}>
                              {notification.type}
                            </Badge>
                            {(notification as any).recipient_count && (notification as any).recipient_count > 1 && (
                              <Badge variant="outline" className="bg-gray-50 text-gray-700">
                                {(notification as any).recipient_count} recipients
                              </Badge>
                            )}
                            {!notification.is_read && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                Unread
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                          {notification.title.toLowerCase().includes('password reset request') && (
                            <Button
                              variant="link"
                              size="sm"
                              className="mt-2 p-0 h-auto text-blue-600 hover:text-blue-800"
                              onClick={() => router.push('/school-admin/password-reset-requests')}
                            >
                              View Password Reset Requests →
                            </Button>
                          )}
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {notification.profiles?.full_name || 'Unknown User'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(notification.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {notification.reply_count && notification.reply_count > 0 && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {notification.reply_count}
                            </Badge>
                          )}
                          {!notification.is_read && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkAsRead(notification.id)}
                            >
                              Mark as read
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewReplies(notification)}
                            className="flex items-center gap-1"
                          >
                            <Reply className="h-3 w-3" />
                            View Replies
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Replies Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Replies to &quot;{selectedNotification?.title}&quot;
            </DialogTitle>
            <DialogDescription>
              View all replies to this notification
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {loadingReplies ? (
              <div className="text-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading replies...</p>
              </div>
            ) : replies.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">No replies yet</p>
              </div>
            ) : (
              replies.map((reply) => (
                <Card key={reply.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {reply.profiles?.full_name || 'Unknown User'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {reply.profiles?.role || 'Unknown'}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(reply.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-2">{reply.reply_text}</p>
                  {reply.updated_at !== reply.created_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Edited: {formatDate(reply.updated_at)}
                    </p>
                  )}
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


"use client";

import { useState, useEffect, useCallback } from "react";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { useAdminRealtimeNotifications } from "../../../hooks/useRealtimeNotifications";
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
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../../../components/ui/table";
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
  Eye,
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
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from '../../../lib/csrf-client';
// Toast function - simple alert replacement
const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  // Simple alert for now - can be replaced with a proper toast library
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

export default function NotificationsManagement() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'view'>('view');

  // Send notification form state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('general');
  const [recipientType, setRecipientType] = useState<'all' | 'role' | 'school' | 'individual'>('all');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  // Recipients data
  const [roles, setRoles] = useState<RecipientOption[]>([]);
  const [schools, setSchools] = useState<RecipientOption[]>([]);
  const [users, setUsers] = useState<RecipientOption[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // View filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'read' | 'unread'>('all');
  // Default to "received" to avoid showing one row per-recipient for broadcasts.
  const [notificationMode, setNotificationMode] = useState<'all' | 'sent' | 'received'>('received');

  // Reply dialog state
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const response = await fetchWithCsrf(`/api/admin/notifications?limit=100&mode=${notificationMode}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token || ''}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        // Dedupe notifications for "sent/all" views:
        // The DB stores one notification row per recipient (user_id),
        // so a single broadcast looks like many rows.
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
        const notificationsWithReplies = await Promise.all(
          normalizedNotifications.map(async (notif: any) => {
            const repliesResponse = await fetchWithCsrf(`/api/notifications/reply?notification_id=${notif.id}`, {
              credentials: 'include'
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
  }, [notificationMode]);

  const loadReplies = async (notificationId: string) => {
    try {
      setLoadingReplies(true);
      const response = await fetchWithCsrf(`/api/notifications/reply?notification_id=${notificationId}`, {
        credentials: 'include'
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

  const loadRecipients = useCallback(async () => {
    try {
      setLoadingRecipients(true);
      const response = await fetchWithCsrf('/api/admin/notifications/recipients', {
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        setRoles(data.roles || []);
        setSchools(data.schools || []);
        setUsers(data.users || []);
      }
     
    } catch (error: any) {
      console.error('Error loading recipients:', error);
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  // Set up realtime notifications instead of polling
  useAdminRealtimeNotifications();

  useEffect(() => {
    loadNotifications();
    loadRecipients();
    // Removed polling - using realtime subscriptions instead
  }, [activeTab, loadNotifications, loadRecipients]);

  // Use smart refresh for tab switching
  useSmartRefresh({
    customRefresh: () => {
      if (activeTab === 'view') {
        loadNotifications();
      }
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

    if (recipientType !== 'all' && selectedRecipients.length === 0) {
      showToast('Please select at least one recipient', 'error');
      return;
    }

    try {
      setSending(true);
      const response = await fetchWithCsrf('/api/admin/notifications', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          type,
          recipientType,
          recipients: recipientType === 'all' ? ['all'] : selectedRecipients
        })
      });

      const data = await response.json();

      if (response.ok) {
        showToast(`Notification sent successfully to ${data.recipients} recipients!`);
        
        // Reset form
        setTitle('');
        setMessage('');
        setType('general');
        setRecipientType('all');
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

  const filteredNotifications = notifications.filter((notif: any) => {
    const matchesSearch = !searchQuery || 
      notif.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notif.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notif.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notif.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'read' && notif.is_read) ||
      (filterStatus === 'unread' && !notif.is_read);

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

  const getRecipientCount = () => {
    if (recipientType === 'all') {
      return 'All users';
    }
    if (recipientType === 'role') {
      const selectedRoles = roles.filter((r: any) => selectedRecipients.includes(r.id));
      const totalCount = selectedRoles.reduce((sum: number, role: any) => sum + (role.count || 0), 0);
      return `${totalCount} users (${selectedRoles.map((r: any) => r.name).join(', ')})`;
    }
    if (recipientType === 'school') {
      return `${selectedRecipients.length} school(s)`;
    }
    if (recipientType === 'individual') {
      return `${selectedRecipients.length} user(s)`;
    }
    return '0 users';
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Communicate with all users in the system
          </p>
        </div>
        <Button
          onClick={loadNotifications}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'send'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Send className="h-4 w-4 inline mr-2" />
          Send Notification
        </button>
        <button
          onClick={() => setActiveTab('view')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'view'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Eye className="h-4 w-4 inline mr-2" />
          View Sent ({notifications.length})
        </button>
      </div>

      {/* Send Notification Tab */}
      {activeTab === 'send' && (
        <Card>
          <CardHeader>
            <CardTitle>Send New Notification</CardTitle>
            <CardDescription>
              Send notifications to users based on role, school, or individually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Notification Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Notification Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
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

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Enter notification title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                placeholder="Enter notification message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={1000}
              />
              <p className="text-sm text-muted-foreground">
                {message.length}/1000 characters
              </p>
            </div>

            {/* Recipient Type */}
            <div className="space-y-2">
              <Label htmlFor="recipient-type">Recipients</Label>
              <Select 
                value={recipientType} 
                 
                onValueChange={(value: any) => {
                  setRecipientType(value);
                  setSelectedRecipients([]);
                }}
              >
                <SelectTrigger id="recipient-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="role">By Role</SelectItem>
                  <SelectItem value="school">By School</SelectItem>
                  <SelectItem value="individual">Individual Users</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recipient Selection */}
            {recipientType !== 'all' && (
              <div className="space-y-2">
                <Label>
                  Select {recipientType === 'role' ? 'Roles' : recipientType === 'school' ? 'Schools' : 'Users'}
                </Label>
                <div className="border rounded-md p-4 max-h-64 overflow-y-auto space-y-2">
                  {recipientType === 'role' && (
                    <>
                      {loadingRecipients ? (
                        <p className="text-sm text-muted-foreground">Loading roles...</p>
                      ) : (
                        roles.map((role) => (
                          <label key={role.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded">
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(role.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRecipients([...selectedRecipients, role.id]);
                                } else {
                                  setSelectedRecipients(selectedRecipients.filter((id: any) => id !== role.id));
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm flex-1">{role.name}</span>
                            <Badge variant="outline">{role.count || 0}</Badge>
                          </label>
                        ))
                      )}
                    </>
                  )}

                  {recipientType === 'school' && (
                    <>
                      {loadingRecipients ? (
                        <p className="text-sm text-muted-foreground">Loading schools...</p>
                      ) : (
                        schools.map((school) => (
                          <label key={school.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded">
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(school.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRecipients([...selectedRecipients, school.id]);
                                } else {
                                  setSelectedRecipients(selectedRecipients.filter((id: any) => id !== school.id));
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm flex-1">{school.name}</span>
                            {school.isActive !== false && (
                              <Badge variant="outline" className="bg-green-100">Active</Badge>
                            )}
                          </label>
                        ))
                      )}
                    </>
                  )}

                  {recipientType === 'individual' && (
                    <>
                      {loadingRecipients ? (
                        <p className="text-sm text-muted-foreground">Loading users...</p>
                      ) : (
                        users.map((user) => (
                          <label key={user.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded">
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRecipients([...selectedRecipients, user.id]);
                                } else {
                                  setSelectedRecipients(selectedRecipients.filter((id: any) => id !== user.id));
                                }
                              }}
                              className="rounded"
                            />
                            <div className="flex-1">
                              <span className="text-sm font-medium">{user.name}</span>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                            <Badge variant="outline">{user.role}</Badge>
                          </label>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Recipient Summary */}
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium">Recipients:</p>
              <p className="text-sm text-muted-foreground">{getRecipientCount()}</p>
            </div>

            {/* Send Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSendNotification}
                disabled={sending || !title.trim() || !message.trim()}
                size="lg"
              >
                {sending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Notification
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Notifications Tab */}
      {activeTab === 'view' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search notifications..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                { }
                <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                  </SelectContent>
                </Select>
                { }
                <Select value={notificationMode} onValueChange={(value: any) => setNotificationMode(value)}>
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
            </CardContent>
          </Card>

          {/* Notifications Table */}
          <Card>
            <CardHeader>
              <CardTitle>
                {notificationMode === 'sent' ? 'Sent Notifications' : 
                 notificationMode === 'received' ? 'Received Notifications' : 
                 'All Notifications'}
              </CardTitle>
              <CardDescription>
                {filteredNotifications.length} notification(s) found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Loading notifications...</p>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">No notifications found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Replies</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNotifications.map((notif) => (
                      <TableRow key={notif.id}>
                        <TableCell>
                          {getTypeIcon(notif.type)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p 
                              className={`font-medium ${!notif.is_read ? 'font-semibold' : ''} cursor-pointer hover:text-blue-600`}
                              onClick={() => {
                                if (notif.title.toLowerCase().includes('password reset request')) {
                                  router.push('/admin/password-reset-requests');
                                }
                              }}
                            >
                              {notif.title}
                            </p>
                            {(notif as any).recipient_count && (notif as any).recipient_count > 1 && (
                              <Badge variant="outline" className="mt-1 bg-gray-50 text-gray-700">
                                {(notif as any).recipient_count} recipients
                              </Badge>
                            )}
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {notif.message}
                            </p>
                            {notif.title.toLowerCase().includes('password reset request') && (
                              <Button
                                variant="link"
                                size="sm"
                                className="mt-2 p-0 h-auto text-blue-600 hover:text-blue-800"
                                onClick={() => router.push('/admin/password-reset-requests')}
                              >
                                View Password Reset Requests →
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {notif.profiles ? (
                            <div>
                              <p className="text-sm font-medium">{notif.profiles.full_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{notif.profiles.email}</p>
                              <Badge variant="outline" className="mt-1">{notif.profiles.role}</Badge>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unknown user</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={notif.is_read ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}
                          >
                            {notif.is_read ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Read
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3 mr-1" />
                                Unread
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <MessageSquare className="h-3 w-3" />
                            {notif.reply_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(notif.created_at)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {!notif.is_read && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const session = await supabase.auth.getSession();
                                    const response = await fetch(`/api/notifications/user`, {
                                      method: 'PATCH',
                                      credentials: 'include',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${session.data.session?.access_token || ''}`
                                      },
                                      body: JSON.stringify({
                                        notification_id: notif.id,
                                        user_id: session.data.session?.user?.id,
                                        is_read: true
                                      })
                                    });
                                    if (response.ok) {
                                      await loadNotifications();
                                    }
                                  } catch (error) {
                                    console.error('Error marking notification as read:', error);
                                  }
                                }}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Mark Read
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewReplies(notif)}
                              className="flex items-center gap-1"
                            >
                              <Reply className="h-3 w-3" />
                              View Replies
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

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

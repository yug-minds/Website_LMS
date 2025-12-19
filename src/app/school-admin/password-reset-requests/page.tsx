"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
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
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Eye,
  Trash2,
  AlertCircle
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "../../../components/ui/dialog";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { supabase } from "../../../lib/supabase";
import { fetchWithCsrf } from "../../../lib/csrf-client";

interface PasswordResetRequest {
  id: string;
  user_id: string;
  email: string;
  user_role: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requested_at: string;
  approved_at?: string;
  approved_by?: string;
  school_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    school_id: string;
  };
  schools?: {
    id: string;
    name: string;
  };
}

export default function PasswordResetRequestsPage() {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'completed'>('all');
  const [selectedRequest, setSelectedRequest] = useState<PasswordResetRequest | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'view' | 'delete'>('view');
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const response = await fetch(`/api/school-admin/password-reset-requests?status=${statusFilter}&limit=100`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token || ''}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests || []);
      } else {
        alert(`Failed to load password reset requests: ${data.error || 'Unknown error'}`);
      }
     
    } catch (error: any) {
      console.error('Error loading password reset requests:', error);
      alert(`Error loading password reset requests: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (request: PasswordResetRequest, type: 'approve' | 'reject' | 'delete') => {
    setSelectedRequest(request);
    setActionType(type);
    setNotes('');
    setActionDialogOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedRequest) return;

    try {
      setActionLoading(true);
      const session = await supabase.auth.getSession();
      
      if (actionType === 'delete') {
        // School admins can't delete requests via API, so we'll just reload
        alert('Delete functionality not available for school admins');
        setActionDialogOpen(false);
        return;
      } else {
        const newStatus = actionType === 'approve' ? 'approved' : 'rejected';
        
        // Validate that we have the required data
        if (!selectedRequest?.id) {
          alert('Error: Request ID is missing. Please refresh the page and try again.');
          setActionLoading(false);
          return;
        }
        
        // Get user ID from session
        const userId = session.data.session?.user?.id;
        
        // CRITICAL: For approval, we MUST have a user ID
        if (newStatus === 'approved') {
          if (!userId) {
            console.error('❌ No user ID available for approval');
            alert('Error: Unable to get your user ID. Please log out and log back in, then try again.');
            setActionLoading(false);
            return;
          }
          
          // Validate it's a valid UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(userId)) {
            console.error('❌ User ID is not a valid UUID:', userId);
            alert('Error: Invalid user ID format. Please log out and log back in, then try again.');
            setActionLoading(false);
            return;
          }
        }
        
        // Build request body - ensure all fields are properly formatted
        const requestBody: any = {
          // Ensure id is a string and valid UUID format
          id: String(selectedRequest.id).trim(),
          // Ensure status is exactly one of the valid enum values
          status: newStatus as 'pending' | 'approved' | 'rejected' | 'completed',
        };
        
        // Include approved_by when approving IF we have a valid UUID
        // If not provided, backend will extract from auth token
        if (newStatus === 'approved' && userId) {
          // Ensure approved_by is a string UUID
          const approvedByStr = String(userId).trim();
          
          // Validate UUID format - if invalid, don't send it and let backend extract from token
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(approvedByStr)) {
            requestBody.approved_by = approvedByStr;
            console.log('✅ Including approved_by in request:', approvedByStr);
          } else {
            console.warn('⚠️ User ID is not a valid RFC 4122 UUID, backend will extract from token:', approvedByStr);
            // Don't include approved_by - backend will extract from auth token
          }
        }
        // When rejecting, don't include approved_by at all (field will be undefined, which is fine)
        
        // Only include notes if provided and not empty (remove empty strings)
        if (notes && typeof notes === 'string') {
          const trimmedNotes = notes.trim();
          if (trimmedNotes.length > 0) {
            // Ensure notes don't exceed max length
            if (trimmedNotes.length > 1000) {
              alert('Error: Notes cannot exceed 1000 characters.');
              setActionLoading(false);
              return;
            }
            requestBody.notes = trimmedNotes;
          }
        }
        
        // Final sanitization: remove any undefined, null, or empty string values
        // (except approved_by which should be present when approving)
        Object.keys(requestBody).forEach(key => {
          const value = requestBody[key];
          if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '' && key !== 'approved_by')) {
            delete requestBody[key];
          }
        });
        
        // Validate request body format before sending
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(requestBody.id)) {
          console.error('❌ Invalid request ID format:', requestBody.id);
          alert(`Error: Invalid request ID format. Please refresh the page and try again.`);
          setActionLoading(false);
          return;
        }
        
        if (requestBody.approved_by && !uuidRegex.test(requestBody.approved_by)) {
          console.error('❌ Invalid approved_by UUID format:', requestBody.approved_by);
          alert(`Error: Invalid user ID format. Please log out and log back in, then try again.`);
          setActionLoading(false);
          return;
        }
        
        // Log the request body for debugging BEFORE sending
        console.log('📤 Sending school admin password reset request update:');
        console.log('  Action:', actionType);
        console.log('  Request body:', JSON.stringify(requestBody, null, 2));
        console.log('  Request body keys:', Object.keys(requestBody));
        console.log('  Selected request ID:', selectedRequest.id, '(type:', typeof selectedRequest.id, ')');
        console.log('  Session user ID:', userId, '(type:', typeof userId, ')');
        console.log('  approved_by in request:', requestBody.approved_by || 'NOT SET', '(type:', typeof requestBody.approved_by, ')');
        console.log('  Status:', newStatus, '(type:', typeof newStatus, ')');
        console.log('  Notes:', requestBody.notes || 'NOT SET', '(type:', typeof requestBody.notes, ')');
        
        const response = await fetchWithCsrf('/api/school-admin/password-reset-requests', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token || ''}`
          },
          body: JSON.stringify(requestBody)
        });
        
        console.log('📥 Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });

        let data: any;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ Failed to parse response:', parseError);
          const text = await response.text();
          console.error('Response text:', text);
          alert(`Failed to ${actionType} request: Invalid response from server. Check console for details.`);
          return;
        }

        if (response.ok) {
          alert(`Request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully`);
          await loadRequests();
          setActionDialogOpen(false);
        } else {
          console.error('❌ Request failed:', {
            status: response.status,
            statusText: response.statusText,
            statusCode: response.status,
            data: data,
            requestBody: requestBody
          });
          
          // Build detailed error message
          let errorMsg = data.error || 'Unknown error';
          if (data.details) {
            errorMsg += `\n\nDetails: ${data.details}`;
          }
          if (data.validationIssues && Array.isArray(data.validationIssues) && data.validationIssues.length > 0) {
            const issues = data.validationIssues.map((issue: any) => 
              `  • ${issue.path || 'unknown field'}: ${issue.message}`
            ).join('\n');
            errorMsg += `\n\nValidation Issues:\n${issues}`;
          }
          
          // Show detailed error in alert
          alert(`Failed to ${actionType} request:\n\n${errorMsg}\n\nCheck browser console (F12) for more details.`);
          
          // Also log to console for debugging
          console.error('Full error response:', JSON.stringify(data, null, 2));
          console.error('Request that failed:', JSON.stringify(requestBody, null, 2));
          console.error('Response headers:', Object.fromEntries(response.headers.entries()));
        }
      }
     
    } catch (error: any) {
      console.error('Error performing action:', error);
      alert(`Error: ${error.message || 'Please try again'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-blue-100 text-blue-700"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return <Badge>{status}</Badge>;
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

  const filteredRequests = requests.filter((req: any) => {
    const matchesSearch = !searchQuery || 
      req.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.user_role.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Password Reset Requests</h1>
          <p className="text-muted-foreground mt-1">
            Manage password reset requests for your school
          </p>
        </div>
        <Button
          onClick={loadRequests}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email, name, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Password Reset Requests</CardTitle>
          <CardDescription>
            {filteredRequests.length} request(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Loading requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">No password reset requests found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{request.profiles?.full_name || 'Unknown User'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{request.email}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{request.user_role}</Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(request.status)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(request.requested_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {request.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAction(request, 'approve')}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAction(request, 'reject')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('view');
                            setActionDialogOpen(true);
                          }}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
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

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'view' && 'View Password Reset Request'}
              {actionType === 'approve' && 'Approve Password Reset Request'}
              {actionType === 'reject' && 'Reject Password Reset Request'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'view' && 'View details of the password reset request'}
              {actionType === 'approve' && 'Approve this password reset request. A temporary password will be generated.'}
              {actionType === 'reject' && 'Reject this password reset request'}
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 mt-4">
              {actionType === 'view' && (
                <div className="space-y-2">
                  <div>
                    <Label>User</Label>
                    <p className="text-sm font-medium">{selectedRequest.profiles?.full_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <p className="text-sm">{selectedRequest.email}</p>
                  </div>
                  <div>
                    <Label>Role</Label>
                    <p className="text-sm">{selectedRequest.user_role}</p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                  </div>
                  <div>
                    <Label>Requested At</Label>
                    <p className="text-sm">{formatDate(selectedRequest.requested_at)}</p>
                  </div>
                  {selectedRequest.approved_at && (
                    <div>
                      <Label>Approved At</Label>
                      <p className="text-sm">{formatDate(selectedRequest.approved_at)}</p>
                    </div>
                  )}
                  {selectedRequest.notes && (
                    <div>
                      <Label>Notes</Label>
                      <p className="text-sm whitespace-pre-wrap">{selectedRequest.notes}</p>
                    </div>
                  )}
                </div>
              )}
              {(actionType === 'approve' || actionType === 'reject') && (
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any notes about this action..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancel
            </Button>
            {actionType !== 'view' && (
              <Button
                onClick={confirmAction}
                disabled={actionLoading}
                variant={actionType === 'reject' ? 'destructive' : 'default'}
              >
                {actionLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {actionType === 'approve' && 'Approve'}
                    {actionType === 'reject' && 'Reject'}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


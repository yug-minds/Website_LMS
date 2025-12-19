"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../../../components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "../../../components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "../../../components/ui/select";
import { 
  Switch 
} from "../../../components/ui/switch";
import { 
  Label 
} from "../../../components/ui/label";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Shield,
  Mail,
  Phone,
  Building,
  Calendar,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Briefcase
} from "lucide-react";
import { fetchWithCsrf } from '../../../lib/csrf-client';
import { supabase } from '../../../lib/supabase';
import { useSmartRefresh } from '../../../hooks/useSmartRefresh';
import { useAutoSaveForm } from '../../../hooks/useAutoSaveForm';
import { loadFormData, clearFormData } from '../../../lib/form-persistence';

interface SchoolAdmin {
  id: string;
  profile_id: string | null;
  school_id: string;
  full_name: string;
  email: string;
  phone: string;
  temp_password: string;
  is_active: boolean;
   
  permissions: any;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  schools?: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
}

interface School {
  id: string;
  name: string;
  city: string;
  state: string;
}

export default function SchoolAdminManagement() {
  const [schoolAdmins, setSchoolAdmins] = useState<SchoolAdmin[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<SchoolAdmin | null>(null);
  
  // Load saved form data
  const savedFormData = typeof window !== 'undefined'
    ? loadFormData<{
        full_name: string;
        email: string;
        phone: string;
        school_id: string;
        temp_password: string;
        permissions: any;
      }>('admin-school-admins-form')
    : null;

  const [formData, setFormData] = useState(savedFormData || {
    full_name: "",
    email: "",
    phone: "",
    school_id: "",
    temp_password: "",
    permissions: {}
  });
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Auto-save form
  const { isDirty: isFormDirty, clearSavedData } = useAutoSaveForm({
    formId: 'admin-school-admins-form',
    formData,
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && !savedFormData) {
        setFormData(data);
      }
    },
    markDirty: true,
  });

  // Fetch school admins
  const fetchSchoolAdmins = useCallback(async (customFilters?: { search?: string; status?: string; schoolId?: string }) => {
    try {
      const search = customFilters?.search ?? searchTerm;
      const status = customFilters?.status ?? statusFilter;
      const school = customFilters?.schoolId ?? schoolFilter;
      
      console.log('🔄 Fetching school admins...', { search, status, school });
      setIsLoading(true);
      setConnectionError(false);

      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status && status !== 'all') params.append('status', status);
      if (school && school !== 'all') params.append('schoolId', school);

      // Add timestamp to prevent caching
      const timestamp = Date.now();
      const url = `/api/admin/school-admins?${params.toString()}&_t=${timestamp}`;
      console.log('📡 Fetching from:', url);
      
      let response;
      try {
        response = await fetchWithCsrf(url, {
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        });
      } catch (fetchError) {
        console.error('❌ Fetch error:', fetchError);
        throw new Error(`Failed to fetch: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
      }
      
      if (!response) {
        throw new Error('No response received from server');
      }

      let data;
      try {
        const text = await response.text();
        if (!text || text.trim() === '') {
          throw new Error('Empty response body');
        }
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('❌ Error parsing JSON:', parseError);
        throw new Error(`Failed to parse response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }

      console.log('📥 Response status:', response.status);
      console.log('📥 Response data:', data);

      if (response.ok) {
        // Ensure we only set data that exists - filter out any invalid entries
         
        const admins = (data.schoolAdmins || []).filter((admin: any) => 
          admin && admin.id && admin.email
        );
        
        console.log('✅ School admins fetched:', admins.length, 'admin(s)');
        if (admins.length > 0) {
           
          console.log('📋 School admins data:', admins.map((a: any) => ({
            id: a.id,
            name: a.full_name,
            email: a.email,
            school_id: a.school_id,
            school_name: a.schools?.name
          })));
        } else {
          console.log('ℹ️ No school admins found in database');
        }
        
        // Always set the filtered array, even if empty
        setSchoolAdmins(admins);
      } else {
        console.error('❌ Failed to fetch school admins:', data.error);
        console.error('❌ Error details:', data);
        setConnectionError(true);
        setSchoolAdmins([]);
      }
    } catch (error) {
      console.error('❌ Error fetching school admins:', error);
      setConnectionError(true);
      setSchoolAdmins([]);
    } finally {
      setIsLoading(false);
    }
  }, [schoolFilter, searchTerm, statusFilter]);

  // Fetch schools
  const fetchSchools = useCallback(async () => {
    try {
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json();

      if (response.ok) {
        setSchools(data.schools || []);
      } else {
        console.error('Failed to fetch schools:', data.error);
      }
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  }, []);

  // Load data on component mount
  useEffect(() => {
    // Clear any stale data first
    setSchoolAdmins([]);
    setConnectionError(false);
    
    // Fetch fresh data from database
    fetchSchoolAdmins();
    fetchSchools();
  }, [fetchSchoolAdmins, fetchSchools]);
  
  // Use smart refresh hook for tab switching
  useSmartRefresh({
    customRefresh: async () => {
      console.log('🔄 Smart refresh: refreshing school admins...');
      await fetchSchoolAdmins();
    },
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
    hasUnsavedData: () => {
      // Check if any dialog is open (indicating unsaved changes)
      // Also check if form has unsaved data via Zustand store
      return isAddDialogOpen || isEditDialogOpen || isFormDirty;
    },
  });

  // Refetch when filters change (but skip if we're in the middle of an update)
  useEffect(() => {
    // Skip refetch if we're currently updating a status
    if (actionLoading) {
      return;
    }
    
    const timer = setTimeout(() => {
      fetchSchoolAdmins({ search: searchTerm, status: statusFilter, schoolId: schoolFilter });
    }, 100); // Small delay to debounce filter changes
    
    return () => clearTimeout(timer);
  }, [actionLoading, fetchSchoolAdmins, schoolFilter, searchTerm, statusFilter]);

  // Handle add admin
  const handleAddAdmin = async () => {
    try {
      setActionLoading('add');
      const response = await fetchWithCsrf('/api/admin/school-admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        alert('School admin added successfully!');
        setIsAddDialogOpen(false);
        setFormData({
          full_name: "",
          email: "",
          phone: "",
          school_id: "",
          temp_password: "",
          permissions: {}
        });
        fetchSchoolAdmins();
      } else {
        alert(`Failed to add school admin: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding school admin:', error);
      alert('Error adding school admin');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle edit admin
  const handleEditAdmin = (admin: SchoolAdmin) => {
    setEditingAdmin(admin);
    setFormData({
      full_name: admin.full_name,
      email: admin.email,
      phone: admin.phone,
      school_id: admin.school_id,
      temp_password: admin.temp_password,
      permissions: admin.permissions
    });
    setNewPassword(""); // Reset new password
    setShowNewPassword(false); // Reset new password visibility
    setIsEditDialogOpen(true);
  };

  // Handle change password
  const handleChangePassword = async () => {
    if (!editingAdmin) return;

    if (!newPassword) {
      alert('Please enter a new password');
      return;
    }
    
    // Validate password strength (8+ chars, uppercase, lowercase, number)
    const { validatePasswordClient } = await import('../../../lib/password-validation');
    const passwordError = validatePasswordClient(newPassword);
    if (passwordError) {
      alert(passwordError);
      return;
    }

    if (!confirm(`Are you sure you want to change the password for "${editingAdmin.full_name}"? They will need to use the new password to log in.`)) {
      return;
    }

    try {
      setActionLoading('change-password');
      const response = await fetch(`/api/admin/school-admins`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingAdmin.id,
          temp_password: newPassword,
          change_password: true // Flag to indicate password change
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Password changed successfully for "${editingAdmin.full_name}"!\n\nNew password: ${newPassword}\n\nPlease share this password securely with the school admin.`);
        setNewPassword("");
        setShowNewPassword(false);
        // Refresh the admin list to get updated data
        fetchSchoolAdmins();
      } else {
        const errorMessage = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to change password';
        alert(`Failed to change password: ${errorMessage}`);
        console.error('Password change error:', data);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error changing password: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Generate new password
  const generateNewPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
  };

  // Copy new password to clipboard
  const copyNewPassword = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      alert('Password copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  // Handle update admin
  const handleUpdateAdmin = async () => {
    if (!editingAdmin) return;

    try {
      setActionLoading('edit');
      // Don't include temp_password in regular update (only use it for password change)
      const { temp_password: _tempPassword, ...updateData } = formData;
      void _tempPassword;
      const response = await fetch(`/api/admin/school-admins`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingAdmin.id,
          ...updateData
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('School admin updated successfully!');
        setIsEditDialogOpen(false);
        setEditingAdmin(null);
        setNewPassword("");
        setShowNewPassword(false);
        fetchSchoolAdmins();
      } else {
        const errorMessage = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to update school admin';
        alert(`Failed to update school admin: ${errorMessage}`);
        console.error('Update error:', data);
      }
    } catch (error) {
      console.error('Error updating school admin:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error updating school admin: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle delete admin
  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm('Are you sure you want to delete this school admin?')) return;

    try {
      setActionLoading(adminId);
      const response = await fetchWithCsrf(`/api/admin/school-admins`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: adminId }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('School admin deleted successfully!');
        fetchSchoolAdmins();
      } else {
        alert(`Failed to delete school admin: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting school admin:', error);
      alert('Error deleting school admin');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (admin: SchoolAdmin, newStatus?: boolean) => {
    // Use the provided newStatus or toggle from current status
    const statusToSet = newStatus !== undefined ? newStatus : !admin.is_active;
    
    console.log('🔄 Toggling school admin status:', { 
      adminId: admin.id, 
      currentStatus: admin.is_active, 
      newStatus: statusToSet 
    });
    
    // Optimistically update the UI
    setSchoolAdmins(prev => prev.map((a: any) => 
      a.id === admin.id ? { ...a, is_active: statusToSet } : a
    ));
    
    try {
      setActionLoading(admin.id);
      const response = await fetch(`/api/admin/school-admins`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: admin.id,
          is_active: statusToSet
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ School admin status updated successfully:', { 
          adminId: admin.id, 
          newStatus: statusToSet,
          response: data 
        });
        
        // Update the state with the response data if available
        if (data.schoolAdmin) {
          console.log('📝 Updating state with response data:', data.schoolAdmin.is_active);
          setSchoolAdmins(prev => {
            const updated = prev.map((a: any) => 
              a.id === admin.id ? { ...a, is_active: data.schoolAdmin.is_active } : a
            );
            console.log('✅ State updated:', updated.find((a: any) => a.id === admin.id)?.is_active);
            return updated;
          });
        } else {
          // If no response data, keep the optimistic update
          console.log('⚠️ No response data, keeping optimistic update');
        }
        
        // Don't refresh immediately - it might fetch stale data
        // The optimistic update + response data update should be enough
        // Only refresh if needed after a longer delay
        // setTimeout(() => {
        //   fetchSchoolAdmins();
        // }, 1000);
      } else {
        // Revert optimistic update on error
        setSchoolAdmins(prev => prev.map((a: any) => 
          a.id === admin.id ? { ...a, is_active: admin.is_active } : a
        ));
        console.error('❌ Failed to update school admin status:', data.error);
        alert(`Failed to update school admin status: ${data.error || 'Please try again.'}`);
      }
    } catch (error) {
      // Revert optimistic update on error
      setSchoolAdmins(prev => prev.map((a: any) => 
        a.id === admin.id ? { ...a, is_active: admin.is_active } : a
      ));
      console.error('❌ Error updating school admin status:', error);
      alert('Error updating school admin status. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle input change
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">School Admin Management</h1>
          <p className="text-gray-600 mt-1">Manage school administrators and their access</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              console.log('🔄 Manual refresh triggered');
              fetchSchoolAdmins();
              fetchSchools();
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add School Admin
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Schools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((school) => (
              <SelectItem key={school.id} value={school.id}>
                {school.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* School Admins Table */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>School Administrators ({schoolAdmins.length})</CardTitle>
          <CardDescription>
            Manage school administrators and their permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading school admins...</p>
            </div>
          ) : connectionError ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold text-red-600 mb-2">Connection Error</h3>
              <p className="text-gray-600 mb-4">Failed to load school admins. Please try again.</p>
              <Button onClick={() => fetchSchoolAdmins()}>Retry</Button>
            </div>
          ) : schoolAdmins.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No School Admins Found</h3>
              <p className="text-gray-600 mb-4">Get started by adding a new school administrator.</p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add School Admin
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schoolAdmins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        {admin.full_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        {admin.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        {admin.phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-gray-400" />
                        {admin.schools?.name || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={admin.is_active === true}
                          onCheckedChange={(checked) => {
                            console.log('🔄 Switch clicked:', { adminId: admin.id, currentStatus: admin.is_active, newStatus: checked });
                            handleToggleStatus(admin, checked);
                          }}
                          disabled={actionLoading === admin.id}
                        />
                        <Badge variant={admin.is_active ? "default" : "secondary"}>
                          {admin.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {new Date(admin.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditAdmin(admin)}
                          disabled={actionLoading === admin.id}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteAdmin(admin.id)}
                          disabled={actionLoading === admin.id}
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Add Admin Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Add School Admin</DialogTitle>
            <DialogDescription>
              Create a new school administrator account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                placeholder="Enter full name"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter email address"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <Label htmlFor="school_id">School</Label>
              <Select value={formData.school_id} onValueChange={(value) => handleInputChange('school_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="temp_password">Temporary Password</Label>
              <Input
                id="temp_password"
                type="password"
                value={formData.temp_password}
                onChange={(e) => handleInputChange('temp_password', e.target.value)}
                placeholder="Enter temporary password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddAdmin}
              disabled={actionLoading === 'add'}
            >
              {actionLoading === 'add' ? 'Adding...' : 'Add Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Admin Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Edit School Admin</DialogTitle>
            <DialogDescription>
              Update school administrator information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input
                id="edit_full_name"
                value={formData.full_name}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                placeholder="Enter full name"
              />
            </div>
            <div>
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter email address"
              />
            </div>
            <div>
              <Label htmlFor="edit_phone">Phone</Label>
              <Input
                id="edit_phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <Label htmlFor="edit_school_id">School</Label>
              <Select value={formData.school_id} onValueChange={(value) => handleInputChange('school_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Change Current Password</Label>
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  Use this to reset the password if the school admin has forgotten it. A new password will be generated and assigned.
                </p>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="new_password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8: uppercase, lowercase, number)"
                    className="pl-10 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateNewPassword}
                    className="flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Generate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyNewPassword}
                    disabled={!newPassword}
                    className="flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={!newPassword || newPassword.length < 8 || actionLoading === 'change-password'}
                    className="flex items-center gap-1"
                  >
                    {actionLoading === 'change-password' ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-3 w-3" />
                        Change Password
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateAdmin}
              disabled={actionLoading === 'edit'}
            >
              {actionLoading === 'edit' ? 'Updating...' : 'Update Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

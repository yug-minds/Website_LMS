"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { fetchWithCsrf } from "../../../lib/csrf-client";
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
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  School,
  Search,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Building,
  MapPin,
  Phone,
  Mail,
  User,
  Calendar,
  BookOpen,
  Users,
  GraduationCap,
  Power,
  PowerOff,
  Settings,
  Key
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "../../../components/ui/dialog";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import AddSchoolDialog from "../../../components/AddSchoolDialog";
import JoiningCodesDialog from "../../../components/JoiningCodesDialog";

interface School {
  id: string;
  name: string;
  school_code?: string;
  join_code?: string;
  school_email?: string;
  school_admin_id?: string;
  school_admin_name?: string;
  school_admin_email?: string;
  address: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  contact_email: string;
  contact_phone: string;
  principal_name: string;
  affiliation_type?: string;
  school_type?: string;
  established_year?: number;
  logo_url?: string;
  grades_offered?: string[];
  total_students_estimate?: number;
  total_teachers_estimate?: number;
  status?: string;
   
  joining_codes: any;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export default function SchoolsManagement() {
  const [schools, setSchools] = useState<School[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [joiningCodesDialog, setJoiningCodesDialog] = useState<{isOpen: boolean, schoolId: string, schoolName: string}>({
    isOpen: false,
    schoolId: '',
    schoolName: ''
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<School>>({});

  const fetchSchools = async () => {
    try {
      setIsLoading(true);
      setConnectionError(false);

      // Use API route instead of direct Supabase client
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch schools' }));
        console.error('Error fetching schools:', errorData.error);
        setConnectionError(true);
        return;
      }

      const data = await response.json();
      setSchools(data.schools || []);
    } catch (error) {
      console.error('Error fetching schools:', error);
      setConnectionError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  const handleDeleteSchool = async (schoolId: string) => {
    if (!confirm('Are you sure you want to delete this school? This action cannot be undone. This will delete all associated school admins, teachers, and students. Courses will be preserved but their school association will be removed.')) {
      return;
    }

    try {
      setActionLoading(schoolId);
      
      // Use API route instead of direct Supabase client call
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schoolId: schoolId || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Error deleting school:', data.error);
        const errorMessage = data.error || data.details || 'Failed to delete school';
        alert(`Error: ${errorMessage}`);
        setActionLoading(null);
        return;
      }

      // Remove from local state
      setSchools(prev => prev.filter((school: any) => school.id !== schoolId));
      alert('School deleted successfully!');
    } catch (error) {
      console.error('Error deleting school:', error);
      alert('Failed to delete school. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSchoolStatus = async (schoolId: string, currentStatus: boolean) => {
    try {
      setActionLoading(schoolId);
      
      // Use API route instead of direct Supabase client
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          schoolId, 
          is_active: !currentStatus 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update school status' }));
        console.error('Error updating school status:', errorData.error);
        alert(`Failed to update school status: ${errorData.error || 'Please try again.'}`);
        return;
      }

      const data = await response.json();

      // Update local state
      setSchools(prev => prev.map((school: any) => 
        school.id === schoolId 
          ? { ...school, is_active: !currentStatus }
          : school
      ));
      
      alert('School status updated successfully!');
    } catch (error) {
      console.error('Error updating school status:', error);
      alert('Failed to update school status. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSchool = (school: School) => {
    setEditingSchool(school);
    setEditFormData({
      name: school.name,
      contact_email: school.contact_email,
      contact_phone: school.contact_phone,
      address: school.address,
      city: school.city || '',
      state: school.state || '',
      pincode: school.pincode || '',
      affiliation_type: school.affiliation_type || '',
      school_type: school.school_type || '',
      established_year: school.established_year || new Date().getFullYear(),
      total_students_estimate: school.total_students_estimate || 0,
      total_teachers_estimate: school.total_teachers_estimate || 0,
      grades_offered: school.grades_offered || []
    });
    setEditDialogOpen(true);
  };

  const handleUpdateSchool = async () => {
    if (!editingSchool) return;

    try {
      setActionLoading(editingSchool.id);
      
      // Use API route instead of direct Supabase client
      const response = await fetchWithCsrf('/api/admin/schools', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schoolId: editingSchool.id,
          name: editFormData.name,
          contact_email: editFormData.contact_email,
          contact_phone: editFormData.contact_phone,
          address: editFormData.address,
          city: editFormData.city,
          state: editFormData.state,
          pincode: editFormData.pincode,
          affiliation_type: editFormData.affiliation_type,
          school_type: editFormData.school_type,
          established_year: editFormData.established_year,
          total_students_estimate: editFormData.total_students_estimate,
          total_teachers_estimate: editFormData.total_teachers_estimate,
          grades_offered: editFormData.grades_offered,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update school' }));
        console.error('Error updating school:', errorData.error);
        alert(`Failed to update school: ${errorData.error || 'Please try again.'}`);
        return;
      }

      const data = await response.json();

      // Update local state
      setSchools(prev => prev.map((school: any) => 
        school.id === editingSchool.id 
          ? { ...school, ...editFormData, ...data.school }
          : school
      ));

      setEditDialogOpen(false);
      setEditingSchool(null);
      setEditFormData({});
      alert('School updated successfully!');
    } catch (error) {
      console.error('Error updating school:', error);
      alert('Failed to update school. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredSchools = schools.filter((school: any) => 
    school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    school.contact_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    school.school_admin_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    school.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    school.state?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (school: School) => {
    if (school.is_active) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
      } else {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <AlertCircle className="h-3 w-3 mr-1" />
          Inactive
        </Badge>
      );
    }
  };

  if (connectionError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Connection Error</h3>
            <p className="text-gray-600 mb-4">Unable to connect to the database. Please check your connection and try again.</p>
            <Button onClick={fetchSchools} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
            <div>
          <h1 className="text-3xl font-bold text-gray-900">Schools Management</h1>
          <p className="text-gray-600 mt-1">Manage schools, school admins, and joining codes</p>
            </div>
          </div>

      {/* Search and Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
              placeholder="Search schools by name, email, admin, city, or state..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add School
                </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schools Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="h-5 w-5" />
            Schools ({filteredSchools.length})
          </CardTitle>
          <CardDescription>
            Manage all registered schools and their joining codes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading schools...</span>
            </div>
          ) : filteredSchools.length === 0 ? (
            <div className="text-center py-12">
              <School className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm ? 'No schools found' : 'No schools registered'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm 
                  ? 'Try adjusting your search terms' 
                  : 'Get started by adding your first school'
                }
              </p>
              {!searchTerm && (
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add School
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School Information</TableHead>
                  <TableHead>Status & Codes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSchools.map((school) => (
                  <TableRow key={school.id}>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{school.name}</span>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            {school.contact_email}
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            {school.contact_phone}
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3" />
                            {school.address}
                            {school.city && `, ${school.city}`}
                            {school.state && `, ${school.state}`}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            Established {school.established_year || 'N/A'}
                          </div>
                          {school.grades_offered && school.grades_offered.length > 0 && (
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-3 w-3" />
                              {school.grades_offered.length} grades
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        {getStatusBadge(school)}
                        {school.grades_offered && school.grades_offered.length > 0 && (
                          <div className="text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Key className="h-3 w-3" />
                              {school.grades_offered.length} joining codes
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setJoiningCodesDialog({
                            isOpen: true,
                            schoolId: school.id,
                            schoolName: school.name
                          })}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Key className="h-4 w-4 mr-1" />
                          Manage Joining Codes
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditSchool(school)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleSchoolStatus(school.id, school.is_active)}
                          disabled={actionLoading === school.id}
                        >
                          {school.is_active ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSchool(school.id)}
                          disabled={actionLoading === school.id}
                          className="text-red-600 hover:text-red-700"
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

      {/* Add School Dialog */}
      <AddSchoolDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={() => {
          setIsDialogOpen(false);
          fetchSchools();
        }}
      />

      {/* Joining Codes Dialog */}
      <JoiningCodesDialog
        isOpen={joiningCodesDialog.isOpen}
        onClose={() => setJoiningCodesDialog({isOpen: false, schoolId: '', schoolName: ''})}
        schoolId={joiningCodesDialog.schoolId || ''}
        schoolName={joiningCodesDialog.schoolName}
      />

      {/* Edit School Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
                <DialogHeader>
            <DialogTitle>Edit School Details</DialogTitle>
                  <DialogDescription>
              Update the school information and settings
                  </DialogDescription>
                </DialogHeader>
            
          <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="edit-name">School Name *</Label>
                    <Input
                  id="edit-name"
                  value={editFormData.name || ''}
                  onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                      placeholder="Enter school name"
                    />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="edit-email">School Email *</Label>
                    <Input
                  id="edit-email"
                      type="email"
                  value={editFormData.contact_email || ''}
                  onChange={(e) => setEditFormData({...editFormData, contact_email: e.target.value})}
                      placeholder="info@school.edu"
                    />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="edit-phone">Contact Phone *</Label>
                    <Input
                  id="edit-phone"
                  value={editFormData.contact_phone || ''}
                  onChange={(e) => setEditFormData({...editFormData, contact_phone: e.target.value})}
                      placeholder="+91 9876543210"
                    />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="edit-year">Established Year</Label>
                    <Input
                  id="edit-year"
                      type="number"
                  value={editFormData.established_year || ''}
                  onChange={(e) => setEditFormData({...editFormData, established_year: parseInt(e.target.value) || new Date().getFullYear()})}
                  placeholder="2024"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
              <Label htmlFor="edit-address">Address *</Label>
                  <Textarea
                id="edit-address"
                value={editFormData.address || ''}
                onChange={(e) => setEditFormData({...editFormData, address: e.target.value})}
                placeholder="Enter complete address"
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="edit-city">City</Label>
                    <Input
                  id="edit-city"
                  value={editFormData.city || ''}
                  onChange={(e) => setEditFormData({...editFormData, city: e.target.value})}
                  placeholder="Enter city"
                    />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="edit-state">State</Label>
                    <Input
                  id="edit-state"
                  value={editFormData.state || ''}
                  onChange={(e) => setEditFormData({...editFormData, state: e.target.value})}
                  placeholder="Enter state"
                    />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="edit-pincode">Pincode</Label>
                  <Input
                  id="edit-pincode"
                  value={editFormData.pincode || ''}
                  onChange={(e) => setEditFormData({...editFormData, pincode: e.target.value})}
                  placeholder="123456"
                  />
                </div>
            </div>
              
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="edit-affiliation">Affiliation Type</Label>
                    <Input
                  id="edit-affiliation"
                  value={editFormData.affiliation_type || ''}
                  onChange={(e) => setEditFormData({...editFormData, affiliation_type: e.target.value})}
                  placeholder="CBSE, ICSE, etc."
                    />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="edit-type">School Type</Label>
                    <Input
                  id="edit-type"
                  value={editFormData.school_type || ''}
                  onChange={(e) => setEditFormData({...editFormData, school_type: e.target.value})}
                  placeholder="Private, Public, etc."
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="edit-students">Total Students (Estimate)</Label>
                    <Input
                  id="edit-students"
                      type="number"
                  value={editFormData.total_students_estimate || ''}
                  onChange={(e) => setEditFormData({...editFormData, total_students_estimate: parseInt(e.target.value) || 0})}
                  placeholder="100"
                    />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="edit-teachers">Total Teachers (Estimate)</Label>
                    <Input
                  id="edit-teachers"
                      type="number"
                  value={editFormData.total_teachers_estimate || ''}
                  onChange={(e) => setEditFormData({...editFormData, total_teachers_estimate: parseInt(e.target.value) || 0})}
                  placeholder="10"
                    />
                  </div>
                </div>
          </div>
            
                <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
              <Button 
              onClick={handleUpdateSchool}
              disabled={actionLoading === editingSchool?.id}
              >
              {actionLoading === editingSchool?.id ? 'Updating...' : 'Update School'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
    </div>
  );
}

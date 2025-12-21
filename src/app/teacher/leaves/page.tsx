"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTeacherSchool } from "../context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Checkbox } from "../../../components/ui/checkbox";
import { Badge } from "../../../components/ui/badge";
import { 
  useTeacherLeaves, 
  useApplyLeave 
} from "../../../hooks/useTeacherData";
import { useAutoSaveForm } from "../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../lib/form-persistence";
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

/**
 * Leave Application Page
 * 
 * Allows teachers to apply for leave.
    * Leave requests go to both School Admin and System Admin for approval.
    * Both admins can approve or reject leave requests.
    * When approved/rejected, attendance records are automatically updated.
 */
export default function LeavesPage() {
  const router = useRouter();
  const { selectedSchool } = useTeacherSchool();
  
  // Load saved leave form data
  const savedFormData = typeof window !== 'undefined' && selectedSchool?.id
    ? loadFormData<{
        start_date: string;
        end_date: string;
        reason: string;
        substitute_required: boolean;
      }>(`teacher-leave-form-${selectedSchool.id}`)
    : null;

  const [formData, setFormData] = useState(savedFormData || {
    start_date: '',
    end_date: '',
    reason: '',
    substitute_required: false
  });

  // Auto-save leave form
  const { isDirty: isLeaveFormDirty, clearSavedData } = useAutoSaveForm({
    formId: selectedSchool?.id ? `teacher-leave-form-${selectedSchool.id}` : 'temp-leave-form',
    formData,
    autoSave: !!selectedSchool?.id,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && selectedSchool?.id && !savedFormData) {
        setFormData(data);
      }
    },
    markDirty: true,
  });

  const { data: leaves, isLoading: leavesLoading } = useTeacherLeaves(selectedSchool?.id);
  const applyLeave = useApplyLeave();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSchool) {
      alert('Please select a school first');
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      alert('Please select start and end dates');
      return;
    }

    if (!formData.reason.trim()) {
      alert('Please provide a reason for leave');
      return;
    }

    // Validate dates
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    if (start > end) {
      alert('End date must be after start date');
      return;
    }

    try {
      await applyLeave.mutateAsync({
        school_id: selectedSchool.id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason,
        substitute_required: formData.substitute_required
      });

      // Clear saved form data after successful submission
      if (selectedSchool?.id) {
        clearFormData(`teacher-leave-form-${selectedSchool.id}`);
        clearSavedData();
      }

      // Reset form
      setFormData({
        start_date: '',
        end_date: '',
        reason: '',
        substitute_required: false
      });

      alert('Leave request submitted successfully! It will be reviewed by your School Admin and System Admin.');
     
    } catch (error: any) {
      alert('Error submitting leave request: ' + (error.message || 'Unknown error'));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'Rejected':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'Pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const calculateDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays;
    }
    return 0;
  };

  if (!selectedSchool) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
              <p className="text-lg font-medium">No school selected</p>
              <p className="text-sm text-gray-600 mt-2">
                Please select a school from the dropdown to apply for leave.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Leave Requests</h1>
        <p className="text-gray-600 mt-2">
          Apply for leave or view your leave history for {selectedSchool.name}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Apply for Leave Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Apply for Leave</CardTitle>
              <CardDescription>
                Submit a leave request. Your School Admin and System Admin will review and approve or reject it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date *</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">End Date *</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      min={formData.start_date || new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                </div>

                {/* Days Calculation */}
                {calculateDays() > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-800">
                      <Calendar className="h-4 w-4 inline mr-2" />
                      Total days: <strong>{calculateDays()} day(s)</strong>
                    </p>
                  </div>
                )}

                {/* Reason */}
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Leave *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Please provide a reason for your leave request..."
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    rows={4}
                    required
                  />
                </div>

                {/* Substitute Required */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="substitute_required"
                    checked={formData.substitute_required}
                    onCheckedChange={(checked) => setFormData({ ...formData, substitute_required: checked as boolean })}
                  />
                  <Label htmlFor="substitute_required" className="cursor-pointer">
                    Substitute teacher required
                  </Label>
                </div>

                {/* Submit Button */}
                <div className="flex items-center gap-4">
                  <Button
                    type="submit"
                    disabled={applyLeave.isPending || !formData.start_date || !formData.end_date || !formData.reason.trim()}
                    className="flex-1"
                  >
                    {applyLeave.isPending ? 'Submitting...' : 'Submit Leave Request'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Leave History */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Leave History</CardTitle>
              <CardDescription>Your recent leave requests</CardDescription>
            </CardHeader>
            <CardContent>
              {leavesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : leaves && leaves.length > 0 ? (
                <div className="space-y-3">
                  {leaves.slice(0, 5).map((leave: any) => (
                    <div
                      key={leave.id}
                      className="p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            {leave.total_days || 0} day(s)
                          </p>
                        </div>
                        {getStatusBadge(leave.status)}
                      </div>
                      {leave.reason && (
                        <p className="text-xs text-gray-500 line-clamp-2 mt-2">
                          {leave.reason}
                        </p>
                      )}
                      {leave.reviewed_at && (
                        <p className="text-xs text-gray-400 mt-2">
                          Reviewed: {new Date(leave.reviewed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No leave requests yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

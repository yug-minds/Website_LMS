"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "./ui/dialog";
import { 
  Key,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  AlertCircle,
  CheckCircle,
  Plus,
  Edit,
  Save,
  Trash2,
  Loader2
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "./ui/table";
import { fetchWithCsrf } from "../lib/csrf-client";

interface JoiningCode {
  id: string;
  code: string;
  school_id: string;
  grade: string;
  is_active: boolean;
  usage_type: 'single' | 'multiple';
  times_used: number;
  max_uses: number | null;
  expires_at: string;
  created_at: string;
  updated_at?: string;
}

interface JoiningCodesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: string;
  schoolName: string;
}

// Standard available grades from Kindergarten to Grade 12
const availableGrades = [
  'Pre-K', 'Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
];

export default function JoiningCodesDialog({ isOpen, onClose, schoolId, schoolName }: JoiningCodesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState<JoiningCode[]>([]);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [schoolGrades, setSchoolGrades] = useState<string[]>([]);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editedCodes, setEditedCodes] = useState<Record<string, Partial<JoiningCode>>>({});
  
  // Add new code form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [newCodeUsageType, setNewCodeUsageType] = useState<'single' | 'multiple'>('multiple');
  const [newCodeMaxUses, setNewCodeMaxUses] = useState<number | null>(null);
  
  // Notification state
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && schoolId) {
      fetchCodes();
      fetchSchoolGrades();
      setShowAddForm(false);
      setEditingCode(null);
      setEditedCodes({});
    }
  }, [isOpen, schoolId]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/joining-codes?schoolId=${schoolId || 'undefined'}`);
      if (response.ok) {
        const data = await response.json();
        setCodes(data.codes || data.joinCodes || []);
      } else {
        showNotification('error', 'Failed to fetch joining codes');
      }
    } catch (error) {
      console.error('Error fetching codes:', error);
      showNotification('error', 'Failed to fetch joining codes');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchoolGrades = async () => {
    try {
      const response = await fetch(`/api/admin/schools`);
      if (response.ok) {
        const data = await response.json();
         
        const school = data.schools?.find((s: any) => s.id === schoolId);
        if (school && school.grades_offered) {
          setSchoolGrades(school.grades_offered);
        }
      }
    } catch (error) {
      console.error('Error fetching school grades:', error);
    }
  };

  // Get available grades (grades without active codes)
  const getAvailableGrades = () => {
    const gradesWithCodes = codes.filter((c: any) => c.is_active).map((c: any) => c.grade);
    return schoolGrades.filter((grade: any) => !gradesWithCodes.includes(grade));
  };

  const handleGradeToggle = (grade: string) => {
    setSelectedGrades(prev => {
      if (prev.includes(grade)) {
        return prev.filter((g: any) => g !== grade);
      } else {
        return [...prev, grade];
      }
    });
  };

  const generateCodesForGrades = async () => {
    if (selectedGrades.length === 0) {
      showNotification('error', 'Please select at least one grade');
      return;
    }

    // Warn if any selected grade already has an active code, but allow generation
    const gradesWithCodes = selectedGrades.filter((grade: any) => {
      const existingCode = codes.find((c: any) => c.grade === grade && c.is_active);
      return existingCode !== undefined;
    });

    if (gradesWithCodes.length > 0) {
      const proceed = confirm(
        `The following grades already have active codes: ${gradesWithCodes.join(', ')}\n\n` +
        `New codes will be created for these grades. The existing codes will remain active.\n\n` +
        `Do you want to continue?`
      );
      if (!proceed) {
        return;
      }
    }

    setGenerating(true);
    try {
      const response = await fetchWithCsrf('/api/admin/joining-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schoolId,
          grades: selectedGrades,
          usageType: newCodeUsageType,
          maxUses: newCodeMaxUses
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const generatedCount = Object.keys(data.codes || {}).length;
        showNotification('success', `Successfully generated ${generatedCount} joining code(s) for ${generatedCount === 1 ? selectedGrades[0] : `${generatedCount} grades`}!`);
        setSelectedGrades([]);
        setNewCodeUsageType('multiple');
        setNewCodeMaxUses(null);
        setShowAddForm(false);
        fetchCodes();
      } else {
        const errorData = await response.json();
        showNotification('error', errorData.error || 'Failed to generate codes');
      }
    } catch (error) {
      console.error('Error generating codes:', error);
      showNotification('error', 'Failed to generate codes');
    } finally {
      setGenerating(false);
    }
  };

  const handleUsageTypeToggle = async (code: JoiningCode, newUsageType: 'single' | 'multiple') => {
    try {
      const response = await fetchWithCsrf('/api/admin/joining-codes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codeId: code.id,
          usageType: newUsageType
        }),
      });

      if (response.ok) {
        showNotification('success', `Usage type updated to ${newUsageType === 'single' ? 'single-use' : 'multiple-use'}`);
        fetchCodes();
      } else {
        const errorData = await response.json();
        showNotification('error', errorData.error || 'Failed to update usage type');
      }
    } catch (error) {
      console.error('Error updating usage type:', error);
      showNotification('error', 'Failed to update usage type');
    }
  };

  const handleCodeStatusToggle = async (code: JoiningCode, isActive: boolean) => {
    try {
      const response = await fetchWithCsrf('/api/admin/joining-codes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code.code,
          isActive
        }),
      });

      if (response.ok) {
        showNotification('success', `Code ${isActive ? 'activated' : 'deactivated'} successfully`);
        fetchCodes();
      } else {
        const errorData = await response.json();
        showNotification('error', errorData.error || 'Failed to toggle code status');
      }
    } catch (error) {
      console.error('Error toggling code status:', error);
      showNotification('error', 'Failed to toggle code status');
    }
  };

   
  const handleCodeEdit = (codeId: string, field: keyof JoiningCode, value: any) => {
    setEditingCode(codeId);
    setEditedCodes(prev => ({
      ...prev,
      [codeId]: {
        ...prev[codeId],
        [field]: value
      }
    }));
  };

  const saveCodeEdit = async (code: JoiningCode) => {
    const edited = editedCodes[code.id];
    if (!edited || Object.keys(edited).length === 0) {
      setEditingCode(null);
      return;
    }

    // Validate code format if changed
    if (edited.code && edited.code.trim() === '') {
      showNotification('error', 'Code cannot be empty');
      return;
    }

    try {
      const response = await fetchWithCsrf('/api/admin/joining-codes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codeId: code.id,
          code: edited.code || code.code,
          usageType: edited.usage_type || code.usage_type,
          maxUses: edited.max_uses !== undefined ? edited.max_uses : code.max_uses,
          expiresAt: edited.expires_at || code.expires_at
        }),
      });

      if (response.ok) {
        showNotification('success', 'Code updated successfully!');
        setEditingCode(null);
        setEditedCodes(prev => {
          const newState = { ...prev };
          delete newState[code.id];
          return newState;
        });
        fetchCodes();
      } else {
        const errorData = await response.json();
        showNotification('error', errorData.error || 'Failed to update code');
      }
    } catch (error) {
      console.error('Error updating code:', error);
      showNotification('error', 'Failed to update code');
    }
  };

  const cancelEdit = (codeId: string) => {
    setEditingCode(null);
    setEditedCodes(prev => {
      const newState = { ...prev };
      delete newState[codeId];
      return newState;
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification('success', `${label} copied to clipboard!`);
    } catch (err) {
      console.error('Failed to copy: ', err);
      showNotification('error', 'Failed to copy to clipboard');
    }
  };

  const regenerateCode = async (code: JoiningCode) => {
    if (!confirm(`Are you sure you want to regenerate the code for ${code.grade}? This will deactivate the current code and create a new one.`)) {
      return;
    }

    setRegenerating(code.id);
    try {
      const response = await fetchWithCsrf('/api/admin/joining-codes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code.code,
          schoolId,
          grade: code.grade
        }),
      });

      if (response.ok) {
        showNotification('success', 'Code regenerated successfully');
        fetchCodes();
      } else {
        const errorData = await response.json();
        showNotification('error', errorData.error || 'Failed to regenerate code');
      }
    } catch (error) {
      console.error('Error regenerating code:', error);
      showNotification('error', 'Failed to regenerate code');
    } finally {
      setRegenerating(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Key className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-gray-900">
                  Manage Joining Codes
                </DialogTitle>
                <DialogDescription className="text-gray-600 mt-1">
                  Create, edit, and manage joining codes for {schoolName}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Notification */}
        {notification && (
          <div className={`p-3 rounded-lg mb-4 flex items-center gap-2 ${
            notification.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNotification(null)}
              className="ml-auto h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading joining codes...</span>
            </div>
          ) : (
            <>
              {/* Add New Code Section */}
              {!showAddForm ? (
                <Card className="bg-white border-2 border-dashed border-blue-200 hover:border-blue-300 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Plus className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">Add New Joining Codes</h3>
                            <p className="text-sm text-gray-600 mt-1">
                              Generate joining codes for one or multiple grades
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Add Code button clicked');
                          console.log('School grades:', schoolGrades);
                          console.log('Available grades:', getAvailableGrades());
                          console.log('Current codes:', codes);
                          setShowAddForm(true);
                        }}
                        className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
                        title="Click to add new joining codes for any grade"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Code
                      </Button>
                    </div>
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        You can generate joining codes for any grade from Pre-K to Grade 12. 
                        {schoolGrades.length > 0 && (
                          <span> This school is configured for: {schoolGrades.join(', ')}.</span>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-white border-2 border-blue-300">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Key className="h-5 w-5 text-blue-600" />
                          Generate New Joining Codes
                        </CardTitle>
                        <CardDescription>
                          Select grades and configure settings to generate joining codes
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false);
                          setSelectedGrades([]);
                          setNewCodeUsageType('multiple');
                          setNewCodeMaxUses(null);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Grade Selection */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          Select Grades <span className="text-red-500">*</span>
                        </Label>
                        <Badge variant="outline" className="text-xs">
                          {availableGrades.length} grades available
                        </Badge>
                      </div>
                      <div className="p-4 border rounded-lg bg-gray-50 max-h-[400px] overflow-y-auto">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {availableGrades.map((grade) => {
                            const hasActiveCode = codes.some((c: any) => c.grade === grade && c.is_active);
                            const isSchoolGrade = schoolGrades.includes(grade);
                            return (
                              <div key={grade} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`grade-${grade}`}
                                  checked={selectedGrades.includes(grade)}
                                  onCheckedChange={() => handleGradeToggle(grade)}
                                />
                                <Label 
                                  htmlFor={`grade-${grade}`} 
                                  className="text-sm font-normal cursor-pointer flex items-center gap-2"
                                >
                                  {grade}
                                  {hasActiveCode && (
                                    <Badge variant="secondary" className="ml-1 text-xs">
                                      Has code
                                    </Badge>
                                  )}
                                  {!isSchoolGrade && (
                                    <Badge variant="outline" className="ml-1 text-xs text-amber-600">
                                      Not in school
                                    </Badge>
                                  )}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {selectedGrades.length > 0 && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800 font-medium">
                            ✓ {selectedGrades.length} grade(s) selected: {selectedGrades.join(', ')}
                          </p>
                          {selectedGrades.some((g: any) => !schoolGrades.includes(g)) && (
                            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Some selected grades are not configured for this school. Codes will still be generated.
                            </p>
                          )}
                        </div>
                      )}
                      {selectedGrades.length === 0 && (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                          <p className="text-xs text-gray-600">
                            Select one or more grades to generate joining codes. You can select from Pre-K to Grade 12.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Usage Type Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-lg bg-gray-50">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Usage Type</Label>
                        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
                          <span className="text-sm text-gray-700 font-medium">Single Use</span>
                          <Switch
                            checked={newCodeUsageType === 'multiple'}
                            onCheckedChange={(checked) => setNewCodeUsageType(checked ? 'multiple' : 'single')}
                          />
                          <span className="text-sm text-gray-700 font-medium">Multiple Use</span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {newCodeUsageType === 'single' 
                            ? 'Each code can only be used by one student' 
                            : 'Same code can be used by multiple students from the same grade'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Max Uses (Optional)</Label>
                        <Input
                          type="number"
                          value={newCodeMaxUses || ''}
                          onChange={(e) => setNewCodeMaxUses(e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="Leave blank for unlimited"
                          min="1"
                          className="bg-white"
                        />
                        <p className="text-xs text-gray-500">
                          Maximum number of times each code can be used. Leave blank for unlimited.
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowAddForm(false);
                          setSelectedGrades([]);
                          setNewCodeUsageType('multiple');
                          setNewCodeMaxUses(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={generateCodesForGrades}
                        disabled={generating || selectedGrades.length === 0}
                        className="min-w-[150px]"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Key className="h-4 w-4 mr-2" />
                            Generate {selectedGrades.length > 0 ? `${selectedGrades.length} Code(s)` : 'Codes'}
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Existing Codes Table */}
              <Card className="bg-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5 text-orange-600" />
                        Existing Joining Codes
                      </CardTitle>
                      <CardDescription>
                        {codes.length} joining code(s) for {schoolName}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {codes.length === 0 ? (
                    <div className="text-center py-12">
                      <Key className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Joining Codes</h3>
                      <p className="text-gray-600">Click &quot;Add Code&quot; above to create your first joining code.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Grade</TableHead>
                            <TableHead>Joining Code</TableHead>
                            <TableHead>Usage Type</TableHead>
                            <TableHead>Usage Stats</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {codes.map((code) => (
                            <TableRow key={code.id} className={!code.is_active ? 'bg-gray-50' : ''}>
                              <TableCell>
                                <Badge variant="outline" className="font-medium">
                                  {code.grade}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {editingCode === code.id ? (
                                  <Input
                                    value={editedCodes[code.id]?.code || code.code}
                                    onChange={(e) => handleCodeEdit(code.id, 'code', e.target.value)}
                                    className="font-mono text-sm w-full"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <code className={`font-mono text-sm px-2 py-1 rounded bg-gray-100 ${!code.is_active ? 'text-gray-400' : ''}`}>
                                      {code.code}
                                    </code>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => copyToClipboard(code.code, `Code for ${code.grade}`)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingCode === code.id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">Single</span>
                                    <Switch
                                      checked={(editedCodes[code.id]?.usage_type || code.usage_type) === 'multiple'}
                                      onCheckedChange={(checked) => handleCodeEdit(code.id, 'usage_type', checked ? 'multiple' : 'single')}
                                    />
                                    <span className="text-xs text-gray-500">Multiple</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-600">Single</span>
                                    <Switch
                                      checked={code.usage_type === 'multiple'}
                                      onCheckedChange={(checked) => handleUsageTypeToggle(code, checked ? 'multiple' : 'single')}
                                    />
                                    <span className="text-sm text-gray-600">Multiple</span>
                                    <Badge variant="secondary" className="ml-2">
                                      {code.usage_type === 'single' ? 'Single-use' : 'Multiple-use'}
                                    </Badge>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div>Used: <span className="font-medium">{code.times_used}</span></div>
                                  {code.max_uses && (
                                    <div className="text-xs text-gray-500">
                                      Max: {code.max_uses}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={code.is_active}
                                    onCheckedChange={(checked) => handleCodeStatusToggle(code, checked)}
                                  />
                                  <Badge className={code.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                    {code.is_active ? (
                                      <>
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Active
                                      </>
                                    ) : (
                                      <>
                                        <X className="h-3 w-3 mr-1" />
                                        Inactive
                                      </>
                                    )}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-2">
                                  {editingCode === code.id ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => saveCodeEdit(code)}
                                        className="bg-green-50 text-green-600 hover:bg-green-100"
                                      >
                                        <Save className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => cancelEdit(code.id)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingCode(code.id)}
                                        title="Edit code"
                                      >
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => regenerateCode(code)}
                                        disabled={regenerating === code.id}
                                        title="Regenerate code"
                                      >
                                        {regenerating === code.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <RefreshCw className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Information Card */}
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertCircle className="h-5 w-5 text-blue-600" />
                    Usage Guidelines
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span><strong>Single-use:</strong> Each code can only be used by one student. Ideal for exclusive enrollment.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span><strong>Multiple-use:</strong> The same code can be used by multiple students from the same grade.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span><strong>Active codes:</strong> Only active codes can be used for student registration.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span><strong>Code expiration:</strong> Codes expire after 1 year from creation date.</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <DialogFooter className="pt-6 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { addTokensToHeaders } from "../../../lib/csrf-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../../components/ui/dialog";
import { 
  Key,
  Edit,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { useAutoSaveForm } from "../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../lib/form-persistence";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Load saved password form (only current_password for convenience, not new passwords)
  const savedPasswordForm = typeof window !== 'undefined'
    ? loadFormData<{ current_password: string }>('school-admin-password-form')
    : null;

  const [passwordForm, setPasswordForm] = useState({
    current_password: savedPasswordForm?.current_password || "",
    new_password: "",
    confirm_password: ""
  });

  // Auto-save password form (only saves current_password for convenience)
  // Note: new_password and confirm_password are NOT saved for security
  const { isDirty: _isPasswordFormDirty, clearSavedData: clearPasswordForm } = useAutoSaveForm({
    formId: 'school-admin-password-form',
    formData: {
      current_password: passwordForm.current_password,
      // Intentionally exclude new_password and confirm_password
    },
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: true, // Use sessionStorage for password form (cleared on tab close)
    onLoad: (data) => {
      if (data?.current_password && !savedPasswordForm) {
        setPasswordForm(prev => ({ ...prev, current_password: data.current_password }));
      }
    },
    markDirty: false, // Don't mark password form as dirty
  });


  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load profile via API route (bypasses RLS)
      try {
        const profileHeaders = await addTokensToHeaders();
        const profileResponse = await fetch(`/api/profile?userId=${user.id}`, {
          cache: 'no-store',
          method: 'GET',
          headers: profileHeaders
        });
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          const profile = profileData.profile;
          
          if (profile) {
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-dismiss messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleChangePassword = async () => {
    try {
      setSaving(true);
      
      if (!passwordForm.current_password) {
        setMessage({ type: 'error', text: 'Current password is required' });
        return;
      }

      // Validate password strength (8+ chars, uppercase, lowercase, number)
      const { validatePasswordClient } = await import('../../../lib/password-validation');
      const passwordError = validatePasswordClient(passwordForm.new_password);
      if (passwordError) {
        setMessage({ type: 'error', text: passwordError });
        return;
      }

      if (passwordForm.new_password !== passwordForm.confirm_password) {
        setMessage({ type: 'error', text: 'New passwords do not match' });
        return;
      }

      // Verify current password by attempting to sign in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) {
        setMessage({ type: 'error', text: 'Unable to verify user' });
        return;
      }

      // Sign in with current password to verify it
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordForm.current_password
      });

      if (signInError) {
        setMessage({ type: 'error', text: 'Current password is incorrect' });
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new_password
      });

      if (error) {
        console.error('Error updating password:', error);
        setMessage({ type: 'error', text: 'Error updating password: ' + error.message });
        return;
      }

      // Clear saved password form after successful change
      clearFormData('school-admin-password-form');
      clearPasswordForm();

      setMessage({ type: 'success', text: 'Password updated successfully' });
      setIsPasswordDialogOpen(false);
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: ""
      });
     
    } catch (error: unknown) {
      console.error('Error updating password:', error);
      setMessage({ type: 'error', text: 'Error updating password. Please try again.' });
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Message Notification */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="ml-4 text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your school profile and system settings</p>
      </div>

      <Tabs defaultValue="security" className="space-y-6">
        <TabsList>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Key className="h-5 w-5 mr-2" />
                Password Security
              </CardTitle>
              <CardDescription>Change your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">Password</div>
                    <div className="text-sm text-gray-500">Last updated: Never</div>
                  </div>
                  <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Edit className="mr-2 h-4 w-4" />
                        Change Password
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Change Password</DialogTitle>
                        <DialogDescription>
                          Enter your current password and choose a new one.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label htmlFor="current_password">Current Password</Label>
                          <div className="relative">
                            <Input
                              id="current_password"
                              type={showPassword ? "text" : "password"}
                              value={passwordForm.current_password}
                              onChange={(e) => setPasswordForm({...passwordForm, current_password: e.target.value})}
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="new_password">New Password</Label>
                          <div className="relative">
                            <Input
                              id="new_password"
                              type={showNewPassword ? "text" : "password"}
                              value={passwordForm.new_password}
                              onChange={(e) => setPasswordForm({...passwordForm, new_password: e.target.value})}
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="confirm_password">Confirm New Password</Label>
                          <div className="relative">
                            <Input
                              id="confirm_password"
                              type={showConfirmPassword ? "text" : "password"}
                              value={passwordForm.confirm_password}
                              onChange={(e) => setPasswordForm({...passwordForm, confirm_password: e.target.value})}
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleChangePassword} disabled={saving}>
                          {saving ? 'Updating...' : 'Update Password'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


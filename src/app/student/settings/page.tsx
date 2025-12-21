"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Badge } from "../../../components/ui/badge";
import { Switch } from "../../../components/ui/switch";
import { 
  User,
  Lock,
  Bell,
  Shield,
  Save,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { useStudentProfile, useUpdateProfile, useChangePassword } from "../../../hooks/useStudentData";
import { useAutoSaveForm } from "../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../lib/form-persistence";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceChange = searchParams.get('force_change') === 'true';

  const { data: profile, isLoading } = useStudentProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  // Load saved settings data
  const savedSettingsData = typeof window !== 'undefined'
    ? loadFormData<{
        fullName: string;
        email: string;
        emailNotifications: boolean;
        assignmentReminders: boolean;
        gradeNotifications: boolean;
        courseUpdates: boolean;
      }>('student-settings-form')
    : null;

  // Profile form state
  const [fullName, setFullName] = useState(savedSettingsData?.fullName || "");
  const [email, setEmail] = useState(savedSettingsData?.email || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Password form state (NOT persisted for security)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Notification preferences
  const [emailNotifications, setEmailNotifications] = useState(
    savedSettingsData?.emailNotifications ?? true
  );
  const [assignmentReminders, setAssignmentReminders] = useState(
    savedSettingsData?.assignmentReminders ?? true
  );
  const [gradeNotifications, setGradeNotifications] = useState(
    savedSettingsData?.gradeNotifications ?? true
  );
  const [courseUpdates, setCourseUpdates] = useState(
    savedSettingsData?.courseUpdates ?? true
  );

  // Auto-save settings form (profile and notifications, NOT password)
  const { isDirty: isSettingsDirty, clearSavedData } = useAutoSaveForm({
    formId: 'student-settings-form',
    formData: {
      fullName,
      email,
      emailNotifications,
      assignmentReminders,
      gradeNotifications,
      courseUpdates,
    },
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && !profile) {
        // Only load if profile not yet loaded
        if (data.fullName) setFullName(data.fullName);
        if (data.email) setEmail(data.email);
        if (typeof data.emailNotifications === 'boolean') setEmailNotifications(data.emailNotifications);
        if (typeof data.assignmentReminders === 'boolean') setAssignmentReminders(data.assignmentReminders);
        if (typeof data.gradeNotifications === 'boolean') setGradeNotifications(data.gradeNotifications);
        if (typeof data.courseUpdates === 'boolean') setCourseUpdates(data.courseUpdates);
      }
    },
    markDirty: true,
  });

  useEffect(() => {
    if (profile) {
      // Profile data from API takes precedence over saved data
      setFullName(profile.full_name || "");
      setEmail(profile.email || "");
    }
  }, [profile]);

  const handleProfileUpdate = async () => {
    setProfileSaving(true);
    setProfileMessage(null);

    try {
      await updateProfile.mutateAsync({
        full_name: fullName,
        email: email
      });

      // Clear saved form data after successful update
      clearFormData('student-settings-form');
      clearSavedData();

      setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setProfileMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordSaving(true);
    setPasswordMessage(null);

    // Validation
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
      setPasswordSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      setPasswordSaving(false);
      return;
    }

    try {
      await changePassword.mutateAsync(newPassword);

      setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // If this was a forced password change, redirect to dashboard
      if (forceChange) {
        setTimeout(() => {
          router.push('/student');
        }, 2000);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordMessage({ type: 'error', text: 'Failed to change password. Please try again.' });
    } finally {
      setPasswordSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account settings and preferences</p>
      </div>

      {/* Force Password Change Alert */}
      {forceChange && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <p className="font-medium text-orange-900">Password Change Required</p>
                <p className="text-sm text-orange-700 mt-1">
                  For security reasons, you must change your temporary password before accessing your account.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs defaultValue={forceChange ? "security" : "profile"} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" disabled={forceChange}>
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" disabled={forceChange}>
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information and profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>

              <div className="space-y-2">
                <Label>School</Label>
                <Input
                  value={profile?.students?.[0]?.schools?.[0]?.name || 'N/A'}
                  disabled
                  className="bg-gray-50"
                />
              </div>

              <div className="space-y-2">
                <Label>Grade</Label>
                <Input
                  value={profile?.students?.[0]?.grade || 'N/A'}
                  disabled
                  className="bg-gray-50"
                />
              </div>

              <div className="space-y-2">
                <Label>Joining Code</Label>
                <div className="flex gap-2">
                  <Input
                    value={profile?.students?.[0]?.joining_code || 'N/A'}
                    disabled
                    className="bg-gray-50"
                  />
                  <Badge variant="outline">Unique ID</Badge>
                </div>
              </div>

              {profileMessage && (
                <div className={`p-3 rounded-lg ${
                  profileMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {profileMessage.type === 'success' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span className="text-sm">{profileMessage.text}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleProfileUpdate} disabled={profileSaving}>
                  {profileSaving ? (
                    <>
                      <Save className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                {forceChange 
                  ? 'Create a new secure password for your account'
                  : 'Update your password to keep your account secure'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!forceChange && (
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">Password must be at least 8 characters long</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {passwordMessage && (
                <div className={`p-3 rounded-lg ${
                  passwordMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {passwordMessage.type === 'success' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span className="text-sm">{passwordMessage.text}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handlePasswordChange} disabled={passwordSaving}>
                  {passwordSaving ? (
                    <>
                      <Lock className="h-4 w-4 mr-2 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Change Password
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security Information</CardTitle>
              <CardDescription>Your account security details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Account Status</span>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm font-medium">Last Login</span>
                <span className="text-sm text-gray-600">
                  {(profile?.students?.[0] as any)?.last_login 
                    ? new Date((profile?.students?.[0] as any).last_login).toLocaleString()
                    : 'N/A'
                  }
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium">Account Created</span>
                <span className="text-sm text-gray-600">
                  {(profile?.students?.[0] as any)?.created_at 
                    ? new Date((profile?.students?.[0] as any).created_at).toLocaleDateString()
                    : 'N/A'
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Manage how you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-gray-600">Receive notifications via email</p>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="font-medium">Assignment Reminders</p>
                  <p className="text-sm text-gray-600">Get reminders for upcoming assignments</p>
                </div>
                <Switch
                  checked={assignmentReminders}
                  onCheckedChange={setAssignmentReminders}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="font-medium">Grade Notifications</p>
                  <p className="text-sm text-gray-600">Notify when grades are posted</p>
                </div>
                <Switch
                  checked={gradeNotifications}
                  onCheckedChange={setGradeNotifications}
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">Course Updates</p>
                  <p className="text-sm text-gray-600">Updates about course content</p>
                </div>
                <Switch
                  checked={courseUpdates}
                  onCheckedChange={setCourseUpdates}
                />
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button>
                  <Save className="h-4 w-4 mr-2" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

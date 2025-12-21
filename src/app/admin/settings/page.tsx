"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "../../../components/ui/tabs";
import { 
  Settings,
  User,
  Shield,
  Mail,
  Key,
  Database,
  Users,
  School,
  AlertTriangle,
  CheckCircle,
  Save,
  RefreshCw
} from "lucide-react";
import { fetchWithCsrf } from '../../../lib/csrf-client';

export default function AdminSettings() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [profileData, setProfileData] = useState({
    full_name: "",
    email: "",
    current_password: "",
    new_password: "",
    confirm_password: ""
  });
  const [securityInfo, setSecurityInfo] = useState({
    last_login: null as string | null,
    failed_login_attempts: 0,
    mfa_enabled: false
  });
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const router = useRouter();

  const loadUserData = useCallback(async () => {
    try {
      if (!supabase || !supabase.auth) {
        console.error('Supabase client not initialized');
        router.push('/login');
        return;
      }

      const { data: authData, error: userError } = await supabase.auth.getUser();
      
      if (userError || !authData || !authData.user) {
        console.error('Error getting user:', userError);
        router.push('/login');
        return;
      }

      const authUser = authData.user;
      
      // Use server API routes for role/profile to avoid any client-side RLS differences
      // that can incorrectly trigger redirects (looks like "logout").
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const roleResp = await fetch(`/api/get-role?userId=${authUser.id}`, {
        method: 'GET',
        cache: 'no-store',
        headers,
      });

      if (!roleResp.ok) {
        console.error('Failed to fetch role:', roleResp.status);
        router.push('/login');
        return;
      }

      const roleData = await roleResp.json();
      const role = String(roleData?.role ?? '').trim().toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') {
        router.push('/redirect');
        return;
      }

      const profileResp = await fetch(`/api/profile?userId=${authUser.id}`, {
        method: 'GET',
        cache: 'no-store',
        headers,
      });

      if (!profileResp.ok) {
        console.error('Failed to fetch profile:', profileResp.status);
        router.push('/login');
        return;
      }

      const profileDataResp = await profileResp.json();
      const profile = profileDataResp?.profile ?? profileDataResp;

      setUser(authUser);
      setUserProfile(profile);
      setProfileData({
        full_name: (profile as any).full_name || "",
        email: authUser.email || "",
        current_password: "",
        new_password: "",
        confirm_password: ""
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);



  const loadSecurityInfo = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        return;
      }

      const response = await fetchWithCsrf('/api/admin/security', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response && response.ok) {
        const data = await response.json();
        if (data) {
          setSecurityInfo({
            last_login: data.last_login || null,
            failed_login_attempts: data.failed_login_attempts || 0,
            mfa_enabled: data.mfa_enabled || false
          });
        }
      }
    } catch (error) {
      console.error('Error loading security info:', error);
    }
  }, []);

  useEffect(() => {
    loadUserData();
    loadSecurityInfo();
  }, [loadSecurityInfo, loadUserData]);

  const handleEnable2FA = async () => {
     
    let data: any = null;
    try {
      setMfaEnrolling(true);
      setMessage(null);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        setMessage({ type: 'error', text: 'Please log in to enable 2FA' });
        setMfaEnrolling(false);
        return;
      }

      const response = await fetchWithCsrf('/api/admin/security/mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify({ action: 'enable' })
      });

      data = await response.json();

      if (!response.ok) {
        // Include detailed error message from API
        const errorDetails = data?.details || data?.error || 'Failed to enable 2FA';
        console.error('2FA API Error:', { status: response.status, data });
        throw new Error(errorDetails);
      }

      if (data.qr_code) {
        setMfaQrCode(data.qr_code);
      }
      if (data.secret) {
        setMfaSecret(data.secret);
      }
      if (data.factorId) {
        setMfaFactorId(data.factorId);
      }
      setMessage({ type: 'success', text: 'Scan the QR code with your authenticator app' });
     
    } catch (error: any) {
      console.error('Error enabling 2FA:', error);
      const errorMessage = data?.details || data?.error || error.message || 'Unknown error';
      setMessage({ type: 'error', text: `Failed to enable 2FA: ${errorMessage}` });
    } finally {
      setMfaEnrolling(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!mfaVerificationCode || !mfaFactorId) {
      setMessage({ type: 'error', text: 'Please enter the verification code' });
      return;
    }

    try {
      setMfaVerifying(true);
      setMessage(null);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        setMessage({ type: 'error', text: 'Please log in to verify 2FA' });
        setMfaVerifying(false);
        return;
      }

      const response = await fetchWithCsrf('/api/admin/security/mfa', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify({
          code: mfaVerificationCode,
          factorId: mfaFactorId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      setMessage({ type: 'success', text: '2FA enabled successfully!' });
      setMfaQrCode(null);
      setMfaSecret(null);
      setMfaVerificationCode('');
      setMfaFactorId(null);
      await loadSecurityInfo();
      setTimeout(() => setMessage(null), 3000);
     
    } catch (error: any) {
      console.error('Error verifying 2FA:', error);
      setMessage({ type: 'error', text: `Verification failed: ${error.message || 'Invalid code'}` });
    } finally {
      setMfaVerifying(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!confirm('Are you sure you want to disable 2FA? This will reduce your account security.')) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        setMessage({ type: 'error', text: 'Please log in to disable 2FA' });
        setSaving(false);
        return;
      }

      const response = await fetchWithCsrf('/api/admin/security/mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify({ action: 'disable' })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disable 2FA');
      }

      setMessage({ type: 'success', text: '2FA disabled successfully' });
      await loadSecurityInfo();
      setTimeout(() => setMessage(null), 3000);
     
    } catch (error: any) {
      console.error('Error disabling 2FA:', error);
      setMessage({ type: 'error', text: `Failed to disable 2FA: ${error.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleSaveProfile = async () => {
    if (!user || !userProfile) {
      setMessage({ type: 'error', text: 'User data not loaded. Please refresh the page.' });
      return;
    }

    // Validate inputs
    if (!profileData.full_name || profileData.full_name.trim() === '') {
      setMessage({ type: 'error', text: 'Full name is required.' });
      return;
    }

    if (!profileData.email || profileData.email.trim() === '') {
      setMessage({ type: 'error', text: 'Email address is required.' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(profileData.email)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    // Validate password fields if password change is requested
    if (profileData.new_password) {
      if (!profileData.current_password) {
        setMessage({ type: 'error', text: 'Please enter your current password to change it.' });
        return;
      }
      
      if (profileData.new_password !== profileData.confirm_password) {
        setMessage({ type: 'error', text: 'New passwords do not match.' });
        return;
      }

      // Validate password strength (8+ chars, uppercase, lowercase, number)
      const { validatePasswordClient } = await import('../../../lib/password-validation');
      const passwordError = validatePasswordClient(profileData.new_password);
      if (passwordError) {
        setMessage({ type: 'error', text: passwordError });
        return;
      }

      // Verify current password before changing
      try {
        if (!supabase || !supabase.auth) {
          setMessage({ type: 'error', text: 'Authentication service not available.' });
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email || '',
          password: profileData.current_password
        });

        if (signInError) {
          setMessage({ type: 'error', text: 'Current password is incorrect.' });
          return;
        }
       
      } catch (error: any) {
        setMessage({ type: 'error', text: 'Failed to verify current password.' });
        return;
      }
    }

    setSaving(true);
    setMessage(null);
    
    try {
      // Step 1: Update profile (name and email in profiles table) via API
      const response = await fetchWithCsrf('/api/admin/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          full_name: profileData.full_name.trim(),
          email: profileData.email.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      // Step 2: Update email in Supabase Auth if changed
      if (profileData.email.trim() !== user.email) {
        if (!supabase || !supabase.auth) {
          setMessage({ type: 'error', text: 'Authentication service not available. Profile updated but email change failed.' });
          setSaving(false);
          return;
        }

        const { error: emailError } = await supabase.auth.updateUser({
          email: profileData.email.trim()
        });
        if (emailError) {
          // Try to rollback profile update
          await fetchWithCsrf('/api/admin/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: user.id,
              full_name: profileData.full_name.trim(),
              email: user.email // Revert to original email
            })
          });
          setMessage({ type: 'error', text: `Email change failed: ${emailError.message}. Profile reverted.` });
          setSaving(false);
          return;
        }
      }

      // Step 3: Update password if provided (must be done after email update)
      if (profileData.new_password) {
        if (!supabase || !supabase.auth) {
          setMessage({ type: 'error', text: 'Authentication service not available. Profile updated but password change failed.' });
          setSaving(false);
          return;
        }

        const { error: passwordError } = await supabase.auth.updateUser({
          password: profileData.new_password
        });
        if (passwordError) {
          setMessage({ type: 'error', text: `Profile updated but password change failed: ${passwordError.message}` });
          setSaving(false);
          return;
        }
      }

      // Step 4: Refresh user data to get latest from auth
      if (supabase && supabase.auth) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData && authData.user) {
          setUser(authData.user);
        }
      }

      // Step 5: Update local state
      setUserProfile({ ...userProfile, full_name: profileData.full_name.trim(), email: profileData.email.trim() });

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setProfileData({
        ...profileData,
        current_password: "",
        new_password: "",
        confirm_password: ""
      });
      
      // Reload user data to ensure consistency
      await loadUserData();
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
     
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: `Error updating profile: ${error.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };




  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
            <p className="text-gray-600 mt-2">Configure system-wide settings and preferences</p>
          </div>

          {/* Message Display */}
          {message && (
            <div className={`mb-4 p-4 rounded-md flex items-center justify-between ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <div className="flex items-center">
                {message.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 mr-2" />
                ) : (
                  <AlertTriangle className="h-5 w-5 mr-2" />
                )}
                <span>{message.text}</span>
              </div>
              <button
                onClick={() => setMessage(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
          )}

          {/* Main Content */}
          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="mr-2 h-5 w-5" />
                    Admin Profile
                  </CardTitle>
                  <CardDescription>Update your personal information and password</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input
                        id="full_name"
                        value={profileData.full_name}
                        onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        placeholder="Enter your email"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Change Password</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="current_password">Current Password</Label>
                        <Input
                          id="current_password"
                          type="password"
                          value={profileData.current_password}
                          onChange={(e) => setProfileData({ ...profileData, current_password: e.target.value })}
                          placeholder="Enter current password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new_password">New Password</Label>
                        <Input
                          id="new_password"
                          type="password"
                          value={profileData.new_password}
                          onChange={(e) => setProfileData({ ...profileData, new_password: e.target.value })}
                          placeholder="Enter new password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm_password">Confirm Password</Label>
                        <Input
                          id="confirm_password"
                          type="password"
                          value={profileData.confirm_password}
                          onChange={(e) => setProfileData({ ...profileData, confirm_password: e.target.value })}
                          placeholder="Confirm new password"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={saving}>
                      {saving ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Profile
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Shield className="mr-2 h-5 w-5" />
                      Security Settings
                    </CardTitle>
                    <CardDescription>Configure security and access controls</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Two-Factor Authentication</Label>
                        <p className="text-sm text-gray-600">Add an extra layer of security</p>
                      </div>
                      <Badge variant={securityInfo.mfa_enabled ? "default" : "outline"}>
                        {securityInfo.mfa_enabled ? "Enabled" : "Not Enabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Login Attempts</Label>
                        <p className="text-sm text-gray-600">Failed attempts in last 30 days</p>
                      </div>
                      <Badge variant="default">
                        {securityInfo.failed_login_attempts} failed attempts
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Last Login</Label>
                        <p className="text-sm text-gray-600">Your last successful login</p>
                      </div>
                      <span className="text-sm text-gray-600">
                        {securityInfo.last_login 
                          ? new Date(securityInfo.last_login).toLocaleString()
                          : 'Never'}
                      </span>
                    </div>
                    
                    {!securityInfo.mfa_enabled && !mfaQrCode && (
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={handleEnable2FA}
                        disabled={mfaEnrolling}
                      >
                        {mfaEnrolling ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Enabling...
                          </>
                        ) : (
                          <>
                      <Key className="mr-2 h-4 w-4" />
                      Enable 2FA
                          </>
                        )}
                    </Button>
                    )}

                    {mfaQrCode && (
                      <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                        <div className="text-sm font-medium">Scan QR Code with Authenticator App</div>
                        {mfaQrCode && (
                          <div className="flex justify-center">
                            <img src={mfaQrCode} alt="2FA QR Code" className="w-48 h-48" />
                      </div>
                        )}
                        {mfaSecret && (
                          <div className="text-xs text-gray-600 break-all">
                            <div className="font-medium mb-1">Or enter this secret manually:</div>
                            <code className="bg-white p-2 rounded border">{mfaSecret}</code>
                    </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="mfa_code">Enter verification code</Label>
                          <Input
                            id="mfa_code"
                            type="text"
                            placeholder="000000"
                            value={mfaVerificationCode}
                            onChange={(e) => setMfaVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            className="text-center text-lg tracking-widest"
                          />
                      </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={handleVerify2FA}
                            disabled={mfaVerifying || mfaVerificationCode.length !== 6}
                            className="flex-1"
                          >
                            {mfaVerifying ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Verifying...
                              </>
                            ) : (
                              'Verify & Enable'
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setMfaQrCode(null);
                              setMfaSecret(null);
                              setMfaVerificationCode('');
                              setMfaFactorId(null);
                            }}
                          >
                            Cancel
                          </Button>
                    </div>
                      </div>
                    )}

                    {securityInfo.mfa_enabled && !mfaQrCode && (
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={handleDisable2FA}
                        disabled={saving}
                      >
                        {saving ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Disabling...
                          </>
                        ) : (
                          <>
                            <Key className="mr-2 h-4 w-4" />
                            Disable 2FA
                          </>
                        )}
                    </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <AlertTriangle className="mr-2 h-5 w-5" />
                    System Maintenance
                  </CardTitle>
                  <CardDescription>Perform system maintenance tasks</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button 
                      variant="outline" 
                      className="h-20 flex flex-col"
                      onClick={async () => {
                        if (confirm('This will create a database backup. Continue?')) {
                          try {
                            setSaving(true);
                            const response = await fetchWithCsrf('/api/admin/settings/backup', { method: 'POST' });
                            const data = await response.json();
                            if (response.ok) {
                              setMessage({ type: 'success', text: 'Database backup initiated successfully!' });
                              setTimeout(() => setMessage(null), 3000);
                            } else {
                              setMessage({ type: 'error', text: data.error || 'Failed to create backup' });
                            }
                           
                          } catch (error: any) {
                            setMessage({ type: 'error', text: 'Error creating backup: ' + error.message });
                          } finally {
                            setSaving(false);
                          }
                        }
                      }}
                      disabled={saving}
                    >
                      <Database className="h-6 w-6 mb-2" />
                      <span>Database Backup</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-20 flex flex-col"
                      onClick={async () => {
                        if (confirm('This will clean up inactive users. Continue?')) {
                          try {
                            setSaving(true);
                            const response = await fetchWithCsrf('/api/admin/settings/cleanup', { method: 'POST' });
                            const data = await response.json();
                            if (response.ok) {
                              setMessage({ type: 'success', text: `User cleanup completed: ${data.cleaned || 0} users removed` });
                              setTimeout(() => setMessage(null), 3000);
                            } else {
                              setMessage({ type: 'error', text: data.error || 'Failed to cleanup users' });
                            }
                           
                          } catch (error: any) {
                            setMessage({ type: 'error', text: 'Error cleaning up users: ' + error.message });
                          } finally {
                            setSaving(false);
                          }
                        }
                      }}
                      disabled={saving}
                    >
                      <Users className="h-6 w-6 mb-2" />
                      <span>User Cleanup</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-20 flex flex-col"
                      onClick={async () => {
                        try {
                          setSaving(true);
                          const response = await fetchWithCsrf('/api/admin/settings/export', { method: 'POST' });
                          if (response.ok) {
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `data-export-${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                            setMessage({ type: 'success', text: 'Data export completed successfully!' });
                            setTimeout(() => setMessage(null), 3000);
                          } else {
                            const data = await response.json();
                            setMessage({ type: 'error', text: data.error || 'Failed to export data' });
                          }
                         
                        } catch (error: any) {
                          setMessage({ type: 'error', text: 'Error exporting data: ' + error.message });
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      <School className="h-6 w-6 mb-2" />
                      <span>Data Export</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
    </div>
  );
}

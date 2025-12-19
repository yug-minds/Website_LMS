"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { Loader2 } from "lucide-react";
import { addTokensToHeaders } from "../../lib/csrf-client";

export default function RedirectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const redirectUser = async () => {
      try {
        // Get current user session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          console.log('No session found, redirecting to login');
          router.push('/login');
          return;
        }

        // Check for force_password_change first
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role, force_password_change')
          .eq('id', session.user.id)
           
          .single() as any;

        if (profileData?.force_password_change) {
          console.log('User must change password, redirecting to update-password');
          router.push('/update-password');
          return;
        }

        // Get user role from API
        try {
          const headers = await addTokensToHeaders();
          const resp = await fetch(`/api/get-role?userId=${session.user.id}`, {
            cache: 'no-store',
            method: 'GET',
            headers
          });

          if (!resp.ok) {
            throw new Error(`Failed to fetch role: ${resp.status}`);
          }

          const json = await resp.json();
          let userRole = json?.role || profileData?.role;

          if (!userRole) {
            setError("User role not found. Please contact support.");
            setLoading(false);
            return;
          }

          // Normalize role: trim whitespace and convert to lowercase
          userRole = userRole.trim().toLowerCase();

          // Redirect based on role
          const roleRoutes: Record<string, string> = {
            admin: '/admin',
            super_admin: '/admin',
            school_admin: '/school-admin',
            teacher: '/teacher',
            student: '/student',
          };

          const redirectPath = roleRoutes[userRole] || '/login';
          console.log(`Redirecting ${userRole} to ${redirectPath}`);
          
          // Redirect directly - no cookies needed
          router.push(redirectPath);
         
        } catch (error: any) {
          console.error('Error fetching role:', error);
          setError(error?.message || 'Failed to determine user role');
          setLoading(false);
        }
       
      } catch (error: any) {
        console.error('Redirect error:', error);
        setError('An unexpected error occurred');
        setLoading(false);
      }
    };

    redirectUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 max-w-md px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 font-medium">Error</p>
            <p className="text-red-500 text-sm mt-2">{error}</p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return null;
}








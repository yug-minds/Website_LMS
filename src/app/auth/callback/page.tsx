"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { addTokensToHeaders } from "../../../lib/csrf-client";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          router.push('/?error=auth_error');
          return;
        }

        if (data.session && data.session.user) {
          // Fetch user role from API instead of guessing from email
          try {
            const headers = await addTokensToHeaders();
            const resp = await fetch(`/api/get-role?userId=${data.session.user.id}`, {
              cache: 'no-store',
              method: 'GET',
              headers
            });
            
            if (resp.ok) {
              const json = await resp.json();
              const userRole = json?.role;
              
              if (userRole) {
                // Use the redirect API for role-based routing
                window.location.href = `/api/auth/redirect?userId=${data.session.user.id}&role=${encodeURIComponent(userRole)}&force_password_change=${json?.force_password_change || false}`;
                return;
              }
            }
          } catch (roleError) {
            console.error('Error fetching role in auth callback:', roleError);
          }
          
          // Fallback: redirect to login if role cannot be determined
          router.push('/login');
        } else {
          router.push('/');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.push('/?error=auth_error');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
    </div>
  );
}

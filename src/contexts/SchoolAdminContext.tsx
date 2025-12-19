"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { addTokensToHeaders } from '../lib/csrf-client';

interface SchoolInfo {
  id: string;
  name: string;
   
  [key: string]: any;
}

interface SchoolAdminContextType {
  schoolInfo: SchoolInfo | null;
  loading: boolean;
  refreshSchoolInfo: () => Promise<void>;
}

const SchoolAdminContext = createContext<SchoolAdminContextType | undefined>(undefined);

export function SchoolAdminProvider({ children }: { children: React.ReactNode }) {
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSchoolInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Get profile via API route (bypasses RLS)
      const profileHeaders = await addTokensToHeaders();
      const profileResponse = await fetch(`/api/profile?userId=${user.id}`, {
        cache: 'no-store',
        method: 'GET',
        headers: profileHeaders
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        const profile = profileData.profile;

        // Verify user is school admin
        if (profile?.role === 'school_admin') {
          // Get school info via API route (bypasses RLS)
          // API route uses school_admins table to get school_id (primary source of truth)
          // Triggers ensure profiles.school_id is synced, but API uses school_admins directly
          try {
            const schoolHeaders = await addTokensToHeaders();
            const schoolResponse = await fetch(`/api/school-admin/school`, {
              cache: 'no-store',
              headers: schoolHeaders
            });

            if (schoolResponse.ok) {
              const schoolData = await schoolResponse.json();
              if (schoolData.school) {
                setSchoolInfo(schoolData.school);
              }
            } else {
              console.warn('Failed to load school from API in context:', schoolResponse.status);
              const errorData = await schoolResponse.json().catch(() => ({}));
              console.warn('Error details:', errorData);
            }
          } catch (err) {
            console.error('Error loading school info in context:', err);
          }
        } else {
          console.warn('User is not a school admin. Role:', profile?.role);
        }
      }
    } catch (error) {
      console.error('Error loading school info:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchoolInfo();
  }, []);

  return (
    <SchoolAdminContext.Provider value={{ schoolInfo, loading, refreshSchoolInfo: loadSchoolInfo }}>
      {children}
    </SchoolAdminContext.Provider>
  );
}

export function useSchoolAdmin() {
  const context = useContext(SchoolAdminContext);
  if (context === undefined) {
    throw new Error('useSchoolAdmin must be used within a SchoolAdminProvider');
  }
  return context;
}


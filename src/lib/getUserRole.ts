import { supabase, supabaseAdmin } from "./supabase";

export async function getUserRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  
  return (profile as { role?: string } | null)?.role || null;
}

export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  
  return profile;
}

export async function getSchoolAdminSchool() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single();
  
  const profileData = profile as { school_id?: string } | null;
  if (!profileData?.school_id) return null;

  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('*')
    .eq('id', profileData.school_id)
    .single();
  
  return school;
}

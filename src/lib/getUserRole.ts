import { supabase, supabaseAdmin } from "./supabase";

export async function getUserRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
     
    .single() as any;
  
  return profile?.role || null;
}

export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
     
    .single() as any;
  
  return profile;
}

export async function getSchoolAdminSchool() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
     
    .single() as any;
  
  if (!profile?.school_id) return null;

  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('*')
    .eq('id', profile.school_id)
     
    .single() as any;
  
  return school;
}

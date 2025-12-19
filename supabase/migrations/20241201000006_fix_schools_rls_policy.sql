-- Add policy to allow authenticated users to view schools
create policy "Authenticated users can view schools" on schools
  for select using (
    auth.role() = 'authenticated'
  );

-- Add optional third text field for Success Stories

alter table if exists public.success_story_sections
  add column if not exists body_tertiary text;




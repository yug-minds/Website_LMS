-- Success Stories schema: sections and versions
create table if not exists public.success_story_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_primary text not null,
  body_secondary text,
  image_url text,
  storage_path text,
  background text check (background in ('blue','white')) default 'white',
  image_position text check (image_position in ('left','right')) default 'left',
  order_index int not null default 0,
  is_published boolean default false,
  published_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()),
  updated_at timestamptz default timezone('utc'::text, now()),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.success_story_versions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references public.success_story_sections(id) on delete cascade,
  version_number int not null,
  snapshot jsonb not null,
  created_at timestamptz default timezone('utc'::text, now()),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.success_story_sections enable row level security;
alter table public.success_story_versions enable row level security;

create policy "public read published success stories" on public.success_story_sections
  for select using ( is_published = true );

create policy "admin full access success stories" on public.success_story_sections
  for all using ( auth.role() = 'admin' ) with check ( auth.role() = 'admin' );

create policy "admin read versions" on public.success_story_versions
  for select using ( auth.role() = 'admin' );

create policy "admin write versions" on public.success_story_versions
  for insert with check ( auth.role() = 'admin' );

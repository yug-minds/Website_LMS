-- Create comprehensive teachers table
create table if not exists teachers (
  id uuid primary key default uuid_generate_v4(),
  teacher_id text unique not null, -- Auto-generated like TCH-024
  full_name text not null,
  email text unique not null,
  phone text,
  qualification text,
  experience_years integer default 0,
  specialization text,
  profile_photo_url text,
  gender text check (gender in ('Male', 'Female', 'Other')),
  date_of_birth date,
  address text,
  max_students_per_session integer default 30,
  default_working_days text[], -- Array of days like ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  check_in_method text check (check_in_method in ('Manual', 'QR', 'Auto via Dashboard Login')) default 'Manual',
  leave_balance_annual integer default 12,
  leave_approval_flow text check (leave_approval_flow in ('School Admin', 'Super Admin')) default 'School Admin',
  emergency_contact text,
  status text check (status in ('Active', 'Inactive', 'On Leave', 'Suspended')) default 'Active',
  created_by uuid references profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Update existing teacher_schools table to add new columns
alter table teacher_schools 
add column if not exists grades_assigned text[],
add column if not exists subjects text[],
add column if not exists schedule_days text[],
add column if not exists is_primary boolean default false,
add column if not exists assigned_by uuid references profiles(id),
add column if not exists working_days_per_week integer default 2,
add column if not exists max_students_per_session integer default 30;

-- DEPRECATED: teacher_attendance table creation removed
-- Use attendance table instead (generalized table for both teachers and students)
-- This table was deprecated and removed in migration 20250127000005_remove_course_chapters_and_teacher_attendance.sql

-- Update existing teacher_leaves table to add new columns
alter table teacher_leaves 
add column if not exists leave_type text check (leave_type in ('Sick', 'Casual', 'Personal', 'Emergency', 'Other')),
add column if not exists total_days integer,
add column if not exists rejection_reason text,
add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());

-- DEPRECATED: teacher_performance table creation removed
-- Performance metrics are calculated dynamically from teacher_reports and attendance tables
-- This table was deprecated and removed in migration 20250127000006_remove_teacher_performance.sql

-- Enable RLS on new tables
alter table teachers enable row level security;
-- RLS for teacher_attendance and teacher_performance removed (tables deprecated)

-- Create RLS policies for teachers
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'teachers' and policyname = 'Admins can manage teachers') then
    create policy "Admins can manage teachers" on teachers
      for all using (
        exists (
          select 1 from profiles 
          where id = auth.uid() and role = 'admin'
        )
      );
  end if;
  
  if not exists (select 1 from pg_policies where tablename = 'teachers' and policyname = 'School admins can view their school teachers') then
    create policy "School admins can view their school teachers" on teachers
      for select using (
        exists (
          select 1 from profiles 
          where id = auth.uid() and role = 'school_admin'
        )
      );
  end if;
  
  if not exists (select 1 from pg_policies where tablename = 'teachers' and policyname = 'Teachers can view their own profile') then
    create policy "Teachers can view their own profile" on teachers
      for select using (
        id in (
          select t.id from teachers t
          join profiles p on p.email = t.email
          where p.id = auth.uid()
        )
      );
  end if;
end $$;

-- RLS policies for teacher_attendance removed (table deprecated)

-- RLS policies for teacher_performance removed (table deprecated)

-- Create indexes for better performance
create index if not exists idx_teachers_email on teachers(email);
create index if not exists idx_teachers_teacher_id on teachers(teacher_id);
create index if not exists idx_teachers_status on teachers(status);
-- Indexes for teacher_attendance and teacher_performance removed (tables deprecated)

-- Create function to generate teacher ID
create or replace function generate_teacher_id()
returns text as $$
declare
  new_id text;
  counter integer;
begin
  -- Get the next counter value
  select coalesce(max(cast(substring(teacher_id from 5) as integer)), 0) + 1
  into counter
  from teachers
  where teacher_id ~ '^TCH-\d+$';
  
  -- Format as TCH-XXX
  new_id := 'TCH-' || lpad(counter::text, 3, '0');
  
  return new_id;
end;
$$ language plpgsql;

-- Create function to update updated_at timestamp
create or replace function update_teachers_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create trigger for updated_at
create trigger update_teachers_updated_at before update on teachers
  for each row execute procedure update_teachers_updated_at();

create trigger update_teacher_leaves_updated_at before update on teacher_leaves
  for each row execute procedure update_teachers_updated_at();

-- Create function to calculate total leave days
create or replace function calculate_leave_days()
returns trigger as $$
begin
  new.total_days := (new.end_date - new.start_date) + 1;
  return new;
end;
$$ language plpgsql;

-- Create trigger for leave days calculation
create trigger calculate_leave_days_trigger before insert or update on teacher_leaves
  for each row execute procedure calculate_leave_days();

-- Create comprehensive teacher dashboard tables
-- This migration adds all necessary tables for the teacher dashboard functionality

-- Create classes table for teacher-class assignments
create table if not exists classes (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid references schools(id) on delete cascade,
  class_name text not null,
  grade text not null,
  subject text,
  academic_year text default '2024-25',
  max_students integer default 30,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Update teacher_schools table to add new columns for better teacher management
alter table teacher_schools 
add column if not exists grades_assigned text[],
add column if not exists subjects text[],
add column if not exists schedule_days text[],
add column if not exists is_primary boolean default false,
add column if not exists assigned_by uuid references profiles(id),
add column if not exists working_days_per_week integer default 5,
add column if not exists max_students_per_session integer default 30;

-- Create teacher_classes table (teacher ↔ class/batch mapping)
create table if not exists teacher_classes (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references profiles(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  grade text,
  subject text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(teacher_id, class_id)
);

-- Update teacher_reports table with comprehensive fields
alter table teacher_reports 
add column if not exists class_id uuid references classes(id),
add column if not exists start_time timestamptz,
add column if not exists end_time timestamptz,
add column if not exists activities text,
add column if not exists report_status text check (report_status in ('Submitted','Approved','Flagged')) default 'Submitted',
add column if not exists student_count integer default 0,
add column if not exists duration_hours decimal(3,1) default 0;

-- Update teacher_leaves table with comprehensive fields
alter table teacher_leaves 
add column if not exists start_date date,
add column if not exists end_date date,
add column if not exists leave_type text check (leave_type in ('Sick', 'Casual', 'Personal', 'Emergency', 'Other')) default 'Personal',
add column if not exists substitute_required boolean default false,
add column if not exists total_days integer,
add column if not exists rejection_reason text,
add column if not exists reviewed_by uuid references profiles(id),
add column if not exists reviewed_at timestamptz,
add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());

-- Create attendance table (generalized for teachers and students)
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  class_id uuid references classes(id),
  date date not null,
  status text check (status in ('Present','Absent','Leave-Approved','Leave-Rejected','Unreported')) not null,
  recorded_by uuid references profiles(id), -- who marked (teacher/admin/system)
  recorded_at timestamptz default timezone('utc'::text, now()),
  remarks text,
  unique(user_id, school_id, date)
);

-- Create teacher_monthly_attendance view
create or replace view teacher_monthly_attendance as
select 
  user_id as teacher_id, 
  school_id, 
  date_trunc('month', date) as month, 
  sum(case when status = 'Present' then 1 else 0 end) as present_count,
  sum(case when status like 'Leave-%' then 1 else 0 end) as leave_count,
  sum(case when status = 'Absent' then 1 else 0 end) as absent_count,
  sum(case when status = 'Unreported' then 1 else 0 end) as unreported_count,
  count(*) as total_days
from attendance
where user_id in (
  select id from profiles where role = 'teacher'
)
group by user_id, school_id, date_trunc('month', date);

-- Enable RLS on new tables
alter table classes enable row level security;
alter table teacher_classes enable row level security;
alter table attendance enable row level security;

-- Create RLS policies for classes
create policy "Admins can manage classes" on classes
  for all using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "School admins can manage their school classes" on classes
  for all using (
    school_id in (
      select s.id from schools s
      join profiles p on p.id = s.school_admin_id
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  );

create policy "Teachers can view their assigned classes" on classes
  for select using (
    id in (
      select tc.class_id from teacher_classes tc
      where tc.teacher_id = auth.uid()
    )
  );

-- Create RLS policies for teacher_classes
create policy "Admins can manage teacher classes" on teacher_classes
  for all using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "School admins can manage their school teacher classes" on teacher_classes
  for all using (
    school_id in (
      select s.id from schools s
      join profiles p on p.id = s.school_admin_id
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  );

create policy "Teachers can view their own class assignments" on teacher_classes
  for select using (teacher_id = auth.uid());

-- Create RLS policies for attendance
create policy "Admins can manage attendance" on attendance
  for all using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "School admins can manage their school attendance" on attendance
  for all using (
    school_id in (
      select s.id from schools s
      join profiles p on p.id = s.school_admin_id
      where p.id = auth.uid() and p.role = 'school_admin'
    )
  );

create policy "Teachers can manage their own attendance" on attendance
  for all using (user_id = auth.uid());

create policy "Teachers can view their students attendance" on attendance
  for select using (
    class_id in (
      select tc.class_id from teacher_classes tc
      where tc.teacher_id = auth.uid()
    )
  );

-- Create indexes for better performance
create index if not exists idx_classes_school_id on classes(school_id);
create index if not exists idx_classes_grade on classes(grade);
create index if not exists idx_classes_is_active on classes(is_active);
create index if not exists idx_teacher_classes_teacher_id on teacher_classes(teacher_id);
create index if not exists idx_teacher_classes_class_id on teacher_classes(class_id);
create index if not exists idx_teacher_classes_school_id on teacher_classes(school_id);
create index if not exists idx_attendance_user_id on attendance(user_id);
create index if not exists idx_attendance_school_id on attendance(school_id);
create index if not exists idx_attendance_date on attendance(date);
create index if not exists idx_attendance_status on attendance(status);

-- Create function to calculate total leave days
create or replace function calculate_leave_days()
returns trigger as $$
begin
  if new.start_date is not null and new.end_date is not null then
    new.total_days := (new.end_date - new.start_date) + 1;
  end if;
  return new;
end;
$$ language plpgsql;

-- Create trigger for leave days calculation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'calculate_leave_days_trigger') THEN
        CREATE TRIGGER calculate_leave_days_trigger BEFORE INSERT OR UPDATE ON teacher_leaves
        FOR EACH ROW EXECUTE PROCEDURE calculate_leave_days();
    END IF;
END $$;

-- Create function to auto-mark attendance on report submission
create or replace function auto_mark_attendance_on_report()
returns trigger as $$
begin
  -- Only process if this is a new report submission
  if TG_OP = 'INSERT' then
    -- Insert or update attendance record for the teacher
    insert into attendance (user_id, school_id, class_id, date, status, recorded_by, recorded_at)
    values (
      new.teacher_id, 
      new.school_id, 
      new.class_id, 
      new.date, 
      'Present', 
      new.teacher_id, 
      now()
    )
    on conflict (user_id, school_id, date) 
    do update set 
      status = case 
        when attendance.status in ('Leave-Approved', 'Leave-Rejected') then attendance.status
        else 'Present'
      end,
      recorded_by = new.teacher_id,
      recorded_at = now(),
      class_id = new.class_id;
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Create trigger for auto-marking attendance
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auto_mark_attendance_trigger') THEN
        CREATE TRIGGER auto_mark_attendance_trigger AFTER INSERT ON teacher_reports
        FOR EACH ROW EXECUTE PROCEDURE auto_mark_attendance_on_report();
    END IF;
END $$;

-- Create function to handle leave approval and update attendance
create or replace function handle_leave_approval()
returns trigger as $$
declare
  leave_date date;
  date_range date[];
begin
  -- Only process if status changed to Approved or Rejected
  if TG_OP = 'UPDATE' and old.status != new.status and new.status in ('Approved', 'Rejected') then
    -- Generate date range for the leave period
    if new.start_date is not null and new.end_date is not null then
      -- Fix: Use ARRAY(SELECT ...) instead of array_agg(generate_series(...))
      select ARRAY(select generate_series(new.start_date, new.end_date, '1 day'::interval)::date)
      into date_range;
      
      -- Insert attendance records for each day in the leave period
      foreach leave_date in array date_range
      loop
        insert into attendance (user_id, school_id, date, status, recorded_by, recorded_at)
        values (
          new.teacher_id,
          new.school_id,
          leave_date,
          case when new.status = 'Approved' then 'Leave-Approved' else 'Leave-Rejected' end,
          new.reviewed_by,
          now()
        )
        on conflict (user_id, school_id, date)
        do update set 
          status = case when new.status = 'Approved' then 'Leave-Approved' else 'Leave-Rejected' end,
          recorded_by = new.reviewed_by,
          recorded_at = now();
      end loop;
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Create trigger for leave approval
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'handle_leave_approval_trigger') THEN
        CREATE TRIGGER handle_leave_approval_trigger AFTER UPDATE ON teacher_leaves
        FOR EACH ROW EXECUTE PROCEDURE handle_leave_approval();
    END IF;
END $$;

-- Create function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_classes_updated_at') THEN
        CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes
        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_teacher_leaves_updated_at') THEN
        CREATE TRIGGER update_teacher_leaves_updated_at BEFORE UPDATE ON teacher_leaves
        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

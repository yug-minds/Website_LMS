-- Enable UUID extension (required for uuid_generate_v4)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schools table
create table schools (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  contact_email text,
  contact_phone text,
  principal_name text,
  joining_codes jsonb, -- e.g. { "grade1": "YUG101", "grade2": "YUG102" }
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Add foreign key constraint to profiles.school_id
alter table profiles add constraint profiles_school_id_fkey foreign key (school_id) references schools(id);

-- Create teacher_schools junction table (many-to-many)
create table teacher_schools (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references profiles(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  is_primary boolean default false,
  assigned_at timestamp with time zone default timezone('utc'::text, now()),
  unique(teacher_id, school_id)
);

-- Create teacher_reports table
create table teacher_reports (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references profiles(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  date date not null,
  class_name text,
  grade text,
  topics_taught text,
  student_count integer,
  duration_hours decimal(3,1),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create teacher_leaves table
create table teacher_leaves (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references profiles(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  leave_date date not null,
  reason text not null,
  status text check (status in ('Pending','Approved','Rejected')) default 'Pending',
  approved_by uuid references profiles(id),
  approved_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create courses table
create table courses (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid references schools(id) on delete cascade,
  grade text not null,
  course_name text not null,
  description text,
  num_chapters integer default 0,
  content_summary jsonb, -- {videos: 10, materials: 5, assignments: 3}
  status text check (status in ('Draft','Published','Archived')) default 'Draft',
  created_by uuid references profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- DEPRECATED: course_chapters table creation removed
-- Use chapters table instead (created in 20241201000008_create_student_dashboard_tables.sql)
-- This table was deprecated and removed in migration 20250127000005_remove_course_chapters_and_teacher_attendance.sql

-- Create student_schools table (students belong to schools)
create table student_schools (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references profiles(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  grade text not null,
  joining_code text,
  enrolled_at timestamp with time zone default timezone('utc'::text, now()),
  is_active boolean default true,
  unique(student_id, school_id)
);

-- Create student_courses table (students enrolled in courses)
create table student_courses (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  enrolled_at timestamp with time zone default timezone('utc'::text, now()),
  progress_percentage decimal(5,2) default 0,
  is_completed boolean default false,
  completed_at timestamp with time zone,
  unique(student_id, course_id)
);

-- Create notifications table
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text check (type in ('info','warning','success','error')) default 'info',
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS on all tables
alter table schools enable row level security;
alter table teacher_schools enable row level security;
alter table teacher_reports enable row level security;
alter table teacher_leaves enable row level security;
alter table courses enable row level security;
-- RLS for course_chapters removed (table deprecated)
alter table student_schools enable row level security;
alter table student_courses enable row level security;
alter table notifications enable row level security;

-- Create RLS policies for schools
create policy "Admins can manage schools" on schools
  for all using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "School admins can view their schools" on schools
  for select using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'school_admin'
    )
  );

-- Create RLS policies for teacher_schools
create policy "Admins can manage teacher schools" on teacher_schools
  for all using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

-- Create RLS policies for teacher_reports
create policy "Teachers can manage their reports" on teacher_reports
  for all using (
    teacher_id = auth.uid() or
    exists (
      select 1 from profiles 
      where id = auth.uid() and role in ('admin', 'school_admin')
    )
  );

-- Create RLS policies for teacher_leaves
create policy "Teachers can manage their leaves" on teacher_leaves
  for all using (
    teacher_id = auth.uid() or
    exists (
      select 1 from profiles 
      where id = auth.uid() and role in ('admin', 'school_admin')
    )
  );

-- Create RLS policies for courses
create policy "Admins can manage courses" on courses
  for all using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "School admins can view their school courses" on courses
  for select using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'school_admin'
    )
  );

-- RLS policy for course_chapters removed (table deprecated)

-- Create RLS policies for student_schools
create policy "Admins can manage student schools" on student_schools
  for all using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "School admins can view their school students" on student_schools
  for select using (
    exists (
      select 1 from profiles 
      where id = auth.uid() and role = 'school_admin'
    )
  );

-- Create RLS policies for student_courses
create policy "Students can view their courses" on student_courses
  for select using (
    student_id = auth.uid() or
    exists (
      select 1 from profiles 
      where id = auth.uid() and role in ('admin', 'school_admin', 'teacher')
    )
  );

-- Create RLS policies for notifications
create policy "Users can manage their notifications" on notifications
  for all using (user_id = auth.uid());

-- Create indexes for better performance
create index idx_teacher_schools_teacher_id on teacher_schools(teacher_id);
create index idx_teacher_schools_school_id on teacher_schools(school_id);
create index idx_teacher_reports_teacher_id on teacher_reports(teacher_id);
create index idx_teacher_reports_school_id on teacher_reports(school_id);
create index idx_teacher_reports_date on teacher_reports(date);
create index idx_teacher_leaves_teacher_id on teacher_leaves(teacher_id);
create index idx_teacher_leaves_school_id on teacher_leaves(school_id);
create index idx_teacher_leaves_status on teacher_leaves(status);
create index idx_courses_school_id on courses(school_id);
create index idx_courses_grade on courses(grade);
-- Index for course_chapters removed (table deprecated)
create index idx_student_schools_student_id on student_schools(student_id);
create index idx_student_schools_school_id on student_schools(school_id);
create index idx_student_courses_student_id on student_courses(student_id);
create index idx_student_courses_course_id on student_courses(course_id);
create index idx_notifications_user_id on notifications(user_id);
create index idx_notifications_is_read on notifications(is_read);

-- Create function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger update_schools_updated_at before update on schools
  for each row execute procedure update_updated_at_column();

create trigger update_courses_updated_at before update on courses
  for each row execute procedure update_updated_at_column();

-- Create comprehensive student dashboard tables
-- This migration adds all necessary tables for the student dashboard functionality

-- DEPRECATED: students table creation removed
-- Use profiles + student_schools instead
-- This table was deprecated and removed in migration 20250127000004_remove_deprecated_tables.sql

-- Update existing courses table to add missing columns
alter table courses 
add column if not exists title text,
add column if not exists subject text,
add column if not exists thumbnail_url text,
add column if not exists is_published boolean default false;

-- Update title column to use course_name if title is null
update courses set title = course_name where title is null;

-- Create chapters table
create table if not exists chapters (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  description text,
  order_index integer not null,
  is_published boolean default false,
  release_date timestamptz,
  created_at timestamptz default timezone('utc'::text, now()),
  updated_at timestamptz default timezone('utc'::text, now())
);

-- Create chapter_contents table
create table if not exists chapter_contents (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid references chapters(id) on delete cascade,
  content_type text check (content_type in ('video', 'text', 'pdf', 'image', 'quiz', 'assignment')) not null,
  title text not null,
  content_url text,
  content_text text,
  order_index integer not null,
  duration_minutes integer,
  is_published boolean default false,
  created_at timestamptz default timezone('utc'::text, now())
);

-- Create enrollments table (student ↔ class/course mapping)
create table if not exists enrollments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references profiles(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  enrolled_on timestamptz default timezone('utc'::text, now()),
  status text default 'active' check (status in ('active', 'completed', 'dropped')),
  progress_percentage decimal(5,2) default 0,
  last_accessed timestamptz,
  created_at timestamptz default timezone('utc'::text, now())
);

-- Create assignments table
create table if not exists assignments (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete cascade,
  class_id uuid references classes(id),
  title text not null,
  description text,
  assignment_type text check (assignment_type in ('mcq', 'essay', 'project', 'quiz')) not null,
  config jsonb, -- For MCQ questions, grading criteria, etc.
  due_date timestamptz,
  max_attempts integer default 1,
  max_marks integer,
  is_published boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default timezone('utc'::text, now()),
  updated_at timestamptz default timezone('utc'::text, now())
);

-- Create submissions table
create table if not exists submissions (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid references assignments(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  file_url text,
  answers_json jsonb, -- For MCQ answers
  text_content text, -- For essay submissions
  grade decimal(5,2),
  feedback text,
  status text check (status in ('draft', 'submitted', 'graded', 'returned')) default 'draft',
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by uuid references profiles(id),
  created_at timestamptz default timezone('utc'::text, now()),
  updated_at timestamptz default timezone('utc'::text, now())
);

-- Create notifications table
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  body text,
  type text check (type in ('assignment', 'grade', 'announcement', 'attendance', 'course', 'general')) not null,
  is_read boolean default false,
  data jsonb, -- Additional data like assignment_id, course_id, etc.
  created_at timestamptz default timezone('utc'::text, now())
);

-- Create certificates table
create table if not exists certificates (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  certificate_url text not null,
  certificate_name text not null,
  issued_at timestamptz default timezone('utc'::text, now()),
  issued_by uuid references profiles(id),
  created_at timestamptz default timezone('utc'::text, now())
);

-- Create student_progress table for tracking chapter completion
create table if not exists student_progress (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete cascade,
  content_id uuid references chapter_contents(id) on delete cascade,
  is_completed boolean default false,
  completed_at timestamptz,
  time_spent_minutes integer default 0,
  created_at timestamptz default timezone('utc'::text, now()),
  unique(student_id, content_id)
);

-- Create doubts/messages table for student-teacher communication
create table if not exists doubts (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references profiles(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  chapter_id uuid references chapters(id),
  assignment_id uuid references assignments(id),
  subject text not null,
  message text not null,
  status text check (status in ('open', 'answered', 'closed')) default 'open',
  response text,
  responded_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()),
  updated_at timestamptz default timezone('utc'::text, now())
);

-- Create student_progress_view
create or replace view student_progress_view as
select 
  s.student_id,
  s.course_id,
  coalesce(c.title, c.course_name) as course_title,
  c.grade as course_grade,
  coalesce(c.subject, c.grade) as course_subject,
  s.progress_percentage,
  s.last_accessed,
  count(distinct ch.id) as total_chapters,
  count(distinct case when sp.is_completed then sp.chapter_id end) as completed_chapters,
  count(distinct a.id) as total_assignments,
  count(distinct case when sub.status = 'graded' then sub.assignment_id end) as completed_assignments,
  avg(sub.grade) as average_grade
from enrollments s
join courses c on c.id = s.course_id
left join chapters ch on ch.course_id = c.id and (ch.is_published = true or ch.is_published is null)
left join student_progress sp on sp.student_id = s.student_id and sp.course_id = s.course_id
left join assignments a on a.course_id = c.id and (a.is_published = true or a.is_published is null)
left join submissions sub on sub.assignment_id = a.id and sub.student_id = s.student_id
where s.status = 'active'
group by s.student_id, s.course_id, coalesce(c.title, c.course_name), c.grade, coalesce(c.subject, c.grade), s.progress_percentage, s.last_accessed;

-- Create student_calendar_view
create or replace view student_calendar_view as
select 
  'class' as event_type,
  c.class_name as title,
  c.grade,
  c.subject,
  tr.date as event_date,
  tr.start_time,
  tr.end_time,
  tr.activities as description,
  'blue' as color
from classes c
join teacher_classes tc on tc.class_id = c.id
join teacher_reports tr on tr.class_id = c.id
join enrollments e on e.class_id = c.id
where e.student_id = auth.uid()

union all

select 
  'assignment' as event_type,
  a.title,
  c.grade,
  coalesce(c.subject, c.grade) as subject,
  a.due_date as event_date,
  null as start_time,
  null as end_time,
  a.description,
  case 
    when a.due_date < now() then 'red'
    when a.due_date < now() + interval '3 days' then 'orange'
    else 'green'
  end as color
from assignments a
join courses c on c.id = a.course_id
join enrollments e on e.course_id = a.course_id
where e.student_id = auth.uid() and (a.is_published = true or a.is_published is null)

union all

select 
  'course' as event_type,
  coalesce(c.title, c.course_name) as title,
  c.grade,
  coalesce(c.subject, c.grade) as subject,
  ch.release_date as event_date,
  null as start_time,
  null as end_time,
  'New chapter released: ' || ch.title as description,
  'purple' as color
from courses c
join chapters ch on ch.course_id = c.id
join enrollments e on e.course_id = c.id
where e.student_id = auth.uid() and (ch.is_published = true or ch.is_published is null) and ch.release_date is not null;

-- RLS for students table removed (table deprecated)
alter table courses enable row level security;
alter table chapters enable row level security;
alter table chapter_contents enable row level security;
alter table enrollments enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table notifications enable row level security;
alter table certificates enable row level security;
alter table student_progress enable row level security;
alter table doubts enable row level security;

-- RLS policies for students table removed (table deprecated)

-- Create RLS policies for courses table
create policy "Students can view published courses" on courses
  for select using (status = 'Published' OR is_published = true);

-- Note: Admin and School Admin policies for courses already exist in previous migrations

-- Create RLS policies for chapters table
create policy "Students can view published chapters" on chapters
  for select using (is_published = true);

-- Note: Admin policies for chapters already exist in previous migrations

-- Create RLS policies for chapter_contents table
create policy "Students can view published chapter contents" on chapter_contents
  for select using (is_published = true);

-- Note: Admin policies for chapter_contents already exist in previous migrations

-- Create RLS policies for enrollments table
create policy "Students can view own enrollments" on enrollments
  for select using (student_id = auth.uid());

create policy "Students can update own enrollment progress" on enrollments
  for update using (student_id = auth.uid());

-- Note: Admin and School Admin policies for enrollments already exist in previous migrations

-- Create RLS policies for assignments table
create policy "Students can view published assignments" on assignments
  for select using (is_published = true);

-- Note: Admin policies for assignments already exist in previous migrations

-- Create RLS policies for submissions table
create policy "Students can manage own submissions" on submissions
  for all using (student_id = auth.uid());

create policy "Teachers can view and grade submissions" on submissions
  for select using (
    assignment_id in (
      select a.id from assignments a
      join courses c on c.id = a.course_id
      join enrollments e on e.course_id = c.id
      join teacher_classes tc on tc.class_id = e.class_id
      where tc.teacher_id = auth.uid()
    )
  );

create policy "Teachers can update submission grades" on submissions
  for update using (
    assignment_id in (
      select a.id from assignments a
      join courses c on c.id = a.course_id
      join enrollments e on e.course_id = c.id
      join teacher_classes tc on tc.class_id = e.class_id
      where tc.teacher_id = auth.uid()
    )
  );

-- Create RLS policies for notifications table
create policy "Users can view own notifications" on notifications
  for select using (user_id = auth.uid());

create policy "Users can update own notifications" on notifications
  for update using (user_id = auth.uid());

create policy "System can create notifications" on notifications
  for insert with check (true);

-- Note: Other notification policies already exist in previous migrations

-- Create RLS policies for certificates table
create policy "Students can view own certificates" on certificates
  for select using (student_id = auth.uid());

-- Note: Admin policies for certificates already exist in previous migrations

-- Create RLS policies for student_progress table
create policy "Students can manage own progress" on student_progress
  for all using (student_id = auth.uid());

create policy "Teachers can view student progress" on student_progress
  for select using (
    course_id in (
      select c.id from courses c
      join enrollments e on e.course_id = c.id
      join teacher_classes tc on tc.class_id = e.class_id
      where tc.teacher_id = auth.uid()
    )
  );

-- Create RLS policies for doubts table
create policy "Students can manage own doubts" on doubts
  for all using (student_id = auth.uid());

create policy "Teachers can view and respond to doubts" on doubts
  for all using (teacher_id = auth.uid());

-- Create indexes for better performance
-- Indexes for students table removed (table deprecated)
create index if not exists idx_courses_school_id on courses(school_id);
create index if not exists idx_courses_is_published on courses(is_published);
create index if not exists idx_chapters_course_id on chapters(course_id);
create index if not exists idx_chapters_is_published on chapters(is_published);
create index if not exists idx_chapter_contents_chapter_id on chapter_contents(chapter_id);
create index if not exists idx_chapter_contents_is_published on chapter_contents(is_published);
create index if not exists idx_enrollments_student_id on enrollments(student_id);
create index if not exists idx_enrollments_course_id on enrollments(course_id);
create index if not exists idx_enrollments_class_id on enrollments(class_id);
create index if not exists idx_assignments_course_id on assignments(course_id);
create index if not exists idx_assignments_class_id on assignments(class_id);
create index if not exists idx_assignments_is_published on assignments(is_published);
create index if not exists idx_submissions_student_id on submissions(student_id);
create index if not exists idx_submissions_assignment_id on submissions(assignment_id);
create index if not exists idx_notifications_user_id on notifications(user_id);
create index if not exists idx_notifications_is_read on notifications(is_read);
create index if not exists idx_certificates_student_id on certificates(student_id);
create index if not exists idx_student_progress_student_id on student_progress(student_id);
create index if not exists idx_student_progress_course_id on student_progress(course_id);
create index if not exists idx_doubts_student_id on doubts(student_id);
create index if not exists idx_doubts_teacher_id on doubts(teacher_id);

-- Create function to update student progress
create or replace function update_student_progress()
returns trigger as $$
declare
  course_id uuid;
  total_contents integer;
  completed_contents integer;
  progress_percentage decimal(5,2);
begin
  -- Get course_id from the content
  select c.course_id into course_id
  from chapter_contents cc
  join chapters c on c.id = cc.chapter_id
  where cc.id = new.content_id;
  
  -- Calculate progress
  select 
    count(*),
    count(case when sp.is_completed then 1 end)
  into total_contents, completed_contents
  from chapter_contents cc
  join chapters c on c.id = cc.chapter_id
  left join student_progress sp on sp.content_id = cc.id and sp.student_id = new.student_id
  where c.course_id = course_id and cc.is_published = true;
  
  if total_contents > 0 then
    progress_percentage := (completed_contents::decimal / total_contents::decimal) * 100;
    
    -- Update enrollment progress
    update enrollments 
    set progress_percentage = progress_percentage,
        last_accessed = now()
    where student_id = new.student_id and course_id = course_id;
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Create trigger for updating student progress
create trigger update_student_progress_trigger
  after insert or update on student_progress
  for each row execute procedure update_student_progress();

-- Create function to auto-grade MCQ assignments
create or replace function auto_grade_mcq_submission()
returns trigger as $$
declare
  assignment_config jsonb;
  correct_answers jsonb;
  student_answers jsonb;
  total_questions integer;
  correct_count integer := 0;
  grade decimal(5,2);
begin
  -- Only process if this is a new submission
  if TG_OP = 'INSERT' and new.assignment_id is not null then
    -- Get assignment configuration
    select config into assignment_config
    from assignments
    where id = new.assignment_id and assignment_type = 'mcq';
    
    if assignment_config is not null then
      -- Extract correct answers and student answers
      correct_answers := assignment_config->'correct_answers';
      student_answers := new.answers_json;
      
      -- Count total questions
      total_questions := jsonb_array_length(correct_answers);
      
      -- Compare answers and count correct ones
      for i in 0..total_questions-1 loop
        if (correct_answers->i) = (student_answers->i) then
          correct_count := correct_count + 1;
        end if;
      end loop;
      
      -- Calculate grade
      if total_questions > 0 then
        grade := (correct_count::decimal / total_questions::decimal) * 100;
        
        -- Update submission with grade
        update submissions
        set grade = grade,
            status = 'graded',
            graded_at = now()
        where id = new.id;
        
        -- Create notification for student
        insert into notifications (user_id, title, body, type, data)
        values (
          new.student_id,
          'Assignment Graded',
          'Your MCQ assignment has been automatically graded.',
          'grade',
          jsonb_build_object('assignment_id', new.assignment_id, 'grade', grade)
        );
      end if;
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Create trigger for auto-grading MCQ submissions
create trigger auto_grade_mcq_submission_trigger
  after insert on submissions
  for each row execute procedure auto_grade_mcq_submission();

-- Create function to update updated_at timestamp
create or replace function update_student_tables_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at (only if they don't exist and tables exist)
DO $$
BEGIN
    -- Only create trigger if students table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'students') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_students_updated_at') THEN
            CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
            FOR EACH ROW EXECUTE PROCEDURE update_student_tables_updated_at();
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'courses') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_courses_updated_at') THEN
            CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
            FOR EACH ROW EXECUTE PROCEDURE update_student_tables_updated_at();
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chapters') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chapters_updated_at') THEN
            CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters
            FOR EACH ROW EXECUTE PROCEDURE update_student_tables_updated_at();
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'assignments') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_assignments_updated_at') THEN
            CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments
            FOR EACH ROW EXECUTE PROCEDURE update_student_tables_updated_at();
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'submissions') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_submissions_updated_at') THEN
            CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions
            FOR EACH ROW EXECUTE PROCEDURE update_student_tables_updated_at();
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'doubts') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_doubts_updated_at') THEN
            CREATE TRIGGER update_doubts_updated_at BEFORE UPDATE ON doubts
            FOR EACH ROW EXECUTE PROCEDURE update_student_tables_updated_at();
        END IF;
    END IF;
END $$;

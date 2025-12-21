-- Fix auto_grade_mcq_submission function to prevent "relation assignments does not exist" error
-- This error occurs because the function was missing explicit schema qualification and search_path

create or replace function public.auto_grade_mcq_submission()
returns trigger 
SECURITY DEFINER
SET search_path = public
as $$
declare
  assignment_config jsonb;
  correct_answers jsonb;
  student_answers jsonb;
  total_questions integer;
  correct_count integer := 0;
  grade decimal(5,2);
  creator_id uuid;
  course_id_val uuid;
  school_id_val uuid;
begin
  -- Only process if this is a new submission
  if TG_OP = 'INSERT' and new.assignment_id is not null then
    -- Get assignment configuration and creator
    select config, created_by, course_id into assignment_config, creator_id, course_id_val
    from public.assignments
    where id = new.assignment_id;
    
    -- Check if it's an auto-gradable assignment (MCQ or Fill Blank)
    -- We'll process if it has config with correct_answers, regardless of type label if possible,
    -- but usually restricted by type. Let's allowing fill_blank too.
    if assignment_config is not null and (assignment_config->'correct_answers') is not null then
      
      -- Extract correct answers and student answers
      correct_answers := assignment_config->'correct_answers';
      student_answers := new.answers_json;
      
      -- Count total questions
      -- Handle case where correct_answers might be null or not an array
      if correct_answers is not null and jsonb_typeof(correct_answers) = 'array' then
        total_questions := jsonb_array_length(correct_answers);
        
        -- Compare answers and count correct ones
        for i in 0..total_questions-1 loop
           -- Handle different value types (string for fill_blank, number for mcq) by direct JSONB comparison
          if (correct_answers->i) = (student_answers->i) then
            correct_count := correct_count + 1;
          end if;
        end loop;
        
        -- Calculate grade
        if total_questions > 0 then
          grade := (correct_count::decimal / total_questions::decimal) * 100;
          
          -- Update submission with grade
          update public.submissions
          set grade = grade,
              status = 'graded',
              graded_at = now()
          where id = new.id;
          
          -- 1. Notification for Student
          insert into public.notifications (user_id, title, body, type, data)
          values (
            new.student_id,
            'Assignment Graded',
            'Your assignment has been automatically graded.',
            'grade',
            jsonb_build_object('assignment_id', new.assignment_id, 'grade', grade)
          );

          -- 2. Notification for Teacher (Creator)
          if creator_id is not null then
            insert into public.notifications (user_id, title, body, type, data)
            values (
              creator_id,
              'New Submission Graded',
              'A student submission has been auto-graded.',
              'assignment',
              jsonb_build_object('assignment_id', new.assignment_id, 'student_id', new.student_id, 'grade', grade)
            );
          end if;

          -- 3. Notification for School Admins
          -- Find school_id from course
          select school_id into school_id_val from public.courses where id = course_id_val;
          
          if school_id_val is not null then
            insert into public.notifications (user_id, title, body, type, data)
            select 
              profile_id,
              'New Submission Graded',
              'A student submission has been auto-graded in your school.',
              'assignment',
              jsonb_build_object('assignment_id', new.assignment_id, 'school_id', school_id_val, 'grade', grade)
            from public.school_admins
            where school_id = school_id_val and is_active = true;
          end if;

        end if;
      end if;
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql;

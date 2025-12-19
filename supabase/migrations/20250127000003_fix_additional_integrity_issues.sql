-- ==========================================================
-- Migration: Fix Additional Data Integrity Issues
-- Date: 2025-01-27
-- Purpose: Fix multi-FK consistency and cross-table validation issues
-- ==========================================================

-- ==========================================================
-- PART 1: Fix teacher_classes Consistency
-- ==========================================================

-- Function to validate teacher_classes consistency
CREATE OR REPLACE FUNCTION validate_teacher_classes_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate school_id matches class's school_id
  IF EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = NEW.class_id
    AND c.school_id != NEW.school_id
  ) THEN
    RAISE EXCEPTION 'teacher_classes.school_id must match classes.school_id';
  END IF;

  -- Validate teacher is assigned to this school
  IF NOT EXISTS (
    SELECT 1 FROM teacher_schools ts
    WHERE ts.teacher_id = NEW.teacher_id
    AND ts.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'teacher_id must be assigned to school_id via teacher_schools';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_teacher_classes_consistency_trigger ON teacher_classes;
CREATE TRIGGER validate_teacher_classes_consistency_trigger
  BEFORE INSERT OR UPDATE ON teacher_classes
  FOR EACH ROW
  EXECUTE FUNCTION validate_teacher_classes_consistency();

-- Fix existing inconsistent records
UPDATE teacher_classes tc
SET school_id = c.school_id
FROM classes c
WHERE tc.class_id = c.id
  AND tc.school_id != c.school_id;

-- Delete teacher_classes where teacher is not assigned to school
DELETE FROM teacher_classes tc
WHERE NOT EXISTS (
  SELECT 1 FROM teacher_schools ts
  WHERE ts.teacher_id = tc.teacher_id
  AND ts.school_id = tc.school_id
);

-- ==========================================================
-- PART 2: Fix class_schedules Consistency
-- ==========================================================

-- Function to validate class_schedules consistency
CREATE OR REPLACE FUNCTION validate_class_schedules_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate school_id matches class's school_id
  IF EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = NEW.class_id
    AND c.school_id != NEW.school_id
  ) THEN
    RAISE EXCEPTION 'class_schedules.school_id must match classes.school_id';
  END IF;

  -- Validate school_id matches period's school_id (if period_id provided)
  IF NEW.period_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM periods p
    WHERE p.id = NEW.period_id
    AND p.school_id != NEW.school_id
  ) THEN
    RAISE EXCEPTION 'class_schedules.school_id must match periods.school_id';
  END IF;

  -- Validate school_id matches room's school_id (if room_id provided)
  IF NEW.room_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM rooms r
    WHERE r.id = NEW.room_id
    AND r.school_id != NEW.school_id
  ) THEN
    RAISE EXCEPTION 'class_schedules.school_id must match rooms.school_id';
  END IF;

  -- Validate teacher is assigned to this school (if teacher_id provided)
  IF NEW.teacher_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teacher_schools ts
    WHERE ts.teacher_id = NEW.teacher_id
    AND ts.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'teacher_id must be assigned to school_id via teacher_schools';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_class_schedules_consistency_trigger ON class_schedules;
CREATE TRIGGER validate_class_schedules_consistency_trigger
  BEFORE INSERT OR UPDATE ON class_schedules
  FOR EACH ROW
  EXECUTE FUNCTION validate_class_schedules_consistency();

-- Fix existing inconsistent records
UPDATE class_schedules cs
SET school_id = c.school_id
FROM classes c
WHERE cs.class_id = c.id
  AND cs.school_id != c.school_id;

-- Delete class_schedules where period/room/teacher don't match school
DELETE FROM class_schedules cs
WHERE (
  -- Period doesn't match school
  (cs.period_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM periods p WHERE p.id = cs.period_id AND p.school_id != cs.school_id
  ))
  OR
  -- Room doesn't match school
  (cs.room_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM rooms r WHERE r.id = cs.room_id AND r.school_id != cs.school_id
  ))
  OR
  -- Teacher not assigned to school
  (cs.teacher_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teacher_schools ts 
    WHERE ts.teacher_id = cs.teacher_id AND ts.school_id = cs.school_id
  ))
);

-- ==========================================================
-- PART 3: Fix attendance Consistency
-- ==========================================================

-- Function to validate attendance consistency
CREATE OR REPLACE FUNCTION validate_attendance_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate school_id matches class's school_id (if class_id provided)
  IF NEW.class_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = NEW.class_id
    AND c.school_id != NEW.school_id
  ) THEN
    RAISE EXCEPTION 'attendance.school_id must match classes.school_id';
  END IF;

  -- Validate user is assigned to this school
  -- Check if user is student
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND role = 'student') THEN
    IF NOT EXISTS (
      SELECT 1 FROM student_schools ss
      WHERE ss.student_id = NEW.user_id
      AND ss.school_id = NEW.school_id
      AND ss.is_active = true
    ) THEN
      RAISE EXCEPTION 'student_id must be enrolled in school_id via student_schools';
    END IF;
  -- Check if user is teacher
  ELSIF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND role = 'teacher') THEN
    IF NOT EXISTS (
      SELECT 1 FROM teacher_schools ts
      WHERE ts.teacher_id = NEW.user_id
      AND ts.school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'teacher_id must be assigned to school_id via teacher_schools';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_attendance_consistency_trigger ON attendance;
CREATE TRIGGER validate_attendance_consistency_trigger
  BEFORE INSERT OR UPDATE ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION validate_attendance_consistency();

-- Fix existing inconsistent records
UPDATE attendance a
SET school_id = c.school_id
FROM classes c
WHERE a.class_id = c.id
  AND a.school_id != c.school_id;

-- Delete attendance where user is not assigned to school
DELETE FROM attendance a
WHERE NOT EXISTS (
  SELECT 1 FROM student_schools ss
  WHERE ss.student_id = a.user_id
  AND ss.school_id = a.school_id
  AND ss.is_active = true
)
AND NOT EXISTS (
  SELECT 1 FROM teacher_schools ts
  WHERE ts.teacher_id = a.user_id
  AND ts.school_id = a.school_id
);

-- ==========================================================
-- PART 4: Fix teacher_reports Consistency
-- ==========================================================

-- Function to validate teacher_reports consistency
CREATE OR REPLACE FUNCTION validate_teacher_reports_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate school_id matches class's school_id (if class_id provided)
  IF NEW.class_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = NEW.class_id
    AND c.school_id != NEW.school_id
  ) THEN
    RAISE EXCEPTION 'teacher_reports.school_id must match classes.school_id';
  END IF;

  -- Validate teacher is assigned to this school
  IF NOT EXISTS (
    SELECT 1 FROM teacher_schools ts
    WHERE ts.teacher_id = NEW.teacher_id
    AND ts.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'teacher_id must be assigned to school_id via teacher_schools';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_teacher_reports_consistency_trigger ON teacher_reports;
CREATE TRIGGER validate_teacher_reports_consistency_trigger
  BEFORE INSERT OR UPDATE ON teacher_reports
  FOR EACH ROW
  EXECUTE FUNCTION validate_teacher_reports_consistency();

-- Fix existing inconsistent records
UPDATE teacher_reports tr
SET school_id = c.school_id
FROM classes c
WHERE tr.class_id = c.id
  AND tr.school_id != c.school_id;

-- Delete teacher_reports where teacher is not assigned to school
DELETE FROM teacher_reports tr
WHERE NOT EXISTS (
  SELECT 1 FROM teacher_schools ts
  WHERE ts.teacher_id = tr.teacher_id
  AND ts.school_id = tr.school_id
);

-- ==========================================================
-- PART 5: Fix student_classes Consistency
-- ==========================================================

-- Function to validate student_classes consistency
CREATE OR REPLACE FUNCTION validate_student_classes_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate student is enrolled in same school as class
  IF NOT EXISTS (
    SELECT 1 FROM student_schools ss
    JOIN classes c ON c.id = NEW.class_id
    WHERE ss.student_id = NEW.student_id
    AND ss.school_id = c.school_id
    AND ss.is_active = true
  ) THEN
    RAISE EXCEPTION 'student_id must be enrolled in the same school as class_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_student_classes_consistency_trigger ON student_classes;
CREATE TRIGGER validate_student_classes_consistency_trigger
  BEFORE INSERT OR UPDATE ON student_classes
  FOR EACH ROW
  EXECUTE FUNCTION validate_student_classes_consistency();

-- Delete inconsistent student_classes records
DELETE FROM student_classes sc
WHERE NOT EXISTS (
  SELECT 1 FROM student_schools ss
  JOIN classes c ON c.id = sc.class_id
  WHERE ss.student_id = sc.student_id
  AND ss.school_id = c.school_id
  AND ss.is_active = true
);

-- ==========================================================
-- PART 6: Fix enrollments Consistency
-- ==========================================================

-- Function to validate enrollments consistency
CREATE OR REPLACE FUNCTION validate_enrollments_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If course_id is provided, validate student has access to course
  IF NEW.course_id IS NOT NULL THEN
    -- Check via course_access (student's school and grade)
    IF NOT EXISTS (
      SELECT 1 FROM course_access ca
      JOIN student_schools ss ON ss.student_id = NEW.student_id
        AND ss.school_id = ca.school_id
        AND ss.grade = ca.grade
        AND ss.is_active = true
      WHERE ca.course_id = NEW.course_id
    ) AND NOT EXISTS (
      -- Also check via student_courses (direct enrollment)
      SELECT 1 FROM student_courses sc
      WHERE sc.student_id = NEW.student_id
      AND sc.course_id = NEW.course_id
    ) THEN
      RAISE EXCEPTION 'student_id must have access to course_id via course_access or student_courses';
    END IF;
  END IF;

  -- If class_id is provided, validate student is in same school as class
  IF NEW.class_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM student_schools ss
      JOIN classes c ON c.id = NEW.class_id
      WHERE ss.student_id = NEW.student_id
      AND ss.school_id = c.school_id
      AND ss.is_active = true
    ) THEN
      RAISE EXCEPTION 'student_id must be enrolled in the same school as class_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_enrollments_consistency_trigger ON enrollments;
CREATE TRIGGER validate_enrollments_consistency_trigger
  BEFORE INSERT OR UPDATE ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION validate_enrollments_consistency();

-- Delete enrollments where student doesn't have access
DELETE FROM enrollments e
WHERE e.course_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.student_id = e.student_id
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade
      AND ss.is_active = true
    WHERE ca.course_id = e.course_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM student_courses sc
    WHERE sc.student_id = e.student_id
    AND sc.course_id = e.course_id
  );

-- Delete enrollments where student is in different school than class
DELETE FROM enrollments e
WHERE e.class_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM student_schools ss
    JOIN classes c ON c.id = e.class_id
    WHERE ss.student_id = e.student_id
    AND ss.school_id = c.school_id
    AND ss.is_active = true
  );

-- ==========================================================
-- PART 7: Fix submissions Consistency
-- ==========================================================

-- Function to validate submissions consistency
CREATE OR REPLACE FUNCTION validate_submissions_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate student has access to course containing this assignment
  IF NOT EXISTS (
    -- Check via course_access (student's school and grade)
    SELECT 1 FROM assignments a
    JOIN course_access ca ON ca.course_id = a.course_id
    JOIN student_schools ss ON ss.student_id = NEW.student_id
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade
      AND ss.is_active = true
    WHERE a.id = NEW.assignment_id
  ) AND NOT EXISTS (
    -- Also check via student_courses (direct enrollment)
    SELECT 1 FROM assignments a
    JOIN student_courses sc ON sc.student_id = NEW.student_id
      AND sc.course_id = a.course_id
    WHERE a.id = NEW.assignment_id
  ) THEN
    RAISE EXCEPTION 'student_id must have access to course containing assignment_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_submissions_consistency_trigger ON submissions;
CREATE TRIGGER validate_submissions_consistency_trigger
  BEFORE INSERT OR UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION validate_submissions_consistency();

-- Note: We don't delete existing submissions as they may be historical data
-- But we prevent new invalid submissions

-- ==========================================================
-- PART 8: Fix student_progress Consistency
-- ==========================================================

-- Function to validate student_progress consistency
CREATE OR REPLACE FUNCTION validate_student_progress_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate chapter belongs to course
  IF NEW.chapter_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM chapters ch
    WHERE ch.id = NEW.chapter_id
    AND ch.course_id != NEW.course_id
  ) THEN
    RAISE EXCEPTION 'chapter_id must belong to course_id';
  END IF;

  -- Validate content belongs to chapter
  IF NEW.content_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM chapter_contents cc
    JOIN chapters ch ON ch.id = cc.chapter_id
    WHERE cc.id = NEW.content_id
    AND ch.course_id != NEW.course_id
  ) THEN
    RAISE EXCEPTION 'content_id must belong to a chapter in course_id';
  END IF;

  -- Validate student has access to course
  IF NOT EXISTS (
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.student_id = NEW.student_id
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade
      AND ss.is_active = true
    WHERE ca.course_id = NEW.course_id
  ) AND NOT EXISTS (
    SELECT 1 FROM student_courses sc
    WHERE sc.student_id = NEW.student_id
    AND sc.course_id = NEW.course_id
  ) THEN
    RAISE EXCEPTION 'student_id must have access to course_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_student_progress_consistency_trigger ON student_progress;
CREATE TRIGGER validate_student_progress_consistency_trigger
  BEFORE INSERT OR UPDATE ON student_progress
  FOR EACH ROW
  EXECUTE FUNCTION validate_student_progress_consistency();

-- Delete inconsistent student_progress records
DELETE FROM student_progress sp
WHERE (
  -- Chapter doesn't belong to course
  (sp.chapter_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM chapters ch
    WHERE ch.id = sp.chapter_id AND ch.course_id != sp.course_id
  ))
  OR
  -- Content doesn't belong to course's chapter
  (sp.content_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM chapter_contents cc
    JOIN chapters ch ON ch.id = cc.chapter_id
    WHERE cc.id = sp.content_id AND ch.course_id != sp.course_id
  ))
  OR
  -- Student doesn't have access to course
  (NOT EXISTS (
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.student_id = sp.student_id
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade
      AND ss.is_active = true
    WHERE ca.course_id = sp.course_id
  ) AND NOT EXISTS (
    SELECT 1 FROM student_courses sc
    WHERE sc.student_id = sp.student_id AND sc.course_id = sp.course_id
  ))
);

-- ==========================================================
-- PART 9: Fix doubts Consistency
-- ==========================================================

-- Function to validate doubts consistency
CREATE OR REPLACE FUNCTION validate_doubts_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate student and teacher are in same school
  IF NOT EXISTS (
    SELECT 1 FROM student_schools ss
    JOIN teacher_schools ts ON ts.teacher_id = NEW.teacher_id
    WHERE ss.student_id = NEW.student_id
    AND ss.school_id = ts.school_id
    AND ss.is_active = true
  ) THEN
    RAISE EXCEPTION 'student_id and teacher_id must be in the same school';
  END IF;

  -- Validate chapter belongs to course (if both provided)
  IF NEW.chapter_id IS NOT NULL AND NEW.course_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM chapters ch
    WHERE ch.id = NEW.chapter_id
    AND ch.course_id != NEW.course_id
  ) THEN
    RAISE EXCEPTION 'chapter_id must belong to course_id';
  END IF;

  -- Validate assignment belongs to course (if both provided)
  IF NEW.assignment_id IS NOT NULL AND NEW.course_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.id = NEW.assignment_id
    AND a.course_id != NEW.course_id
  ) THEN
    RAISE EXCEPTION 'assignment_id must belong to course_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_doubts_consistency_trigger ON doubts;
CREATE TRIGGER validate_doubts_consistency_trigger
  BEFORE INSERT OR UPDATE ON doubts
  FOR EACH ROW
  EXECUTE FUNCTION validate_doubts_consistency();

-- Delete inconsistent doubts records
DELETE FROM doubts d
WHERE NOT EXISTS (
  SELECT 1 FROM student_schools ss
  JOIN teacher_schools ts ON ts.teacher_id = d.teacher_id
  WHERE ss.student_id = d.student_id
  AND ss.school_id = ts.school_id
  AND ss.is_active = true
);

-- ==========================================================
-- PART 10: Fix certificates Consistency (Business Logic)
-- ==========================================================

-- Function to validate certificates consistency
CREATE OR REPLACE FUNCTION validate_certificates_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate student was enrolled in course
  IF NOT EXISTS (
    SELECT 1 FROM student_courses sc
    WHERE sc.student_id = NEW.student_id
    AND sc.course_id = NEW.course_id
    AND sc.is_completed = true
  ) AND NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = NEW.student_id
    AND e.course_id = NEW.course_id
    AND e.status = 'completed'
  ) THEN
    RAISE WARNING 'Certificate issued for student who may not have completed course';
    -- Don't block, but log warning
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_certificates_consistency_trigger ON certificates;
CREATE TRIGGER validate_certificates_consistency_trigger
  BEFORE INSERT OR UPDATE ON certificates
  FOR EACH ROW
  EXECUTE FUNCTION validate_certificates_consistency();

-- ==========================================================
-- PART 11: Add Indexes for Performance
-- ==========================================================

-- Indexes for faster validation lookups
CREATE INDEX IF NOT EXISTS idx_classes_school_id_lookup ON classes(school_id, id);
CREATE INDEX IF NOT EXISTS idx_periods_school_id_lookup ON periods(school_id, id);
CREATE INDEX IF NOT EXISTS idx_rooms_school_id_lookup ON rooms(school_id, id);
CREATE INDEX IF NOT EXISTS idx_assignments_course_id_lookup ON assignments(course_id, id);
CREATE INDEX IF NOT EXISTS idx_chapters_course_id_lookup ON chapters(course_id, id);
CREATE INDEX IF NOT EXISTS idx_chapter_contents_chapter_id_lookup ON chapter_contents(chapter_id, id);

-- ==========================================================
-- PART 12: Update check_data_integrity Function
-- ==========================================================

-- Add checks for new issues to the integrity function
CREATE OR REPLACE FUNCTION check_data_integrity()
RETURNS TABLE (
  issue_type TEXT,
  table_name TEXT,
  record_count BIGINT,
  description TEXT
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Existing checks (from previous migration)
  SELECT 
    'data_inconsistency'::TEXT,
    'profiles vs student_schools'::TEXT,
    COUNT(*)::BIGINT,
    'Students with profiles.school_id != student_schools.school_id'::TEXT
  FROM profiles p
  LEFT JOIN student_schools ss ON ss.student_id = p.id AND ss.is_active = true
  WHERE p.role = 'student'
    AND (p.school_id IS DISTINCT FROM ss.school_id)
  
  UNION ALL
  
  SELECT 
    'data_inconsistency'::TEXT,
    'profiles vs school_admins'::TEXT,
    COUNT(*)::BIGINT,
    'School admins with profiles.school_id != school_admins.school_id'::TEXT
  FROM profiles p
  JOIN school_admins sa ON sa.profile_id = p.id
  WHERE p.role = 'school_admin'
    AND p.school_id IS DISTINCT FROM sa.school_id
  
  UNION ALL
  
  SELECT 
    'data_inconsistency'::TEXT,
    'profiles vs teacher_schools'::TEXT,
    COUNT(*)::BIGINT,
    'Teachers with profiles.school_id != primary teacher_schools.school_id'::TEXT
  FROM profiles p
  JOIN teacher_schools ts ON ts.teacher_id = p.id AND ts.is_primary = true
  WHERE p.role = 'teacher'
    AND p.school_id IS DISTINCT FROM ts.school_id
  
  UNION ALL
  
  -- New checks for multi-FK consistency
  SELECT 
    'multi_fk_inconsistency'::TEXT,
    'teacher_classes'::TEXT,
    COUNT(*)::BIGINT,
    'teacher_classes with inconsistent school_id, class_id, or teacher_id'::TEXT
  FROM teacher_classes tc
  JOIN classes c ON c.id = tc.class_id
  LEFT JOIN teacher_schools ts ON ts.teacher_id = tc.teacher_id AND ts.school_id = tc.school_id
  WHERE tc.school_id != c.school_id OR ts.id IS NULL
  
  UNION ALL
  
  SELECT 
    'multi_fk_inconsistency'::TEXT,
    'class_schedules'::TEXT,
    COUNT(*)::BIGINT,
    'class_schedules with inconsistent school_id, class_id, period_id, room_id, or teacher_id'::TEXT
  FROM class_schedules cs
  JOIN classes c ON c.id = cs.class_id
  LEFT JOIN periods p ON p.id = cs.period_id
  LEFT JOIN rooms r ON r.id = cs.room_id
  LEFT JOIN teacher_schools ts ON ts.teacher_id = cs.teacher_id AND ts.school_id = cs.school_id
  WHERE cs.school_id != c.school_id
    OR (cs.period_id IS NOT NULL AND (p.id IS NULL OR cs.school_id != p.school_id))
    OR (cs.room_id IS NOT NULL AND (r.id IS NULL OR cs.school_id != r.school_id))
    OR (cs.teacher_id IS NOT NULL AND ts.id IS NULL)
  
  UNION ALL
  
  SELECT 
    'multi_fk_inconsistency'::TEXT,
    'attendance'::TEXT,
    COUNT(*)::BIGINT,
    'attendance with inconsistent user_id, school_id, or class_id'::TEXT
  FROM attendance a
  LEFT JOIN classes c ON c.id = a.class_id
  LEFT JOIN student_schools ss ON ss.student_id = a.user_id AND ss.school_id = a.school_id AND ss.is_active = true
  LEFT JOIN teacher_schools ts ON ts.teacher_id = a.user_id AND ts.school_id = a.school_id
  WHERE (a.class_id IS NOT NULL AND a.school_id != c.school_id)
    OR (ss.id IS NULL AND ts.id IS NULL)
  
  UNION ALL
  
  SELECT 
    'multi_fk_inconsistency'::TEXT,
    'teacher_reports'::TEXT,
    COUNT(*)::BIGINT,
    'teacher_reports with inconsistent teacher_id, school_id, or class_id'::TEXT
  FROM teacher_reports tr
  LEFT JOIN classes c ON c.id = tr.class_id
  LEFT JOIN teacher_schools ts ON ts.teacher_id = tr.teacher_id AND ts.school_id = tr.school_id
  WHERE (tr.class_id IS NOT NULL AND tr.school_id != c.school_id)
    OR ts.id IS NULL
  
  UNION ALL
  
  SELECT 
    'cross_table_validation'::TEXT,
    'student_classes'::TEXT,
    COUNT(*)::BIGINT,
    'student_classes where student is not in same school as class'::TEXT
  FROM student_classes sc
  JOIN classes c ON c.id = sc.class_id
  LEFT JOIN student_schools ss ON ss.student_id = sc.student_id AND ss.school_id = c.school_id AND ss.is_active = true
  WHERE ss.id IS NULL
  
  UNION ALL
  
  SELECT 
    'cross_table_validation'::TEXT,
    'enrollments'::TEXT,
    COUNT(*)::BIGINT,
    'enrollments where student does not have access to course'::TEXT
  FROM enrollments e
  WHERE e.course_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM course_access ca
      JOIN student_schools ss ON ss.student_id = e.student_id
        AND ss.school_id = ca.school_id
        AND ss.grade = ca.grade
        AND ss.is_active = true
      WHERE ca.course_id = e.course_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM student_courses sc
      WHERE sc.student_id = e.student_id AND sc.course_id = e.course_id
    )
  
  UNION ALL
  
  SELECT 
    'cross_table_validation'::TEXT,
    'submissions'::TEXT,
    COUNT(*)::BIGINT,
    'submissions where student does not have access to assignment course'::TEXT
  FROM submissions s
  JOIN assignments a ON a.id = s.assignment_id
  WHERE NOT EXISTS (
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.student_id = s.student_id
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade
      AND ss.is_active = true
    WHERE ca.course_id = a.course_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM student_courses sc
    WHERE sc.student_id = s.student_id AND sc.course_id = a.course_id
  )
  
  UNION ALL
  
  SELECT 
    'cross_table_validation'::TEXT,
    'student_progress'::TEXT,
    COUNT(*)::BIGINT,
    'student_progress where student does not have access to course'::TEXT
  FROM student_progress sp
  WHERE NOT EXISTS (
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.student_id = sp.student_id
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade
      AND ss.is_active = true
    WHERE ca.course_id = sp.course_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM student_courses sc
    WHERE sc.student_id = sp.student_id AND sc.course_id = sp.course_id
  )
  
  UNION ALL
  
  SELECT 
    'cross_table_validation'::TEXT,
    'doubts'::TEXT,
    COUNT(*)::BIGINT,
    'doubts where student and teacher are not in same school'::TEXT
  FROM doubts d
  WHERE NOT EXISTS (
    SELECT 1 FROM student_schools ss
    JOIN teacher_schools ts ON ts.teacher_id = d.teacher_id
    WHERE ss.student_id = d.student_id
    AND ss.school_id = ts.school_id
    AND ss.is_active = true
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_data_integrity() IS 'Checks for all data integrity issues including multi-FK consistency and cross-table validation';















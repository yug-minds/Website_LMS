-- Transaction functions for atomic multi-table operations
-- These functions ensure data consistency and prevent race conditions

-- Function to create student profile and enrollment atomically
CREATE OR REPLACE FUNCTION create_student_enrollment(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_school_id uuid,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL,
  p_grade text DEFAULT 'Not Specified',
  p_joining_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id uuid;
  v_enrollment_id uuid;
  v_result jsonb;
BEGIN
  -- Validate school exists
  IF NOT EXISTS (SELECT 1 FROM schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'School not found'
    );
  END IF;

  -- Start transaction (implicit in function)
  BEGIN
    -- Insert profile
    INSERT INTO profiles (
      id,
      full_name,
      email,
      role,
      phone,
      address,
      parent_name,
      parent_phone,
      force_password_change,
      school_id
    ) VALUES (
      p_user_id,
      p_full_name,
      p_email,
      'student',
      p_phone,
      p_address,
      p_parent_name,
      p_parent_phone,
      true,
      p_school_id
    )
    RETURNING id INTO v_profile_id;

    -- Insert student_schools enrollment
    INSERT INTO student_schools (
      student_id,
      school_id,
      grade,
      joining_code,
      enrolled_at,
      is_active
    ) VALUES (
      p_user_id,
      p_school_id,
      p_grade,
      p_joining_code,
      NOW(),
      true
    )
    RETURNING id INTO v_enrollment_id;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'profile_id', v_profile_id,
      'enrollment_id', v_enrollment_id
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback is automatic in function
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;
END;
$$;

-- Function to update student profile and enrollment atomically
CREATE OR REPLACE FUNCTION update_student_enrollment(
  p_student_id uuid,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL,
  p_school_id uuid DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_joining_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_existing_enrollment_id uuid;
BEGIN
  BEGIN
    -- Update profile if any profile fields provided
    IF p_full_name IS NOT NULL OR p_email IS NOT NULL OR p_phone IS NOT NULL 
       OR p_address IS NOT NULL OR p_parent_name IS NOT NULL OR p_parent_phone IS NOT NULL THEN
      
      UPDATE profiles
      SET
        full_name = COALESCE(p_full_name, full_name),
        email = COALESCE(p_email, email),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        parent_name = COALESCE(p_parent_name, parent_name),
        parent_phone = COALESCE(p_parent_phone, parent_phone),
        updated_at = NOW()
      WHERE id = p_student_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Student not found'
        );
      END IF;
    END IF;

    -- Update enrollment if school_id provided
    IF p_school_id IS NOT NULL THEN
      -- Validate school exists
      IF NOT EXISTS (SELECT 1 FROM schools WHERE id = p_school_id) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'School not found'
        );
      END IF;

      -- Deactivate existing active enrollments
      UPDATE student_schools
      SET is_active = false
      WHERE student_id = p_student_id
        AND is_active = true;

      -- Check if enrollment already exists for this school
      SELECT id INTO v_existing_enrollment_id
      FROM student_schools
      WHERE student_id = p_student_id
        AND school_id = p_school_id
      LIMIT 1;

      IF v_existing_enrollment_id IS NOT NULL THEN
        -- Update existing enrollment
        UPDATE student_schools
        SET
          grade = COALESCE(p_grade, grade),
          joining_code = COALESCE(p_joining_code, joining_code),
          is_active = true,
          enrolled_at = COALESCE(enrolled_at, NOW())
        WHERE id = v_existing_enrollment_id;
      ELSE
        -- Create new enrollment
        INSERT INTO student_schools (
          student_id,
          school_id,
          grade,
          joining_code,
          enrolled_at,
          is_active
        ) VALUES (
          p_student_id,
          p_school_id,
          COALESCE(p_grade, 'Not Specified'),
          p_joining_code,
          NOW(),
          true
        );
      END IF;

      -- Update profile.school_id to match active enrollment
      UPDATE profiles
      SET school_id = p_school_id
      WHERE id = p_student_id;
    ELSIF p_grade IS NOT NULL OR p_joining_code IS NOT NULL THEN
      -- Update grade/joining_code for current active enrollment
      UPDATE student_schools
      SET
        grade = COALESCE(p_grade, grade),
        joining_code = COALESCE(p_joining_code, joining_code)
      WHERE id = (
        SELECT id FROM student_schools
        WHERE student_id = p_student_id
          AND is_active = true
        LIMIT 1
      );
    END IF;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'student_id', p_student_id
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;
END;
$$;

-- Function to update course access atomically (fixes race condition)
CREATE OR REPLACE FUNCTION update_course_access(
  p_course_id uuid,
  p_access_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry jsonb;
  v_inserted_count integer := 0;
BEGIN
  BEGIN
    -- Lock the course_access table for this course to prevent race conditions
    LOCK TABLE course_access IN EXCLUSIVE MODE;

    -- Delete all existing entries for this course
    DELETE FROM course_access
    WHERE course_id = p_course_id;

    -- Insert new entries
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_access_entries)
    LOOP
      INSERT INTO course_access (
        course_id,
        school_id,
        grade,
        created_at,
        updated_at
      ) VALUES (
        p_course_id,
        (v_entry->>'school_id')::uuid,
        v_entry->>'grade',
        NOW(),
        NOW()
      )
      ON CONFLICT (course_id, school_id, grade) DO NOTHING;
      
      v_inserted_count := v_inserted_count + 1;
    END LOOP;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'inserted_count', v_inserted_count
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;
END;
$$;

-- Function to update leave status atomically (fixes race condition)
CREATE OR REPLACE FUNCTION update_leave_status(
  p_leave_id uuid,
  p_status text,
  p_reviewed_by uuid DEFAULT NULL,
  p_admin_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
  v_result jsonb;
BEGIN
  BEGIN
    -- Lock the row to prevent concurrent updates
    SELECT status INTO v_current_status
    FROM teacher_leaves
    WHERE id = p_leave_id
    FOR UPDATE;

    -- Check if leave exists
    IF v_current_status IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Leave not found'
      );
    END IF;

    -- Only allow status change if currently pending (prevents duplicate approvals)
    IF v_current_status != 'Pending' AND p_status IN ('Approved', 'Rejected') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Leave status cannot be changed from ' || v_current_status
      );
    END IF;

    -- Update leave status
    UPDATE teacher_leaves
    SET
      status = p_status,
      reviewed_by = COALESCE(p_reviewed_by, reviewed_by),
      reviewed_at = CASE WHEN p_status IN ('Approved', 'Rejected') THEN NOW() ELSE reviewed_at END,
      approved_at = CASE WHEN p_status = 'Approved' THEN NOW() ELSE approved_at END,
      rejected_at = CASE WHEN p_status = 'Rejected' THEN NOW() ELSE rejected_at END,
      admin_remarks = COALESCE(p_admin_remarks, admin_remarks),
      updated_at = NOW()
    WHERE id = p_leave_id;

    -- Return success with updated data
    SELECT row_to_json(t) INTO v_result
    FROM (
      SELECT * FROM teacher_leaves WHERE id = p_leave_id
    ) t;

    RETURN jsonb_build_object(
      'success', true,
      'leave', v_result
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;
END;
$$;

-- Function to create teacher profile, teacher record, and school assignments atomically
CREATE OR REPLACE FUNCTION create_teacher_enrollment(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_qualification text DEFAULT NULL,
  p_experience_years integer DEFAULT 0,
  p_specialization text DEFAULT NULL,
  p_teacher_id text DEFAULT NULL,
  p_school_assignments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id uuid;
  v_teacher_record_id uuid;
  v_assignment_id uuid;
  v_assignment jsonb;
  v_result jsonb;
  v_generated_teacher_id text;
BEGIN
  -- Generate teacher_id if not provided
  IF p_teacher_id IS NULL OR p_teacher_id = '' THEN
    v_generated_teacher_id := 'TCH-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  ELSE
    v_generated_teacher_id := p_teacher_id;
  END IF;

  BEGIN
    -- Insert profile
    INSERT INTO profiles (
      id,
      full_name,
      email,
      role,
      phone,
      address
    ) VALUES (
      p_user_id,
      p_full_name,
      p_email,
      'teacher',
      p_phone,
      p_address
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address,
      updated_at = NOW()
    RETURNING id INTO v_profile_id;

    -- Insert teacher record
    INSERT INTO teachers (
      profile_id,
      teacher_id,
      full_name,
      email,
      phone,
      qualification,
      experience_years,
      specialization,
      address,
      status
    ) VALUES (
      p_user_id,
      v_generated_teacher_id,
      p_full_name,
      p_email,
      p_phone,
      p_qualification,
      p_experience_years,
      p_specialization,
      p_address,
      'Active'
    )
    ON CONFLICT (email) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      qualification = EXCLUDED.qualification,
      experience_years = EXCLUDED.experience_years,
      specialization = EXCLUDED.specialization,
      address = EXCLUDED.address,
      updated_at = NOW()
    RETURNING id INTO v_teacher_record_id;

    -- Insert school assignments if provided
    IF jsonb_array_length(p_school_assignments) > 0 THEN
      FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_school_assignments)
      LOOP
        -- Validate school exists
        IF NOT EXISTS (SELECT 1 FROM schools WHERE id = (v_assignment->>'school_id')::uuid) THEN
          CONTINUE; -- Skip invalid school assignments
        END IF;

        INSERT INTO teacher_schools (
          teacher_id,
          school_id,
          grades_assigned,
          subjects,
          working_days_per_week,
          max_students_per_session,
          is_primary,
          assigned_at
        ) VALUES (
          p_user_id,
          (v_assignment->>'school_id')::uuid,
          COALESCE((v_assignment->>'grades_assigned')::text[], ARRAY[]::text[]),
          COALESCE((v_assignment->>'subjects')::text[], ARRAY[]::text[]),
          COALESCE((v_assignment->>'working_days_per_week')::integer, 5),
          COALESCE((v_assignment->>'max_students_per_session')::integer, 30),
          COALESCE((v_assignment->>'is_primary')::boolean, false),
          NOW()
        )
        ON CONFLICT (teacher_id, school_id) DO UPDATE SET
          grades_assigned = EXCLUDED.grades_assigned,
          subjects = EXCLUDED.subjects,
          working_days_per_week = EXCLUDED.working_days_per_week,
          max_students_per_session = EXCLUDED.max_students_per_session,
          is_primary = EXCLUDED.is_primary;
      END LOOP;
    END IF;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'profile_id', v_profile_id,
      'teacher_id', v_teacher_record_id,
      'teacher_code', v_generated_teacher_id
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;
END;
$$;

-- Function to update teacher profile, teacher record, and school assignments atomically
CREATE OR REPLACE FUNCTION update_teacher_enrollment(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_qualification text DEFAULT NULL,
  p_experience_years integer DEFAULT NULL,
  p_specialization text DEFAULT NULL,
  p_school_assignments jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_assignment jsonb;
BEGIN
  BEGIN
    -- Update profile if any profile fields provided
    IF p_full_name IS NOT NULL OR p_email IS NOT NULL OR p_phone IS NOT NULL OR p_address IS NOT NULL THEN
      UPDATE profiles
      SET
        full_name = COALESCE(p_full_name, full_name),
        email = COALESCE(p_email, email),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        updated_at = NOW()
      WHERE id = p_user_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Teacher profile not found'
        );
      END IF;
    END IF;

    -- Update teacher record if any teacher fields provided
    IF p_full_name IS NOT NULL OR p_email IS NOT NULL OR p_phone IS NOT NULL 
       OR p_address IS NOT NULL OR p_qualification IS NOT NULL 
       OR p_experience_years IS NOT NULL OR p_specialization IS NOT NULL THEN
      
      UPDATE teachers
      SET
        full_name = COALESCE(p_full_name, full_name),
        email = COALESCE(p_email, email),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        qualification = COALESCE(p_qualification, qualification),
        experience_years = COALESCE(p_experience_years, experience_years),
        specialization = COALESCE(p_specialization, specialization),
        updated_at = NOW()
      WHERE profile_id = p_user_id OR email = COALESCE(p_email, (SELECT email FROM profiles WHERE id = p_user_id));

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Teacher record not found'
        );
      END IF;
    END IF;

    -- Update school assignments if provided
    IF p_school_assignments IS NOT NULL THEN
      -- Delete existing assignments
      DELETE FROM teacher_schools WHERE teacher_id = p_user_id;

      -- Insert new assignments
      IF jsonb_array_length(p_school_assignments) > 0 THEN
        FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_school_assignments)
        LOOP
          -- Validate school exists
          IF EXISTS (SELECT 1 FROM schools WHERE id = (v_assignment->>'school_id')::uuid) THEN
            INSERT INTO teacher_schools (
              teacher_id,
              school_id,
              grades_assigned,
              subjects,
              working_days_per_week,
              max_students_per_session,
              is_primary,
              assigned_at
            ) VALUES (
              p_user_id,
              (v_assignment->>'school_id')::uuid,
              COALESCE((v_assignment->>'grades_assigned')::text[], ARRAY[]::text[]),
              COALESCE((v_assignment->>'subjects')::text[], ARRAY[]::text[]),
              COALESCE((v_assignment->>'working_days_per_week')::integer, 5),
              COALESCE((v_assignment->>'max_students_per_session')::integer, 30),
              COALESCE((v_assignment->>'is_primary')::boolean, false),
              NOW()
            );
          END IF;
        END LOOP;
      END IF;
    END IF;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'teacher_id', p_user_id
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION create_student_enrollment IS 'Atomically creates student profile and enrollment to prevent race conditions';
COMMENT ON FUNCTION update_student_enrollment IS 'Atomically updates student profile and enrollment to prevent race conditions';
COMMENT ON FUNCTION update_course_access IS 'Atomically updates course access entries with table locking to prevent race conditions';
COMMENT ON FUNCTION update_leave_status IS 'Atomically updates leave status with row locking to prevent duplicate approvals';
COMMENT ON FUNCTION create_teacher_enrollment IS 'Atomically creates teacher profile, teacher record, and school assignments to prevent race conditions';
COMMENT ON FUNCTION update_teacher_enrollment IS 'Atomically updates teacher profile, teacher record, and school assignments to prevent race conditions';


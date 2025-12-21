-- Test Users for Development
-- These users are created for testing purposes
-- 
-- Test Credentials:
-- Admin: admin@yugminds.com / admin123
-- Teacher: teacher@yugminds.com / TempPass
-- Student: student@yugminds.com / pass123
-- School Admin: schooladmin@yugminds.com / pass123

-- Ensure pgcrypto extension is available for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create test users in auth.users table
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES 
-- Admin User
(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@yugminds.com',
  crypt('admin123', gen_salt('bf')),
  NOW(),
  NULL,
  NULL,
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Admin User"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
),
-- Teacher User
(
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'teacher@yugminds.com',
  crypt('TempPass', gen_salt('bf')),
  NOW(),
  NULL,
  NULL,
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Test Teacher"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
),
-- Student User
(
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'student@yugminds.com',
  crypt('pass123', gen_salt('bf')),
  NOW(),
  NULL,
  NULL,
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Test Student"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
),
-- School Admin User
(
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'schooladmin@yugminds.com',
  crypt('pass123', gen_salt('bf')),
  NOW(),
  NULL,
  NULL,
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Test School Admin"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- Create corresponding profiles
-- Use DO UPDATE to ensure roles are correct even if profiles exist
INSERT INTO profiles (
  id,
  full_name,
  email,
  role,
  school_id,
  created_at
) VALUES 
-- Admin Profile
(
  '00000000-0000-0000-0000-000000000001',
  'Admin User',
  'admin@yugminds.com',
  'admin',
  NULL,
  NOW()
),
-- Teacher Profile
(
  '00000000-0000-0000-0000-000000000002',
  'Test Teacher',
  'teacher@yugminds.com',
  'teacher',
  NULL,
  NOW()
),
-- Student Profile
(
  '00000000-0000-0000-0000-000000000003',
  'Test Student',
  'student@yugminds.com',
  'student',
  NULL,
  NOW()
),
-- School Admin Profile
(
  '00000000-0000-0000-0000-000000000004',
  'Test School Admin',
  'schooladmin@yugminds.com',
  'school_admin',
  NULL,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  updated_at = NOW();

-- Create a test school for the school admin
INSERT INTO schools (
  id,
  name,
  school_code,
  join_code,
  school_email,
  school_admin_id,
  school_admin_name,
  school_admin_email,
  address,
  city,
  state,
  country,
  pincode,
  contact_email,
  contact_phone,
  principal_name,
  affiliation_type,
  school_type,
  established_year,
  grades_offered,
  total_students_estimate,
  total_teachers_estimate,
  status,
  joining_codes,
  is_active,
  created_at,
  updated_at,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000000005',
  'YugMinds Test School',
  'SCH-TEST',
  'JNSCH-TEST',
  'info@yugminds.com',
  '00000000-0000-0000-0000-000000000004',
  'Test School Admin',
  'schooladmin@yugminds.com',
  '123 Test Street, Test City',
  'Test City',
  'Test State',
  'India',
  '123456',
  'info@yugminds.com',
  '+91 9876543210',
  'Test School Admin',
  'CBSE',
  'Private',
  2020,
  '["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]',
  100,
  10,
  'Active',
  '{"Grade 1": "TEST001", "Grade 2": "TEST002", "Grade 3": "TEST003"}',
  true,
  NOW(),
  NOW(),
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- Update school admin profile with school_id
UPDATE profiles 
SET school_id = '00000000-0000-0000-0000-000000000005'
WHERE id = '00000000-0000-0000-0000-000000000004';

-- Create teacher-school assignment
INSERT INTO teacher_schools (
  teacher_id,
  school_id,
  is_primary,
  assigned_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000005',
  true,
  NOW()
)
ON CONFLICT (teacher_id, school_id) DO NOTHING;

-- Create student-school assignment
INSERT INTO student_schools (
  student_id,
  school_id,
  grade,
  joining_code,
  enrolled_at,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000005',
  'Grade 5',
  'TEST001',
  NOW(),
  true
)
ON CONFLICT (student_id, school_id) DO NOTHING;

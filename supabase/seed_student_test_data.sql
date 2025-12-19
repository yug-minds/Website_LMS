-- Seed test data for Student Dashboard
-- This file creates test data for students, courses, assignments, and related tables

-- Insert test school (if not exists)
INSERT INTO schools (id, name, address, phone, email, school_admin_id, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'Test School for Students',
  '123 Education Street, Learning City, LC 12345',
  '+1-555-0123',
  'admin@testschool.edu',
  (SELECT id FROM profiles WHERE role = 'school_admin' LIMIT 1),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert test student profile
INSERT INTO profiles (id, full_name, email, role, force_password_change, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440002',
  'Test Student',
  'student1@yugminds.com',
  'student',
  true,
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert student record
INSERT INTO students (id, profile_id, school_id, grade, joining_code, last_login, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440001',
  'Grade 5',
  'STU-001',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert test teacher profile
INSERT INTO profiles (id, full_name, email, role, force_password_change, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440004',
  'Test Teacher',
  'teacher1@yugminds.com',
  'teacher',
  false,
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert teacher record
INSERT INTO teachers (id, teacher_id, full_name, email, phone, qualification, experience_years, specialization, status, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440005',
  'TCH-001',
  'Test Teacher',
  'teacher1@yugminds.com',
  '+1-555-0124',
  'M.Ed Mathematics',
  5,
  'Mathematics',
  'Active',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert teacher-school relationship
INSERT INTO teacher_schools (teacher_id, school_id, grades_assigned, subjects, is_primary, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440005',
  '550e8400-e29b-41d4-a716-446655440001',
  ARRAY['Grade 5'],
  ARRAY['Mathematics', 'Science'],
  true,
  NOW()
) ON CONFLICT (teacher_id, school_id) DO NOTHING;

-- Insert test class
INSERT INTO classes (id, school_id, class_name, grade, subject, academic_year, max_students, is_active, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440001',
  'Grade 5 Mathematics',
  'Grade 5',
  'Mathematics',
  '2024-25',
  30,
  true,
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert teacher-class relationship
INSERT INTO teacher_classes (teacher_id, class_id, school_id, grade, subject, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440001',
  'Grade 5',
  'Mathematics',
  NOW()
) ON CONFLICT (teacher_id, class_id) DO NOTHING;

-- Insert test courses
INSERT INTO courses (id, school_id, title, description, grade, subject, thumbnail_url, is_published, created_by, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440001',
  'Mathematics Fundamentals',
  'Learn the basics of mathematics including addition, subtraction, multiplication, and division.',
  'Grade 5',
  'Mathematics',
  'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400',
  true,
  '550e8400-e29b-41d4-a716-446655440004',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440008',
  '550e8400-e29b-41d4-a716-446655440001',
  'Science Discovery',
  'Explore the wonders of science through hands-on experiments and activities.',
  'Grade 5',
  'Science',
  'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=400',
  true,
  '550e8400-e29b-41d4-a716-446655440004',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert test chapters for Mathematics course
INSERT INTO chapters (id, course_id, title, description, order_index, is_published, release_date, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440009',
  '550e8400-e29b-41d4-a716-446655440007',
  'Introduction to Numbers',
  'Learn about different types of numbers and their properties.',
  1,
  true,
  NOW() - INTERVAL '7 days',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440010',
  '550e8400-e29b-41d4-a716-446655440007',
  'Addition and Subtraction',
  'Master the basic operations of addition and subtraction.',
  2,
  true,
  NOW() - INTERVAL '5 days',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440011',
  '550e8400-e29b-41d4-a716-446655440007',
  'Multiplication and Division',
  'Learn multiplication tables and division techniques.',
  3,
  true,
  NOW() - INTERVAL '3 days',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440012',
  '550e8400-e29b-41d4-a716-446655440007',
  'Fractions and Decimals',
  'Understand fractions and decimal numbers.',
  4,
  true,
  NOW() + INTERVAL '2 days',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert chapter contents
INSERT INTO chapter_contents (id, chapter_id, content_type, title, content_text, order_index, duration_minutes, is_published, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440013',
  '550e8400-e29b-41d4-a716-446655440009',
  'text',
  'What are Numbers?',
  'Numbers are symbols used to represent quantities. We use numbers to count, measure, and compare things.',
  1,
  15,
  true,
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440014',
  '550e8400-e29b-41d4-a716-446655440009',
  'video',
  'Number Line Introduction',
  'https://example.com/video1.mp4',
  2,
  20,
  true,
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440015',
  '550e8400-e29b-41d4-a716-446655440010',
  'text',
  'Addition Basics',
  'Addition is combining two or more numbers to find their total.',
  1,
  20,
  true,
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440016',
  '550e8400-e29b-41d4-a716-446655440010',
  'quiz',
  'Addition Practice Quiz',
  'Test your addition skills with this interactive quiz.',
  2,
  10,
  true,
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert student enrollment
INSERT INTO enrollments (student_id, class_id, course_id, enrolled_on, status, progress_percentage, last_accessed, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440007',
  NOW() - INTERVAL '10 days',
  'active',
  45.0,
  NOW() - INTERVAL '1 day',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440008',
  NOW() - INTERVAL '8 days',
  'active',
  20.0,
  NOW() - INTERVAL '2 days',
  NOW()
) ON CONFLICT (student_id, course_id) DO NOTHING;

-- Insert student progress
INSERT INTO student_progress (student_id, course_id, chapter_id, content_id, is_completed, completed_at, time_spent_minutes, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440009',
  '550e8400-e29b-41d4-a716-446655440013',
  true,
  NOW() - INTERVAL '6 days',
  15,
  NOW() - INTERVAL '6 days'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440009',
  '550e8400-e29b-41d4-a716-446655440014',
  true,
  NOW() - INTERVAL '5 days',
  20,
  NOW() - INTERVAL '5 days'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440010',
  '550e8400-e29b-41d4-a716-446655440015',
  true,
  NOW() - INTERVAL '3 days',
  20,
  NOW() - INTERVAL '3 days'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440010',
  '550e8400-e29b-41d4-a716-446655440016',
  false,
  NULL,
  5,
  NOW() - INTERVAL '2 days'
) ON CONFLICT (student_id, content_id) DO NOTHING;

-- Insert test assignments
INSERT INTO assignments (id, course_id, class_id, title, description, assignment_type, config, due_date, max_attempts, max_marks, is_published, created_by, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440017',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440006',
  'Addition and Subtraction Quiz',
  'Test your understanding of addition and subtraction with this comprehensive quiz.',
  'mcq',
  '{"questions": [{"id": 1, "question": "What is 15 + 27?", "options": ["42", "32", "52", "22"], "correct_answer": 0}, {"id": 2, "question": "What is 50 - 23?", "options": ["27", "37", "17", "47"], "correct_answer": 0}], "correct_answers": [0, 0]}',
  NOW() + INTERVAL '3 days',
  3,
  100,
  true,
  '550e8400-e29b-41d4-a716-446655440004',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440018',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440006',
  'Math Problem Solving Essay',
  'Write an essay explaining how to solve word problems involving addition and subtraction.',
  'essay',
  '{"min_words": 200, "max_words": 500, "topics": ["problem_solving", "addition", "subtraction"]}',
  NOW() + INTERVAL '7 days',
  1,
  50,
  true,
  '550e8400-e29b-41d4-a716-446655440004',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-446655440019',
  '550e8400-e29b-41d4-a716-446655440008',
  '550e8400-e29b-41d4-a716-446655440006',
  'Science Experiment Report',
  'Conduct a simple experiment and write a report about your findings.',
  'project',
  '{"file_types": ["pdf", "doc", "docx"], "max_file_size": "10MB", "instructions": "Include hypothesis, procedure, results, and conclusion"}',
  NOW() + INTERVAL '5 days',
  1,
  75,
  true,
  '550e8400-e29b-41d4-a716-446655440004',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert test submission
INSERT INTO submissions (id, assignment_id, student_id, answers_json, status, submitted_at, grade, feedback, graded_at, graded_by, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440020',
  '550e8400-e29b-41d4-a716-446655440017',
  '550e8400-e29b-41d4-a716-446655440002',
  '[0, 0]',
  'graded',
  NOW() - INTERVAL '2 days',
  100.0,
  'Excellent work! You got all questions correct.',
  NOW() - INTERVAL '1 day',
  '550e8400-e29b-41d4-a716-446655440004',
  NOW() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;

-- Insert test attendance records
INSERT INTO attendance (user_id, school_id, class_id, date, status, recorded_by, recorded_at, remarks)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440006',
  CURRENT_DATE - INTERVAL '5 days',
  'Present',
  '550e8400-e29b-41d4-a716-446655440004',
  NOW() - INTERVAL '5 days',
  'On time'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440006',
  CURRENT_DATE - INTERVAL '4 days',
  'Present',
  '550e8400-e29b-41d4-a716-446655440004',
  NOW() - INTERVAL '4 days',
  'On time'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440006',
  CURRENT_DATE - INTERVAL '3 days',
  'Absent',
  '550e8400-e29b-41d4-a716-446655440004',
  NOW() - INTERVAL '3 days',
  'Sick leave'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440006',
  CURRENT_DATE - INTERVAL '2 days',
  'Present',
  '550e8400-e29b-41d4-a716-446655440004',
  NOW() - INTERVAL '2 days',
  'On time'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440006',
  CURRENT_DATE - INTERVAL '1 day',
  'Present',
  '550e8400-e29b-41d4-a716-446655440004',
  NOW() - INTERVAL '1 day',
  'On time'
) ON CONFLICT (user_id, school_id, date) DO NOTHING;

-- Insert test teacher reports
INSERT INTO teacher_reports (id, teacher_id, school_id, class_id, date, start_time, end_time, topics_covered, activities, student_count, duration_hours, report_status, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440021',
  '550e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440006',
  CURRENT_DATE - INTERVAL '1 day',
  '09:00:00',
  '10:00:00',
  'Addition and Subtraction',
  'Interactive math games and practice problems',
  25,
  1.0,
  'Submitted',
  NOW() - INTERVAL '1 day'
),
(
  '550e8400-e29b-41d4-a716-446655440022',
  '550e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440006',
  CURRENT_DATE,
  '09:00:00',
  '10:00:00',
  'Multiplication Tables',
  'Multiplication drills and group activities',
  25,
  1.0,
  'Submitted',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert test notifications
INSERT INTO notifications (user_id, title, body, type, data, is_read, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440002',
  'Assignment Graded',
  'Your Addition and Subtraction Quiz has been graded. You scored 100%!',
  'grade',
  '{"assignment_id": "550e8400-e29b-41d4-a716-446655440017", "grade": 100}',
  false,
  NOW() - INTERVAL '1 day'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  'New Assignment Available',
  'A new math assignment "Math Problem Solving Essay" is now available.',
  'assignment',
  '{"assignment_id": "550e8400-e29b-41d4-a716-446655440018"}',
  false,
  NOW() - INTERVAL '2 hours'
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  'Class Reminder',
  'Don\'t forget about today\'s mathematics class at 9:00 AM.',
  'general',
  '{"class_id": "550e8400-e29b-41d4-a716-446655440006"}',
  false,
  NOW() - INTERVAL '30 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Insert test certificate
INSERT INTO certificates (id, student_id, course_id, certificate_url, certificate_name, issued_at, issued_by, created_at)
VALUES 
(
  '550e8400-e29b-41d4-a716-446655440023',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440007',
  'https://example.com/certificates/math-fundamentals-cert.pdf',
  'Mathematics Fundamentals Certificate',
  NOW() - INTERVAL '1 day',
  '550e8400-e29b-41d4-a716-446655440004',
  NOW() - INTERVAL '1 day'
) ON CONFLICT (id) DO NOTHING;

-- Update student progress view (this will be calculated automatically by triggers)
-- But we can manually update the enrollment progress
UPDATE enrollments 
SET progress_percentage = 45.0, last_accessed = NOW() - INTERVAL '1 day'
WHERE student_id = '550e8400-e29b-41d4-a716-446655440002' 
AND course_id = '550e8400-e29b-41d4-a716-446655440007';

UPDATE enrollments 
SET progress_percentage = 20.0, last_accessed = NOW() - INTERVAL '2 days'
WHERE student_id = '550e8400-e29b-41d4-a716-446655440002' 
AND course_id = '550e8400-e29b-41d4-a716-446655440008';


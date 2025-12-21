-- Seed test data for Teacher Dashboard
-- This script creates test data for teachers, classes, and related tables

-- Insert test schools if they don't exist
INSERT INTO schools (id, name, school_code, join_code, city, state, status) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'YugMinds Primary School', 'SCH-0001', 'JNSCH-00001', 'Mumbai', 'Maharashtra', 'Active'),
('550e8400-e29b-41d4-a716-446655440002', 'YugMinds High School', 'SCH-0002', 'JNSCH-00002', 'Delhi', 'Delhi', 'Active')
ON CONFLICT (id) DO NOTHING;

-- Insert test teacher profile
INSERT INTO profiles (id, email, full_name, role, phone, specialization, qualification, experience_years) VALUES
('550e8400-e29b-41d4-a716-446655440010', 'teacher1@yugminds.com', 'John Smith', 'teacher', '+91-9876543210', 'Mathematics', 'B.Ed, M.Sc Mathematics', 5),
('550e8400-e29b-41d4-a716-446655440011', 'teacher2@yugminds.com', 'Sarah Johnson', 'teacher', '+91-9876543211', 'Science', 'B.Ed, M.Sc Physics', 3)
ON CONFLICT (id) DO NOTHING;

-- Insert teacher-school assignments
INSERT INTO teacher_schools (teacher_id, school_id, is_primary, grades_assigned, subjects, working_days_per_week) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', true, ARRAY['5', '6'], ARRAY['Mathematics'], 5),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440002', false, ARRAY['7', '8'], ARRAY['Mathematics'], 3),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', true, ARRAY['5', '6'], ARRAY['Science'], 5)
ON CONFLICT (teacher_id, school_id) DO NOTHING;

-- Insert test classes
INSERT INTO classes (id, school_id, class_name, grade, subject, max_students, is_active) VALUES
('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440001', 'Grade 5 Math', '5', 'Mathematics', 30, true),
('550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440001', 'Grade 6 Math', '6', 'Mathematics', 25, true),
('550e8400-e29b-41d4-a716-446655440022', '550e8400-e29b-41d4-a716-446655440002', 'Grade 7 Math', '7', 'Mathematics', 28, true),
('550e8400-e29b-41d4-a716-446655440023', '550e8400-e29b-41d4-a716-446655440001', 'Grade 5 Science', '5', 'Science', 30, true),
('550e8400-e29b-41d4-a716-446655440024', '550e8400-e29b-41d4-a716-446655440001', 'Grade 6 Science', '6', 'Science', 25, true)
ON CONFLICT (id) DO NOTHING;

-- Insert teacher-class assignments
INSERT INTO teacher_classes (teacher_id, class_id, school_id, grade, subject) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440001', '5', 'Mathematics'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440001', '6', 'Mathematics'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440022', '550e8400-e29b-41d4-a716-446655440002', '7', 'Mathematics'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440023', '550e8400-e29b-41d4-a716-446655440001', '5', 'Science'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440024', '550e8400-e29b-41d4-a716-446655440001', '6', 'Science')
ON CONFLICT (teacher_id, class_id) DO NOTHING;

-- Insert sample teacher reports
INSERT INTO teacher_reports (teacher_id, school_id, class_id, date, start_time, end_time, topics_taught, activities, notes, student_count, duration_hours, report_status) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440020', '2024-12-01', '2024-12-01T09:00:00', '2024-12-01T10:00:00', 'Basic Arithmetic, Addition and Subtraction', 'Interactive exercises, group work', 'Students showed good understanding', 28, 1.0, 'Approved'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440021', '2024-12-01', '2024-12-01T10:30:00', '2024-12-01T11:30:00', 'Fractions and Decimals', 'Problem solving, visual aids', 'Some students need extra practice', 24, 1.0, 'Approved'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440020', '2024-12-02', '2024-12-02T09:00:00', '2024-12-02T10:00:00', 'Multiplication Tables', 'Memory games, timed tests', 'Great progress in memorization', 29, 1.0, 'Submitted'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440023', '2024-12-01', '2024-12-01T11:00:00', '2024-12-01T12:00:00', 'Solar System, Planets', 'Model building, presentations', 'Students were very engaged', 27, 1.0, 'Approved')
ON CONFLICT DO NOTHING;

-- Insert sample attendance records
INSERT INTO attendance (user_id, school_id, class_id, date, status, recorded_by, recorded_at) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440020', '2024-12-01', 'Present', '550e8400-e29b-41d4-a716-446655440010', '2024-12-01T09:00:00'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440021', '2024-12-01', 'Present', '550e8400-e29b-41d4-a716-446655440010', '2024-12-01T10:30:00'),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440020', '2024-12-02', 'Present', '550e8400-e29b-41d4-a716-446655440010', '2024-12-02T09:00:00'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440023', '2024-12-01', 'Present', '550e8400-e29b-41d4-a716-446655440011', '2024-12-01T11:00:00')
ON CONFLICT (user_id, school_id, date) DO NOTHING;

-- Insert sample leave requests
INSERT INTO teacher_leaves (teacher_id, school_id, start_date, end_date, leave_type, reason, substitute_required, total_days, status) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '2024-12-15', '2024-12-17', 'Personal', 'Family emergency', true, 3, 'Pending'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', '2024-12-10', '2024-12-10', 'Sick', 'Doctor appointment', false, 1, 'Approved')
ON CONFLICT DO NOTHING;

-- Insert sample monthly attendance data
INSERT INTO teacher_monthly_attendance (teacher_id, school_id, month, present_count, leave_count, absent_count, unreported_count, total_days) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '2024-11-01', 20, 2, 1, 0, 23),
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '2024-12-01', 15, 1, 0, 2, 18),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', '2024-11-01', 22, 0, 1, 0, 23),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', '2024-12-01', 12, 1, 0, 1, 14)
ON CONFLICT (teacher_id, school_id, month) DO NOTHING;

-- Create a view for easier testing
CREATE OR REPLACE VIEW teacher_dashboard_data AS
SELECT 
  p.id as teacher_id,
  p.full_name,
  p.email,
  p.specialization,
  ts.school_id,
  s.name as school_name,
  s.school_code,
  COUNT(DISTINCT tc.class_id) as total_classes,
  COUNT(DISTINCT tr.id) as total_reports,
  COUNT(DISTINCT tl.id) as total_leaves,
  COALESCE(ma.present_count, 0) as current_month_present,
  COALESCE(ma.total_days, 0) as current_month_total
FROM profiles p
LEFT JOIN teacher_schools ts ON p.id = ts.teacher_id
LEFT JOIN schools s ON ts.school_id = s.id
LEFT JOIN teacher_classes tc ON p.id = tc.teacher_id
LEFT JOIN teacher_reports tr ON p.id = tr.teacher_id
LEFT JOIN teacher_leaves tl ON p.id = tl.teacher_id
LEFT JOIN teacher_monthly_attendance ma ON p.id = ma.teacher_id AND ma.month = date_trunc('month', CURRENT_DATE)
WHERE p.role = 'teacher'
GROUP BY p.id, p.full_name, p.email, p.specialization, ts.school_id, s.name, s.school_code, ma.present_count, ma.total_days;

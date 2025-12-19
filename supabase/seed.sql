-- Insert test schools
INSERT INTO public.schools (
  id,
  name,
  address,
  contact_email,
  contact_phone,
  principal_name,
  joining_codes,
  is_active,
  created_at,
  updated_at
) VALUES 
(
  '00000000-0000-0000-0000-000000000010',
  'Yugminds International School',
  '123 Education Street, Learning City',
  'contact@yugminds.com',
  '+1-555-0123',
  'Dr. Principal Name',
  '{"grade1": "YUG101", "grade2": "YUG102", "grade3": "YUG103", "grade4": "YUG104", "grade5": "YUG105"}',
  true,
  NOW(),
  NOW()
),
(
  '00000000-0000-0000-0000-000000000011',
  'St. Marys High School',
  '456 Learning Avenue, Education City',
  'admin@stmarys.edu',
  '+1-555-0124',
  'Mrs. Mary Johnson',
  '{"grade1": "STM101", "grade2": "STM102", "grade3": "STM103", "grade4": "STM104", "grade5": "STM105"}',
  true,
  NOW(),
  NOW()
),
(
  '00000000-0000-0000-0000-000000000012',
  'Delhi Public School',
  '789 Knowledge Road, Academic Town',
  'admin@dps.edu',
  '+1-555-0125',
  'Mr. Rajesh Kumar',
  '{"grade1": "DPS101", "grade2": "DPS102", "grade3": "DPS103", "grade4": "DPS104", "grade5": "DPS105"}',
  true,
  NOW(),
  NOW()
);
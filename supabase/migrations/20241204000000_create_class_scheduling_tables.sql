-- Create class scheduling/timetable tables
-- This migration adds tables for managing weekly class schedules

-- Create periods table (defines time slots like Period 1, Period 2, etc.)
CREATE TABLE IF NOT EXISTS periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, period_number)
);

-- Create rooms table (classrooms/rooms in the school)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  room_name TEXT,
  capacity INTEGER,
  location TEXT,
  facilities TEXT[], -- e.g., ['Projector', 'Whiteboard', 'AC']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, room_number)
);

-- Create class_schedules table (main timetable)
CREATE TABLE IF NOT EXISTS class_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  period_id UUID REFERENCES periods(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  academic_year TEXT DEFAULT '2024-25',
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_class_schedules_school_id ON class_schedules(school_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_class_id ON class_schedules(class_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_teacher_id ON class_schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_day_of_week ON class_schedules(day_of_week);
CREATE INDEX IF NOT EXISTS idx_class_schedules_period_id ON class_schedules(period_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_room_id ON class_schedules(room_id);
CREATE INDEX IF NOT EXISTS idx_periods_school_id ON periods(school_id);
CREATE INDEX IF NOT EXISTS idx_rooms_school_id ON rooms(school_id);

-- Enable RLS
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for periods
CREATE POLICY "School admins can manage periods for their school"
  ON periods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM school_admins
      WHERE school_admins.profile_id = auth.uid()
      AND school_admins.school_id = periods.school_id
      AND school_admins.is_active = true
    )
  );

-- RLS Policies for rooms
CREATE POLICY "School admins can manage rooms for their school"
  ON rooms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM school_admins
      WHERE school_admins.profile_id = auth.uid()
      AND school_admins.school_id = rooms.school_id
      AND school_admins.is_active = true
    )
  );

-- RLS Policies for class_schedules
CREATE POLICY "School admins can manage schedules for their school"
  ON class_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM school_admins
      WHERE school_admins.profile_id = auth.uid()
      AND school_admins.school_id = class_schedules.school_id
      AND school_admins.is_active = true
    )
  );

-- Teachers can view their own schedules
CREATE POLICY "Teachers can view their own schedules"
  ON class_schedules FOR SELECT
  USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teacher_schools
      WHERE teacher_schools.teacher_id = auth.uid()
      AND teacher_schools.school_id = class_schedules.school_id
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_class_scheduling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_periods_updated_at
  BEFORE UPDATE ON periods
  FOR EACH ROW
  EXECUTE FUNCTION update_class_scheduling_updated_at();

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_class_scheduling_updated_at();

CREATE TRIGGER update_class_schedules_updated_at
  BEFORE UPDATE ON class_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_class_scheduling_updated_at();







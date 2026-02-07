-- Migration: Add Effective Date Tracking to Class Schedules
-- Date: 2025-12-27
-- Purpose: Add effective_from and effective_to columns to track schedule history
--          This enables accurate working days calculations when schedules change mid-month

-- ==========================================================
-- PART 1: Add effective date columns to class_schedules
-- ==========================================================

-- Temporarily disable the validation trigger to avoid issues during migration
-- Check if trigger exists first to avoid errors
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'validate_class_schedules_consistency_trigger'
    AND tgrelid = 'class_schedules'::regclass
  ) THEN
    ALTER TABLE class_schedules DISABLE TRIGGER validate_class_schedules_consistency_trigger;
  END IF;
END $$;

-- Add effective_from column as nullable first (to avoid triggering validation during ALTER)
ALTER TABLE class_schedules 
ADD COLUMN IF NOT EXISTS effective_from DATE;

-- Add effective_to column (when this schedule version ended, NULL = currently active)
ALTER TABLE class_schedules 
ADD COLUMN IF NOT EXISTS effective_to DATE;

-- Add comment for documentation
COMMENT ON COLUMN class_schedules.effective_from IS 'Date when this schedule version became active';
COMMENT ON COLUMN class_schedules.effective_to IS 'Date when this schedule version ended (NULL means currently active)';

-- ==========================================================
-- PART 2: Add constraints to ensure data integrity
-- ==========================================================

-- Constraint: effective_to must be >= effective_from (if not NULL)
ALTER TABLE class_schedules
ADD CONSTRAINT check_effective_dates_valid 
CHECK (effective_to IS NULL OR effective_to >= effective_from);

-- Constraint: If schedule is inactive, it must have an end date
-- Note: This allows active schedules to have end dates (for future-dated changes)
-- But inactive schedules without end dates are invalid
ALTER TABLE class_schedules
ADD CONSTRAINT check_inactive_has_end_date 
CHECK (is_active = true OR effective_to IS NOT NULL);

-- ==========================================================
-- PART 3: Create indexes for performance
-- ==========================================================

-- Composite index for efficient historical schedule lookups
CREATE INDEX IF NOT EXISTS idx_class_schedules_effective_dates 
ON class_schedules(teacher_id, school_id, day_of_week, effective_from, effective_to);

-- Index for querying current active schedules
CREATE INDEX IF NOT EXISTS idx_class_schedules_current_active 
ON class_schedules(teacher_id, school_id, day_of_week) 
WHERE effective_to IS NULL AND is_active = true;

-- ==========================================================
-- PART 4: Migrate existing data
-- ==========================================================

-- Set effective_from for all existing schedules based on created_at
UPDATE class_schedules
SET effective_from = created_at::date
WHERE effective_from IS NULL OR effective_from != created_at::date;

-- Set effective_to for active schedules (should be NULL)
UPDATE class_schedules
SET effective_to = NULL
WHERE is_active = true AND effective_to IS NOT NULL;

-- Set effective_to for inactive schedules based on updated_at (if available)
-- If updated_at is in the future or NULL, use CURRENT_DATE
UPDATE class_schedules
SET effective_to = CASE 
  WHEN updated_at IS NOT NULL AND updated_at::date <= CURRENT_DATE 
  THEN updated_at::date
  ELSE CURRENT_DATE
END
WHERE is_active = false AND effective_to IS NULL;

-- Ensure all records have effective_from set (fallback to created_at or CURRENT_DATE)
UPDATE class_schedules
SET effective_from = COALESCE(created_at::date, CURRENT_DATE)
WHERE effective_from IS NULL;

-- Now add NOT NULL constraint after all data is populated
ALTER TABLE class_schedules
ALTER COLUMN effective_from SET NOT NULL;

-- Set default for future inserts
ALTER TABLE class_schedules
ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;

-- Re-enable the validation trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'validate_class_schedules_consistency_trigger'
    AND tgrelid = 'class_schedules'::regclass
  ) THEN
    ALTER TABLE class_schedules ENABLE TRIGGER validate_class_schedules_consistency_trigger;
  END IF;
END $$;
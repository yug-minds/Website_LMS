-- ============================================================================
-- Migration: Fix assignment_questions question_type Constraint
-- Date: 2025-12-11
-- Purpose: Ensure question_type constraint accepts both uppercase and lowercase
--          values to match frontend usage ('MCQ' and 'mcq' both work)
-- ============================================================================

-- Drop existing constraint if it exists (may have different names)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find the constraint name
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.assignment_questions'::regclass
    AND contype = 'c'
    AND conname LIKE '%question_type%';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.assignment_questions DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Dropped existing question_type constraint: %', constraint_name;
  END IF;
END $$;

-- Add new constraint that accepts both uppercase and lowercase values
DO $$
BEGIN
  ALTER TABLE public.assignment_questions
  ADD CONSTRAINT assignment_questions_question_type_check
  CHECK (question_type IN (
    'MCQ', 'mcq', 'Mcq',
    'FillBlank', 'fill_blank', 'Fill_Blank', 'fillblank',
    'essay', 'Essay',
    'true_false', 'TrueFalse', 'True_False',
    'short_answer', 'ShortAnswer', 'shortanswer'
  ));
  
  RAISE NOTICE 'Added updated question_type constraint that accepts both uppercase and lowercase values';
END $$;




















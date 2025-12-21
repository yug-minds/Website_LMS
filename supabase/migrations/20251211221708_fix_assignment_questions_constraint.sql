-- ============================================================================
-- Migration: Fix assignment_questions question_type Constraint
-- Date: 2025-12-11
-- Purpose: Ensure question_type constraint accepts both uppercase and lowercase
--          values to match frontend usage ('MCQ' and 'mcq' both work)
-- ============================================================================

-- Drop all existing question_type check constraints
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  -- Find all check constraints related to question_type
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.assignment_questions'::regclass
      AND contype = 'c'
      AND (
        conname LIKE '%question_type%'
        OR pg_get_constraintdef(oid) LIKE '%question_type%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.assignment_questions DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    RAISE NOTICE 'Dropped existing question_type constraint: %', constraint_record.conname;
  END LOOP;
END $$;

-- Add new constraint that accepts both uppercase and lowercase values
DO $$
BEGIN
  -- Check if constraint already exists (in case it was created with a different name)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.assignment_questions'::regclass
      AND contype = 'c'
      AND conname = 'assignment_questions_question_type_check'
  ) THEN
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
  ELSE
    RAISE NOTICE 'Constraint assignment_questions_question_type_check already exists';
  END IF;
END $$;

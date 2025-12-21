-- ==========================================================
-- Migration: Remove teacher_performance Table
-- Date: 2025-01-27
-- Purpose: Remove unused teacher_performance table
-- ==========================================================

-- ==========================================================
-- Verification
-- ==========================================================

-- Note: This table is not actively used in the codebase.
-- All performance metrics are calculated on-the-fly from:
-- - teacher_reports table (for report-based metrics)
-- - attendance table (for attendance metrics)
-- 
-- The table has schema issues:
-- - References teachers.id instead of profiles.id
-- - Not used for any data retrieval
-- - Only referenced in deletion code (which is being removed)

-- ==========================================================
-- Drop teacher_performance table
-- ==========================================================

DROP TABLE IF EXISTS teacher_performance CASCADE;

-- ==========================================================
-- Add comments to document removal
-- ==========================================================

-- Note: Teacher performance metrics are now calculated dynamically from:
-- - teacher_reports table (for report counts, hours, students)
-- - attendance table (for attendance percentages)
-- - This provides real-time data instead of pre-calculated values

-- ==========================================================
-- Summary
-- ==========================================================

-- Table removed:
-- - teacher_performance - Use dynamic calculations from teacher_reports and attendance instead

-- Why removed:
-- 1. Not actively used (no data retrieval queries)
-- 2. Schema issue (references teachers.id instead of profiles.id)
-- 3. Performance metrics are calculated on-the-fly (better approach)
-- 4. No data loss (metrics are calculated dynamically)

-- Alternative approach:
-- Performance metrics are calculated from:
-- - /api/admin/analytics - Uses teacher_reports for performance distribution
-- - /api/admin/teacher-reports - Provides report data for performance calculations
-- - Frontend calculates metrics from report data















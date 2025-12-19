-- Migration: Create password_reset_requests table
-- Date: 2025-12-12
-- Purpose: Create table for managing password reset requests from users
-- Note: This migration does NOT reset or delete any existing data

-- ============================================================================
-- CREATE password_reset_requests TABLE
-- Purpose: Store password reset requests submitted by users
-- Used by: /api/auth/password-reset-request, /api/admin/password-reset-requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    user_role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for password_reset_requests
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id ON public.password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_email ON public.password_reset_requests(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status ON public.password_reset_requests(status);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_school_id ON public.password_reset_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_requested_at ON public.password_reset_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_status ON public.password_reset_requests(user_id, status);

-- ============================================================================
-- CREATE TRIGGER FUNCTION for updated_at column
-- ============================================================================

CREATE OR REPLACE FUNCTION update_password_reset_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE TRIGGER for updated_at column
-- ============================================================================

DROP TRIGGER IF EXISTS update_password_reset_requests_updated_at_trigger ON public.password_reset_requests;
CREATE TRIGGER update_password_reset_requests_updated_at_trigger
    BEFORE UPDATE ON public.password_reset_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_password_reset_requests_updated_at();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE RLS POLICIES
-- ============================================================================

-- Admins can view and manage all password reset requests
DROP POLICY IF EXISTS "Admins can manage password reset requests" ON public.password_reset_requests;
CREATE POLICY "Admins can manage password reset requests"
    ON public.password_reset_requests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- School admins can view password reset requests for their school
DROP POLICY IF EXISTS "School admins can view their school password reset requests" ON public.password_reset_requests;
CREATE POLICY "School admins can view their school password reset requests"
    ON public.password_reset_requests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND profiles.school_id = password_reset_requests.school_id
        )
    );

-- School admins can update password reset requests for their school (but not approve school admins)
DROP POLICY IF EXISTS "School admins can update their school password reset requests" ON public.password_reset_requests;
CREATE POLICY "School admins can update their school password reset requests"
    ON public.password_reset_requests
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND profiles.school_id = password_reset_requests.school_id
            AND password_reset_requests.user_role != 'school_admin'
        )
    );

-- Users can insert their own password reset requests
DROP POLICY IF EXISTS "Users can create their own password reset requests" ON public.password_reset_requests;
CREATE POLICY "Users can create their own password reset requests"
    ON public.password_reset_requests
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
    );

-- Users can view their own password reset requests
DROP POLICY IF EXISTS "Users can view their own password reset requests" ON public.password_reset_requests;
CREATE POLICY "Users can view their own password reset requests"
    ON public.password_reset_requests
    FOR SELECT
    USING (
        user_id = auth.uid()
    );

-- ============================================================================
-- ADD COMMENTS for documentation
-- ============================================================================

COMMENT ON TABLE public.password_reset_requests IS 'Stores password reset requests submitted by users. Requests are reviewed and approved by administrators.';
COMMENT ON COLUMN public.password_reset_requests.status IS 'Status of the password reset request: pending, approved, rejected, or completed';
COMMENT ON COLUMN public.password_reset_requests.approved_by IS 'ID of the admin who approved/rejected the request';
COMMENT ON COLUMN public.password_reset_requests.school_id IS 'School ID of the user requesting password reset (for school admin notifications)';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================




















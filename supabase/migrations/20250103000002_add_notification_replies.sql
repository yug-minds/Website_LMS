-- Migration: Add notification replies table and data column
-- This migration adds a proper table for storing notification replies
-- and optionally adds a data JSONB column to notifications for future extensibility

-- Create notification_replies table
CREATE TABLE IF NOT EXISTS notification_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  UNIQUE(notification_id, user_id) -- One reply per user per notification
);

-- Add data column to notifications table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'data'
  ) THEN
    ALTER TABLE notifications ADD COLUMN data JSONB;
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notification_replies_notification_id ON notification_replies(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_replies_user_id ON notification_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_replies_created_at ON notification_replies(created_at DESC);

-- Enable RLS on notification_replies
ALTER TABLE notification_replies ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own replies
CREATE POLICY "Users can view their own replies" ON notification_replies
  FOR SELECT USING (user_id = auth.uid());

-- RLS Policy: Users can view replies to their notifications
CREATE POLICY "Users can view replies to their notifications" ON notification_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM notifications 
      WHERE notifications.id = notification_replies.notification_id 
      AND notifications.user_id = auth.uid()
    )
  );

-- RLS Policy: Admins can view all replies
CREATE POLICY "Admins can view all replies" ON notification_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- RLS Policy: School admins can view replies to notifications sent to their school
CREATE POLICY "School admins can view replies in their school" ON notification_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN notifications n ON n.user_id = p.id
      WHERE p.id = auth.uid() 
      AND p.role = 'school_admin'
      AND n.id = notification_replies.notification_id
      AND p.school_id = (
        SELECT school_id FROM profiles WHERE id = notification_replies.user_id
      )
    )
  );

-- RLS Policy: Teachers can view replies to notifications they sent
CREATE POLICY "Teachers can view replies to their notifications" ON notification_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN notifications n ON n.user_id = p.id
      WHERE p.id = auth.uid() 
      AND p.role = 'teacher'
      AND n.id = notification_replies.notification_id
      AND p.school_id = (
        SELECT school_id FROM profiles WHERE id = notification_replies.user_id
      )
    )
  );

-- RLS Policy: Users can create replies to notifications sent to them
CREATE POLICY "Users can reply to their notifications" ON notification_replies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM notifications 
      WHERE notifications.id = notification_replies.notification_id 
      AND notifications.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- RLS Policy: Users can update their own replies
CREATE POLICY "Users can update their own replies" ON notification_replies
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: Users can delete their own replies
CREATE POLICY "Users can delete their own replies" ON notification_replies
  FOR DELETE USING (user_id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_replies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_notification_replies_updated_at
  BEFORE UPDATE ON notification_replies
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_replies_updated_at();








import { z } from 'zod';
import { passwordSchema } from './password-validation';

/**
 * Validation schemas for API endpoints
 * These schemas ensure data integrity and prevent invalid input
 */

// Common validation patterns
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Lenient UUID schema that accepts standard UUIDs and special test UUIDs
const lenientUuidSchema = z.string().refine(
  (val) => {
    // Standard UUID format
    const standardUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (standardUuidRegex.test(val)) {
      return true;
    }
    // Special test UUIDs that are used in the system
    const specialUuids = [
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
      'ffffffff-ffff-ffff-ffff-ffffffffffff'
    ];
    return specialUuids.includes(val.toLowerCase());
  },
  { message: 'Invalid UUID format' }
);
const emailSchema = z.string().email('Invalid email format');
const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional().nullable();
// Fixed phone schema that allows empty strings
const phoneSchemaFlexible = z.string().optional().nullable().transform(val => {
  // Convert empty strings to null
  if (val === '' || val === null) return null;
  // Validate if provided
  if (val && !val.match(/^\+?[1-9]\d{1,14}$/)) {
    throw new Error('Invalid phone number format');
  }
  return val;
});

// Loose phone schema for school-admin forms (allows any string; normalizes empty to null)
// Reason: UI doesn't enforce E.164 formatting, and we don't want student creation to hard-fail.
const phoneSchemaLoose = z
  .string()
  .optional()
  .nullable()
  .transform((val) => {
    if (val === '' || val === null || val === undefined) return null;
    return String(val).trim();
  });
const nonEmptyString = z.string().min(1, 'Field cannot be empty');

// Student schemas
export const createStudentSchema = z.object({
  full_name: nonEmptyString.max(255, 'Name too long'),
  email: emailSchema,
  password: passwordSchema(false), // 8+ chars, uppercase, lowercase, number
  school_id: uuidSchema,
  grade: z.string().optional(),
  phone: phoneSchema,
  address: z.string().max(500, 'Address too long').optional().nullable(),
  parent_name: z.string().max(255, 'Parent name too long').optional().nullable(),
  parent_phone: phoneSchema,
  joining_code: z.string().optional().nullable(),
});

// School admin creates students within their own school, so `school_id` is derived server-side
export const createStudentSchemaSchoolAdmin = z.object({
  full_name: nonEmptyString.max(255, 'Name too long'),
  email: emailSchema,
  password: passwordSchema(false), // 8+ chars, uppercase, lowercase, number
  grade: z.string().optional(),
  phone: phoneSchemaLoose,
  address: z.string().max(500, 'Address too long').optional().nullable(),
  parent_name: z.string().max(255, 'Parent name too long').optional().nullable(),
  parent_phone: phoneSchemaLoose,
  joining_code: z.string().optional().nullable(),
});

export const updateStudentSchema = z.object({
  full_name: nonEmptyString.max(255, 'Name too long').optional(),
  email: emailSchema.optional(),
  password: passwordSchema(false).optional(), // 8+ chars, uppercase, lowercase, number
  school_id: uuidSchema.optional(),
  grade: z.string().optional(),
  phone: phoneSchema,
  address: z.string().max(500, 'Address too long').optional().nullable(),
  parent_name: z.string().max(255, 'Parent name too long').optional().nullable(),
  parent_phone: phoneSchema,
  joining_code: z.string().optional().nullable(),
});

// Teacher schemas
export const createTeacherSchema = z.object({
  full_name: nonEmptyString.max(255, 'Name too long'),
  email: emailSchema,
  temp_password: passwordSchema(false), // 8+ chars, uppercase, lowercase, number
  phone: phoneSchemaFlexible,
  address: z.string().max(500, 'Address too long').optional().nullable(),
  qualification: z.string().max(255, 'Qualification too long').optional().nullable(),
  experience_years: z.number().int().min(0).max(50, 'Invalid experience years').optional(),
  specialization: z.string().max(255, 'Specialization too long').optional().nullable(),
  school_assignments: z.array(z.object({
    school_id: uuidSchema,
    grades_assigned: z.array(z.string()).optional(),
    subjects: z.array(z.string()).optional(),
    working_days_per_week: z.number().int().min(1).max(7).optional(),
    max_students_per_session: z.number().int().min(1).max(100).optional(),
    is_primary: z.boolean().optional(),
  })).optional().default([]),
});

export const updateTeacherSchema = z.object({
  id: uuidSchema,
  full_name: nonEmptyString.max(255, 'Name too long').optional(),
  email: emailSchema.optional(),
  change_password: z.boolean().optional(),
  temp_password: passwordSchema(false).optional(), // 8+ chars, uppercase, lowercase, number
  phone: phoneSchemaFlexible,
  address: z.string().max(500, 'Address too long').optional().nullable(),
  qualification: z.string().max(255, 'Qualification too long').optional().nullable(),
  experience_years: z.number().int().min(0).max(50).optional(),
  specialization: z.string().max(255, 'Specialization too long').optional().nullable(),
  school_assignments: z.array(z.object({
    school_id: uuidSchema,
    grades_assigned: z.array(z.string()).optional(),
    subjects: z.array(z.string()).optional(),
    working_days_per_week: z.number().int().min(1).max(7).optional(),
    max_students_per_session: z.number().int().min(1).max(100).optional(),
    is_primary: z.boolean().optional(),
  })).optional(),
});

// Schedule schema
export const scheduleSchema = z.object({
  // UI may send optional foreign keys as null/empty; accept and normalize
  class_id: z.union([uuidSchema, z.null()]).optional(),
  teacher_id: z.union([uuidSchema, z.null()]).optional(),
  subject: z.string().max(100).optional(),
  grade: z.string().max(50).optional(),
  day_of_week: z.string().max(20).optional(),
  period_id: z.union([uuidSchema, z.null()]).optional(),
  room_id: z.union([uuidSchema, z.null()]).optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  academic_year: z.string().max(50).optional(),
}).passthrough();

// Room schema
export const roomSchema = z.object({
  room_number: z.string().max(50),
  room_name: z.string().max(255).optional(),
  // UI often sends capacity as string or null; accept and normalize
  capacity: z
    .union([z.coerce.number().int().min(1).max(1000), z.null()])
    .optional(),
  school_id: uuidSchema.optional(),
}).passthrough();

// Notification update schema
export const notificationUpdateSchema = z.object({
  is_read: z.boolean().optional(),
  message: z.string().max(1000).optional(),
  title: z.string().max(255).optional(),
}).passthrough();

// Notification reply schema
export const notificationReplySchema = z.object({
  notification_id: uuidSchema,
  user_id: uuidSchema,
  reply_text: z.string().min(1).max(2000, 'Reply text too long'),
});

// Notification mark read schema
export const notificationMarkReadSchema = z.object({
  notification_id: uuidSchema,
  user_id: uuidSchema,
  is_read: z.boolean().optional(),
});

// Notification delete reply schema
export const notificationDeleteReplySchema = z.object({
  reply_id: uuidSchema,
  user_id: uuidSchema,
});

// Notification create schema
export const createNotificationSchema = z.object({
  title: nonEmptyString.max(255, 'Title too long'),
  message: nonEmptyString.max(2000, 'Message too long'),
  type: z.string().max(50).optional(),
  recipientType: z.enum(['all', 'role', 'school', 'individual']).optional(),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required').optional(),
  school_id: uuidSchema.optional(),
}).refine((data) => data.recipientType && data.recipients && data.recipients.length > 0, {
  message: 'recipientType and recipients are required',
});

// Teacher class assignment schema
export const teacherClassAssignmentSchema = z.object({
  school_id: uuidSchema,
  class_id: uuidSchema,
  assigned_at: z.string().optional(),
});

// Profile update schema
export const updateProfileSchema = z.object({
  userId: uuidSchema,
  full_name: z.string().max(255).optional(),
  phone: phoneSchema,
}).refine((data) => data.full_name !== undefined || data.phone !== undefined, {
  message: 'At least one field (full_name or phone) must be provided',
});

// Admin teacher attendance schema
export const adminTeacherAttendanceSchema = z.object({
  teacher_id: uuidSchema,
  school_id: uuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  status: z.enum(['Present', 'Absent', 'Absent (Approved)', 'Absent (Unapproved)', 'Late', 'Leave-Approved', 'Leave-Rejected']),
  check_in_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, 'Invalid time format').optional(),
  check_out_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, 'Invalid time format').optional(),
  notes: z.string().max(1000).optional(),
});

// Admin profile update schema
export const adminProfileUpdateSchema = z.object({
  user_id: uuidSchema,
  full_name: z.string().max(255).optional(),
  email: emailSchema.optional(),
}).refine((data) => data.full_name !== undefined || data.email !== undefined, {
  message: 'At least one field (full_name or email) must be provided',
});

// School creation schema
export const createSchoolSchema = z.object({
  name: nonEmptyString.max(255, 'School name too long'),
  contact_email: emailSchema,
  contact_phone: phoneSchema,
  established_year: z.coerce.number().int().min(1800).max(new Date().getFullYear() + 10).optional(),
  address: nonEmptyString.max(500, 'Address too long'),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  affiliation_type: z.string().max(100).optional(),
  school_type: z.string().max(100).optional(),
  school_logo: z.string().url().optional().nullable().or(z.literal('')),
  school_admin_name: z.string().max(255).optional(),
  school_admin_email: emailSchema.optional(),
  school_admin_phone: phoneSchema,
  school_admin_temp_password: passwordSchema(false).optional(),
  principal_name: z.string().max(255).optional(),
  principal_phone: phoneSchema,
  grades_offered: z.array(z.string()).optional(),
  total_students_estimate: z.coerce.number().int().min(0).optional(),
  total_teachers_estimate: z.coerce.number().int().min(0).optional(),
  generate_joining_codes: z.coerce.boolean().optional(),
  usage_type: z.enum(['single', 'multiple']).optional(),
  max_uses: z.union([z.coerce.number().int().min(1), z.null()]).optional(),
  manual_codes: z.record(z.string(), z.string()).optional().nullable(),
});

// School admin creation schema
export const createSchoolAdminSchema = z.object({
  full_name: nonEmptyString.max(255, 'Name too long'),
  email: emailSchema,
  phone: phoneSchema,
  school_id: uuidSchema,
  temp_password: passwordSchema(false).optional(), // 8+ chars, uppercase, lowercase, number
  permissions: z.record(z.string(), z.boolean()).optional(),
});

// School admin update schema
export const updateSchoolAdminSchema = z.object({
  id: uuidSchema,
  full_name: z.string().max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  school_id: uuidSchema.optional(),
  temp_password: passwordSchema(false).optional(), // 8+ chars, uppercase, lowercase, number
  permissions: z.record(z.string(), z.boolean()).optional(),
});

// School update schema
export const updateSchoolSchema = z.object({
  id: uuidSchema,
  name: z.string().max(255).optional(),
  contact_email: emailSchema.optional(),
  contact_phone: phoneSchema,
  established_year: z.number().int().min(1800).max(new Date().getFullYear() + 10).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  affiliation_type: z.string().max(100).optional(),
  school_type: z.string().max(100).optional(),
  logo_url: z.string().url().optional().nullable(),
  principal_name: z.string().max(255).optional(),
  principal_phone: phoneSchema,
  grades_offered: z.array(z.string()).optional(),
  total_students_estimate: z.number().int().min(0).optional(),
  total_teachers_estimate: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

// School admin profile update schema
export const schoolAdminProfileUpdateSchema = z.object({
  full_name: z.string().max(255).optional(),
  email: emailSchema.optional(),
}).refine((data) => data.full_name !== undefined || data.email !== undefined, {
  message: 'At least one field (full_name or email) must be provided',
});

// School admin school update schema
export const schoolAdminSchoolUpdateSchema = z.object({
  name: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  contact_email: emailSchema.optional(),
  contact_phone: phoneSchema,
  principal_name: z.string().max(255).optional(),
  joining_codes: z.array(z.string()).optional(),
});

// System settings schema
export const systemSettingsSchema = z.object({
  site_name: z.string().max(255).optional(),
  site_description: z.string().max(1000).optional(),
  email_notifications: z.boolean().optional(),
  sms_notifications: z.boolean().optional(),
  maintenance_mode: z.boolean().optional(),
  max_file_size: z.number().int().min(1).max(100).optional(),
  session_timeout: z.number().int().min(1).max(1440).optional(),
}).passthrough();

// Joining code update schema
export const updateJoiningCodeSchema = z.object({
  code: z.string().min(1).max(50),
  schoolId: uuidSchema,
  grade: z.string().max(50),
  manualCode: z.string().max(50).optional(),
  usageType: z.enum(['single', 'multiple']).optional(),
  maxUses: z.number().int().min(1).optional(),
});

// Password reset request update schema
export const passwordResetRequestUpdateSchema = z.object({
  id: z.preprocess(
    (val) => {
      // Ensure it's a string and trim whitespace
      if (typeof val !== 'string') {
        return String(val || '').trim();
      }
      return val.trim();
    },
    uuidSchema
  ),
  status: z.preprocess(
    (val) => {
      // Ensure it's a string and trim whitespace
      if (typeof val !== 'string') {
        return String(val || '').trim();
      }
      return val.trim();
    },
    z.enum(['pending', 'approved', 'rejected', 'completed'], {
      message: 'Status must be one of: pending, approved, rejected, completed'
    })
  ),
  approved_by: z.preprocess(
    (val) => {
      // Convert empty string, null, or undefined to undefined BEFORE validation
      if (val === '' || val === null || val === undefined) {
        return undefined;
      }
      // Ensure it's a string before validation
      if (typeof val !== 'string') {
        return undefined;
      }
      // Trim whitespace
      const trimmed = val.trim();
      if (trimmed === '') {
        return undefined;
      }
      return trimmed;
    },
    lenientUuidSchema.optional()
  ),
  notes: z.preprocess(
    (val) => {
      // Convert empty string, null, or undefined to undefined BEFORE validation
      if (val === '' || val === null || val === undefined) {
        return undefined;
      }
      // Ensure it's a string
      if (typeof val !== 'string') {
        return undefined;
      }
      // Trim whitespace
      const trimmed = val.trim();
      if (trimmed === '') {
        return undefined;
      }
      return trimmed;
    },
    z.string().max(1000, 'Notes cannot exceed 1000 characters').optional()
  ),
}).passthrough(); // Allow extra fields to pass through

// Notification preferences schema
export const notificationPreferencesSchema = z.object({
  user_id: uuidSchema,
  new_user_registration: z.boolean().optional(),
  teacher_leave_requests: z.boolean().optional(),
  system_alerts: z.boolean().optional(),
  weekly_reports: z.boolean().optional(),
  monthly_analytics: z.boolean().optional(),
}).passthrough();

// MFA action schema
export const mfaActionSchema = z.object({
  action: z.enum(['enable', 'disable', 'verify']),
  code: z.string().max(10).optional(), // TOTP code for verification
});

// Bulk report approval schema
export const bulkReportApprovalSchema = z.object({
  report_ids: z.array(uuidSchema).min(1, 'At least one report ID is required'),
});

// Notification update schema (mark as read)
export const notificationUpdateByIdSchema = z.object({
  is_read: z.boolean(),
});

// Account creation schema
export const createAccountSchema = z.object({
  role: z.enum(['admin', 'school_admin', 'teacher', 'student']),
  email: emailSchema,
  password: passwordSchema(false), // 8+ chars, uppercase, lowercase, number
  full_name: nonEmptyString.max(255, 'Name too long'),
  school_id: uuidSchema.optional(), // Required for school_admin, teacher, student
  grade: z.string().optional(), // Required for student
  phone: phoneSchema,
  address: z.string().max(500).optional(),
  parent_name: z.string().max(255).optional(), // For students
  parent_phone: phoneSchema, // For students
}).refine((data) => {
  // school_id is required for non-admin roles
  if (data.role !== 'admin' && !data.school_id) {
    return false;
  }
  return true;
}, {
  message: 'school_id is required for non-admin roles',
  path: ['school_id'],
}).refine((data) => {
  // grade is required for students
  if (data.role === 'student' && !data.grade) {
    return false;
  }
  return true;
}, {
  message: 'grade is required for students',
  path: ['grade'],
});

// Migration execution schema
export const migrationExecuteSchema = z.object({
  sql: z.string().min(1, 'SQL is required').max(100000, 'SQL too long'),
});

// Migration file schema
export const migrationFileSchema = z.object({
  migrationFile: z.string().min(1, 'Migration file path is required').max(500, 'File path too long'),
});

// File upload schema (for FormData validation)
export const fileUploadSchema = z.object({
  type: z.enum(['video', 'material', 'thumbnail']),
  courseId: z.string().uuid('Invalid course ID').optional(),
  chapterId: z.string().uuid('Invalid chapter ID').optional(),
  chapterIndex: z.string().optional(),
});

// Data import schema (for FormData validation)
export const dataImportSchema = z.object({
  type: z.enum(['students', 'teachers']),
});

// Empty body schema (for routes that don't accept body but should validate)
export const emptyBodySchema = z.object({}).strict();

// Teacher report schema
export const createTeacherReportSchema = z.object({
  school_id: uuidSchema,
  class_id: uuidSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  class_name: z.string().max(255).optional(),
  grade: z.string().max(50).optional(),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, 'Invalid time format (HH:MM or HH:MM:SS)').optional(),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, 'Invalid time format (HH:MM or HH:MM:SS)').optional(),
  topics_taught: z.string().max(2000).optional(),
  activities: z.string().max(2000).optional(),
  homework_assigned: z.string().max(2000).optional(),
  student_attendance: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  materials_used: z.string().max(2000).optional(),
}).refine((data) => data.school_id && data.date && (data.grade || data.class_id), {
  message: 'school_id, date, and either grade or class_id are required',
});

// Teacher leave schema
export const createTeacherLeaveSchema = z.object({
  school_id: uuidSchema,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  leave_type: z.string().max(100).optional(),
  reason: z.string().min(1).max(2000, 'Reason too long'),
  substitute_required: z.boolean().optional(),
}).refine((data) => {
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  return end >= start;
}, {
  message: 'End date must be after or equal to start date',
});

// Teacher attendance schema
export const createTeacherAttendanceSchema = z.object({
  school_id: uuidSchema,
  class_id: uuidSchema.optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  status: z.enum(['Present', 'Absent', 'Leave-Approved', 'Leave-Rejected']),
  remarks: z.string().max(1000).optional().nullable(),
});

// Logo management schemas
export const createLogoSchema = z.object({
  school_name: z.string().max(255, 'School name too long'),
  description: z.string().max(255).optional().nullable(),
  image_type: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
  width: z.number().int().min(300, 'Minimum width is 300px'),
  height: z.number().int().min(300, 'Minimum height is 300px'),
  file_size: z.number().int().max(2 * 1024 * 1024, 'Max file size 2MB'),
});

export const updateLogoSchema = z.object({
  id: uuidSchema,
  school_name: z.string().max(255).optional(),
  description: z.string().max(255).optional().nullable(),
  replace_image: z.boolean().optional(),
  image_type: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']).optional(),
  width: z.number().int().min(300).optional(),
  height: z.number().int().min(300).optional(),
  file_size: z.number().int().max(2 * 1024 * 1024).optional(),
});

export const deleteLogoSchema = z.object({
  hard: z.boolean().optional(),
});

export const logoPaginationSchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(1000)).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0)).optional(),
});

// Helper function to validate request body
export function validateRequestBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string; details: z.ZodError } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: 'Validation failed',
        details: error
      };
    }
    // If it's not a ZodError, wrap it
    const zodError = new z.ZodError([{
      code: 'custom',
      path: [],
      message: error instanceof Error ? error.message : 'Invalid request data'
    }]);
    return { 
      success: false, 
      error: 'Invalid request data',
      details: zodError
    };
  }
}

// Helper function to validate query parameters
export function validateQueryParams<T>(schema: z.ZodSchema<T>, searchParams: URLSearchParams): { success: true; data: T } | { success: false; error: string; details: z.ZodError } {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  
  return validateRequestBody(schema, params);
}

// Backwards-compatible aliases and commonly used schemas (restored)
export const idSchema = z.object({ id: uuidSchema }).passthrough();

export const courseAccessSchema = z.object({
  school_ids: z.array(uuidSchema).min(1, 'At least one school ID is required'),
  grades: z.array(z.string()).min(1, 'At least one grade is required'),
});

export const createChapterSchema = z.object({
  order_number: z.number().int().min(0).optional(),
  name: z.string().min(1).max(255).optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  learning_outcomes: z.array(z.string()).optional(),
}).refine((data) => data.name || data.title, { message: 'Either name or title is required' });

// Helper schema for UUID arrays that filters invalid UUIDs instead of failing
const uuidArraySchema = z.array(z.string())
  .transform((arr) => {
    // Filter out invalid UUIDs and empty strings, keeping only valid UUIDs
    if (!arr || !Array.isArray(arr)) return undefined;
    const validUUIDs = arr
      .filter((id): id is string => {
        if (!id || typeof id !== 'string') return false;
        const trimmed = id.trim();
        if (trimmed === '') return false;
        // Check if it's a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(trimmed);
      })
      .map((id: any) => id.trim());
    return validUUIDs.length > 0 ? validUUIDs : undefined;
  })
  .optional();

// Helper schema for grade arrays that filters empty values
const gradeArraySchema = z.array(z.string())
  .transform((arr) => {
    // Filter out empty strings and null values
    if (!arr || !Array.isArray(arr)) return undefined;
    const validGrades = arr
      .filter((grade): grade is string => {
        if (!grade || typeof grade !== 'string') return false;
        return grade.trim().length > 0;
      })
      .map((grade: any) => grade.trim());
    return validGrades.length > 0 ? validGrades : undefined;
  })
  .optional();

export const createCourseSchema = z.object({
  title: nonEmptyString.max(255).optional(),
  name: nonEmptyString.max(255).optional(), // Accept both name and title
  description: z.string().max(2000).optional().nullable(),
  duration_weeks: z.number().int().min(1).max(104).optional().nullable(), // 1 week to 2 years
  prerequisites_course_ids: z.array(uuidSchema).optional().nullable(),
  prerequisites_text: z.string().max(1000).optional().nullable(),
  thumbnail_url: z.string().url().optional().nullable().or(z.literal('')),
  difficulty_level: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional().default('Beginner'),
  school_ids: uuidArraySchema, // Uses transform to filter invalid UUIDs
  grades: gradeArraySchema, // Uses transform to filter empty grades
}).refine((data) => data.name || data.title, { 
  message: 'Either name or title is required',
  path: ['name'] // Show error on name field
}).passthrough();

export const updateCourseSchema = z.object({
  id: uuidSchema,
  title: z.string().max(255).optional(),
  name: z.string().max(255).optional(), // Accept both name and title
  description: z.string().max(2000).optional().nullable(),
  duration_weeks: z.number().int().min(1).max(104).optional().nullable(), // 1 week to 2 years
  prerequisites_course_ids: z.array(uuidSchema).optional().nullable(),
  prerequisites_text: z.string().max(1000).optional().nullable(),
  thumbnail_url: z.string().url().optional().nullable().or(z.literal('')),
  difficulty_level: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional(),
  school_ids: uuidArraySchema, // Uses transform to filter invalid UUIDs
  grades: gradeArraySchema, // Uses transform to filter empty grades
}).passthrough();

// Publish course schema
export const publishCourseSchema = z.object({
  course_id: uuidSchema,
  changes_summary: z.string().max(2000).optional().nullable(),
  publish: z.boolean(), // true to publish, false to unpublish
});

// Bulk assignment schema
export const bulkAssignSchema = z.object({
  course_id: uuidSchema,
  school_ids: z.array(uuidSchema).min(1, 'At least one school ID is required'),
  grades: z.array(z.string()).min(1, 'At least one grade is required'),
});

// Course version schema
export const courseVersionSchema = z.object({
  course_id: uuidSchema,
  version_number: z.number().int().min(1).optional(), // Auto-generated if not provided
  changes_summary: z.string().max(2000).optional().nullable(),
  course_data: z.record(z.string(), z.any()).optional(), // Will be populated from course
});

// Revert to version schema
export const revertToVersionSchema = z.object({
  course_id: uuidSchema,
  version_number: z.number().int().min(1),
  create_new_version: z.boolean().default(true), // Create new version when reverting
});

export const updateLeaveStatusSchema = z.object({
  id: uuidSchema,
  status: z.enum(['Approved', 'Rejected', 'Pending']),
  approved_by: uuidSchema.optional().nullable(),
  admin_remarks: z.string().max(1000).optional().nullable(),
  action: z.string().optional(),
});

export const leaveActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(1000).optional().nullable(),
});

export const reportActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(1000).optional().nullable(),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const trackLoginSchema = z.object({
  user_id: uuidSchema.optional(),
  email: emailSchema,
  success: z.boolean(),
  failure_reason: z.string().optional().nullable(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
}).passthrough();

export const contactFormSchema = z.object({
  firstName: nonEmptyString.max(100),
  lastName: nonEmptyString.max(100),
  areaCode: z.string().max(10).optional(),
  phoneNumber: z.string().max(20).optional(),
  email: emailSchema,
  purpose: nonEmptyString.max(100),
  message: z.string().max(2000),
});

export const periodSchema = z.object({
  period_number: z.number().int().min(1).max(20),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  school_id: uuidSchema.optional(),
}).passthrough();

export const validateJoiningCodeSchema = z.object({
  code: z.string().min(1, 'Joining code is required'),
  studentData: z.object({
    full_name: nonEmptyString.max(255),
    email: emailSchema,
    password: passwordSchema(false),
  }).optional(),
});

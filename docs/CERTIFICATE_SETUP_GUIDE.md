# Certificate Auto-Generation Setup Guide

## Current Status
✅ Certificate generation system is fully implemented
✅ Blank template with correct coordinates is being used
✅ Storage bucket is created
✅ Database trigger is set up
✅ API endpoints are ready

## Issue: Existing Eligible Students Not Getting Certificates

The database trigger only fires when a **new** chapter is completed. Students who already completed 80%+ before the trigger was set up won't automatically get certificates.

## Solution: Two-Step Process

### Step 1: Run Migration to Create Certificate Records
Run the migration: `20251219000004_ensure_certificates_for_existing_students.sql`

This will:
- Find all students with 80%+ completion
- Create certificate records for them (with `certificate_url = NULL`)
- Create notifications

### Step 2: Generate Certificate Images
After running the migration, call the backfill endpoint to generate actual certificate images:

```bash
# Generate certificates for all eligible students
POST /api/certificates/backfill-all?limit=50
```

Or process pending certificates:
```bash
# Process certificates that have records but no images
POST /api/certificates/process-pending?limit=20
```

## For Future Students

The trigger will automatically:
1. Detect when a student completes 80%+
2. Create certificate record
3. Attempt to generate certificate image via API
4. Display in student dashboard

## Manual Testing

### Check Certificate Status
```bash
GET /api/test/debug-certificates?email=student@example.com
```

### Generate Certificate for Specific Student
```bash
POST /api/test/generate-certificate?email=student@example.com
```

### Regenerate Certificate
```bash
POST /api/test/regenerate-certificate
Body: { "studentId": "...", "courseId": "..." }
```

## Troubleshooting

### Certificates Not Showing in Dashboard
1. Check if certificate has `certificate_url` (not NULL)
2. Verify RLS policies allow student to view their certificates
3. Check browser console for errors
4. Verify the query in `useStudentCertificates()` hook

### Trigger Not Firing
1. Check if trigger exists: Query `pg_trigger` table
2. Verify `course_progress` table updates are happening
3. Check database logs for trigger errors
4. Ensure trigger function `check_and_generate_certificate()` exists

### Certificate Images Not Generating
1. Verify storage bucket `certificates` exists
2. Check if template image exists at correct path
3. Verify Sharp library is installed
4. Check API logs for image generation errors

## Next Steps

1. **Run the migration** `20251219000004_ensure_certificates_for_existing_students.sql`
2. **Call backfill endpoint** to generate certificate images:
   ```bash
   curl -X POST "http://localhost:3000/api/certificates/backfill-all?limit=50"
   ```
3. **Verify certificates appear** in student dashboard
4. **Set up background job** (optional) to process pending certificates every 5-10 minutes

## Background Job Setup

If `pg_cron` is not available, set up external cron:

```bash
# Add to crontab (runs every 5 minutes)
*/5 * * * * curl -X POST https://your-domain.com/api/certificates/process-pending?limit=10
```

Or use a service like:
- Vercel Cron Jobs
- GitHub Actions (scheduled)
- External cron service



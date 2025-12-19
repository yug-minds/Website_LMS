# Automatic Certificate Generation System

## Overview
The system automatically generates certificates for students when they complete 80% or more of a course. Certificates are displayed in the student dashboard's Certificates tab.

## How It Works

### 1. Automatic Generation (Database Trigger)
When a student completes a chapter:
- The `course_progress` table is updated with `completed = true`
- The `check_and_generate_certificate()` trigger function fires
- It calculates completion percentage: `(completed_chapters / total_chapters) * 100`
- If completion >= 80%:
  - Creates a certificate record in the `certificates` table
  - Attempts to call the API via `pg_net` (if available) to generate the certificate image
  - Creates a notification for the student
  - If API call fails, certificate record is created with `certificate_url = NULL` for background processing

### 2. Certificate Image Generation
- Uses the blank template: `public/Courses Certificate of Completion blank.png`
- Overlays student name at coordinates: X=999, Y=693 (center of area 486,612 to 1511,773)
- Overlays course name at coordinates: X=1001, Y=992 (center of area 488,911 to 1513,1072)
- Uploads generated PNG to Supabase Storage bucket `certificates`
- Updates certificate record with the public URL

### 3. Background Processing
If the database trigger can't call the API directly:
- Certificates with `certificate_url = NULL` are processed by the background job
- Endpoint: `/api/certificates/process-pending`
- Can be called manually or via cron job every 5-10 minutes

### 4. Student Dashboard Display
- Certificates are displayed in `/student/certificates` page
- Shows certificate preview, view, and download buttons
- If certificate is still being generated, shows a "Certificate is being generated" message

## API Endpoints

### For Students
- `POST /api/student/certificates/generate` - Manually generate certificate (requires 80% completion)

### For System/Background Jobs
- `POST /api/certificates/auto-generate` - Auto-generate certificate (called by trigger or background job)
- `POST /api/certificates/process-pending` - Process pending certificates (NULL certificate_url)
- `GET /api/certificates/process-pending` - Check count of pending certificates

### For Admins
- `POST /api/admin/certificates/generate-all-eligible` - Generate certificates for all eligible students
- `POST /api/admin/certificates/batch-generate` - Batch generate certificates

## Database Functions

### `check_and_generate_certificate()`
- Trigger function that fires on `course_progress` updates
- Creates certificate records when 80% completion is reached
- Attempts to call API via `pg_net` if available

### `batch_generate_certificates_for_eligible_students()`
- Finds all students with 80%+ completion who don't have certificates
- Creates certificate records for them
- Returns list of student-course pairs

### `trigger_certificate_generation_for_eligible()`
- Creates certificate records for all eligible students
- Can be called manually to backfill certificates

## Setup Instructions

### 1. Run Migrations
```bash
# Run these migrations in order:
# - 20251219000000_create_certificates_bucket.sql (creates storage bucket)
# - 20251219000001_update_certificate_trigger.sql (updates trigger)
# - 20251219000002_batch_generate_certificates.sql (creates batch function)
# - 20251219000003_setup_certificate_cron.sql (sets up cron job if available)
```

### 2. Create Storage Bucket
If not created via migration, create manually in Supabase Dashboard:
- Name: `certificates`
- Public: `true`
- File size limit: `5MB`
- Allowed MIME types: `image/png`

### 3. Generate Certificates for Existing Students
Call the admin endpoint to generate certificates for all eligible students:
```bash
POST /api/admin/certificates/generate-all-eligible?limit=50
```

### 4. Set Up Background Processing (Optional)
If `pg_cron` is not available, set up external cron job:
```bash
# Call every 5-10 minutes
curl -X POST http://your-domain.com/api/certificates/process-pending?limit=10
```

## Testing

### Test Certificate Generation
```bash
# Generate certificate for specific student
curl -X POST http://localhost:3000/api/test/generate-certificate?email=student@example.com

# Regenerate certificate with new template
curl -X POST http://localhost:3000/api/test/regenerate-certificate \
  -H "Content-Type: application/json" \
  -d '{"studentId":"...","courseId":"..."}'
```

### Check Pending Certificates
```bash
curl http://localhost:3000/api/certificates/process-pending
```

## Troubleshooting

### Certificates Not Generating Automatically
1. Check if trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_auto_generate_certificate';`
2. Check if `pg_net` extension is available
3. Check database logs for trigger errors
4. Manually process pending certificates via `/api/certificates/process-pending`

### Certificates Not Showing in Dashboard
1. Verify certificate has `certificate_url` (not NULL)
2. Check RLS policies on `certificates` table
3. Verify student is querying their own certificates
4. Check browser console for errors

### Certificate Images Not Loading
1. Verify storage bucket exists and is public
2. Check RLS policies on storage bucket
3. Verify certificate URL is accessible
4. Check if image was uploaded successfully

## Future Enhancements
- Add certificate verification/validation
- Add certificate sharing functionality
- Add certificate expiration dates
- Add certificate templates selection
- Add batch download functionality



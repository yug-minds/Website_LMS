# Certificate Generation System - Production Readiness Checklist

## ✅ Completed Fixes

### 1. API Response Consistency
- ✅ All endpoints now return consistent `{ success: boolean, ... }` format
- ✅ Error responses include `success: false` field
- ✅ Success responses include `success: true` field

### 2. Error Handling
- ✅ Added proper error handling for database queries
- ✅ Added cleanup of uploaded files on errors
- ✅ Added validation for edge cases (empty courses, missing data)
- ✅ Improved error messages with details

### 3. Completion Calculation
- ✅ Consistent calculation across all endpoints
- ✅ Rounded to 2 decimal places for precision
- ✅ Handles edge case: courses with 0 published chapters
- ✅ Validates progress data before calculation

### 4. Input Validation
- ✅ Validates student and course names before generation
- ✅ Truncates long names to prevent text overflow (50 chars for name, 60 for course)
- ✅ Sanitizes input (trim whitespace)
- ✅ Validates template file exists before processing

### 5. Security
- ✅ Student endpoint uses authenticated user ID (prevents unauthorized access)
- ✅ Admin endpoints use proper authentication
- ✅ Input sanitization prevents XSS in certificate text

## 🔍 Verification Checklist

### Database
- [ ] Verify trigger `trigger_auto_generate_certificate` exists and is enabled
- [ ] Verify `certificates` table has `certificate_url` as nullable
- [ ] Verify storage bucket `certificates` exists and is public
- [ ] Verify RLS policies allow students to view their own certificates

### Environment Variables
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set (for admin operations)
- [ ] `NEXT_PUBLIC_APP_URL` or `VERCEL_URL` is set (for background jobs)

### Template File
- [ ] `public/Courses Certificate of Completion blank.png` exists
- [ ] Template image is valid PNG format
- [ ] Template dimensions are correct (should be ~1200x800 or larger)

### Background Jobs
- [ ] Set up cron job or scheduled task to call `/api/certificates/process-pending` every 5-10 minutes
- [ ] Or configure `pg_cron` in Supabase (if available) to run the process-pending function

## 🧪 Testing Checklist

### Manual Testing
1. **Complete Course to 80%+**
   - [ ] Student completes 80% of course chapters
   - [ ] Certificate record is created automatically (check database)
   - [ ] Certificate image is generated (check storage)
   - [ ] Certificate appears in student dashboard

2. **Manual Generation (Fallback)**
   - [ ] Student with 80%+ completion clicks "Generate Certificate"
   - [ ] Certificate is generated successfully
   - [ ] Button disappears after generation
   - [ ] Certificate appears in dashboard

3. **Edge Cases**
   - [ ] Course with 0 chapters (should show error)
   - [ ] Student with missing name (should use fallback)
   - [ ] Course with missing name (should use fallback)
   - [ ] Very long names (should truncate)
   - [ ] Duplicate generation attempt (should return existing certificate)

4. **Error Scenarios**
   - [ ] Storage bucket missing (should show clear error)
   - [ ] Template file missing (should show clear error)
   - [ ] Network error during generation (should clean up and retry)

### Automated Testing (Recommended)
- [ ] Unit tests for completion calculation
- [ ] Integration tests for certificate generation
- [ ] E2E tests for full certificate flow

## 📊 Monitoring

### Key Metrics to Monitor
1. **Certificate Generation Success Rate**
   - Track successful vs failed generations
   - Alert if success rate drops below 95%

2. **Pending Certificates**
   - Monitor count of certificates with NULL `certificate_url`
   - Alert if count exceeds 10 for more than 1 hour

3. **Generation Time**
   - Track time from trigger to certificate URL population
   - Alert if average time exceeds 5 minutes

4. **Storage Usage**
   - Monitor certificate storage bucket size
   - Set up alerts for storage limits

### Logging
- All errors are logged with context
- Certificate generation events are logged
- API calls include request/response logging

## 🚀 Deployment Steps

1. **Run Migrations**
   ```bash
   supabase migration up
   ```

2. **Verify Storage Bucket**
   - Check that `certificates` bucket exists
   - Verify it's public and has correct policies

3. **Set Environment Variables**
   - Ensure all required env vars are set in production

4. **Test Certificate Generation**
   - Create a test student
   - Complete a test course to 80%+
   - Verify certificate is generated

5. **Set Up Background Job**
   - Configure cron to call `/api/certificates/process-pending`
   - Or set up Supabase pg_cron job

6. **Monitor**
   - Set up monitoring and alerts
   - Watch logs for first few hours

## 🔧 Troubleshooting

### Certificate Not Generating
1. Check trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_auto_generate_certificate';`
2. Check for pending certificates: `SELECT * FROM certificates WHERE certificate_url IS NULL;`
3. Check logs for errors
4. Verify storage bucket exists and is accessible

### Certificate Generation Failing
1. Check template file exists at correct path
2. Verify Sharp library is installed
3. Check storage permissions
4. Review error logs for specific failure reason

### Button Still Showing After Generation
1. Clear browser cache
2. Check certificate has valid URL in database
3. Verify frontend query is correctly filtering certificates

## 📝 Notes

- Certificates are generated as PNG images (not PDF)
- Certificate names are truncated to prevent overflow
- Background job processes pending certificates every 5-10 minutes
- Manual generation is available as fallback for students



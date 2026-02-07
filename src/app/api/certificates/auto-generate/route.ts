/**
 * Auto-Generate Certificate Endpoint
 * 
 * Internal API endpoint for automatic certificate generation
 * Called by database triggers or background jobs when student reaches 80% completion
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'
import { generateCertificateImage } from '../../../../lib/certificate-image-generator'

/**
 * POST /api/certificates/auto-generate
 * 
 * Generates a certificate automatically when called by database trigger or background job
 * 
 * Body: { studentId: string, courseId: string }
 * 
 * Returns: { success: boolean, certificateId?: string, certificateUrl?: string, error?: string }
 */
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);
  
  try {
    const body = await request.json()
    const { studentId, courseId } = body

    if (!studentId || !courseId) {
      return NextResponse.json(
        { success: false, error: 'Student ID and Course ID are required' },
        { status: 400 }
      )
    }

    // Get student profile
    type StudentRow = { full_name?: string | null; email?: string | null };
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', studentId)
      .single()

    const studentRow = student as StudentRow | null;
    if (studentError || !studentRow) {
      console.error('Student not found:', studentError)
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      )
    }

    // Get course details
    type CourseRow = { name?: string | null; title?: string | null; description?: string | null };
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('name, title, description')
      .eq('id', courseId)
      .single()

    const courseRow = course as CourseRow | null;
    if (courseError || !courseRow) {
      console.error('Course not found:', courseError)
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      )
    }

    // Calculate course completion percentage
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .eq('course_id', courseId)
      .eq('is_published', true)

    if (chaptersError) {
      console.error('Error fetching chapters:', chaptersError)
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to fetch course chapters',
          details: chaptersError.message 
        },
        { status: 500 }
      )
    }

    const totalChapters = chapters?.length || 0

    // Edge case: Course with no published chapters
    if (totalChapters === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Course has no published chapters',
        },
        { status: 400 }
      )
    }

    const { data: progress, error: progressError } = await supabaseAdmin
      .from('course_progress')
      .select('completed')
      .eq('student_id', studentId)
      .eq('course_id', courseId)

    if (progressError) {
      console.error('Error fetching progress:', progressError)
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to fetch course progress',
          details: progressError.message 
        },
        { status: 500 }
      )
    }

    type ProgressItem = {
      completed?: boolean | null;
    };
    const completedChapters = ((progress || []) as ProgressItem[]).filter((p) => p.completed === true).length

    // Calculate completion percentage (round to 2 decimal places for consistency)
    const completionPercent = totalChapters > 0
      ? Math.round((completedChapters / totalChapters) * 100 * 100) / 100
      : 0

    // Verify 80% completion requirement
    if (completionPercent < 80) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Course completion must be at least 80%',
          completionPercent 
        },
        { status: 400 }
      )
    }

    // Check if certificate already exists
    type CertRow = { id?: string; certificate_url?: string | null };
    const { data: existingCert } = await supabaseAdmin
      .from('certificates')
      .select('id, certificate_url')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle()

    const existingCertRow = existingCert as CertRow | null;
    if (existingCertRow?.certificate_url) {
      return NextResponse.json({
        success: true,
        certificateId: existingCertRow.id,
        certificateUrl: existingCertRow.certificate_url,
        message: 'Certificate already exists',
      })
    }

    // Validate student and course names before generating
    const studentName = studentRow.full_name?.trim() || 'Student'
    const courseName = courseRow.name?.trim() || courseRow.title?.trim() || 'Course'
    
    if (!studentName || studentName === 'Student') {
      console.warn('Student name is missing or default, using fallback:', { studentId, studentRow })
    }
    
    if (!courseName || courseName === 'Course') {
      console.warn('Course name is missing or default, using fallback:', { courseId, courseRow })
    }

    // Generate certificate image
    let certificateBuffer: Buffer
    try {
      certificateBuffer = await generateCertificateImage({
        studentName,
        courseName,
      })
    } catch (imageError: unknown) {
      console.error('Error generating certificate image:', imageError)
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to generate certificate image', 
          details: imageError instanceof Error ? imageError.message : 'Unknown error'
        },
        { status: 500 }
      )
    }

    // Upload certificate to Supabase Storage
    const timestamp = Date.now()
    const fileName = `${timestamp}.png`
    const filePath = `${studentId}/${courseId}/${fileName}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('certificates')
      .upload(filePath, certificateBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading certificate to storage:', uploadError)
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to upload certificate to storage', 
          details: uploadError.message 
        },
        { status: 500 }
      )
    }

    // Get public URL for the certificate
    const { data: urlData } = supabaseAdmin.storage
      .from('certificates')
      .getPublicUrl(filePath)

    const certificateUrl = urlData?.publicUrl

    if (!certificateUrl) {
      return NextResponse.json(
        { success: false, error: 'Failed to get certificate URL' },
        { status: 500 }
      )
    }

    // Check if certificate record exists, then update or insert
    type CertRecordRow = { id?: string; issued_at?: string | null };
    const { data: existingCertRecord } = await supabaseAdmin
      .from('certificates')
      .select('id, issued_at')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle()

    const existingRecord = existingCertRecord as CertRecordRow | null;
    type CertificateResult = { id: string; certificate_url?: string | null };
    let certificate: CertificateResult;
    if (existingRecord?.id) {
      // Update existing certificate
      const { data: updatedCert, error: updateError } = await supabaseAdmin
        .from('certificates')
        // @ts-expect-error - Supabase generated types use never for untyped schema
        .update({
          certificate_name: `${courseRow.name || courseRow.title} - Certificate of Completion`,
          certificate_url: certificateUrl,
        })
        .eq('id', existingRecord.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating certificate record:', updateError)
        await supabaseAdmin.storage
          .from('certificates')
          .remove([filePath])
          .catch(() => {})
        return NextResponse.json(
          { 
            success: false, 
            error: 'Failed to update certificate record', 
            details: updateError.message 
          },
          { status: 500 }
        )
      }
      certificate = updatedCert as CertificateResult;
    } else {
      // Insert new certificate
      const { data: newCert, error: insertError } = await supabaseAdmin
        .from('certificates')
        // @ts-expect-error - Supabase generated types use never for untyped schema
        .insert({
          student_id: studentId,
          course_id: courseId,
          certificate_name: `${courseRow.name || courseRow.title} - Certificate of Completion`,
          certificate_url: certificateUrl,
          issued_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating certificate record:', insertError)
        await supabaseAdmin.storage
          .from('certificates')
          .remove([filePath])
          .catch(() => {})
        return NextResponse.json(
          { 
            success: false, 
            error: 'Failed to create certificate record', 
            details: insertError.message 
          },
          { status: 500 }
        )
      }
      certificate = newCert as CertificateResult;
    }

    console.log('Certificate auto-generated successfully', {
      studentId,
      courseId,
      certificateId: certificate.id,
    })

    return NextResponse.json({
      success: true,
      certificateId: certificate.id,
      certificateUrl: certificate.certificate_url ?? undefined,
      message: 'Certificate generated successfully',
    })
  } catch (error) {
    console.error('Error in auto-generate certificate:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}



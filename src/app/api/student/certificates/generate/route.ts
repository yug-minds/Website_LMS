import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabase'
import { generateCertificateImage } from '../../../../../lib/certificate-image-generator'
import { getAuthenticatedUserId } from '../../../../../lib/auth-utils'

type CertRow = { id?: string; certificate_url?: string | null };
type ProfileRow = { full_name?: string | null; email?: string | null };
type CourseRow = { name?: string | null; title?: string | null; description?: string | null };
type CertRecordRow = { id?: string; issued_at?: string | null; name?: string | null; title?: string | null };

export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);
  
  try {
    // Get authenticated user ID
    const studentId = await getAuthenticatedUserId(request)
    
    if (!studentId) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { courseId } = body

    if (!courseId) {
      return NextResponse.json(
        { error: 'Course ID is required', success: false },
        { status: 400 }
      )
    }

    // Get student profile
    const { data: studentData, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', studentId)
      .single()

    const student = studentData as ProfileRow | null
    if (studentError || !student) {
      return NextResponse.json(
        { error: 'Student not found', success: false },
        { status: 404 }
      )
    }

    // Get course details
    const { data: courseData, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('name, title, description')
      .eq('id', courseId)
      .single()

    const course = courseData as CourseRow | null
    if (courseError || !course) {
      return NextResponse.json(
        { error: 'Course not found', success: false },
        { status: 404 }
      )
    }

    // Calculate course completion percentage
    // Get total published chapters for the course
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .eq('course_id', courseId)
      .eq('is_published', true)

    if (chaptersError) {
      console.error('Error fetching chapters:', chaptersError)
      return NextResponse.json(
        { 
          error: 'Failed to fetch course chapters',
          success: false 
        },
        { status: 500 }
      )
    }

    const totalChapters = chapters?.length || 0

    // Edge case: Course with no published chapters
    if (totalChapters === 0) {
      return NextResponse.json(
        { 
          error: 'Course has no published chapters',
          success: false 
        },
        { status: 400 }
      )
    }

    // Get completed chapters for this student
    const { data: progress, error: progressError } = await supabaseAdmin
      .from('course_progress')
      .select('completed')
      .eq('student_id', studentId)
      .eq('course_id', courseId)

    if (progressError) {
      console.error('Error fetching progress:', progressError)
      return NextResponse.json(
        { 
          error: 'Failed to fetch course progress',
          success: false 
        },
        { status: 500 }
      )
    }

    const completedChapters = progress?.filter((p: { completed?: boolean }) => p.completed === true).length || 0

    // Calculate completion percentage (round to 2 decimal places)
    const completionPercent = totalChapters > 0
      ? Math.round((completedChapters / totalChapters) * 100 * 100) / 100
      : 0

    // Check if student has completed at least 80%
    if (completionPercent < 80) {
      return NextResponse.json(
        { 
          error: 'Course completion must be at least 80%', 
          completionPercent,
          success: false 
        },
        { status: 400 }
      )
    }

    // Check if certificate already exists
    const { data: existingCertData } = await supabaseAdmin
      .from('certificates')
      .select('id, certificate_url')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .single()

    const existingCert = existingCertData as CertRow | null
    if (existingCert && existingCert.certificate_url) {
      return NextResponse.json({
        success: true,
        certificateId: existingCert.id,
        certificateUrl: existingCert.certificate_url,
        message: 'Certificate already exists',
      })
    }

    // Validate student and course names before generating
    const studentRow = student as ProfileRow
    const courseRow = course as CourseRow
    const studentName = studentRow.full_name?.trim() || 'Student'
    const courseName = courseRow.name?.trim() || courseRow.title?.trim() || 'Course'
    
    if (!studentName || studentName === 'Student') {
      console.warn('Student name is missing or default, using fallback:', { studentId, student })
    }
    
    if (!courseName || courseName === 'Course') {
      console.warn('Course name is missing or default, using fallback:', { courseId, course })
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
          error: 'Failed to generate certificate image', 
          details: imageError instanceof Error ? imageError.message : String(imageError),
          success: false 
        },
        { status: 500 }
      )
    }

    // Upload certificate to Supabase Storage
    const timestamp = Date.now()
    const fileName = `${timestamp}.png`
    const filePath = `${studentId}/${courseId}/${fileName}`

    const { data: _uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('certificates')
      .upload(filePath, certificateBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading certificate to storage:', uploadError)
      // Clean up: try to remove uploaded file if it was partially uploaded
      return NextResponse.json(
        { 
          error: 'Failed to upload certificate to storage', 
          details: uploadError.message,
          success: false 
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
      // Clean up uploaded file
      await supabaseAdmin.storage
        .from('certificates')
        .remove([filePath])
        .catch(() => {})
      return NextResponse.json(
        { 
          error: 'Failed to get certificate URL',
          success: false 
        },
        { status: 500 }
      )
    }

    // Check if certificate record exists, then update or insert
    const { data: existingCertRecord } = await supabaseAdmin
      .from('certificates')
      .select('id, issued_at')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle()

    let certificate
    if (existingCertRecord) {
      // Update existing certificate
      const updatePayload = {
        certificate_name: `${courseRow.name || courseRow.title} - Certificate of Completion`,
        certificate_url: certificateUrl,
      }
      const { data: updatedCertData, error: updateError } = await supabaseAdmin
        .from('certificates')
        .update(updatePayload as unknown as never)
        .eq('id', (existingCertRecord as { id?: string }).id ?? '')
        .select()
        .single()

      if (updateError) {
        console.error('Error updating certificate record:', updateError)
        // Clean up uploaded file
        await supabaseAdmin.storage
          .from('certificates')
          .remove([filePath])
          .catch(() => {})
        return NextResponse.json(
          { 
            error: 'Failed to update certificate record', 
            details: updateError.message,
            success: false 
          },
          { status: 500 }
        )
      }
      certificate = updatedCertData as CertRecordRow & { certificate_url?: string }
    } else {
      // Insert new certificate
      const insertPayload = {
        student_id: studentId,
        course_id: courseId,
        certificate_name: `${courseRow.name || courseRow.title} - Certificate of Completion`,
        certificate_url: certificateUrl,
        issued_at: new Date().toISOString(),
      }
      const { data: newCertData, error: insertError } = await supabaseAdmin
        .from('certificates')
        .insert(insertPayload as unknown as never)
        .select()
        .single()

      if (insertError) {
        console.error('Error creating certificate record:', insertError)
        // Clean up uploaded file
        await supabaseAdmin.storage
          .from('certificates')
          .remove([filePath])
          .catch(() => {})
        return NextResponse.json(
          { 
            error: 'Failed to create certificate record', 
            details: insertError.message,
            success: false 
          },
          { status: 500 }
        )
      }
      certificate = newCertData as CertRecordRow & { certificate_url?: string }
    }

    return NextResponse.json({
      success: true,
      certificateId: certificate?.id,
      certificateUrl: certificate?.certificate_url,
      message: 'Certificate generated successfully',
    })
  } catch (error) {
    console.error('Error generating certificate:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
        success: false 
      },
      { status: 500 }
    )
  }
}


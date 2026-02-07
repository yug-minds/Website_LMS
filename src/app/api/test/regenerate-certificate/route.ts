/**
 * Force regenerate certificate for testing
 * This will delete the old certificate and create a new one
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'
import { generateCertificateImage } from '../../../../lib/certificate-image-generator'

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
        { error: 'Student ID and Course ID are required' },
        { status: 400 }
      )
    }

    type ProfileRow = { full_name?: string | null };
    type CourseRow = { name?: string | null; title?: string | null };
    type CertRow = { id?: string; certificate_url?: string | null };
    // Get student and course info
    const { data: studentData } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .single()

    const { data: courseData } = await supabaseAdmin
      .from('courses')
      .select('name, title')
      .eq('id', courseId)
      .single()

    const student = studentData as ProfileRow | null
    const course = courseData as CourseRow | null
    if (!student || !course) {
      return NextResponse.json(
        { error: 'Student or course not found' },
        { status: 404 }
      )
    }

    // Delete old certificate file if exists
    const { data: oldCertData } = await supabaseAdmin
      .from('certificates')
      .select('certificate_url')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle()

    const oldCert = oldCertData as CertRow | null
    if (oldCert?.certificate_url) {
      // Extract path from URL
      const urlParts = (oldCert.certificate_url as string).split('/certificates/')
      if (urlParts.length > 1) {
        const filePath = urlParts[1]
        await supabaseAdmin.storage
          .from('certificates')
          .remove([filePath])
          .catch(() => {})
      }
    }

    // Generate new certificate
    const certificateBuffer = await generateCertificateImage({
      studentName: (student?.full_name ?? 'Student') as string,
      courseName: (course?.name ?? course?.title ?? 'Course') as string,
    })

    // Upload new certificate
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
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('certificates')
      .getPublicUrl(filePath)

    const certificateUrl = urlData?.publicUrl

    if (!certificateUrl) {
      throw new Error('Failed to get certificate URL')
    }

    // Update certificate record
    const { data: existingCertData } = await supabaseAdmin
      .from('certificates')
      .select('id')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle()

    const existingCert = existingCertData as { id?: string } | null
    if (existingCert?.id) {
      await supabaseAdmin
        .from('certificates')
        .update({ certificate_url: certificateUrl } as unknown as never)
        .eq('id', existingCert.id)
    } else {
      const insertPayload = {
        student_id: studentId,
        course_id: courseId,
        certificate_name: `${course?.name ?? course?.title ?? 'Course'} - Certificate of Completion`,
        certificate_url: certificateUrl,
        issued_at: new Date().toISOString(),
      };
      await supabaseAdmin
        .from('certificates')
        .insert(insertPayload as unknown as never)
    }

    return NextResponse.json({
      success: true,
      certificateUrl: certificateUrl as string,
      message: 'Certificate regenerated successfully',
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}



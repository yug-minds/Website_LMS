/**
 * Force regenerate certificate for testing
 * This will delete the old certificate and create a new one
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'
import { generateCertificateImage } from '../../../../lib/certificate-image-generator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId, courseId } = body

    if (!studentId || !courseId) {
      return NextResponse.json(
        { error: 'Student ID and Course ID are required' },
        { status: 400 }
      )
    }

    // Get student and course info
    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .single()

    const { data: course } = await supabaseAdmin
      .from('courses')
      .select('name, title')
      .eq('id', courseId)
      .single()

    if (!student || !course) {
      return NextResponse.json(
        { error: 'Student or course not found' },
        { status: 404 }
      )
    }

    // Delete old certificate file if exists
    const { data: oldCert } = await supabaseAdmin
      .from('certificates')
      .select('certificate_url')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle()

    if (oldCert?.certificate_url) {
      // Extract path from URL
      const urlParts = oldCert.certificate_url.split('/certificates/')
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
      studentName: student.full_name || 'Student',
      courseName: course.name || course.title || 'Course',
    })

    // Upload new certificate
    const timestamp = Date.now()
    const fileName = `${timestamp}.png`
    const filePath = `${studentId}/${courseId}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
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
    const { data: existingCert } = await supabaseAdmin
      .from('certificates')
      .select('id')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle()

    if (existingCert) {
      await supabaseAdmin
        .from('certificates')
        .update({
          certificate_url: certificateUrl,
        })
        .eq('id', existingCert.id)
    } else {
      await supabaseAdmin
        .from('certificates')
        .insert({
          student_id: studentId,
          course_id: courseId,
          certificate_name: `${course.name || course.title} - Certificate of Completion`,
          certificate_url: certificateUrl,
          issued_at: new Date().toISOString(),
        })
    }

    return NextResponse.json({
      success: true,
      certificateUrl,
      message: 'Certificate regenerated successfully',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}



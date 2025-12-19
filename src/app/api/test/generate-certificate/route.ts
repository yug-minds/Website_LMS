/**
 * Test endpoint to generate certificate for Aarav Sharma
 * This is a temporary endpoint for testing
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || 'sharma@dawnbudsmodelschool.edu'

    console.log(`🔍 Looking for student: ${email}`)

    // Find student by email
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', email)
      .eq('role', 'student')
      .single()

    if (studentError || !student) {
      return NextResponse.json(
        { error: 'Student not found', details: studentError?.message },
        { status: 404 }
      )
    }

    console.log(`✅ Found student: ${student.full_name} (${student.id})`)

    // Get all courses from course_progress for this student
    const { data: progressData } = await supabaseAdmin
      .from('course_progress')
      .select(`
        course_id,
        courses (
          id,
          name,
          title
        )
      `)
      .eq('student_id', student.id)

    if (!progressData || progressData.length === 0) {
      return NextResponse.json(
        { error: 'No course progress found for student' },
        { status: 404 }
      )
    }

    // Get unique courses
    const courseMap = new Map<string, any>()
    for (const p of progressData) {
      const courseId = p.course_id
      if (!courseMap.has(courseId) && (p as any).courses) {
        courseMap.set(courseId, (p as any).courses)
      }
    }

    if (courseMap.size === 0) {
      return NextResponse.json(
        { error: 'No courses found for student' },
        { status: 404 }
      )
    }

    // For each course, check completion and generate certificate if eligible
    const results: Array<{
      courseId: string
      courseName: string
      completion: number
      certificateGenerated: boolean
      certificateUrl?: string
      error?: string
    }> = []

    for (const [courseId, course] of courseMap.entries()) {
      const courseName = course.name || course.title || 'Unknown Course'

      // Get total chapters
      const { data: chapters } = await supabaseAdmin
        .from('chapters')
        .select('id')
        .eq('course_id', courseId)
        .eq('is_published', true)

      const totalChapters = chapters?.length || 0

      // Get completed chapters
      const { data: progress } = await supabaseAdmin
        .from('course_progress')
        .select('completed')
        .eq('student_id', student.id)
        .eq('course_id', courseId)

      const completedChapters = progress?.filter((p: any) => p.completed === true).length || 0
      const completion = totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0

      console.log(`📚 ${courseName}: ${completion.toFixed(1)}% (${completedChapters}/${totalChapters})`)

      if (completion >= 80) {
        // Check if certificate already exists with a valid URL
        const { data: existingCert } = await supabaseAdmin
          .from('certificates')
          .select('certificate_url')
          .eq('student_id', student.id)
          .eq('course_id', courseId)
          .maybeSingle()

        // Only skip if certificate has a valid URL (not null, not "pending")
        if (existingCert?.certificate_url && 
            existingCert.certificate_url !== 'pending' && 
            existingCert.certificate_url !== null) {
          results.push({
            courseId,
            courseName,
            completion,
            certificateGenerated: true,
            certificateUrl: existingCert.certificate_url,
          })
          continue
        }
        
        // If certificate exists but has no URL, we'll regenerate it
        console.log(`🔄 Certificate record exists but has no URL, generating new certificate...`)

        // Generate certificate using auto-generate endpoint (internal call)
        try {
          // Import and call the auto-generate function directly
          const { generateCertificateImage } = await import('../../../../lib/certificate-image-generator')
          
          // Get course details
          const { data: course } = await supabaseAdmin
            .from('courses')
            .select('name, title')
            .eq('id', courseId)
            .single()

          // Generate certificate image
          const certificateBuffer = await generateCertificateImage({
            studentName: student.full_name || 'Student',
            courseName: course?.name || course?.title || courseName,
          })

          // Check if certificates bucket exists, create if not
          const { data: buckets } = await supabaseAdmin.storage.listBuckets()
          const certificatesBucket = buckets?.find((b: any) => b.id === 'certificates')
          
          if (!certificatesBucket) {
            console.log('📦 Creating certificates bucket...')
            // Note: Bucket creation via API requires Supabase Management API
            // For now, we'll try to create it via SQL if possible
            // Otherwise, user needs to run the migration or create it manually
            throw new Error(
              'Certificates bucket not found. Please run the migration: ' +
              'supabase/migrations/20251219000000_create_certificates_bucket.sql ' +
              'or create it manually in Supabase Dashboard > Storage'
            )
          }

          // Upload to storage
          const timestamp = Date.now()
          const fileName = `${timestamp}.png`
          const filePath = `${student.id}/${courseId}/${fileName}`

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

          // Check if certificate record exists
          const { data: existingCertRecord } = await supabaseAdmin
            .from('certificates')
            .select('id')
            .eq('student_id', student.id)
            .eq('course_id', courseId)
            .maybeSingle()

          let certificate
          if (existingCertRecord) {
            // Update existing certificate
            const { data: updatedCert, error: updateError } = await supabaseAdmin
              .from('certificates')
              .update({
                certificate_name: `${courseName} - Certificate of Completion`,
                certificate_url: certificateUrl,
                issued_at: existingCertRecord.id ? undefined : new Date().toISOString(), // Keep original issued_at if exists
              })
              .eq('id', existingCertRecord.id)
              .select()
              .single()

            if (updateError) {
              await supabaseAdmin.storage
                .from('certificates')
                .remove([filePath])
                .catch(() => {})
              throw new Error(`Update error: ${updateError.message}`)
            }
            certificate = updatedCert
          } else {
            // Insert new certificate
            const { data: newCert, error: insertError } = await supabaseAdmin
              .from('certificates')
              .insert({
                student_id: student.id,
                course_id: courseId,
                certificate_name: `${courseName} - Certificate of Completion`,
                certificate_url: certificateUrl,
                issued_at: new Date().toISOString(),
              })
              .select()
              .single()

            if (insertError) {
              await supabaseAdmin.storage
                .from('certificates')
                .remove([filePath])
                .catch(() => {})
              throw new Error(`Insert error: ${insertError.message}`)
            }
            certificate = newCert
          }

          results.push({
            courseId,
            courseName,
            completion,
            certificateGenerated: true,
            certificateUrl: certificate.certificate_url,
          })
          console.log(`✅ Certificate generated for ${courseName}: ${certificate.certificate_url}`)
        } catch (error: any) {
          console.error(`❌ Error generating certificate for ${courseName}:`, error)
          results.push({
            courseId,
            courseName,
            completion,
            certificateGenerated: false,
            error: error.message || 'Unknown error',
          })
        }
      } else {
        results.push({
          courseId,
          courseName,
          completion,
          certificateGenerated: false,
          error: `Completion ${completion.toFixed(1)}% is below 80% threshold`,
        })
      }
    }

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.full_name,
        email: student.email,
      },
      results,
      summary: {
        total: results.length,
        generated: results.filter(r => r.certificateGenerated).length,
        eligible: results.filter(r => r.completion >= 80).length,
      },
    })
  } catch (error: any) {
    console.error('Error in test certificate generation:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}



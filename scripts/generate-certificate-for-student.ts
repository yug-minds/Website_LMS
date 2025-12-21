/**
 * Script to generate certificate for a specific student
 * Usage: npx tsx scripts/generate-certificate-for-student.ts <email>
 */

import { supabaseAdmin } from '../src/lib/supabase'

async function generateCertificateForStudent(email: string) {
  console.log(`\n🔍 Looking for student with email: ${email}\n`)

  // Find student by email
  const { data: student, error: studentError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('email', email)
    .eq('role', 'student')
    .single()

  if (studentError || !student) {
    console.error('❌ Student not found:', studentError?.message || 'No student found')
    return
  }

  console.log(`✅ Found student: ${student.full_name} (ID: ${student.id})\n`)

  // Find completed courses for this student
  const { data: progress, error: progressError } = await supabaseAdmin
    .from('course_progress')
    .select(`
      course_id,
      completed,
      courses (
        id,
        name,
        title
      )
    `)
    .eq('student_id', student.id)

  if (progressError) {
    console.error('❌ Error fetching progress:', progressError)
    return
  }

  // Group by course and calculate completion
  const courseMap = new Map<string, { course: any; completed: number; total: number }>()

  for (const p of progress || []) {
    const courseId = p.course_id
    if (!courseMap.has(courseId)) {
      courseMap.set(courseId, {
        course: p.courses,
        completed: 0,
        total: 0,
      })
    }
    const entry = courseMap.get(courseId)!
    entry.total++
    if (p.completed) {
      entry.completed++
    }
  }

  // Get total chapters for each course
  for (const [courseId, entry] of courseMap.entries()) {
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .eq('course_id', courseId)
      .eq('is_published', true)

    entry.total = chapters?.length || entry.total
  }

  console.log('📚 Course Progress:')
  const eligibleCourses: Array<{ courseId: string; courseName: string; completion: number }> = []

  for (const [courseId, entry] of courseMap.entries()) {
    const completion = entry.total > 0 ? (entry.completed / entry.total) * 100 : 0
    const courseName = entry.course?.name || entry.course?.title || 'Unknown Course'
    console.log(`  - ${courseName}: ${completion.toFixed(1)}% (${entry.completed}/${entry.total} chapters)`)
    
    if (completion >= 80) {
      eligibleCourses.push({ courseId, courseName, completion })
    }
  }

  if (eligibleCourses.length === 0) {
    console.log('\n❌ No courses with 80%+ completion found')
    return
  }

  console.log(`\n✅ Found ${eligibleCourses.length} eligible course(s) for certificate\n`)

  // Check existing certificates
  const { data: existingCerts } = await supabaseAdmin
    .from('certificates')
    .select('course_id, certificate_url')
    .eq('student_id', student.id)

  const existingCourseIds = new Set(existingCerts?.map((c: { course_id: string; certificate_url: string | null }) => c.course_id) || [])

  // Generate certificates for eligible courses
  for (const { courseId, courseName, completion } of eligibleCourses) {
    if (existingCourseIds.has(courseId)) {
      const existing = existingCerts?.find((c: { course_id: string; certificate_url: string | null }) => c.course_id === courseId)
      if (existing?.certificate_url) {
        console.log(`⏭️  Certificate already exists for "${courseName}"`)
        console.log(`   URL: ${existing.certificate_url}\n`)
        continue
      }
    }

    console.log(`🎓 Generating certificate for: ${courseName} (${completion.toFixed(1)}% complete)`)

    // Call the certificate generation API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                   'http://localhost:3000'

    try {
      const response = await fetch(`${baseUrl}/api/student/certificates/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId: student.id,
          courseId: courseId,
        }),
      })

      const result = await response.json()

      if (response.ok && result.certificateUrl) {
        console.log(`✅ Certificate generated successfully!`)
        console.log(`   Certificate ID: ${result.certificateId}`)
        console.log(`   URL: ${result.certificateUrl}\n`)
      } else {
        console.error(`❌ Failed to generate certificate:`, result.error || result.message)
        if (result.details) {
          console.error(`   Details: ${result.details}\n`)
        }
      }
    } catch (error: any) {
      console.error(`❌ Error generating certificate:`, error.message)
      console.error(`   Make sure the server is running at ${baseUrl}\n`)
    }
  }
}

// Run the script
const email = process.argv[2] || 'sharma@dawnbudsmodelschool.edu'

generateCertificateForStudent(email)
  .then(() => {
    console.log('✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })



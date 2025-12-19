import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabase'
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit'
import { gradeAssignment, Question, StudentAnswer } from '../../../../../../lib/assignment-grading'

/**
 * Table Structure Understanding:
 * 
 * 1. assignments table:
 *    - Stores assignment metadata (title, description, due_date, max_attempts, etc.)
 *    - One assignment can have multiple questions
 *    - Links to courses via course_id
 * 
 * 2. assignment_questions table:
 *    - Stores individual questions for each assignment
 *    - Links to assignments via assignment_id (foreign key)
 *    - Contains question_type (MCQ, essay, fill_blank), question_text, options, correct_answer
 *    - One assignment can have many questions
 * 
 * 3. submissions table:
 *    - Stores student submissions for assignments
 *    - Links to assignments via assignment_id (foreign key)
 *    - Links to students via student_id (foreign key)
 *    - Contains answers_json (for MCQ/fill_blank), text_content (for essays), file_url
 *    - Stores grade, feedback, status (draft, submitted, graded, returned)
 *    - One student can have one submission per assignment (or multiple if resubmission allowed)
 */


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    // Apply rate limiting
    const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
        },
        { 
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult)
        }
      )
    }

    const { assignmentId } = await params
    console.log('🚀 [Submit] Starting assignment submission for:', assignmentId)

    // Get auth token from request
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    console.log('✅ [Submit] User authenticated:', user.id)

    // Test database connection by checking if assignments table is accessible
    console.log('🔍 [Submit] Testing database connection...')
    const { data: connectionTest, error: connectionError } = await supabaseAdmin
      .from('assignments')
      .select('id')
      .limit(1)
    
    if (connectionError) {
      console.error('❌ [Submit] Database connection test failed:', connectionError)
      console.error('   Error code:', connectionError.code)
      console.error('   Error message:', connectionError.message)
      console.error('   This suggests a database connectivity or configuration issue')
      
      return NextResponse.json(
        { 
          error: 'Database Connection Error', 
          details: `Unable to connect to database. Error: ${connectionError.message} (Code: ${connectionError.code || 'unknown'}). Please verify: 1) Database is accessible, 2) Service role key is correct, 3) Network connectivity is working.` 
        },
        { status: 500 }
      )
    }
    console.log('✅ [Submit] Database connection test passed')

    // Parse request body
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      console.error('❌ [Submit] Error parsing request body:', jsonError)
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          details: 'Invalid JSON in request body. Please ensure the request body is valid JSON.' 
        },
        { status: 400 }
      )
    }
    
    const { answers, fileUrl, textContent } = body || {}

    // Validate request body
    if (!answers && !fileUrl && !textContent) {
      return NextResponse.json(
        { error: 'Bad Request', details: 'At least one answer, file, or text content is required' },
        { status: 400 }
      )
    }

    // STEP 1: Fetch assignment from assignments table
    // Using supabaseAdmin like other working routes
    console.log('🔍 [Submit] Step 1: Fetching assignment from assignments table...')
    
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('assignments')
      .select('id, title, auto_grading_enabled, max_score, max_attempts, due_date, is_published')
      .eq('id', assignmentId)
      .eq('is_published', true)
      .single()

    if (assignmentError) {
      console.error('❌ [Submit] Error fetching assignment:', assignmentError)
      console.error('   Error code:', assignmentError.code)
      console.error('   Error message:', assignmentError.message)
      console.error('   Error details:', assignmentError.details)
      console.error('   Error hint:', assignmentError.hint)
      console.error('   Full error object:', JSON.stringify(assignmentError, null, 2))
      
      // Check for specific PostgreSQL error codes
      const isTableNotFound = assignmentError.code === '42P01' || 
                              (assignmentError.message?.toLowerCase().includes('relation') && 
                               assignmentError.message?.toLowerCase().includes('does not exist'))
      
      if (isTableNotFound) {
        // Log diagnostic information
        console.error('🔍 [Submit] Diagnostic info:')
        console.error('   Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 50))
        console.error('   Service key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
        console.error('   Service key length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0)
        
        return NextResponse.json(
          { 
            error: 'Database Error', 
            details: `Database query failed: ${assignmentError.message}. Error code: ${assignmentError.code || 'unknown'}. Please check: 1) Database connection is working, 2) Tables exist in the database, 3) Service role key has proper permissions. Original error: ${JSON.stringify({ code: assignmentError.code, message: assignmentError.message, details: assignmentError.details, hint: assignmentError.hint })}` 
          },
          { status: 500 }
        )
      }
      
      // For other errors, return appropriate status
      // PGRST116 = no rows returned (for .single())
      if (assignmentError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Not Found', details: 'Assignment not found or not published' },
          { status: 404 }
        )
      }
      
      return NextResponse.json(
        { error: 'Database Error', details: assignmentError.message || 'Failed to fetch assignment' },
        { status: 500 }
      )
    }
    
    if (!assignment) {
      return NextResponse.json(
        { error: 'Not Found', details: 'Assignment not found or not published' },
        { status: 404 }
      )
    }
    
    console.log('✅ [Submit] Assignment found:', assignment.id, '-', assignment.title)

    // STEP 2: Fetch questions from assignment_questions table
    console.log('🔍 [Submit] Step 2: Fetching questions from assignment_questions table...')
    const { data: questions, error: questionsError } = await supabaseAdmin
      .from('assignment_questions')
      .select('id, question_type, question_text, correct_answer, marks, options, order_index')
      .eq('assignment_id', assignmentId)
      .order('order_index', { ascending: true })

    if (questionsError) {
      console.warn('⚠️ [Submit] Error fetching questions (continuing anyway):', questionsError)
    } else {
      console.log('✅ [Submit] Found', questions?.length || 0, 'question(s)')
    }

    // STEP 3: Check attempt limit from submissions table
    // First, check for existing submission to see if it's already submitted/graded
    console.log('🔍 [Submit] Step 3: Checking for existing submission and attempt limit...')
    const { data: existingSubmissionCheck, error: existingSubmissionError } = await supabaseAdmin
      .from('submissions')
      .select('id, status, submitted_at')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .maybeSingle()

    if (existingSubmissionError) {
      console.warn('⚠️ [Submit] Error checking existing submission (continuing anyway):', existingSubmissionError)
    }

    // If assignment has max_attempts limit, check if already submitted/graded
    if (assignment.max_attempts && existingSubmissionCheck) {
      // Check if submission is already submitted or graded
      if (existingSubmissionCheck.status === 'submitted' || existingSubmissionCheck.status === 'graded') {
        // Count all submitted/graded submissions
        const { count: submittedCount, error: countError } = await supabaseAdmin
          .from('submissions')
          .select('*', { count: 'exact', head: true })
          .eq('assignment_id', assignmentId)
          .eq('student_id', user.id)
          .in('status', ['submitted', 'graded'])

        if (!countError && submittedCount !== null && submittedCount >= assignment.max_attempts) {
          return NextResponse.json(
            { 
              error: 'Attempt Limit Exceeded', 
              details: `Maximum ${assignment.max_attempts} attempt(s) allowed for this assignment. You have already submitted this assignment.` 
            },
            { status: 400 }
          )
        }
      }
    }
    console.log('✅ [Submit] Attempt limit check passed')

    // STEP 4: Prepare auto-grading if enabled
    let gradingResult = null
    let submissionStatus = 'submitted'
    let grade: number | null = null
    let feedback: string | null = null

    if (assignment.auto_grading_enabled && questions && questions.length > 0) {
      console.log('🔍 [Submit] Step 4: Preparing auto-grading...')
      
      const studentAnswers: StudentAnswer[] = []
      
      if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
        Object.entries(answers).forEach(([questionIndex, answer]) => {
          const index = parseInt(questionIndex)
          if (!isNaN(index) && questions[index]) {
            const question = questions[index]
            const questionType = question.question_type?.toLowerCase()
            
            if (questionType === 'fillblank' || questionType === 'fill_blank') {
              studentAnswers.push({
                questionId: question.id,
                answer: Array.isArray(answer) ? answer as string[] : answer as string
              })
            } else {
              studentAnswers.push({
                questionId: question.id,
                answer: answer as number | string
              })
            }
          }
        })
      } else if (Array.isArray(answers)) {
        answers.forEach((answer, index) => {
          const question = questions[index]
          if (question) {
            studentAnswers.push({
              questionId: question.id,
              answer: answer
            })
          }
        })
      }
      
      if (textContent && typeof textContent === 'string' && textContent.trim().length > 0) {
        questions.forEach((question: any) => {
          const questionType = question.question_type?.toLowerCase()
          if (questionType === 'essay') {
            const existingAnswer = studentAnswers.find((a: any) => a.questionId === question.id)
            if (!existingAnswer) {
              studentAnswers.push({
                questionId: question.id,
                answer: textContent
              })
            }
          }
        })
      }

      const questionsForGrading: Question[] = questions.map((q: any) => ({
        id: q.id,
        question_type: q.question_type,
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        marks: q.marks || 1,
        options: q.options || []
      }))

      gradingResult = gradeAssignment(
        questionsForGrading,
        studentAnswers,
        assignment.auto_grading_enabled
      )

      if (gradingResult.canAutoGrade) {
        grade = gradingResult.percentage
        submissionStatus = 'graded'
        feedback = `Auto-graded: ${gradingResult.totalScore}/${gradingResult.maxScore} points (${gradingResult.percentage}%)`
        console.log('✅ [Submit] Auto-grading completed:', grade + '%')
      }
    }

    // STEP 5: Prepare submission data
    console.log('🔍 [Submit] Step 5: Preparing submission data...')
    
    const answersJson: any = {}
    if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
      Object.assign(answersJson, answers)
    }
    
    if (textContent && typeof textContent === 'string' && textContent.trim().length > 0) {
      const essayQuestionIndex = questions?.findIndex((q: any) => 
        q.question_type?.toLowerCase() === 'essay'
      )
      if (essayQuestionIndex !== undefined && essayQuestionIndex >= 0) {
        answersJson[essayQuestionIndex] = textContent
      }
    }

    const submissionData: any = {
      assignment_id: assignmentId,
      student_id: user.id,
      answers_json: Object.keys(answersJson).length > 0 ? answersJson : (answers || null),
      file_url: fileUrl || null,
      text_content: textContent || null,
      status: submissionStatus,
      submitted_at: new Date().toISOString(),
      grade: grade,
      feedback: feedback
    }

    console.log('💾 [Submit] Submission data prepared:', {
      assignment_id: assignmentId,
      student_id: user.id,
      status: submissionStatus,
      has_answers: !!submissionData.answers_json,
      has_file: !!submissionData.file_url,
      has_text: !!submissionData.text_content,
      grade: grade
    })

    // STEP 6: Use existing submission check from Step 3, or check again if needed
    console.log('🔍 [Submit] Step 6: Using existing submission check...')
    const existingSubmission = existingSubmissionCheck

    let submission
    if (existingSubmission) {
      // If submission is already submitted or graded and max_attempts is 1, prevent update
      if (assignment.max_attempts === 1 && 
          (existingSubmission.status === 'submitted' || existingSubmission.status === 'graded')) {
        return NextResponse.json(
          { 
            error: 'Already Submitted', 
            details: 'This assignment has already been submitted and cannot be modified. Maximum 1 attempt allowed.' 
          },
          { status: 400 }
        )
      }
      // STEP 7a: Update existing submission in submissions table
      console.log('🔄 [Submit] Step 7a: Updating existing submission...')
      const { data: updatedSubmission, error: updateError } = await supabaseAdmin
        .from('submissions')
        .update(submissionData)
        .eq('id', existingSubmission.id)
        .select()
        .single()

      if (updateError) {
        console.error('❌ [Submit] Error updating submission:', updateError)
        console.error('   Error code:', updateError.code)
        console.error('   Error message:', updateError.message)
        console.error('   Error details:', updateError.details)
        console.error('   Error hint:', updateError.hint)
        console.error('   Full error object:', JSON.stringify(updateError, null, 2))
        
        // Check for specific PostgreSQL error codes
        const isTableNotFound = updateError.code === '42P01' || 
                                (updateError.message?.toLowerCase().includes('relation') && 
                                 updateError.message?.toLowerCase().includes('does not exist'))
        
        if (isTableNotFound) {
          return NextResponse.json(
            { 
              error: 'Database Error', 
              details: `Database query failed: ${updateError.message}. Error code: ${updateError.code || 'unknown'}. Please check: 1) Database connection is working, 2) Tables exist in the database, 3) Service role key has proper permissions. Original error: ${JSON.stringify({ code: updateError.code, message: updateError.message, details: updateError.details, hint: updateError.hint })}` 
            },
            { status: 500 }
          )
        }
        
        return NextResponse.json(
          { error: 'Internal Server Error', details: `Failed to update submission: ${updateError.message || 'Unknown error'}` },
          { status: 500 }
        )
      }

      console.log('✅ [Submit] Submission updated successfully:', updatedSubmission.id)
      submission = updatedSubmission
    } else {
      // STEP 7b: Create new submission in submissions table
      console.log('➕ [Submit] Step 7b: Creating new submission...')
      
      const { data: newSubmission, error: insertError } = await supabaseAdmin
        .from('submissions')
        .insert(submissionData)
        .select()
        .single()

      if (insertError) {
        console.error('❌ [Submit] Error creating submission:', insertError)
        console.error('   Error code:', insertError.code)
        console.error('   Error message:', insertError.message)
        console.error('   Error details:', insertError.details)
        console.error('   Error hint:', insertError.hint)
        console.error('   Full error object:', JSON.stringify(insertError, null, 2))
        
        // Check for specific PostgreSQL error codes
        const isTableNotFound = insertError.code === '42P01' || 
                                (insertError.message?.toLowerCase().includes('relation') && 
                                 insertError.message?.toLowerCase().includes('does not exist'))
        
        if (isTableNotFound) {
          return NextResponse.json(
            { 
              error: 'Database Error', 
              details: `Database query failed: ${insertError.message}. Error code: ${insertError.code || 'unknown'}. Please check: 1) Database connection is working, 2) Tables exist in the database, 3) Service role key has proper permissions. Original error: ${JSON.stringify({ code: insertError.code, message: insertError.message, details: insertError.details, hint: insertError.hint })}` 
            },
            { status: 500 }
          )
        }
        
        if (insertError.code === '23503' || insertError.message?.includes('foreign key')) {
          return NextResponse.json(
            { 
              error: 'Database Integrity Error', 
              details: `Foreign key constraint violation: ${insertError.message}. The assignment_id (${assignmentId}) may not exist in the assignments table, or there's a schema mismatch.` 
            },
            { status: 500 }
          )
        }
        
        return NextResponse.json(
          { error: 'Internal Server Error', details: `Failed to create submission: ${insertError.message || 'Unknown error'}` },
          { status: 500 }
        )
      }

      console.log('✅ [Submit] Submission created successfully:', newSubmission.id)
      submission = newSubmission
    }

    console.log('✅ [Submit] Submission flow completed successfully!')

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        status: submission.status,
        grade: submission.grade,
        feedback: submission.feedback,
        submitted_at: submission.submitted_at
      },
      grading: gradingResult ? {
        totalScore: gradingResult.totalScore,
        maxScore: gradingResult.maxScore,
        percentage: gradingResult.percentage,
        canAutoGrade: gradingResult.canAutoGrade
      } : null
    })
  } catch (error: any) {
    console.error('❌ [Submit] Unexpected error:', error)
    console.error('   Error type:', error?.constructor?.name)
    console.error('   Error message:', error?.message)
    console.error('   Error stack:', error?.stack)
    
    try {
      return NextResponse.json(
        { 
          error: 'Internal Server Error', 
          details: error?.message || 'An unexpected error occurred',
          ...(process.env.NODE_ENV === 'development' && { 
            stack: error?.stack,
            type: error?.constructor?.name 
          })
        },
        { status: 500 }
      )
    } catch (responseError: any) {
      console.error('❌ [Submit] CRITICAL: Failed to create error response:', responseError)
      return new NextResponse(
        JSON.stringify({ 
          error: 'Internal Server Error', 
          details: 'An unexpected error occurred while processing your request' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  }
}

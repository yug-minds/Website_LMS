import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export async function POST(request: NextRequest) {
  const maxRetries = 3;
  let lastError: any = null;
  
  // Read request body once at the beginning
  let requestData;
  try {
    requestData = await request.json();
  } catch (error) {
    console.error('❌ [simple-progress API] Invalid request body:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { studentId, courseId, chapterId, contentId, isCompleted } = requestData;

  console.log('📝 [simple-progress API] Received request:', {
    studentId,
    courseId,
    chapterId,
    contentId,
    isCompleted
  });

  if (!studentId || !courseId || !chapterId) {
    console.error('❌ [simple-progress API] Missing required fields:', { studentId, courseId, chapterId });
    return NextResponse.json(
      { error: 'Missing required fields', received: { studentId, courseId, chapterId } },
      { status: 400 }
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📝 [simple-progress API] Attempt ${attempt}/${maxRetries} - Marking chapter as completed:`, {
        studentId,
        courseId,
        chapterId,
        isCompleted
      });

      // Use upsert with explicit conflict handling
      // The course_progress table has UNIQUE(student_id, chapter_id) constraint
      const progressData = {
        student_id: studentId,
        course_id: courseId,
        chapter_id: chapterId,
        completed: isCompleted === true || isCompleted === 'true',
        progress_percent: (isCompleted === true || isCompleted === 'true') ? 100 : 0,
        completed_at: (isCompleted === true || isCompleted === 'true') ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };

      console.log(`📝 [simple-progress API] Attempt ${attempt} - Upserting progress data:`, progressData);

      // First, try to check if record exists
      const { data: existingProgress, error: selectError } = await supabaseAdmin
        .from('course_progress')
        .select('id, completed')
        .eq('student_id', studentId)
        .eq('chapter_id', chapterId)
        .maybeSingle();

      if (selectError) {
        console.error(`❌ [simple-progress API] Attempt ${attempt} - Select error:`, selectError);
        throw new Error(`Select error: ${selectError.message}`);
      }

      let progressResult;
      
      if (existingProgress) {
        // Update existing record
        console.log(`📝 [simple-progress API] Attempt ${attempt} - Updating existing record (id: ${existingProgress.id})...`);
        progressResult = await supabaseAdmin
          .from('course_progress')
          .update({
            completed: progressData.completed,
            progress_percent: progressData.progress_percent,
            completed_at: progressData.completed_at,
            updated_at: progressData.updated_at
          })
          .eq('id', existingProgress.id)
          .select();
      } else {
        // Insert new record
        console.log(`📝 [simple-progress API] Attempt ${attempt} - Inserting new record...`);
        progressResult = await supabaseAdmin
          .from('course_progress')
          .insert({
            student_id: progressData.student_id,
            course_id: progressData.course_id,
            chapter_id: progressData.chapter_id,
            completed: progressData.completed,
            progress_percent: progressData.progress_percent,
            completed_at: progressData.completed_at
          })
          .select();
      }

      if (progressResult.error) {
        console.error(`❌ [simple-progress API] Attempt ${attempt} - Database error:`, progressResult.error);
        throw new Error(`Database error: ${progressResult.error.message} (code: ${progressResult.error.code})`);
      }

      console.log(`✅ [simple-progress API] Attempt ${attempt} - Progress saved successfully:`, progressResult.data);

      // Verify the save
      const { data: verifyData, error: verifyError } = await supabaseAdmin
        .from('course_progress')
        .select('*')
        .eq('student_id', studentId)
        .eq('chapter_id', chapterId)
        .maybeSingle();

      if (verifyError) {
        console.warn(`⚠️ [simple-progress API] Verification query failed:`, verifyError);
      } else {
        console.log(`✅ [simple-progress API] Verified saved data:`, verifyData);
      }

      return NextResponse.json({
        success: true,
        message: 'Progress updated successfully',
        data: progressResult.data?.[0] || null,
        verified: verifyData,
        attempt,
        action: existingProgress ? 'updated' : 'inserted'
      });

    } catch (error) {
      lastError = error;
      console.error(`❌ [simple-progress API] Attempt ${attempt}/${maxRetries} failed:`, error);
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(`⏳ [simple-progress API] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  console.error(`❌ [simple-progress API] All ${maxRetries} attempts failed. Last error:`, lastError);
  
  // Determine error type for better user feedback
  const errorMessage = lastError?.message || 'Unknown error';
  const isNetworkError = errorMessage.includes('timeout') || 
                        errorMessage.includes('520') || 
                        errorMessage.includes('connection') ||
                        errorMessage.includes('fetch');
  
  return NextResponse.json({
    error: 'Failed to save progress',
    details: isNetworkError 
      ? 'Connection timeout. Your progress will be saved when connection is restored.'
      : errorMessage,
    isNetworkError,
    retryable: true,
    attempts: maxRetries
  }, { status: 500 });
}

// GET endpoint to check progress for debugging
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const courseId = searchParams.get('courseId');
    const chapterId = searchParams.get('chapterId');

    if (!studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('course_progress')
      .select('*')
      .eq('student_id', studentId);

    if (courseId) {
      query = query.eq('course_id', courseId);
    }
    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      progress: data
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch progress',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
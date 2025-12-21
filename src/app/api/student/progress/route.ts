import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { studentId, courseId, chapterId, contentId, isCompleted } = await request.json();

    if (!studentId || !courseId || !chapterId || !contentId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('📝 [progress API] Saving progress:', {
      studentId,
      courseId,
      chapterId,
      contentId,
      isCompleted
    });

    // Save to course_progress to track chapter completion
    console.log('📝 [progress API] Saving to course_progress...');
    
    // First check if record already exists to avoid certificate generation issues
    const { data: existingProgress } = await supabaseAdmin
      .from('course_progress')
      .select('*')
      .eq('student_id', studentId)
      .eq('chapter_id', chapterId)
      .maybeSingle();
    
    let progressData, progressError;
    
    if (existingProgress) {
      // Update existing record
      console.log('📝 [progress API] Updating existing progress record...');
      const result = await supabaseAdmin
        .from('course_progress')
        .update({
          completed: isCompleted,
          progress_percent: isCompleted ? 100 : 0,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq('student_id', studentId)
        .eq('chapter_id', chapterId)
        .select();
      
      progressData = result.data;
      progressError = result.error;
    } else {
      // Insert new record
      console.log('📝 [progress API] Creating new progress record...');
      const result = await supabaseAdmin
        .from('course_progress')
        .insert({
          student_id: studentId,
          course_id: courseId,
          chapter_id: chapterId,
          completed: isCompleted,
          progress_percent: isCompleted ? 100 : 0,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .select();
      
      progressData = result.data;
      progressError = result.error;
    }

    if (progressError) {
      console.error('❌ [progress API] Error saving progress:', progressError);
      return NextResponse.json(
        { error: 'Failed to save progress', details: progressError.message },
        { status: 500 }
      );
    }

    console.log('✅ [progress API] Progress saved successfully:', progressData);

    // For now, we're directly marking the chapter as complete when any content is completed
    // This is a simplified approach to get progress tracking working
    console.log('ℹ️ [progress API] Using simplified progress tracking - marking chapter as complete');

    return NextResponse.json({
      success: true,
      progress: progressData?.[0] || null
    });

  } catch (error) {
    console.error('❌ [progress API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
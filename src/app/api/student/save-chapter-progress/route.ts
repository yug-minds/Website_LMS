import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

/**
 * Simple API to save chapter progress directly to database
 * No retries, no complexity - just direct database save
 */
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);
  
  console.log('🚀 [save-chapter-progress] API called');
  
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('❌ [save-chapter-progress] Invalid JSON in request body:', parseError);
      return NextResponse.json({
        error: 'Invalid JSON in request body',
        details: parseError instanceof Error ? parseError.message : 'Failed to parse JSON'
      }, { status: 400 });
    }

    const { studentId, courseId, chapterId, completed = true } = body;

    console.log('📝 [save-chapter-progress] Request body:', { studentId, courseId, chapterId, completed });

    // Validate required fields
    if (!studentId || !courseId || !chapterId) {
      console.error('❌ [save-chapter-progress] Missing required fields');
      return NextResponse.json({
        error: 'Missing required fields',
        required: ['studentId', 'courseId', 'chapterId'],
        received: { studentId, courseId, chapterId }
      }, { status: 400 });
    }

    // Direct insert/update to course_progress table
    console.log('📝 [save-chapter-progress] Checking for existing record...');
    
    type ProgressRow = { id?: string };
    const { data: existingData, error: selectError } = await supabaseAdmin
      .from('course_progress')
      .select('id')
      .eq('student_id', studentId)
      .eq('chapter_id', chapterId)
      .maybeSingle();
    const existing = existingData as ProgressRow | null;

    if (selectError) {
      console.error('❌ [save-chapter-progress] Select error:', selectError);
      return NextResponse.json({
        error: 'Database select error',
        details: selectError.message,
        code: selectError.code
      }, { status: 500 });
    }

    let result;
    const now = new Date().toISOString();

    if (existing) {
      console.log('📝 [save-chapter-progress] Updating existing record:', existing.id);
      const updatePayload = {
        completed: completed,
        progress_percent: completed ? 100 : 0,
        completed_at: completed ? now : null,
        updated_at: now
      };
      const { data, error } = await supabaseAdmin
        .from('course_progress')
        .update(updatePayload as unknown as never)
        .eq('id', existing.id ?? '')
        .select();

      if (error) {
        console.error('❌ [save-chapter-progress] Update error:', error);
        return NextResponse.json({
          error: 'Database update error',
          details: error.message,
          code: error.code,
          hint: error.hint
        }, { status: 500 });
      }
      result = { action: 'updated', data };
    } else {
      console.log('📝 [save-chapter-progress] Inserting new record...');
      const insertPayload = {
        student_id: studentId,
        course_id: courseId,
        chapter_id: chapterId,
        completed: completed,
        progress_percent: completed ? 100 : 0,
        completed_at: completed ? now : null
      };
      const { data, error } = await supabaseAdmin
        .from('course_progress')
        .insert(insertPayload as unknown as never)
        .select();

      if (error) {
        console.error('❌ [save-chapter-progress] Insert error:', error);
        return NextResponse.json({
          error: 'Database insert error',
          details: error.message,
          code: error.code,
          hint: error.hint
        }, { status: 500 });
      }
      result = { action: 'inserted', data };
    }

    console.log('✅ [save-chapter-progress] Success:', result);

    // Verify the save by reading back
    const { data: verify } = await supabaseAdmin
      .from('course_progress')
      .select('*')
      .eq('student_id', studentId)
      .eq('chapter_id', chapterId)
      .maybeSingle();

    console.log('✅ [save-chapter-progress] Verified data:', verify);

    return NextResponse.json({
      success: true,
      ...result,
      verified: verify
    });

  } catch (error) {
    console.error('❌ [save-chapter-progress] Unexpected error:', error);
    return NextResponse.json({
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

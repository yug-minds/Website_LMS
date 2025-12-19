import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../../lib/auth-utils';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { updateCourseSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { getOrSetCache, CacheKeys, CacheTTL, invalidateCache } from '../../../../../lib/cache';

import { cleanupCourseStorage } from '../../../../../lib/storage-utils';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// GET - Get a single course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
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
    );
  }

  try {
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    const { id: courseId } = await params;

    // Fetch course metadata with caching (course metadata changes infrequently)
    let course: any;
    let fetchError: any;
    
    try {
      course = await getOrSetCache(
        CacheKeys.courseMetadata(courseId),
        async () => {
          const { data, error } = await supabaseAdmin
            .from('courses')
            .select('id, course_name, title, name, description, subject, grade, status, is_published, school_id, created_by, created_at, updated_at, thumbnail_url, duration_weeks, prerequisites_course_ids, prerequisites_text, difficulty_level, total_chapters, num_chapters, total_videos, total_materials, total_assignments, release_type')
            .eq('id', courseId)
             
            .single() as any;
          
          if (error) {
            logger.error('Database error fetching course', {
              endpoint: '/api/admin/courses/[id]',
              courseId,
              error: error.message,
              code: error.code
            });
            throw error;
          }
          
          if (!data) {
            logger.warn('Course not found in database', {
              endpoint: '/api/admin/courses/[id]',
              courseId
            });
            throw new Error('Course not found');
          }
          
          return data;
        },
        CacheTTL.MEDIUM // Cache for 5 minutes
      );
    } catch (error: unknown) {
      fetchError = error;
      logger.error('Error fetching course', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      }, error instanceof Error ? error : new Error(String(error)));
      course = null;
    }

    if (!course) {
      // Check if it's a "not found" error vs other error
      const isNotFound = fetchError?.code === 'PGRST116' || 
                        fetchError?.message?.includes('not found') ||
                        fetchError?.message?.includes('No rows returned') ||
                        fetchError?.message === 'Course not found';
      
      logger.warn('Course not found or failed to fetch', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        errorCode: fetchError?.code,
        errorMessage: fetchError?.message,
        isNotFound
      });
      
      const errorResponse = NextResponse.json({ 
        error: 'Course not found', 
        message: `Course with ID ${courseId} does not exist or could not be loaded`,
        details: fetchError?.message || 'Course not found in database',
        courseId 
      }, { status: isNotFound ? 404 : 500 });
      ensureCsrfToken(errorResponse, request);
      return errorResponse;
    }

    // Parallelize all independent queries after fetching course
    const [
      { data: accessData, error: accessError },
      { data: chaptersData, error: chaptersError },
      { data: sData, error: sError }
    ] = await Promise.all([
      supabaseAdmin
        .from('course_access')
        .select('id, course_id, school_id, grade')
        .eq('course_id', courseId),
      supabaseAdmin
        .from('chapters')
        .select('id, course_id, title, name, description, order_index, order_number, learning_outcomes, release_date, is_published, created_at, updated_at')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true }),
      supabaseAdmin
        .from('course_schedules')
        .select('id, course_id, day_of_week, start_time, end_time, room_id, created_at')
        .eq('course_id', courseId)
    ]);

    // Handle course_access and fetch schools in parallel
     
    let courseAccess: any[] = [];
    if (accessError) {
      console.error('❌ Error fetching course_access:', accessError);
    } else if (accessData) {
      courseAccess = accessData;
      console.log(`✅ Fetched ${accessData.length} course_access entries for course ${courseId}`);
      
      // Fetch school names if we have access data
       
      const schoolIds = Array.from(new Set(accessData.map((a: any) => a.school_id).filter(Boolean)));
      if (schoolIds.length > 0) {
        const { data: schoolsData, error: schoolsError } = await supabaseAdmin
          .from('schools')
          .select('id, name')
           
          .in('id', schoolIds) as any;
        
        if (schoolsError) {
          console.error('❌ Error fetching schools for course_access:', schoolsError);
        } else if (schoolsData) {
           
          const schoolsMap = new Map(schoolsData.map((s: any) => [s.id, s]));
           
          courseAccess = accessData.map((access: any) => ({
            ...access,
            schools: schoolsMap.get(access.school_id) || null
          }));
        }
      }
    } else {
      console.warn(`⚠️ No course_access entries found for course ${courseId}`);
    }
    
    console.log('📋 Final course_access entries:', courseAccess.length, JSON.stringify(courseAccess, null, 2));

    if (chaptersError) {
      console.error('Error fetching chapters:', chaptersError);
    }

    const schedulesData = (!sError && sData) ? sData : [];

    // Now get chapter IDs first to fetch assignments chapter-wise
    const chapterIds = chaptersData && chaptersData.length > 0 
      ? chaptersData.map((ch: any) => ch.id) 
      : [];

    // Fetch assignments both chapter-wise AND by course_id
    // This ensures we catch assignments with NULL chapter_id or mismatched chapter_ids
    let assignmentsByChapter: any[] = [];
    let assignmentsByCourse: any[] = [];
    let assignmentsError: any = null;
    
    // Fetch assignments chapter-wise (for properly linked assignments)
    if (chapterIds.length > 0) {
      const { data: chapterData, error: chapterErr } = await supabaseAdmin
        .from('assignments')
        .select('id, course_id, chapter_id, title, description, assignment_type, due_date, max_score, max_marks, auto_grading_enabled, config, is_published, created_at, updated_at')
        .in('chapter_id', chapterIds);
      
      assignmentsByChapter = chapterData || [];
      
      if (chapterErr) {
        console.warn('⚠️ Error fetching assignments chapter-wise (non-critical):', chapterErr.message);
        assignmentsError = chapterErr;
      } else {
        console.log(`✅ Fetched ${assignmentsByChapter.length} assignment(s) chapter-wise for ${chapterIds.length} chapter(s)`);
        if (assignmentsByChapter.length > 0) {
          console.log('📝 Assignments by chapter:', assignmentsByChapter.map((a: any) => ({
            id: a.id,
            title: a.title,
            chapter_id: a.chapter_id,
            hasConfig: !!a.config
          })));
        }
      }
    }
    
    // Always also fetch by course_id to catch assignments with NULL chapter_id
    const { data: courseData, error: courseErr } = await supabaseAdmin
      .from('assignments')
      .select('id, course_id, chapter_id, title, description, assignment_type, due_date, max_score, max_marks, auto_grading_enabled, config, is_published, created_at, updated_at')
      .eq('course_id', courseId);
    
    assignmentsByCourse = courseData || [];
    
    if (courseErr) {
      console.error('❌ Error fetching assignments by course_id:', courseErr);
      logger.error('Failed to fetch assignments by course_id', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: courseErr.message
      });
      assignmentsError = courseErr;
    } else {
      console.log(`✅ Fetched ${assignmentsByCourse.length} assignment(s) by course_id`);
    }
    
    // Merge results: deduplicate by assignment ID
    // Prioritize chapter-wise results (they have proper chapter_id)
    const assignmentMap = new Map<string, any>();
    
    // First, add all chapter-wise assignments
    assignmentsByChapter.forEach((a: any) => {
      assignmentMap.set(a.id, a);
    });
    
    // Then, add course_id assignments that weren't in chapter-wise results
    assignmentsByCourse.forEach((a: any) => {
      if (!assignmentMap.has(a.id)) {
        // This assignment wasn't in chapter-wise results (likely NULL chapter_id or mismatched)
        // Assign it to first chapter for display purposes
        if (!a.chapter_id && chapterIds.length > 0) {
          console.warn(`⚠️ Assignment "${a.title}" (${a.id}) has NULL chapter_id, assigning to first chapter: ${chapterIds[0]}`);
          a.chapter_id = chapterIds[0];
        }
        assignmentMap.set(a.id, a);
      }
    });
    
    const assignmentsData = Array.from(assignmentMap.values());
    
    console.log(`✅ Merged assignments: ${assignmentsData.length} total (${assignmentsByChapter.length} chapter-wise, ${assignmentsByCourse.length} by course_id, ${assignmentsByCourse.length - assignmentsByChapter.length} with NULL/mismatched chapter_id)`);
    
    if (assignmentsData.length > 0) {
      console.log('📝 Final merged assignments:', assignmentsData.map((a: any) => ({
        id: a.id,
        title: a.title,
        chapter_id: a.chapter_id,
        wasFromChapterWise: assignmentsByChapter.some((ac: any) => ac.id === a.id)
      })));
    }

    let chapterContentsData: any[] = [];
     
    let videosData: any[] = [];
     
    let materialsData: any[] = [];
     
    let assignmentQuestionsData: any[] = [];

    if (chapterIds.length > 0) {
      // Parallelize all chapter-related queries
      const [
        { data: contentsData, error: contentsError },
        { data: vData, error: videosError },
        { data: mData, error: materialsError }
      ] = await Promise.all([
        supabaseAdmin
          .from('chapter_contents')
          .select('id, chapter_id, content_type, title, content_url, content_text, duration_minutes, storage_path, thumbnail_url, content_label, order_index, created_at, updated_at')
          .in('chapter_id', chapterIds)
          .order('order_index', { ascending: true }),
        supabaseAdmin
          .from('videos')
          .select('id, chapter_id, title, video_url, duration, order_index, created_at, updated_at')
          .in('chapter_id', chapterIds),
        supabaseAdmin
          .from('materials')
          .select('id, chapter_id, title, file_url, file_type, order_index, is_published, created_at, updated_at')
          .in('chapter_id', chapterIds)
      ]);

      if (contentsError) {
        console.error('❌ Error fetching chapter contents:', contentsError);
      } else {
        chapterContentsData = contentsData || [];
        console.log(`✅ Fetched ${chapterContentsData.length} chapter content item(s)`);
      }

      if (videosError) {
        console.error('❌ Error fetching videos:', videosError);
        console.error('   Error details:', JSON.stringify(videosError, null, 2));
      } else {
        videosData = vData || [];
        console.log(`✅ Fetched ${videosData.length} videos for ${chapterIds.length} chapters`);
        if (videosData.length === 0) {
          console.warn('⚠️ No videos found in database for these chapter IDs:', chapterIds);
        }
      }

      if (materialsError) {
        console.error('❌ Error fetching materials:', materialsError);
      } else {
        materialsData = mData || [];
        console.log(`✅ Fetched ${materialsData.length} materials`);
      }
    } else {
      console.log('⚠️ No chapters found, skipping chapter-related fetches');
    }

    // Fetch assignment questions after we have assignment IDs
    if (assignmentsData && assignmentsData.length > 0) {
       
      const assignmentIds = assignmentsData.map((a: any) => a.id).filter(Boolean); // Filter out any null/undefined IDs
      console.log(`🔍 [API] Fetching questions for ${assignmentIds.length} assignment(s):`, assignmentIds);
      
      // CRITICAL: Log each assignment ID to verify they're correct
      assignmentsData.forEach((a: any) => {
        console.log(`  Assignment: "${a.title}" (${a.id})`);
      });
      
      if (assignmentIds.length === 0) {
        console.warn('⚠️ [API] No valid assignment IDs to fetch questions for!');
        console.warn('   Assignments data:', assignmentsData.map((a: any) => ({ id: a.id, title: a.title })));
      } else {
        const { data: aqData, error: aqError } = await supabaseAdmin
          .from('assignment_questions')
          .select('id, assignment_id, question_text, question_type, options, correct_answer, marks, order_index, explanation, created_at, updated_at')
          .in('assignment_id', assignmentIds)
           
          .order('order_index', { ascending: true }) as any;
        
        if (aqError) {
          console.error('❌ [API] Error fetching assignment questions:', aqError);
          console.error('   Assignment IDs queried:', assignmentIds);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:342',message:'ERROR fetching questions from DB',data:{error:aqError?.message,assignmentIds,assignmentIdsCount:assignmentIds.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
        } else {
          assignmentQuestionsData = aqData || [];
          console.log(`✅ [API] Fetched ${assignmentQuestionsData.length} question(s) from database`);
          
          // CRITICAL: Log questions by assignment to verify they're being fetched
          if (assignmentQuestionsData.length > 0) {
            const questionsByAssignment: Record<string, any[]> = {};
            assignmentQuestionsData.forEach((q: any) => {
              if (!questionsByAssignment[q.assignment_id]) {
                questionsByAssignment[q.assignment_id] = [];
              }
              questionsByAssignment[q.assignment_id].push(q);
            });
            
            console.log('📋 [API] Questions by assignment:');
            assignmentIds.forEach((aid: string) => {
              const questions = questionsByAssignment[aid] || [];
              const assignment = assignmentsData.find((a: any) => a.id === aid);
              console.log(`  "${assignment?.title || 'Unknown'}" (${aid}): ${questions.length} question(s)`);
              if (questions.length === 0) {
                console.warn(`    ⚠️ No questions found for assignment "${assignment?.title}" (${aid})`);
              }
            });
          } else {
            console.warn('⚠️ [API] No questions found in database for these assignment IDs:', assignmentIds);
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:346',message:'Questions fetched from DB',data:{questionsCount:assignmentQuestionsData.length,assignmentIds,questionsByAssignment:assignmentIds.map((aid:string)=>({assignmentId:aid,count:assignmentQuestionsData.filter((q:any)=>q.assignment_id===aid).length}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
        }
      }
    } else {
      console.log('⚠️ [API] No assignments found, skipping question fetch');
    }

    // Extract content counts from content_summary if it's JSONB
    const contentSummary = course.content_summary || {};
    const totalVideos = course.total_videos || contentSummary.videos || videosData.length || 0;
    const totalMaterials = course.total_materials || contentSummary.materials || materialsData.length || 0;
    const totalAssignments = course.total_assignments || contentSummary.assignments || (assignmentsData?.length || 0);

    // Map database schema
    const mappedCourse = {
      ...course,
      name: course.course_name || course.name || course.title || '',
      total_chapters: course.num_chapters || course.total_chapters || 0,
      total_videos: totalVideos,
      total_materials: totalMaterials,
      total_assignments: totalAssignments,
      release_type: course.release_type || 'Weekly',
      status: course.is_published ? 'Published' : (course.status || 'Draft'),
      difficulty_level: course.difficulty_level || 'Beginner',
      course_access: courseAccess,
       
      chapters: (chaptersData || []).map((ch: any) => {
         
        const chapterContents = chapterContentsData
          .filter((content: any) => content.chapter_id === ch.id)
          .map((content: any) => ({
            id: content.id,
            content_id: content.id, // For compatibility
            chapter_id: content.chapter_id,
            content_type: content.content_type,
            title: content.title || '',
            content_url: content.content_url || null,
            content_text: content.content_text || null,
            duration_minutes: content.duration_minutes || null,
            storage_path: content.storage_path || null,
            thumbnail_url: content.thumbnail_url || null,
            content_label: content.content_label || null,
            order_index: content.order_index || 0,
            created_at: content.created_at,
            updated_at: content.updated_at,
          }));
        // Try to find release date from course_schedules if missing in chapter
        let releaseDate = ch.release_date;
        if (!releaseDate && schedulesData.length > 0) {
           
          const schedule = schedulesData.find((s: any) => s.chapter_id === ch.id) as any;
          if (schedule) {
            releaseDate = schedule.release_date;
          }
        }

        return {
          id: ch.id,
          name: ch.title || ch.name || '',
          title: ch.title || ch.name || '',
          description: ch.description || '',
          order_number: ch.order_index || ch.order_number || 1,
          order_index: ch.order_index || ch.order_number || 1,
          learning_outcomes: ch.learning_outcomes || [], 
          release_date: releaseDate || null,
          contents: chapterContents
        };
      }),
      videos: videosData || [],
      materials: materialsData || [],
      chapter_contents: (chapterContentsData || []).map((content: any) => ({
        id: content.id,
        content_id: content.id, // For compatibility
        chapter_id: content.chapter_id,
        content_type: content.content_type,
        title: content.title || '',
        content_url: content.content_url || null,
        content_text: content.content_text || null,
        duration_minutes: content.duration_minutes || null,
        storage_path: content.storage_path || null,
        thumbnail_url: content.thumbnail_url || null,
        content_label: content.content_label || null,
        order_index: content.order_index || 0,
        created_at: content.created_at,
        updated_at: content.updated_at,
      })),
       
      assignments: (assignmentsData || []).map((a: any) => {
        let config: any = {};
        try {
          config = typeof a.config === 'string' ? JSON.parse(a.config) : (a.config || {});
        } catch (e) {
          console.warn('⚠️ Error parsing assignment config:', e, a.config);
          config = {};
        }
        
        // Get questions for this assignment
        // Use robust ID comparison to handle UUID string mismatches
        
        // CRITICAL: Verify assignmentQuestionsData is populated
        if (assignmentQuestionsData.length === 0) {
          console.warn(`⚠️ [API] assignmentQuestionsData is EMPTY when filtering for assignment "${a.title}" (${a.id})`);
          console.warn('   This means questions were not fetched from database or assignmentQuestionsData was not populated');
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:453',message:'BEFORE filtering questions',data:{assignmentId:a.id,assignmentTitle:a.title,totalQuestionsAvailable:assignmentQuestionsData.length,questionAssignmentIds:assignmentQuestionsData.map((q:any)=>q.assignment_id),assignmentQuestionsDataIsEmpty:assignmentQuestionsData.length===0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const filteredQuestions = assignmentQuestionsData.filter((q: any) => {
          // Direct match
          if (q.assignment_id === a.id) {
            console.log(`✅ [Filter] Direct match found for question ${q.id} -> assignment ${a.id}`);
            return true;
          }
          // String comparison (handle case differences)
          if (String(q.assignment_id).toLowerCase() === String(a.id).toLowerCase()) {
            console.log(`✅ [Filter] Case-insensitive match found for question ${q.id} -> assignment ${a.id}`);
            return true;
          }
          // UUID format comparison (remove dashes and compare)
          const qId = String(q.assignment_id || '').replace(/-/g, '').toLowerCase();
          const aId = String(a.id || '').replace(/-/g, '').toLowerCase();
          if (qId === aId && qId.length > 0) {
            console.log(`✅ [Filter] UUID format match found for question ${q.id} -> assignment ${a.id}`);
            return true;
          }
          return false;
        });
        
        // CRITICAL: Log filter results for assignment a4
        if (a.title === 'a4' || a.id === 'ed84fe55-9c57-4a32-864b-105d44116428') {
          console.log(`🔍 [Filter] Assignment a4 filter results:`, {
            assignmentId: a.id,
            totalQuestionsInDB: assignmentQuestionsData.length,
            filteredCount: filteredQuestions.length,
            questionIdsInDB: assignmentQuestionsData.map((q: any) => q.assignment_id),
            questionIdsFiltered: filteredQuestions.map((q: any) => q.id),
            allQuestionAssignmentIds: assignmentQuestionsData.map((q: any) => ({
              questionId: q.id,
              assignmentId: q.assignment_id,
              matches: q.assignment_id === a.id || String(q.assignment_id).toLowerCase() === String(a.id).toLowerCase()
            }))
          });
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:463',message:'AFTER filtering questions',data:{assignmentId:a.id,assignmentTitle:a.title,filteredCount:filteredQuestions.length,filteredQuestionIds:filteredQuestions.map((q:any)=>q.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Debug: Log filter results
        if (filteredQuestions.length === 0 && assignmentQuestionsData.length > 0) {
          console.warn(`⚠️ [API] No questions matched for assignment "${a.title}" (${a.id})`);
          console.warn(`   Assignment ID type: ${typeof a.id}, value: ${a.id}`);
          console.warn(`   Total questions in assignmentQuestionsData: ${assignmentQuestionsData.length}`);
          console.warn(`   Question assignment_ids:`, assignmentQuestionsData.map((q: any) => ({
            id: q.assignment_id,
            type: typeof q.assignment_id,
            matches: q.assignment_id === a.id || String(q.assignment_id).toLowerCase() === String(a.id).toLowerCase()
          })));
        }
        
        // Map filtered questions to frontend format
        const questions = filteredQuestions.map((q: any) => {
            // Normalize question_type: database uses lowercase 'mcq', frontend expects 'MCQ'
            let normalizedQuestionType: 'MCQ' | 'FillBlank' = 'MCQ';
            const dbQuestionType = (q.question_type || 'mcq').toLowerCase();
            if (dbQuestionType === 'mcq') {
              normalizedQuestionType = 'MCQ';
            } else if (dbQuestionType === 'fill_blank' || dbQuestionType === 'fillblank') {
              normalizedQuestionType = 'FillBlank';
            }
            
            return {
              id: q.id, // Include question ID for proper tracking
              question_type: normalizedQuestionType, // Normalize to frontend format
              question_text: q.question_text || '',
              options: q.options || [],
              correct_answer: q.correct_answer || '',
              marks: q.marks || 1,
              explanation: q.explanation || '',
              order_index: q.order_index || 0 // Include order_index for proper ordering
            };
          });
        
        console.log(`📋 Mapped ${questions.length} question(s) for assignment "${a.title}" (${a.id})`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:499',message:'AFTER mapping questions to frontend format',data:{assignmentId:a.id,assignmentTitle:a.title,mappedQuestionsCount:questions.length,mappedQuestions:questions.map((q:any)=>({id:q.id,type:q.question_type,text:q.question_text?.substring(0,30)})),willIncludeInResponse:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Extract chapter_id from both column and config, prioritizing column
        let chapterId: string | null = null;
        
        // Priority 1: Direct column value (most reliable)
        if (a.chapter_id) {
          chapterId = a.chapter_id;
        }
        // Priority 2: From config JSON
        else if (config.chapter_id) {
          chapterId = config.chapter_id;
        }
        
        // Validate chapter_id exists in the course's chapters
        if (chapterId) {
          const isValidChapter = chaptersData?.some((ch: any) => ch.id === chapterId);
          if (!isValidChapter) {
            console.warn(`⚠️ Assignment "${a.title}" has invalid chapter_id: ${chapterId}. Available chapters:`, 
              chaptersData?.map((ch: any) => ch.id) || []);
            // If invalid, try to use first chapter as fallback
            if (chaptersData && chaptersData.length > 0) {
              chapterId = chaptersData[0].id;
              console.warn(`   Using first chapter as fallback: ${chapterId}`);
            } else {
              chapterId = null;
            }
          }
        } else {
          // No chapter_id found, use first chapter as fallback if available
          if (chaptersData && chaptersData.length > 0) {
            chapterId = chaptersData[0].id;
            console.warn(`⚠️ Assignment "${a.title}" has no chapter_id, using first chapter as fallback: ${chapterId}`);
          } else {
            // If no chapters available, still include the assignment but log a warning
            console.warn(`⚠️ Assignment "${a.title}" has no chapter_id and no chapters available for fallback. Assignment will still be included.`);
          }
        }
        
        console.log('📋 Mapping assignment:', {
          assignmentId: a.id,
          assignmentTitle: a.title,
          directChapterId: a.chapter_id,
          configChapterId: config.chapter_id,
          finalChapterId: chapterId,
          questionsCount: questions.length,
          hasChapterId: !!chapterId,
          chaptersAvailable: chaptersData?.length || 0,
          questionsDetails: questions.length > 0 ? questions.map((q: any) => ({
            id: q.id,
            question_type: q.question_type,
            question_text: q.question_text?.substring(0, 30) + '...'
          })) : []
        });
        
        const mappedAssignment = {
          ...a,
          chapter_id: chapterId, // May be null if no chapters available, but assignment should still be included
          // Prioritize column value over config for auto_grading_enabled
          auto_grading_enabled: a.auto_grading_enabled !== undefined ? a.auto_grading_enabled : (config.auto_grading_enabled || false),
          questions: questions // CRITICAL: Include questions array
        };
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:575',message:'Assignment object created with questions',data:{assignmentId:a.id,assignmentTitle:a.title,questionsInObject:mappedAssignment.questions?.length||0,hasQuestionsProperty:'questions' in mappedAssignment,questionsArray:Array.isArray(mappedAssignment.questions)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Verify questions are included
        if (questions.length > 0) {
          console.log(`✅ [API] Assignment "${a.title}" (${a.id}) includes ${questions.length} question(s) in response:`, 
            questions.map((q: any) => ({ id: q.id, type: q.question_type, text: q.question_text?.substring(0, 30) }))
          );
        } else {
          // Check if questions exist in database but weren't matched
          const questionsForThisAssignment = assignmentQuestionsData.filter((q: any) => q.assignment_id === a.id);
          if (questionsForThisAssignment.length > 0) {
            console.error(`❌ [API] CRITICAL: Found ${questionsForThisAssignment.length} question(s) in database for assignment "${a.title}" (${a.id}) but filter returned 0!`);
            console.error('   Assignment ID:', a.id, typeof a.id);
            console.error('   Question assignment_ids:', questionsForThisAssignment.map((q: any) => ({ id: q.assignment_id, type: typeof q.assignment_id })));
            console.error('   ID match check:', questionsForThisAssignment.map((q: any) => q.assignment_id === a.id));
          } else {
            console.log(`⚠️ [API] Assignment "${a.title}" (${a.id}) has 0 questions in database. Total questions fetched: ${assignmentQuestionsData.length}`);
          }
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:600',message:'RETURNING assignment in API response',data:{assignmentId:mappedAssignment.id,assignmentTitle:mappedAssignment.title,questionsInResponse:mappedAssignment.questions?.length||0,questionsArray:JSON.stringify(mappedAssignment.questions?.slice(0,2)||[]).substring(0,200),hasQuestionsProperty:'questions' in mappedAssignment},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return mappedAssignment;
      })
      // CRITICAL FIX: Don't filter out assignments - include them even if chapter_id is null
      // The frontend will handle assignments with null chapter_id by matching them to the first chapter
      // This ensures assignments are never lost due to missing chapter_id
      .map((a: any) => {
        // CRITICAL: Verify questions exist before mapping
        const questionsBeforeMap = a.questions;
        const hasQuestionsBefore = questionsBeforeMap && Array.isArray(questionsBeforeMap) && questionsBeforeMap.length > 0;
        
        // If chapter_id is still null after all fallbacks, try one more time with first chapter
        if (!a.chapter_id && chaptersData && chaptersData.length > 0) {
          console.warn(`⚠️ Final fallback: Assigning "${a.title}" to first chapter: ${chaptersData[0].id}`);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:607',message:'Final fallback map - preserving questions',data:{assignmentId:a.id,assignmentTitle:a.title,questionsBeforeMap:questionsBeforeMap?.length||0,hasQuestionsBefore,willPreserveQuestions:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          const result = {
            ...a, // This should preserve questions
            chapter_id: chaptersData[0].id
          };
          // CRITICAL: Verify questions are preserved
          if (hasQuestionsBefore && (!result.questions || result.questions.length === 0)) {
            console.error(`❌ [API] CRITICAL: Questions LOST in final fallback map for "${a.title}"!`, {
              assignmentId: a.id,
              questionsBefore: questionsBeforeMap?.length || 0,
              questionsAfter: result.questions?.length || 0,
              resultKeys: Object.keys(result)
            });
            // Restore questions if they were lost
            result.questions = questionsBeforeMap;
          }
          return result;
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:612',message:'Final map - returning assignment as-is',data:{assignmentId:a.id,assignmentTitle:a.title,questionsInAssignment:a.questions?.length||0,hasQuestionsProperty:'questions' in a},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // CRITICAL: Verify questions are still present
        if (hasQuestionsBefore && (!a.questions || a.questions.length === 0)) {
          console.error(`❌ [API] CRITICAL: Questions LOST for "${a.title}" in final map!`, {
            assignmentId: a.id,
            questionsBefore: questionsBeforeMap?.length || 0,
            questionsAfter: a.questions?.length || 0
          });
          // Restore questions if they were lost
          a.questions = questionsBeforeMap;
        }
        
        return a;
      })
    };

    // CRITICAL VERIFICATION: Check if questions are included in final response
    const assignmentsInResponse = mappedCourse.assignments || [];
    const assignmentA4 = assignmentsInResponse.find((a: any) => a.title === 'a4' || a.id === 'ed84fe55-9c57-4a32-864b-105d44116428');
    
    console.log('🔍 [API] FINAL CHECK - Assignment a4 in response:', {
      exists: !!assignmentA4,
      id: assignmentA4?.id,
      title: assignmentA4?.title,
      questionsCount: assignmentA4?.questions?.length || 0,
      hasQuestionsProperty: 'questions' in (assignmentA4 || {}),
      questions: assignmentA4?.questions?.map((q: any) => ({ id: q.id, type: q.question_type })) || [],
      allKeys: Object.keys(assignmentA4 || {}),
      // EXPANDED: Full assignment object for debugging
      fullAssignment: assignmentA4 ? JSON.stringify(assignmentA4, null, 2).substring(0, 1000) : 'NOT FOUND'
    });
    
    // CRITICAL: Verify questions are present before returning
    if (assignmentA4 && (!assignmentA4.questions || assignmentA4.questions.length === 0)) {
      console.error('❌ [API] CRITICAL ERROR: Assignment a4 in response but NO QUESTIONS!', {
        assignmentId: assignmentA4.id,
        assignmentTitle: assignmentA4.title,
        allProperties: Object.keys(assignmentA4),
        assignmentObject: JSON.stringify(assignmentA4, null, 2)
      });
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:625',message:'FINAL API RESPONSE - checking assignment a4',data:{totalAssignments:assignmentsInResponse.length,assignmentA4Exists:!!assignmentA4,assignmentA4Questions:assignmentA4?.questions?.length||0,assignmentA4HasQuestionsProp:'questions' in (assignmentA4||{}),assignmentA4Keys:Object.keys(assignmentA4||{}),allAssignmentTitles:assignmentsInResponse.map((a:any)=>a.title)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const successResponse = NextResponse.json({ course: mappedCourse });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/courses/[id]', {
      endpoint: '/api/admin/courses/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]' },
      'Failed to fetch course'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PATCH - Update a course
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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
    );
  }

  try {
    const { id: courseId } = await params;
    const body = await request.json();
    
    // Pre-process body to clean up invalid values before validation
    const cleanedBody = {
      ...body,
      school_ids: Array.isArray(body.school_ids) 
        ? body.school_ids.filter((id: any) => id && typeof id === 'string' && id.trim().length > 0)
        : body.school_ids,
      grades: Array.isArray(body.grades)
        ? body.grades.filter((g: any) => g && typeof g === 'string' && g.trim().length > 0)
        : body.grades
    };

    // Validate request body
    const validation = validateRequestBody(updateCourseSchema, cleanedBody);
    if (!validation.success) {
      const errorMessages = validation.details?.issues?.map((e: any) => {
        const path = Array.isArray(e.path) ? e.path.join('.') : String(e.path || '');
        return `${path ? path + ': ' : ''}${e.message}`;
      }).join(', ') || validation.error || 'Invalid request data';
      
      logger.warn('Validation failed for course update', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        errors: errorMessages,
        validationIssues: validation.details?.issues
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
          hint: 'Please check all required fields and ensure school IDs are valid UUIDs'
        },
        { status: 400 }
      );
    }
    
    console.log('📥 [API] PATCH request received for course:', courseId);
    console.log('📋 [API] Request body keys:', Object.keys(body));
    
    // #region agent log
    const logToFile = async (data: any) => {
      try {
        await fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch {}
    };
    await logToFile({location:'route.ts:537',message:'PATCH request received',data:{courseId,bodyKeys:Object.keys(body),hasAssignments:!!body.assignments,isArray:Array.isArray(body.assignments),assignmentsCount:body.assignments?.length||0,assignments:body.assignments?.map((a:any)=>({title:a.title,chapter_id:a.chapter_id,id:a.id}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'});
    // #endregion
    
    console.log('📋 [API] Assignments in request:', {
      hasAssignments: !!body.assignments,
      isArray: Array.isArray(body.assignments),
      assignmentsCount: body.assignments?.length || 0,
      assignments: body.assignments || []
    });
    
    // Use finalAssignments for all subsequent operations (will be set after destructuring)
    // This check happens before finalAssignments is available, so check body directly
    if (body.assignments && Array.isArray(body.assignments) && body.assignments.length > 0) {
      console.log('✅ [API] Assignments received in body:', body.assignments.map((a: any) => ({
        title: a.title,
        chapter_id: a.chapter_id,
        assignment_type: a.assignment_type,
        questionsCount: a.questions?.length || 0,
        hasId: !!a.id
      })));
    } else {
      console.warn('⚠️ [API] No assignments in request body or assignments is not an array');
      console.warn('   body.assignments:', body.assignments);
      console.warn('   typeof body.assignments:', typeof body.assignments);
    }
    
    // Validate course_id format (should be UUID)
    if (!courseId || typeof courseId !== 'string' || courseId.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Invalid course ID', 
        details: 'Course ID is required and must be a valid UUID' 
      }, { status: 400 });
    }
    
    // Verify course exists
    const { data: courseExists, error: courseCheckError } = await supabaseAdmin
      .from('courses')
      .select('id')
      .eq('id', courseId)
       
      .single() as any;
    
    if (courseCheckError || !courseExists) {
      console.error('❌ Course not found:', courseCheckError);
      return NextResponse.json({ 
        error: 'Course not found', 
        details: `Course with ID ${courseId} does not exist` 
      }, { status: 404 });
    }
    
    console.log('✅ Course exists:', courseExists.id);
    
    // CRITICAL: Extract assignments from body BEFORE validation merge
    // This ensures assignments are preserved even if validation strips them
    const assignmentsFromBody = body.assignments;
    console.log('🔍 [API] Assignments extracted DIRECTLY from body (before merge):', {
      hasAssignments: !!assignmentsFromBody,
      isArray: Array.isArray(assignmentsFromBody),
      assignmentsCount: assignmentsFromBody?.length || 0,
      assignmentsType: typeof assignmentsFromBody,
      assignmentsPreview: assignmentsFromBody?.slice(0, 2).map((a: any) => ({
        title: a.title,
        chapter_id: a.chapter_id,
        id: a.id
      })) || []
    });
    
    const {
      name,
      title,
      course_name,
      description,
      duration_weeks,
      prerequisites_course_ids,
      prerequisites_text,
      thumbnail_url,
      status,
      is_published,
      num_chapters,
      total_chapters,
      total_videos,
      total_materials,
      total_assignments,
      release_type,
      difficulty_level,
      school_ids,
      grades,
      chapters,
      videos,
      materials,
      assignments,
      scheduling,
      chapter_contents
    } = { ...validation.data, ...body }; // Merge validated data with additional fields

    // CRITICAL FIX: Use assignments from body directly if they were lost in validation merge
    const finalAssignments = assignments || assignmentsFromBody;
    
    // Log assignments after extraction
    console.log('📋 [API] Assignments after extraction and merge:', {
      fromDestructuring: !!assignments,
      fromBodyDirect: !!assignmentsFromBody,
      finalAssignments: !!finalAssignments,
      isArray: Array.isArray(finalAssignments),
      assignmentsCount: finalAssignments?.length || 0,
      assignmentsType: typeof finalAssignments,
      assignmentsValue: finalAssignments,
      werePreserved: assignments === assignmentsFromBody
    });
    
    if (assignments && Array.isArray(assignments) && assignments.length > 0) {
      console.log('✅ [API] Assignments will be processed:', assignments.map((a: any) => ({
        title: a.title || 'No title',
        chapter_id: a.chapter_id || 'No chapter_id',
        assignment_type: a.assignment_type || 'No type',
        questionsCount: a.questions?.length || 0,
        hasId: !!a.id,
        fullAssignment: a
      })));
    } else {
      console.warn('⚠️ [API] Assignments not found or invalid after extraction:', {
        assignments: assignments,
        type: typeof assignments,
        isArray: Array.isArray(assignments)
      });
    }

    // Update course basic info (only update columns that exist in the schema)
     
    const updateData: any = {};

    // Handle name/title: accept name, title, or course_name
    // Update both name and course_name to keep them in sync
    const courseName = name || title || course_name;
    if (courseName !== undefined) {
      updateData.name = courseName; // name column has NOT NULL constraint
      updateData.course_name = courseName; // Also update course_name for backward compatibility
    }
    if (description !== undefined) updateData.description = description;
    if (duration_weeks !== undefined) {
      updateData.duration_weeks = duration_weeks ? parseInt(String(duration_weeks)) : null;
    }
    if (prerequisites_course_ids !== undefined) {
      updateData.prerequisites_course_ids = Array.isArray(prerequisites_course_ids) && prerequisites_course_ids.length > 0
        ? prerequisites_course_ids
        : null;
    }
    if (prerequisites_text !== undefined) updateData.prerequisites_text = prerequisites_text || null;
    if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url || null;
    if (difficulty_level !== undefined) updateData.difficulty_level = difficulty_level || 'Beginner';
    if (status !== undefined) updateData.status = status;
    if (is_published !== undefined) updateData.is_published = is_published;
    if (num_chapters !== undefined || total_chapters !== undefined) {
      updateData.num_chapters = total_chapters || num_chapters || 0;
    }
    // Note: total_videos, total_materials, total_assignments, release_type don't exist in courses table
    // They would need to be calculated from related tables if needed

    // Update the course
    console.log('📝 Updating course with data:', JSON.stringify(updateData, null, 2));
     
    const { data: course, error: courseError } = await ((supabaseAdmin as any)
      .from('courses')
       
      .update(updateData as any)
      .eq('id', courseId)
      .select()
       
      .single() as any) as any;

    if (courseError) {
      console.error('❌ Error updating course:', courseError);
      return NextResponse.json({ error: 'Failed to update course', details: courseError.message }, { status: 500 });
    }
    
    console.log('✅ Course updated successfully:', course);

    // Update course_access if school_ids and grades provided
    // Use validated arrays from cleaned body
    const validSchoolIds = school_ids || [];
    const validGrades = grades || [];
    
    if (Array.isArray(validSchoolIds) && validSchoolIds.length > 0 && 
        Array.isArray(validGrades) && validGrades.length > 0) {
      try {
        console.log('📋 Updating course_access with:', {
          courseId,
          school_ids: validSchoolIds,
          grades: validGrades,
          school_count: validSchoolIds.length,
          grade_count: validGrades.length
        });

        // Validate school_ids exist
        const { data: existingSchools, error: schoolsCheckError } = await supabaseAdmin
          .from('schools')
          .select('id')
           
          .in('id', validSchoolIds) as any;

        if (schoolsCheckError) {
          console.error('❌ Error validating schools:', schoolsCheckError);
          return NextResponse.json({ 
            error: 'Failed to validate schools', 
            details: schoolsCheckError.message 
          }, { status: 500 });
        }

        const existingSchoolIds = existingSchools?.map((s: { id: string }) => s.id) || [];
        const invalidSchoolIds = validSchoolIds.filter((id: string) => !existingSchoolIds.includes(id));
        
        if (invalidSchoolIds.length > 0) {
          console.error('❌ Invalid school IDs:', invalidSchoolIds);
          return NextResponse.json({ 
            error: 'Invalid school IDs provided', 
            details: `The following school IDs are invalid: ${invalidSchoolIds.join(', ')}` 
          }, { status: 400 });
        }

        // Use already validated grades array
        // Valid grades are already filtered in the schema transformation

        // Get existing course_access entries to compare
         
        let existingAccess: any[] = [];
        const { data: fetchedAccess, error: checkError } = await supabaseAdmin
          .from('course_access')
          .select('id, course_id, school_id, grade')
           
          .eq('course_id', courseId) as any;

        if (checkError) {
          console.error('❌ Error checking existing course access:', checkError);
          console.error('❌ Error code:', checkError.code);
          console.error('❌ Error message:', checkError.message);
          console.error('❌ Error details:', JSON.stringify(checkError, null, 2));
          
          // If it's a permission error, we might not be able to proceed
          if (checkError.code === '42501' || checkError.message?.includes('permission') || checkError.message?.includes('policy')) {
            console.error('❌ Permission denied when checking course_access - RLS policy may be blocking');
            return NextResponse.json({ 
              error: 'Failed to update course access', 
              details: 'Permission denied when accessing course_access table',
              hint: 'Check Row Level Security (RLS) policies. The service role should bypass RLS, but verify the SUPABASE_SERVICE_ROLE_KEY is correctly configured.',
              code: checkError.code
            }, { status: 500 });
          }
          
          // For other errors, continue with empty array (assume no existing entries)
          console.warn('⚠️ Could not fetch existing entries, assuming none exist');
          existingAccess = [];
        } else {
          existingAccess = fetchedAccess || [];
          console.log(`📋 Found ${existingAccess.length} existing course_access entries for course ${courseId}`);
        }
        
        // Ensure existingAccess is always an array
        if (!Array.isArray(existingAccess)) {
          console.warn('⚠️ existingAccess is not an array, setting to empty array');
          existingAccess = [];
        }

        // Helper function to normalize grade to display format (e.g., "grade4" -> "Grade 4")
        const normalizeGradeToDisplay = (grade: string): string => {
          if (!grade) return '';
          const trimmed = typeof grade === 'string' ? grade.trim() : String(grade).trim();
          
          // If already in "Grade X" format, return as-is
          if (/^Grade\s+\d+$/i.test(trimmed)) {
            return trimmed;
          }
          
          // Remove "grade" prefix if present (case-insensitive)
          const normalized = trimmed.replace(/^grade\s*/i, '').trim();
          
          // Handle special cases
          const lower = normalized.toLowerCase();
          if (lower === 'pre-k' || lower === 'prek' || lower === 'pre-kg') {
            return 'Pre-K';
          }
          if (lower === 'k' || lower === 'kindergarten' || lower === 'kg') {
            return 'Kindergarten';
          }
          
          // Extract number and format as "Grade X"
          const numMatch = normalized.match(/(\d{1,2})/);
          if (numMatch) {
            return `Grade ${numMatch[1]}`;
          }
          
          // If no number found, return as-is (capitalize first letter)
          return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
        };

        // Create new course_access entries
        const accessEntries = [];
        const seenEntries = new Set<string>(); // Track duplicates
        
        // Use existingSchoolIds - these are guaranteed to exist in the database
        for (const schoolId of existingSchoolIds) {
          // Validate schoolId is a valid UUID format
          if (!schoolId || typeof schoolId !== 'string' || schoolId.trim().length === 0) {
            console.error(`❌ Invalid school ID:`, schoolId);
            continue;
          }
          
          for (const grade of validGrades) {
            // Normalize grade to display format
            const gradeValue = normalizeGradeToDisplay(grade);
            
            if (gradeValue && gradeValue.trim().length > 0) {
              // Create a unique key to prevent duplicates
              const entryKey = `${courseId}-${schoolId || 'undefined'}-${gradeValue}`;
              
              if (!seenEntries.has(entryKey)) {
                seenEntries.add(entryKey);
              const entry = {
                course_id: courseId,
                school_id: schoolId.trim(),
                grade: gradeValue.trim()
              };
                
                // Validate entry before adding
                if (!entry.course_id || !entry.school_id || !entry.grade) {
                  console.error(`❌ Invalid entry data:`, entry);
                  continue;
                }
                
                accessEntries.push(entry);
              }
            } else {
              console.warn(`⚠️ Skipping invalid grade:`, grade);
            }
          }
        }

        console.log(`📋 Creating ${accessEntries.length} course_access entries:`, 
          JSON.stringify(accessEntries.map((e: any) => ({ course_id: e.course_id, school_id: e.school_id, grade: e.grade })), null, 2));
        
        // Validate all entries before attempting insert
        const invalidEntries = accessEntries.filter((e: any) => !e.course_id || !e.school_id || !e.grade);
        if (invalidEntries.length > 0) {
          console.error(`❌ Found ${invalidEntries.length} invalid entries:`, invalidEntries);
          return NextResponse.json({ 
            error: 'Invalid course access data', 
            details: `${invalidEntries.length} entries have missing required fields (course_id, school_id, or grade)`,
            invalidEntries: invalidEntries
          }, { status: 400 });
        }

        if (accessEntries.length === 0) {
          console.error('❌ No valid access entries to create');
          return NextResponse.json({ 
            error: 'No valid access entries to create', 
            details: 'Could not create any course access entries' 
          }, { status: 400 });
        }

        // Use transaction function to atomically update course access
        // This prevents race conditions with proper table locking
        console.log(`🔄 Updating course_access entries atomically for course ${courseId}...`);
        
        const { data: transactionResult, error: transactionError } = await (supabaseAdmin
           
          .rpc('update_course_access' as any, {
            p_course_id: courseId,
             
            p_access_entries: accessEntries as any
           
          } as any) as any);

        if (transactionError || !transactionResult?.success) {
          console.error('❌ Error updating course access:', transactionError || transactionResult?.error);
          return NextResponse.json({ 
            error: 'Failed to update course access', 
            details: transactionResult?.error || transactionError?.message || 'Transaction failed',
            code: transactionError?.code
          }, { status: 500 });
        }
        
        console.log(`✅ Successfully updated ${transactionResult.inserted_count || accessEntries.length} course access entries`);
        
        // Fetch the updated access entries to return
        console.log('📥 Fetching final course_access state...');
        const { data: fetchedFinalAccess, error: fetchError } = await supabaseAdmin
          .from('course_access')
          .select('id, course_id, school_id, grade')
           
          .eq('course_id', courseId) as any;

        let finalAccess: any[] = [];
        if (!fetchError && fetchedFinalAccess) {
          finalAccess = fetchedFinalAccess;
        }

        if (fetchError) {
          console.error('❌ Error fetching final course access:', fetchError);
          // Log warning but continue since update was successful
          console.warn('⚠️ Updates were made but final fetch failed');
        }
        
        console.log(`✅ Successfully updated course_access: ${finalAccess.length} total entries`);
        
        if (finalAccess.length > 0) {
          console.log('📋 Final course access entries:', JSON.stringify(finalAccess, null, 2));
        }

      } catch (courseAccessError: any) {
        logger.error('Exception during course_access update', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
        }, courseAccessError instanceof Error ? courseAccessError : new Error(String(courseAccessError)));
        
        const errorInfo = await handleApiError(
          courseAccessError,
          { endpoint: '/api/admin/courses/[id]', courseId },
          'Failed to update course access'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }
    } else {
      console.log('⚠️ Skipping course_access update - missing school_ids or grades:', {
        has_school_ids: !!school_ids,
        school_ids_length: school_ids?.length || 0,
        has_grades: !!grades,
        grades_length: grades?.length || 0
      });
    }

    // Always build chapter ID mapping - needed for videos/materials/assignments
    const chapterIdMap: Map<string, string> = new Map(); // Maps frontend chapter IDs to database chapter IDs
    
    // First, fetch existing chapters to build initial mapping
    const { data: existingChaptersForMapping } = await supabaseAdmin
      .from('chapters')
      .select('id, order_index, order_number')
      .eq('course_id', courseId)
       
      .order('order_index', { ascending: true }) as any;
    
    if (existingChaptersForMapping && existingChaptersForMapping.length > 0) {
      console.log('📋 Building initial chapter ID mapping from existing chapters...');
       
      existingChaptersForMapping.forEach((ch: any, index: number) => {
        // Map by ID
        chapterIdMap.set(String(ch.id).toLowerCase(), ch.id);
        // Map by order index
        if (ch.order_index) chapterIdMap.set(String(ch.order_index), ch.id);
        if (ch.order_number) chapterIdMap.set(String(ch.order_number), ch.id);
        // Map by array position
        chapterIdMap.set(String(index), ch.id);
      });
      console.log(`   Initial mapping: ${chapterIdMap.size} entries`);
    }
    
    // Update chapters if provided
    if (chapters && Array.isArray(chapters)) {
      // 1. Fetch existing chapters to know what to delete
      const { data: existingChapters, error: fetchExistingError } = await supabaseAdmin
        .from('chapters')
        .select('id, order_index, order_number')
         
        .eq('course_id', courseId) as any;
      
      if (fetchExistingError) {
        console.error('Error fetching existing chapters:', fetchExistingError);
      }

      const existingIds = existingChapters?.map((ch: { id: string }) => ch.id) || [];
       
      const payloadIds = chapters.map((ch: any) => ch.id).filter((id: any) => id && typeof id === 'string');
      
      console.log('🔄 Updating chapters:', {
        existingCount: existingIds.length,
        payloadCount: chapters.length,
        idsToDelete: existingIds.filter((id: string) => !payloadIds.includes(id)).length
      });

      // 2. Delete chapters not in payload
      const idsToDelete = existingIds.filter((id: string) => !payloadIds.includes(id));
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from('chapters')
          .delete()
          .in('id', idsToDelete);
          
        if (deleteError) {
          console.error('Error deleting removed chapters:', deleteError);
        }
      }

      // 3. Upsert chapters (update existing, insert new)
      if (chapters.length > 0) {
         
        const chaptersToUpsert = chapters.map((chapter: any, index: number) => {
           
          const chapterData: any = {
            course_id: courseId,
            title: chapter.name || chapter.title || '',
            // Try both column names to be safe or prefer 'name' if schema matches migration
            name: chapter.name || chapter.title || '', 
            description: chapter.description || '',
            learning_outcomes: chapter.learning_outcomes || [],
            order_index: chapter.order_number || chapter.order_index || index + 1,
            order_number: chapter.order_number || chapter.order_index || index + 1,
            release_date: chapter.release_date || null,
            is_published: true
          };
          
          // Only include ID if it's a valid string AND a valid UUID
          // This prevents "invalid input syntax for type uuid" errors with temp IDs (e.g. "chapter-123")
          const isValidUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

          if (chapter.id && typeof chapter.id === 'string' && isValidUuid(chapter.id)) {
            chapterData.id = chapter.id;
          }
          
          return chapterData;
        });

        const { data: upsertedChapters, error: chaptersError } = await (supabaseAdmin
          .from('chapters')
           
          .upsert(chaptersToUpsert as any)
           
          .select('id, order_index, order_number') as any);

        if (chaptersError) {
          console.error('Error updating/inserting chapters:', chaptersError);
        } else if (upsertedChapters) {
          // Update mapping from frontend chapter IDs/indices to database chapter IDs
          console.log('📋 Updating chapter ID mapping after upsert...');
           
          // First, map by array index/order since upsert usually preserves order or we can match by properties
          chapters.forEach((frontendChapter: any, index: number) => {
            const frontendId = frontendChapter.id;
            const orderIndex = frontendChapter.order_number || frontendChapter.order_index || index + 1;
            
            // Try to find matching chapter by ID first (if frontend ID was valid UUID and preserved)
            let dbChapter = upsertedChapters.find((ch: any) => 
              frontendId && ch.id === frontendId
            );
            
            // If not found by ID, match by order_index/order_number
            if (!dbChapter) {
              dbChapter = upsertedChapters.find((ch: any) => 
                (ch.order_index === orderIndex) || (ch.order_number === orderIndex)
              );
            }
            
            // If still not found, match by position in array if lengths match
            if (!dbChapter && upsertedChapters.length === chapters.length && upsertedChapters[index]) {
              dbChapter = upsertedChapters[index];
            }
            
            if (dbChapter) {
              // Map frontend ID to database ID
              if (frontendId) {
                chapterIdMap.set(String(frontendId).toLowerCase(), dbChapter.id);
                // Also map verbatim
                chapterIdMap.set(String(frontendId), dbChapter.id);
              }
              // Also map by order index as fallback
              chapterIdMap.set(String(orderIndex), dbChapter.id);
              chapterIdMap.set(String(index), dbChapter.id);
              
              console.log(`  ✅ Mapped chapter "${frontendChapter.name || frontendChapter.title}" (frontend ID: ${frontendId || 'none'}, order: ${orderIndex}) -> DB ID: ${dbChapter.id}`);
            } else {
              console.error(`  ❌ Could not map chapter "${frontendChapter.name || frontendChapter.title}" to database chapter`);
            }
          });
          
          console.log(`📋 Chapter ID mapping updated: ${chapterIdMap.size} total mappings`);
        }
      }
    }

    // Update videos if provided
    if (videos && Array.isArray(videos)) {
      // Delete existing videos for this course's chapters
      const { data: courseChapters } = await supabaseAdmin
        .from('chapters')
        .select('id, order_index, order_number')
        .eq('course_id', courseId)
         
        .order('order_index', { ascending: true }) as any;

      if (courseChapters && courseChapters.length > 0) {
        const chapterIds = courseChapters.map((ch: { id: string }) => ch.id);
        
        // Ensure chapterIdMap has all current chapters mapped (in case chapters weren't updated)
        if (chapterIdMap.size === 0 || chapterIds.length > chapterIdMap.size) {
          console.log('📋 Building/updating chapter ID mapping from existing chapters for video mapping...');
           
          courseChapters.forEach((ch: any, index: number) => {
            // Map by ID
            chapterIdMap.set(String(ch.id).toLowerCase(), ch.id);
            // Map by order index
            if (ch.order_index) chapterIdMap.set(String(ch.order_index), ch.id);
            if (ch.order_number) chapterIdMap.set(String(ch.order_number), ch.id);
            // Map by array position
            chapterIdMap.set(String(index), ch.id);
          });
          console.log(`   Mapping now has ${chapterIdMap.size} entries`);
        }
        
        await supabaseAdmin
          .from('videos')
          .delete()
          .in('chapter_id', chapterIds);

        // Insert new videos - map frontend chapter_ids to database chapter_ids
        if (videos.length > 0) {
          console.log(`📹 Processing ${videos.length} video(s) for insertion...`);
          console.log(`   Chapter ID map size: ${chapterIdMap.size}`);
          console.log(`   Available chapter IDs:`, chapterIds);
          
          const videosToInsert = videos
             
            .filter((v: any) => v.chapter_id && v.title)
             
            .map((video: any) => {
              // Map frontend chapter_id to database chapter_id
              const frontendChapterId = String(video.chapter_id).trim().toLowerCase();
              let dbChapterId = chapterIdMap.get(frontendChapterId);
              
              // If not found in map, try direct match (in case it's already a DB ID)
              if (!dbChapterId) {
                const directMatch = chapterIds.find((id: string) => String(id).toLowerCase() === frontendChapterId);
                if (directMatch) {
                  dbChapterId = directMatch;
                  console.log(`   ✅ Direct match found for video "${video.title}": ${frontendChapterId} -> ${dbChapterId}`);
                }
              } else {
                console.log(`   ✅ Mapped video "${video.title}": ${frontendChapterId} -> ${dbChapterId}`);
              }
              
              if (!dbChapterId) {
                console.error(`❌ Could not map video "${video.title}" chapter_id "${video.chapter_id}" to database chapter ID`);
                console.error(`   Frontend chapter_id: ${frontendChapterId}`);
                console.error(`   Available mappings:`, Array.from(chapterIdMap.entries()).slice(0, 10));
                console.error(`   Available chapter IDs:`, chapterIds);
                return null; // Filter out videos with unmappable chapter_ids
              }
              
              return {
                chapter_id: dbChapterId,
                title: video.title,
                video_url: video.video_url || '',
                duration: video.duration || null,
                uploaded_by: body.created_by || null
              };
            })
             
            .filter((v: any) => v !== null); // Remove null entries

          console.log(`💾 Saving ${videosToInsert.length} video(s) to database (${videos.length} total, ${videos.length - videosToInsert.length} filtered):`, videosToInsert.map((v: any) => ({
            title: v.title,
            chapter_id: v.chapter_id,
            video_url: v.video_url?.substring(0, 60) + '...'
          })));

          if (videosToInsert.length > 0) {
            const { data: insertedVideos, error: videosError } = await (supabaseAdmin
              .from('videos')
               
              .insert(videosToInsert as any)
               
              .select() as any);

            if (videosError) {
              console.error('❌ Error updating videos:', videosError);
              console.error('   Videos that failed:', videosToInsert);
            } else {
              console.log(`✅ Successfully saved ${insertedVideos?.length || 0} video(s) to database`);
              if (insertedVideos) {
                 
                console.log('   Saved videos:', insertedVideos.map((v: any) => ({
                  id: v.id,
                  title: v.title,
                  chapter_id: v.chapter_id,
                  video_url: v.video_url
                })));
              }
            }
          } else {
            console.warn('⚠️ No valid videos to insert after mapping chapter IDs');
          }
        }
      } else {
        console.warn('⚠️ No chapters found for course - cannot save videos');
      }
    }

    // Update materials if provided
    if (materials && Array.isArray(materials)) {
      // Delete existing materials for this course's chapters
      const { data: courseChapters } = await supabaseAdmin
        .from('chapters')
        .select('id')
         
        .eq('course_id', courseId) as any;

      if (courseChapters && courseChapters.length > 0) {
        const chapterIds = courseChapters.map((ch: { id: string }) => ch.id);
        await supabaseAdmin
          .from('materials')
          .delete()
          .in('chapter_id', chapterIds);

        // Insert new materials - map frontend chapter_ids to database chapter_ids
        if (materials.length > 0) {
          const materialsToInsert = materials
             
            .filter((m: any) => m.chapter_id && m.title)
             
            .map((material: any) => {
              // Map frontend chapter_id to database chapter_id
              const frontendChapterId = String(material.chapter_id).trim().toLowerCase();
              let dbChapterId = chapterIdMap.get(frontendChapterId);
              
              // If not found in map, try direct match (in case it's already a DB ID)
              if (!dbChapterId) {
                const directMatch = chapterIds.find((id: string) => String(id).toLowerCase() === frontendChapterId);
                if (directMatch) {
                  dbChapterId = directMatch;
                }
              }
              
              if (!dbChapterId) {
                console.error(`❌ Could not map material "${material.title}" chapter_id "${material.chapter_id}" to database chapter ID`);
                return null;
              }
              
              return {
                chapter_id: dbChapterId,
                title: material.title,
                file_url: material.file_url || '',
                file_type: material.file_type || 'pdf',
                uploaded_by: body.created_by || null
              };
            })
             
            .filter((m: any) => m !== null); // Remove null entries

          if (materialsToInsert.length > 0) {
            const { error: materialsError } = await (supabaseAdmin
              .from('materials')
               
              .insert(materialsToInsert as any) as any);

            if (materialsError) {
              console.error('Error updating materials:', materialsError);
            } else {
              console.log(`✅ Successfully saved ${materialsToInsert.length} material(s) to database`);
            }
          } else {
            console.warn('⚠️ No valid materials to insert after mapping chapter IDs');
          }
        }
      } else {
        console.warn('⚠️ No chapters found for course - cannot save materials');
      }
    }

    const synchronizeChapterContents = async (payloadContents: any[]) => {
      // Check if chapter_contents table exists by trying a simple query
      try {
        const { error: tableCheckError } = await supabaseAdmin
          .from('chapter_contents')
          .select('id')
          .limit(1);
        
        if (tableCheckError) {
          console.error('❌ chapter_contents table may not exist or is not accessible:', tableCheckError);
          console.warn('⚠️ Skipping chapter_contents synchronization - table not available');
          return;
        }
       
      } catch (checkError: any) {
        logger.warn('Error checking chapter_contents table (non-critical)', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
        }, checkError instanceof Error ? checkError : new Error(String(checkError)));
        // Skipping chapter_contents synchronization
        return;
      }

      const { data: courseChaptersForContents } = await supabaseAdmin
        .from('chapters')
        .select('id')
         
        .eq('course_id', courseId) as any;

      const chapterIdsForContents = courseChaptersForContents?.map((ch: { id: string }) => ch.id) || [];
      if (chapterIdsForContents.length === 0) {
        console.warn('⚠️ No chapters available to synchronize chapter contents');
        return;
      }

      const resolveChapterId = (rawChapterId: any, fallbackOrder?: number) => {
        if (rawChapterId) {
          const key = String(rawChapterId).trim().toLowerCase();
          const rawKey = String(rawChapterId);
          
          if (chapterIdMap.has(key)) return chapterIdMap.get(key);
          if (chapterIdMap.has(rawKey)) return chapterIdMap.get(rawKey);
          
          // Check direct match against actual IDs
          const directMatch = chapterIdsForContents.find((id: string) => String(id).toLowerCase() === key);
          if (directMatch) {
            return directMatch;
          }
        }

        if (typeof fallbackOrder === 'number') {
          const orderKey = String(fallbackOrder);
          if (chapterIdMap.has(orderKey)) {
            return chapterIdMap.get(orderKey);
          }
        }

        return chapterIdsForContents[0] || null;
      };

      const contentsToUpsert = payloadContents
         
        .map((content: any, index: number) => {
          const chapterId = resolveChapterId(content.chapter_id, content.order_index || index + 1);
          if (!chapterId) {
            console.warn('⚠️ Skipping chapter content - could not resolve chapter ID', content);
            return null;
          }

          let metadata = content.content_metadata || content.metadata || null;
          if (metadata && typeof metadata === 'string') {
            try {
              metadata = JSON.parse(metadata);
            } catch (e) {
              logger.warn('Error parsing metadata (non-critical)', {
                endpoint: '/api/admin/courses/[id]',
                courseId,
              }, e instanceof Error ? e : new Error(String(e)));
              metadata = null;
            }
          }

          return {
            id: content.id,
            chapter_id: chapterId,
            content_type: content.content_type || (content.file_type === 'pdf' ? 'pdf' : content.file_type ? 'file' : 'text'),
            title: content.title || `Content item ${index + 1}`,
            content_url: content.content_url || content.video_url || content.file_url || null,
            content_text: content.content_text || null,
            order_index: content.order_index || index + 1,
            duration_minutes: content.duration_minutes || content.duration || null,
            is_published: content.is_published ?? true,
            storage_path: content.storage_path || null,
            content_metadata: metadata,
            thumbnail_url: content.thumbnail_url || null,
            content_label: content.content_label || null
          };
        })
         
        .filter((item: any) => item !== null);

      if (contentsToUpsert.length === 0) {
        console.log('ℹ️ No valid chapter contents to upsert');
        return;
      }

      // Delete contents that are no longer present (only those with IDs)
       
      const payloadIds = contentsToUpsert.map((item: any) => item.id).filter(Boolean);
      const { data: existingContents } = await supabaseAdmin
        .from('chapter_contents')
        .select('id')
         
        .in('chapter_id', chapterIdsForContents) as any;

      if (existingContents && payloadIds.length > 0) {
        const idsToDelete = existingContents
           
          .filter((existing: any) => !payloadIds.includes(existing.id))
           
          .map((existing: any) => existing.id);

        if (idsToDelete.length > 0) {
          console.log(`🗑️ Deleting ${idsToDelete.length} removed chapter content item(s)`);
          await supabaseAdmin
            .from('chapter_contents')
            .delete()
            .in('id', idsToDelete);
        }
      }

      console.log(`🧱 Upserting ${contentsToUpsert.length} chapter content item(s)`);
      console.log('   Sample content item:', JSON.stringify(contentsToUpsert[0], null, 2));
      
      try {
        const { error: contentsError } = await (supabaseAdmin
          .from('chapter_contents')
           
          .upsert(contentsToUpsert as any) as any);

        if (contentsError) {
          console.error('❌ Error upserting chapter contents:', contentsError);
          console.error('   Error details:', JSON.stringify(contentsError, null, 2));
          throw new Error(`Failed to upsert chapter contents: ${contentsError.message || 'Unknown error'}`);
        } else {
          console.log('✅ Successfully upserted chapter contents');
        }
       
      } catch (error: any) {
        logger.warn('Exception in synchronizeChapterContents (non-critical)', {
          endpoint: '/api/admin/courses/[id]',
        }, error instanceof Error ? error : new Error(String(error)));
        // Don't throw - allow course update to continue even if chapter_contents fails
        // This prevents the entire update from failing if chapter_contents table has issues
      }
    };

    const chapterContentsPayload = Array.isArray(chapter_contents) ? chapter_contents : [];

    try {
      if (chapterContentsPayload.length > 0) {
        console.log(`📦 Processing ${chapterContentsPayload.length} chapter_contents items`);
        await synchronizeChapterContents(chapterContentsPayload);
      } else if ((videos && videos.length > 0) || (materials && materials.length > 0)) {
         
        const fallbackContents: any[] = [];
        if (videos && videos.length > 0) {
           
          videos.forEach((video: any, index: number) => {
            fallbackContents.push({
              ...video,
              content_type: 'video_link',
              content_url: video.video_url,
              order_index: video.order_index || index + 1
            });
          });
        }
        if (materials && materials.length > 0) {
           
          materials.forEach((material: any, index: number) => {
            fallbackContents.push({
              ...material,
              content_type: material.file_type === 'pdf' ? 'pdf' : 'file',
              content_url: material.file_url,
              order_index: material.order_index || index + 1
            });
          });
        }
        if (fallbackContents.length > 0) {
          console.log(`📦 Processing ${fallbackContents.length} fallback contents from videos/materials`);
          await synchronizeChapterContents(fallbackContents);
        }
      }
     
    } catch (chapterContentsError: any) {
      logger.warn('Error processing chapter contents (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      }, chapterContentsError instanceof Error ? chapterContentsError : new Error(String(chapterContentsError)));
      // Don't fail the entire update if chapter_contents processing fails
      // Log the error but continue with the rest of the update
    }

    // Update assignments if provided
    // CRITICAL: Use finalAssignments (which preserves assignments from body)
    const assignmentsToProcess = finalAssignments;
    
    console.log('🔄 [API] Starting assignment processing:', {
      hasAssignments: !!assignmentsToProcess,
      isArray: Array.isArray(assignmentsToProcess),
      assignmentsCount: assignmentsToProcess?.length || 0,
      courseId: courseId,
      source: assignmentsToProcess === assignmentsFromBody ? 'direct from body' : 'from destructuring'
    });
    
    // #region agent log
    await logToFile({location:'route.ts:1486',message:'Starting assignment processing',data:{hasAssignments:!!assignmentsToProcess,isArray:Array.isArray(assignmentsToProcess),assignmentsCount:assignmentsToProcess?.length||0,courseId,assignments:assignmentsToProcess?.map((a:any)=>({title:a.title,chapter_id:a.chapter_id,id:a.id}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});
    // #endregion
    
    if (assignmentsToProcess && Array.isArray(assignmentsToProcess)) {
      console.log('✅ [API] Assignments array is valid, proceeding with save...');
      console.log('   Assignments to save:', assignmentsToProcess.length);
      
      // Delete existing assignments for this course (cascade will delete questions)
      console.log('🗑️ [API] Deleting existing assignments for course:', courseId);
      const { error: deleteError } = await supabaseAdmin
        .from('assignments')
        .delete()
        .eq('course_id', courseId);
      
      if (deleteError) {
        console.error('❌ [API] Error deleting existing assignments:', deleteError);
        logger.error('Failed to delete existing assignments', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          error: deleteError
        });
      } else {
        console.log('✅ [API] Successfully deleted existing assignments');
      }

      // Insert new assignments with questions
      if (assignmentsToProcess.length > 0) {
        console.log(`📝 [API] Processing ${assignmentsToProcess.length} assignment(s) for insertion...`);
        // Get chapter IDs with order_index for mapping
        const { data: courseChapters } = await supabaseAdmin
          .from('chapters')
          .select('id, order_index, order_number')
           
          .eq('course_id', courseId)
          .order('order_index', { ascending: true }) as any;
        const chapterIds = courseChapters?.map((ch: { id: string }) => ch.id) || [];
        
        // #region agent log
        await logToFile({location:'route.ts:1526',message:'Fetched chapters for assignment matching',data:{courseId,chaptersCount:courseChapters?.length||0,chapterIds,assignmentsCount:assignments.length,assignments:assignments.map((a:any)=>({title:a.title,chapter_id:a.chapter_id,id:a.id}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'});
        // #endregion
        
        if (chapterIds.length === 0) {
          console.error('❌ [API] No chapters found for course, cannot save assignments');
          logger.error('Cannot save assignments - no chapters available', {
            endpoint: '/api/admin/courses/[id]',
            courseId,
            assignmentsCount: assignments.length
          });
          // #region agent log
          await logToFile({location:'route.ts:1528',message:'ERROR: No chapters found',data:{courseId,assignmentsCount:assignments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'});
          // #endregion
        }
        
        console.log(`📝 Processing ${assignmentsToProcess.length} assignment(s) for course ${courseId}`);
        console.log(`   Available chapter IDs:`, chapterIds);
        
        // Track assignment processing results
        const assignmentErrors: string[] = [];
        const assignmentSuccesses: string[] = [];
        
        for (const assignment of assignmentsToProcess) {
          try {
            console.log(`📋 Processing assignment: "${assignment.title}" with chapter_id: ${assignment.chapter_id}`);
            
            // #region agent log
            await logToFile({location:'route.ts:1544',message:'Processing individual assignment',data:{assignmentTitle:assignment.title,assignmentId:assignment.id,assignmentChapterId:assignment.chapter_id,availableChapterIds:chapterIds},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'});
            // #endregion
            
            // With permanent IDs, chapter_id should always be a valid UUID
            let dbChapterId: string | null = null;
            if (assignment.chapter_id) {
              const assignmentChapterId = String(assignment.chapter_id).trim();
              
              // Find matching chapter by ID (case-insensitive comparison for safety)
              const directMatch = chapterIds.find((id: string) => 
                String(id).toLowerCase() === assignmentChapterId.toLowerCase() || 
                id === assignmentChapterId
              );
              
              if (directMatch) {
                dbChapterId = directMatch;
                console.log(`   ✅ Found matching chapter ID: ${dbChapterId}`);
                // #region agent log
                await logToFile({location:'route.ts:1559',message:'Chapter ID matched successfully',data:{assignmentTitle:assignment.title,assignmentChapterId,dbChapterId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'});
                // #endregion
              } else {
                // Chapter ID doesn't match any existing chapter
                // This could happen if chapter was deleted or ID is invalid
                console.warn(`   ⚠️ Assignment chapter_id "${assignmentChapterId}" does not match any chapter`);
                console.warn(`      Available chapter IDs:`, chapterIds);
                
                // Fallback: use first chapter if only one exists
                if (chapterIds.length === 1) {
                  dbChapterId = chapterIds[0];
                  console.warn(`      Using single chapter as fallback: ${dbChapterId}`);
                } else if (chapterIds.length > 0) {
                  // Multiple chapters - cannot determine which one to use
                  const errorMsg = `Assignment "${assignment.title}" has invalid chapter_id "${assignmentChapterId}". Available chapters: ${chapterIds.join(', ')}`;
                  console.error(`   ❌ ${errorMsg}`);
                  assignmentErrors.push(errorMsg);
                  logger.error('Cannot save assignment - invalid chapter_id', {
                    endpoint: '/api/admin/courses/[id]',
                    courseId,
                    assignmentTitle: assignment.title,
                    assignmentChapterId: assignmentChapterId,
                    availableChapterIds: chapterIds
                  });
                  continue; // Skip this assignment
                }
              }
            } else {
              // No chapter_id provided
              const errorMsg = `Assignment "${assignment.title}" is missing chapter_id`;
              console.error(`   ❌ ${errorMsg}`);
              assignmentErrors.push(errorMsg);
              logger.error('Cannot save assignment - missing chapter_id', {
                endpoint: '/api/admin/courses/[id]',
                courseId,
                assignmentTitle: assignment.title
              });
              continue; // Skip this assignment
            }
            
            // CRITICAL: Validate that we have a valid chapter_id before inserting
            if (!dbChapterId) {
              const errorMsg = `Assignment "${assignment.title}" cannot be saved: no valid chapter_id found. Original chapter_id: ${assignment.chapter_id || 'none'}`;
              console.error(`   ❌ ${errorMsg}`);
              // #region agent log
              await logToFile({location:'route.ts:1600',message:'ERROR: Assignment skipped - no valid chapter_id',data:{assignmentTitle:assignment.title,assignmentId:assignment.id,originalChapterId:assignment.chapter_id,availableChapterIds:chapterIds},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'});
              // #endregion
              assignmentErrors.push(errorMsg);
              logger.error('Cannot save assignment - no valid chapter_id', {
                endpoint: '/api/admin/courses/[id]',
                courseId,
                assignmentTitle: assignment.title,
                originalChapterId: assignment.chapter_id,
                availableChapterIds: chapterIds
              });
              continue; // Skip this assignment
            }
            
            // Build config object for additional metadata (keep for backward compatibility)
            let configObj: string | null = null;
            try {
              // Store any additional metadata in config, but primary fields go in columns
              const configData: any = {};
              if (assignment.auto_grading_enabled !== undefined) {
                configData.auto_grading_enabled = assignment.auto_grading_enabled;
              }
              if (Object.keys(configData).length > 0) {
                configObj = JSON.stringify(configData);
              }
            } catch (e) {
              logger.warn('Error creating assignment config (non-critical)', {
                endpoint: '/api/admin/courses/[id]',
                courseId,
              }, e instanceof Error ? e : new Error(String(e)));
            }
            
            // Use assignment.id if provided (permanent ID from frontend), otherwise let database generate it
            // Store chapter_id in database column (like videos and materials) for proper foreign key relationship
            const assignmentData: any = {
              course_id: courseId,
              chapter_id: dbChapterId, // Store in column for proper foreign key relationship
              title: assignment.title,
              description: assignment.description || '',
              assignment_type: assignment.assignment_type || 'essay',
              max_marks: assignment.max_score || assignment.max_marks || 100,
              max_score: assignment.max_score || assignment.max_marks || 100, // Also set max_score for consistency
              auto_grading_enabled: assignment.auto_grading_enabled || false, // Store in column, not just config
              is_published: true,
              config: configObj, // Keep for additional metadata if needed
              created_by: body.created_by || null
            };
            
            // Include assignment ID if provided (for updates or permanent IDs from frontend)
            if (assignment.id) {
              assignmentData.id = assignment.id;
              console.log(`   📝 Using provided assignment ID: ${assignment.id}`);
            }

            console.log(`   💾 [API] Inserting assignment:`, {
              title: assignment.title,
              chapter_id: dbChapterId,
              assignment_type: assignment.assignment_type || 'essay',
              max_marks: assignment.max_score || assignment.max_marks || 100,
              questionsCount: assignment.questions?.length || 0,
              assignmentData: assignmentData
            });
            
            // #region agent log
            await logToFile({location:'route.ts:1664',message:'About to insert assignment into database',data:{assignmentTitle:assignment.title,assignmentId:assignment.id,dbChapterId,assignmentData:{course_id:assignmentData.course_id,chapter_id:assignmentData.chapter_id,title:assignmentData.title}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'});
            // #endregion
            
            const { data: insertedAssignment, error: assignmentsError } = await ((supabaseAdmin
              .from('assignments')
               
              .insert(assignmentData as any) as any)
              .select()
               
              .single() as any) as any;

            // #region agent log
            await logToFile({location:'route.ts:1672',message:'Database insert result',data:{assignmentTitle:assignment.title,hasError:!!assignmentsError,errorMessage:assignmentsError?.message,hasInsertedData:!!insertedAssignment,insertedId:insertedAssignment?.id,insertedChapterId:insertedAssignment?.chapter_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'});
            // #endregion

            if (assignmentsError) {
              const errorMsg = `Failed to insert assignment "${assignment.title}": ${assignmentsError.message}`;
              console.error(`   ❌ ${errorMsg}`);
              assignmentErrors.push(errorMsg);
              logger.error('Failed to insert assignment', {
                endpoint: '/api/admin/courses/[id]',
                courseId,
                assignmentTitle: assignment.title,
                chapterId: dbChapterId,
                error: assignmentsError.message,
                assignmentData: assignmentData
              });
              continue;
            }
            
            if (insertedAssignment) {
              console.log(`   ✅ [API] Successfully inserted assignment:`, {
                id: insertedAssignment.id,
                title: insertedAssignment.title,
                chapter_id: insertedAssignment.chapter_id,
                course_id: insertedAssignment.course_id,
                assignment_type: insertedAssignment.assignment_type,
                max_marks: insertedAssignment.max_marks
              });
              assignmentSuccesses.push(assignment.title);
            } else {
              const errorMsg = `Assignment "${assignment.title}" insertion returned no data`;
              console.error(`   ❌ [API] ${errorMsg}`);
              assignmentErrors.push(errorMsg);
            }

            // Insert assignment questions if provided
            if (insertedAssignment && assignment.questions && assignment.questions.length > 0) {
              console.log(`📋 Inserting ${assignment.questions.length} question(s) for assignment ${insertedAssignment.id}...`);

              const questionsToInsert = assignment.questions.map((q: any, index: number) => {
                // Normalize question_type to match database constraint
                // Database accepts: 'mcq', 'essay', 'true_false', 'short_answer', 'fill_blank' (lowercase)
                // OR: 'MCQ', 'FillBlank', 'mcq', 'fill_blank', 'essay', 'true_false' (mixed case)
                // Use lowercase to ensure compatibility with all constraint versions
                let normalizedQuestionType = (q.question_type || 'mcq').trim();
                
                // Map common variations to lowercase database-accepted values
                // Using lowercase ensures compatibility with all constraint versions
                const typeMap: Record<string, string> = {
                  'MCQ': 'mcq',
                  'mcq': 'mcq',
                  'Mcq': 'mcq',
                  'FillBlank': 'fill_blank',
                  'fill_blank': 'fill_blank',
                  'fillblank': 'fill_blank',
                  'Fill_Blank': 'fill_blank',
                  'Fill_blank': 'fill_blank',
                  'essay': 'essay',
                  'Essay': 'essay',
                  'true_false': 'true_false',
                  'TrueFalse': 'true_false',
                  'truefalse': 'true_false',
                  'True_False': 'true_false',
                  'short_answer': 'short_answer',
                  'ShortAnswer': 'short_answer',
                  'shortanswer': 'short_answer'
                };
                
                normalizedQuestionType = typeMap[normalizedQuestionType] || normalizedQuestionType.toLowerCase();
                
                return {
                  assignment_id: insertedAssignment.id,
                  question_type: normalizedQuestionType,
                  question_text: q.question_text || '',
                  options: q.options && Array.isArray(q.options) ? q.options.filter((o: string) => o && o.trim()) : null,
                  correct_answer: q.correct_answer || '',
                  marks: q.marks || 1,
                  order_index: index,
                  explanation: q.explanation || null
                };
              });

              const { data: insertedQuestions, error: questionsError } = await supabaseAdmin
                .from('assignment_questions')
                .insert(questionsToInsert)
                .select();
              
              if (questionsError) {
                const errorMsg = `Error inserting questions for assignment "${assignment.title}": ${questionsError.message}`;
                console.error(`   ❌ [API] ${errorMsg}`);
                console.error('   ❌ [API] Questions data:', JSON.stringify(questionsToInsert, null, 2));
                assignmentErrors.push(errorMsg);
                logger.error('Failed to insert assignment questions', {
                  endpoint: '/api/admin/courses/[id]',
                  courseId,
                  assignmentId: insertedAssignment.id,
                  error: questionsError.message
                });
              } else {
                const insertedCount = insertedQuestions?.length || 0;
                if (insertedCount === questionsToInsert.length) {
                  console.log(`   ✅ [API] Successfully inserted ${insertedCount} question(s) for assignment ${insertedAssignment.id}`);
                } else {
                  const errorMsg = `Only ${insertedCount} of ${questionsToInsert.length} questions were inserted for assignment "${assignment.title}"`;
                  console.warn(`   ⚠️ [API] ${errorMsg}`);
                  assignmentErrors.push(errorMsg);
                }
              }
            } else {
              console.log(`   ℹ️ [API] No questions to insert for assignment "${assignment.title}"`);
            }
            
            // Verify assignment was actually saved by querying it back
            if (insertedAssignment?.id) {
              const { data: verifyAssignment, error: verifyError } = await supabaseAdmin
                .from('assignments')
                .select('id, title, course_id, config')
                .eq('id', insertedAssignment.id)
                .single();
              
              if (verifyError || !verifyAssignment) {
                const errorMsg = `Assignment "${assignment.title}" was inserted but could not be verified in database`;
                console.error(`   ❌ [API] ${errorMsg}`, verifyError);
                assignmentErrors.push(errorMsg);
              } else {
                console.log(`   ✅ [API] Verified assignment "${assignment.title}" exists in database with ID: ${verifyAssignment.id}`);
              }
            }
           
          } catch (error: any) {
            const errorMsg = `Exception while processing assignment "${assignment.title}": ${error instanceof Error ? error.message : String(error)}`;
            console.error(`   ❌ [API] ${errorMsg}`);
            assignmentErrors.push(errorMsg);
            logger.warn('Exception while processing assignment (non-critical)', {
              endpoint: '/api/admin/courses/[id]',
              assignmentId: assignment.id,
              assignmentTitle: assignment.title,
            }, error instanceof Error ? error : new Error(String(error)));
            continue;
          }
        }
        
        // Log final results
        console.log(`✅ [API] Completed processing ${assignmentsToProcess.length} assignment(s) for course ${courseId}`);
        console.log(`   ✅ Successfully saved: ${assignmentSuccesses.length} assignment(s)`, assignmentSuccesses);
        if (assignmentErrors.length > 0) {
          console.error(`   ❌ Failed to save: ${assignmentErrors.length} assignment(s)`, assignmentErrors);
        }
        
        // #region agent log
        await logToFile({location:'route.ts:1786',message:'Assignment processing completed',data:{totalProcessed:assignmentsToProcess.length,successCount:assignmentSuccesses.length,errorCount:assignmentErrors.length,successes:assignmentSuccesses,errors:assignmentErrors},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'});
        // #endregion
      } else {
        console.log('ℹ️ [API] No assignments to insert (array is empty)');
        // #region agent log
        await logToFile({location:'route.ts:1792',message:'No assignments to insert - array is empty',data:{courseId,assignmentsLength:assignmentsToProcess.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'});
        // #endregion
      }
    } else {
      console.warn('⚠️ [API] Assignments not provided or not an array, skipping assignment processing');
      // #region agent log
      await logToFile({location:'route.ts:1795',message:'Assignments not provided or not array',data:{hasAssignments:!!assignmentsToProcess,isArray:Array.isArray(assignmentsToProcess),assignmentsType:typeof assignmentsToProcess,courseId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'});
      // #endregion
    }

    // Update course schedules if provided
    if (scheduling && scheduling.release_type) {
      // Delete existing schedules
      await supabaseAdmin
        .from('course_schedules')
        .delete()
        .eq('course_id', courseId);

      // Create new schedules if chapters exist
      const { data: courseChapters } = await supabaseAdmin
        .from('chapters')
        .select('id, order_index, release_date')
        .eq('course_id', courseId)
         
        .order('order_index', { ascending: true }) as any;

      if (courseChapters && courseChapters.length > 0 && scheduling.start_date) {
        const startDate = new Date(scheduling.start_date);
         
        const schedulesToInsert = courseChapters.map((chapter: any, index: number) => {
          const releaseDate = new Date(startDate);
          if (scheduling.release_type === 'Weekly') {
            releaseDate.setDate(startDate.getDate() + (index * 7));
          } else if (scheduling.release_type === 'Daily') {
            releaseDate.setDate(startDate.getDate() + index);
          } else if (scheduling.release_type === 'Bi-weekly') {
            releaseDate.setDate(startDate.getDate() + (index * 14));
          }

          return {
            course_id: courseId,
            chapter_id: chapter.id,
            release_type: scheduling.release_type,
            release_date: releaseDate.toISOString(),
            next_release: index < courseChapters.length - 1 ? new Date(releaseDate.getTime() + (scheduling.release_type === 'Weekly' ? 7 : scheduling.release_type === 'Daily' ? 1 : 14) * 24 * 60 * 60 * 1000).toISOString() : null
          };
        });

        const { error: schedulesError } = await supabaseAdmin
          .from('course_schedules')
          .insert(schedulesToInsert);

        if (schedulesError) {
          console.error('Error updating course schedules:', schedulesError);
        }
      }
    }

    // Update course totals after all content is saved
    const { data: finalChapters } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .eq('course_id', courseId) as any;
    
    if (finalChapters && finalChapters.length > 0) {
      const chapterIds = finalChapters.map((ch: any) => ch.id);
      
      // Count content
      const [
        { count: videosCount },
        { count: materialsCount },
        { count: contentsCount },
        { count: assignmentsCount }
      ] = await Promise.all([
        supabaseAdmin
          .from('videos')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds),
        supabaseAdmin
          .from('materials')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds),
        supabaseAdmin
          .from('chapter_contents')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds),
        supabaseAdmin
          .from('assignments')
          .select('id', { count: 'exact', head: true })
          .eq('course_id', courseId)
      ]);

      // Update course with accurate totals
      await supabaseAdmin
        .from('courses')
        .update({
          num_chapters: finalChapters.length,
          total_chapters: finalChapters.length,
          total_videos: videosCount || 0,
          total_materials: materialsCount || 0,
          total_assignments: assignmentsCount || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', courseId);
      
      console.log(`✅ Updated course totals:`, {
        chapters: finalChapters.length,
        videos: videosCount || 0,
        materials: materialsCount || 0,
        assignments: assignmentsCount || 0
      });
    }

    // Fetch updated course (without relationships to avoid schema issues)
    const { data: updatedCourse, error: fetchError } = await supabaseAdmin
      .from('courses')
      .select('id, course_name, title, name, description, subject, grade, status, is_published, school_id, created_by, created_at, updated_at, thumbnail_url, duration_weeks, prerequisites_course_ids, prerequisites_text, difficulty_level, total_chapters, num_chapters, total_videos, total_materials, total_assignments, release_type')
      .eq('id', courseId)
       
      .single() as any;

    if (fetchError) {
      console.error('❌ Error fetching updated course:', fetchError);
    }

    // Fetch course_access separately
     
    let courseAccess: any[] = [];
    try {
      const { data: accessData, error: accessError } = await supabaseAdmin
        .from('course_access')
        .select('id, course_id, school_id, grade')
         
        .eq('course_id', courseId) as any;

      if (!accessError && accessData) {
        courseAccess = accessData;
        
        // Fetch school names separately
         
        const schoolIds = Array.from(new Set(accessData.map((a: any) => a.school_id).filter(Boolean)));
        if (schoolIds.length > 0) {
          const { data: schoolsData, error: schoolsError } = await supabaseAdmin
            .from('schools')
            .select('id, name')
             
            .in('id', schoolIds) as any;
          
          if (!schoolsError && schoolsData) {
             
            const schoolsMap = new Map(schoolsData.map((s: any) => [s.id, s]));
             
            courseAccess = accessData.map((access: any) => ({
              ...access,
              schools: schoolsMap.get(access.school_id) || null
            }));
          }
        }
        
        console.log(`✅ Fetched ${courseAccess.length} course_access entries after update`);
      }
    } catch (accessErr) {
      logger.warn('Exception fetching course_access after update (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      }, accessErr instanceof Error ? accessErr : new Error(String(accessErr)));
    }
    let totalVideos = 0;
    let totalMaterials = 0;
    let totalAssignments = 0;

    let updatedChapterContents: any[] = [];
     
    let chaptersData: any[] | null = null;
    if (updatedCourse) {
      // Count videos
      const { data: fetchedChapters } = await supabaseAdmin
        .from('chapters')
        .select('id')
         
        .eq('course_id', courseId) as any;

      chaptersData = fetchedChapters;
      
      if (chaptersData && chaptersData.length > 0) {
        const chapterIds = chaptersData.map((ch: any) => ch.id);
        const { count: videosCount } = await supabaseAdmin
          .from('videos')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds);
        totalVideos = videosCount || 0;
        
        const { count: materialsCount } = await supabaseAdmin
          .from('materials')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds);
        totalMaterials = materialsCount || 0;

        const { data: contentsFetch } = await supabaseAdmin
          .from('chapter_contents')
          .select('id, chapter_id, content_type, title, content_url, content_text, duration_minutes, storage_path, thumbnail_url, content_label, order_index, created_at, updated_at')
          .in('chapter_id', chapterIds)
           
          .order('order_index', { ascending: true }) as any;
        if (contentsFetch) {
          updatedChapterContents = contentsFetch;
        }
      }
      
      // Count assignments
      const { count: assignmentsCount } = await supabaseAdmin
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId);
      totalAssignments = assignmentsCount || 0;
    }

    // Map database schema
    const mappedCourse = updatedCourse ? {
      ...updatedCourse,
      name: updatedCourse.course_name || updatedCourse.name || updatedCourse.title || '',
      total_chapters: updatedCourse.num_chapters || 0,
      total_videos: totalVideos,
      total_materials: totalMaterials,
      total_assignments: totalAssignments,
      release_type: release_type || 'Weekly', // Use provided release_type or default
      status: updatedCourse.is_published ? 'Published' : (updatedCourse.status || 'Draft'),
      course_access: courseAccess, // Use separately fetched course_access
      chapter_contents: (updatedChapterContents || []).map((content: any) => ({
        id: content.id,
        content_id: content.id, // For compatibility
        chapter_id: content.chapter_id,
        content_type: content.content_type,
        title: content.title || '',
        content_url: content.content_url || null,
        content_text: content.content_text || null,
        duration_minutes: content.duration_minutes || null,
        storage_path: content.storage_path || null,
        thumbnail_url: content.thumbnail_url || null,
        content_label: content.content_label || null,
        order_index: content.order_index || 0,
        created_at: content.created_at,
        updated_at: content.updated_at,
      }))
    } : course;
    
    console.log('✅ Returning updated course:', {
      id: mappedCourse.id,
      name: mappedCourse.name,
      course_access_count: mappedCourse.course_access?.length || 0
    });

    // Invalidate cache after update
    invalidateCache(CacheKeys.courseMetadata(courseId));

    // Include assignment processing results in response if assignments were processed
    const responseData: any = { 
      course: mappedCourse, 
      message: 'Course updated successfully' 
    };
    
    // Add assignment processing results if they exist (from the assignment processing loop)
    // Note: assignmentErrors and assignmentSuccesses are scoped to the assignment processing block
    // We'll check if assignments were provided and log the results
    if (assignments && Array.isArray(assignments) && assignments.length > 0) {
      // We can't access assignmentErrors/assignmentSuccesses here as they're scoped
      // But we can add a note that assignments were processed
      responseData.assignmentsProcessed = assignments.length;
    }
    
    const successResponse = NextResponse.json(responseData);
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/admin/courses/[id]', {
      endpoint: '/api/admin/courses/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]' },
      'Failed to update course'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE - Delete a course
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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
    );
  }
  try {
    const { id: courseId } = await params;

    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    logger.info('Starting course deletion', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
      userId: adminCheck.userId,
    });

    // 1. Verify course exists before deletion
    const { data: courseExists, error: courseCheckError } = await supabaseAdmin
      .from('courses')
      .select('id, name, course_name')
      .eq('id', courseId)
      .single() as any;

    if (courseCheckError || !courseExists) {
      logger.warn('Course not found for deletion', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: courseCheckError?.message,
      });
      const errorResponse = NextResponse.json(
        { error: 'Course not found', details: `Course with ID ${courseId} does not exist` },
        { status: 404 }
      );
      ensureCsrfToken(errorResponse, request);
      return errorResponse;
    }

    logger.info('Course found, proceeding with deletion', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
      courseName: courseExists.name || courseExists.course_name,
    });

    // 2. Clean up storage files BEFORE deleting course record
    // This ensures we can still query related tables to find storage paths
    logger.info('Starting storage cleanup', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });

    const storageCleanupResult = await cleanupCourseStorage(courseId, 'course-files');

    if (!storageCleanupResult.success) {
      // Log warning but continue with deletion
      // Storage cleanup failure shouldn't block course deletion
      logger.warn('Storage cleanup had failures (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        deletedCount: storageCleanupResult.deletedCount,
        failedPaths: storageCleanupResult.failedPaths,
      });
    } else {
      logger.info('Storage cleanup completed successfully', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        deletedCount: storageCleanupResult.deletedCount,
      });
    }

    // 3. Explicitly delete all related data in reverse dependency order
    // This ensures deletion even if CASCADE constraints are missing or not working
    logger.info('Starting explicit deletion of related course data', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });

    const deletionResults: Record<string, { count: number; error?: string }> = {};

    // Get all chapter IDs for this course first (needed for cascading deletes)
    const { data: courseChapters } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .eq('course_id', courseId) as any;
    
    const chapterIds = courseChapters?.map((ch: { id: string }) => ch.id) || [];
    logger.info('Found chapters for course', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
      chapterCount: chapterIds.length,
    });

    // Get all assignment IDs for this course (needed for deleting questions)
    const { data: courseAssignments } = await supabaseAdmin
      .from('assignments')
      .select('id')
      .eq('course_id', courseId) as any;
    
    const assignmentIds = courseAssignments?.map((a: { id: string }) => a.id) || [];
    logger.info('Found assignments for course', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
      assignmentCount: assignmentIds.length,
    });

    // 3.1. Delete assignment_questions (via assignment_id)
    if (assignmentIds.length > 0) {
      logger.info('Deleting assignment questions', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        assignmentCount: assignmentIds.length,
      });
      const { count: questionsCount, error: questionsError } = await supabaseAdmin
        .from('assignment_questions')
        .delete()
        .in('assignment_id', assignmentIds)
        .select('*', { count: 'exact', head: true }) as any;
      
      deletionResults.assignment_questions = {
        count: questionsCount || 0,
        error: questionsError?.message,
      };
      
      if (questionsError) {
        logger.warn('Error deleting assignment questions (non-critical)', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          error: questionsError.message,
        });
      } else {
        logger.info('Assignment questions deleted', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          count: questionsCount || 0,
        });
      }
    } else {
      deletionResults.assignment_questions = { count: 0 };
      logger.info('No assignment questions to delete', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      });
    }

    // 3.2. Delete assignments (via course_id)
    logger.info('Deleting assignments', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });
    const { count: assignmentsCount, error: assignmentsError } = await supabaseAdmin
      .from('assignments')
      .delete()
      .eq('course_id', courseId)
      .select('*', { count: 'exact', head: true }) as any;
    
    deletionResults.assignments = {
      count: assignmentsCount || 0,
      error: assignmentsError?.message,
    };
    
    if (assignmentsError) {
      logger.warn('Error deleting assignments (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: assignmentsError.message,
      });
    } else {
      logger.info('Assignments deleted', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        count: assignmentsCount || 0,
      });
    }

    // 3.3. Delete chapter_contents (via chapter_id)
    if (chapterIds.length > 0) {
      logger.info('Deleting chapter contents', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        chapterCount: chapterIds.length,
      });
      const { count: contentsCount, error: contentsError } = await supabaseAdmin
        .from('chapter_contents')
        .delete()
        .in('chapter_id', chapterIds)
        .select('*', { count: 'exact', head: true }) as any;
      
      deletionResults.chapter_contents = {
        count: contentsCount || 0,
        error: contentsError?.message,
      };
      
      if (contentsError) {
        logger.warn('Error deleting chapter contents (non-critical)', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          error: contentsError.message,
        });
      } else {
        logger.info('Chapter contents deleted', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          count: contentsCount || 0,
        });
      }
    } else {
      deletionResults.chapter_contents = { count: 0 };
      logger.info('No chapter contents to delete', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      });
    }

    // 3.4. Delete videos (via chapter_id)
    if (chapterIds.length > 0) {
      logger.info('Deleting videos', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        chapterCount: chapterIds.length,
      });
      const { count: videosCount, error: videosError } = await supabaseAdmin
        .from('videos')
        .delete()
        .in('chapter_id', chapterIds)
        .select('*', { count: 'exact', head: true }) as any;
      
      deletionResults.videos = {
        count: videosCount || 0,
        error: videosError?.message,
      };
      
      if (videosError) {
        logger.warn('Error deleting videos (non-critical)', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          error: videosError.message,
        });
      } else {
        logger.info('Videos deleted', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          count: videosCount || 0,
        });
      }
    } else {
      deletionResults.videos = { count: 0 };
      logger.info('No videos to delete', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      });
    }

    // 3.5. Delete materials (via chapter_id)
    if (chapterIds.length > 0) {
      logger.info('Deleting materials', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        chapterCount: chapterIds.length,
      });
      const { count: materialsCount, error: materialsError } = await supabaseAdmin
        .from('materials')
        .delete()
        .in('chapter_id', chapterIds)
        .select('*', { count: 'exact', head: true }) as any;
      
      deletionResults.materials = {
        count: materialsCount || 0,
        error: materialsError?.message,
      };
      
      if (materialsError) {
        logger.warn('Error deleting materials (non-critical)', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          error: materialsError.message,
        });
      } else {
        logger.info('Materials deleted', {
          endpoint: '/api/admin/courses/[id]',
          courseId,
          count: materialsCount || 0,
        });
      }
    } else {
      deletionResults.materials = { count: 0 };
      logger.info('No materials to delete', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      });
    }

    // 3.6. Delete chapters (via course_id)
    logger.info('Deleting chapters', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });
    const { count: chaptersCount, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .delete()
      .eq('course_id', courseId)
      .select('*', { count: 'exact', head: true }) as any;
    
    deletionResults.chapters = {
      count: chaptersCount || 0,
      error: chaptersError?.message,
    };
    
    if (chaptersError) {
      logger.warn('Error deleting chapters (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: chaptersError.message,
      });
    } else {
      logger.info('Chapters deleted', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        count: chaptersCount || 0,
      });
    }

    // 3.7. Delete course_access (via course_id)
    logger.info('Deleting course access records', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });
    const { count: accessCount, error: accessError } = await supabaseAdmin
      .from('course_access')
      .delete()
      .eq('course_id', courseId)
      .select('*', { count: 'exact', head: true }) as any;
    
    deletionResults.course_access = {
      count: accessCount || 0,
      error: accessError?.message,
    };
    
    if (accessError) {
      logger.warn('Error deleting course access (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: accessError.message,
      });
    } else {
      logger.info('Course access records deleted', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        count: accessCount || 0,
      });
    }

    // 3.8. Delete course_schedules (via course_id)
    logger.info('Deleting course schedules', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });
    const { count: schedulesCount, error: schedulesError } = await supabaseAdmin
      .from('course_schedules')
      .delete()
      .eq('course_id', courseId)
      .select('*', { count: 'exact', head: true }) as any;
    
    deletionResults.course_schedules = {
      count: schedulesCount || 0,
      error: schedulesError?.message,
    };
    
    if (schedulesError) {
      logger.warn('Error deleting course schedules (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: schedulesError.message,
      });
    } else {
      logger.info('Course schedules deleted', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        count: schedulesCount || 0,
      });
    }

    // 3.9. Delete student_courses (via course_id)
    logger.info('Deleting student course enrollments', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });
    const { count: studentCoursesCount, error: studentCoursesError } = await supabaseAdmin
      .from('student_courses')
      .delete()
      .eq('course_id', courseId)
      .select('*', { count: 'exact', head: true }) as any;
    
    deletionResults.student_courses = {
      count: studentCoursesCount || 0,
      error: studentCoursesError?.message,
    };
    
    if (studentCoursesError) {
      logger.warn('Error deleting student courses (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: studentCoursesError.message,
      });
    } else {
      logger.info('Student course enrollments deleted', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        count: studentCoursesCount || 0,
      });
    }

    // 3.10. Delete course_progress (via course_id)
    logger.info('Deleting course progress records', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });
    const { count: progressCount, error: progressError } = await supabaseAdmin
      .from('course_progress')
      .delete()
      .eq('course_id', courseId)
      .select('*', { count: 'exact', head: true }) as any;
    
    deletionResults.course_progress = {
      count: progressCount || 0,
      error: progressError?.message,
    };
    
    if (progressError) {
      logger.warn('Error deleting course progress (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: progressError.message,
      });
    } else {
      logger.info('Course progress records deleted', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        count: progressCount || 0,
      });
    }

    // 3.11. Delete course_versions (via course_id)
    logger.info('Deleting course versions', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    });
    const { count: versionsCount, error: versionsError } = await supabaseAdmin
      .from('course_versions')
      .delete()
      .eq('course_id', courseId)
      .select('*', { count: 'exact', head: true }) as any;
    
    deletionResults.course_versions = {
      count: versionsCount || 0,
      error: versionsError?.message,
    };
    
    if (versionsError) {
      logger.warn('Error deleting course versions (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: versionsError.message,
      });
    } else {
      logger.info('Course versions deleted', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        count: versionsCount || 0,
      });
    }

    // 3.12. Finally, delete the course record itself
    logger.info('Deleting course record', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
      deletionSummary: deletionResults,
    });

    const { error: deleteError } = await supabaseAdmin
      .from('courses')
      .delete()
      .eq('id', courseId);

    if (deleteError) {
      logger.error('Error deleting course record', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
        error: deleteError.message,
        code: deleteError.code,
        deletionSummary: deletionResults,
      });
      const errorResponse = NextResponse.json(
        { error: 'Failed to delete course', details: deleteError.message },
        { status: 500 }
      );
      ensureCsrfToken(errorResponse, request);
      return errorResponse;
    }

    logger.info('Course record deleted successfully', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
      deletionSummary: deletionResults,
    });

    // 4. Invalidate cache after successful deletion
    try {
      await invalidateCache(CacheKeys.courseMetadata(courseId));
      // Invalidate courses list cache (if it exists)
      // Note: Cache invalidation for list is handled by pattern matching in cache system
      logger.info('Cache invalidated after course deletion', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      });
    } catch (cacheError) {
      // Cache invalidation failure is non-critical
      logger.warn('Cache invalidation failed (non-critical)', {
        endpoint: '/api/admin/courses/[id]',
        courseId,
      }, cacheError instanceof Error ? cacheError : new Error(String(cacheError)));
    }

    // 5. Return success response with deletion summary
    const successResponse = NextResponse.json({
      message: 'Course deleted successfully',
      storageCleanup: {
        deletedFiles: storageCleanupResult.deletedCount,
        failedPaths: storageCleanupResult.failedPaths.length > 0 ? storageCleanupResult.failedPaths : undefined,
      },
      deletedRecords: deletionResults,
    });
    ensureCsrfToken(successResponse, request);
    
    logger.info('Course deletion completed successfully', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
      storageFilesDeleted: storageCleanupResult.deletedCount,
      deletionSummary: deletionResults,
    });

    return successResponse;
  } catch (error) {
    const { id: courseId } = await params;
    logger.error('Unexpected error in DELETE /api/admin/courses/[id]', {
      endpoint: '/api/admin/courses/[id]',
      courseId,
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]' },
      'Failed to delete course'
    );
    const errorResponse = NextResponse.json(errorInfo, { status: errorInfo.status });
    ensureCsrfToken(errorResponse, request);
    return errorResponse;
  }
}


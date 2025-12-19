'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { CheckCircle, AlertCircle, Loader2, ClipboardList } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useCourseProgressStore } from '../../../store/course-progress-store'
import { useToast } from '../../ui/toast'
import { useQueryClient } from '@tanstack/react-query'

interface QuizContentViewerProps {
  content: {
    id: string
    title: string
    content_url?: string
    source?: string
    content_text?: string
    max_score?: number
    auto_grading_enabled?: boolean
  }
  courseId: string
  chapterId: string
  onComplete?: () => void
}

// Debounce utility
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

export default function QuizContentViewer({ 
  content, 
  courseId, 
  chapterId,
  onComplete 
}: QuizContentViewerProps) {
  const router = useRouter()
  const [assignment, setAssignment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<any[]>([])
  const [submission, setSubmission] = useState<any>(null)
  
  const hasCompletedRef = useRef(false)

  // Global progress store
  const { 
    setContentCompleted, 
    isContentCompleted,
    setSavingProgress,
    isSaving 
  } = useCourseProgressStore()

  const toast = useToast()
  const queryClient = useQueryClient()

  const isCompleted = isContentCompleted(content.id)
  const saving = isSaving(content.id)

  // Mark as complete - delegate to parent for database saving
  const handleMarkComplete = useCallback(() => {
    if (hasCompletedRef.current) return
    hasCompletedRef.current = true

    console.log('📝 [QuizViewer] Marking as complete, calling parent onComplete...')
    
    // Call parent's onComplete which handles database saving
    onComplete?.()
    
    // Update local UI state
    setContentCompleted(content.id, chapterId, courseId, true)
    
    console.log('✅ [QuizViewer] Marked as complete')
  }, [content.id, courseId, chapterId, onComplete, setContentCompleted])

  // Debounced version for UI interactions
  const debouncedMarkComplete = useMemo(
    () => debounce(handleMarkComplete, 500),
    [handleMarkComplete]
  )

  useEffect(() => {
    const fetchAssignment = async () => {
      try {
        console.log('🚀 [QuizViewer] Starting assignment fetch...', { contentId: content.id, chapterId })
        
        const startTime = performance.now()
        const { data: { user } } = await supabase.auth.getUser()
        
        let assignmentId: string | null = null
        let assignmentData: any = null

        // Step 1: Get assignment data (optimized)
        if (content.source === 'assignments' && content.id) {
          // Use content data directly (fastest path)
          assignmentId = content.id
          assignmentData = {
            id: content.id,
            title: content.title,
            description: content.content_text || '',
            max_score: content.max_score,
            auto_grading_enabled: content.auto_grading_enabled,
            chapter_id: chapterId,
          }
          console.log('✅ [QuizViewer] Using content data directly')
        } else {
          // Fallback: Query assignments table
          console.log('🔍 [QuizViewer] Querying assignments table...')
          const { data: assignments, error: assignmentError } = await supabase
            .from('assignments')
            .select('id, title, description, max_score, auto_grading_enabled, chapter_id')
            .eq('chapter_id', chapterId)
            .eq('is_published', true)
            .limit(1)

          if (assignmentError) {
            console.error('❌ [QuizViewer] Assignment query error:', assignmentError)
            throw assignmentError
          }

          if (assignments && assignments.length > 0) {
            assignmentData = assignments[0]
            assignmentId = assignments[0].id
            console.log('✅ [QuizViewer] Found assignment via chapter query')
          }
        }

        if (!assignmentId || !assignmentData) {
          console.log('⚠️ [QuizViewer] No assignment found')
          setLoading(false)
          return
        }

        setAssignment(assignmentData)

        // Step 2: Parallel fetch of questions, submission, and progress (PERFORMANCE BOOST)
        console.log('🔄 [QuizViewer] Fetching questions, submission, and progress in parallel...')
        
        const promises = [
          // Fetch questions (only essential fields for performance)
          supabase
            .from('assignment_questions')
            .select('id, question_text, question_type, options, marks')
            .eq('assignment_id', assignmentId)
            .order('created_at', { ascending: true }),
          
          // Fetch submission if user exists
          user ? supabase
            .from('submissions')
            .select('id, status, score, submitted_at')
            .eq('assignment_id', assignmentId)
            .eq('student_id', user.id)
            .maybeSingle() : Promise.resolve({ data: null, error: null }),
          
          // Check progress if user exists
          user ? supabase
            .from('student_progress')
            .select('is_completed')
            .eq('student_id', user.id)
            .eq('content_id', content.id)
            .maybeSingle() : Promise.resolve({ data: null, error: null })
        ]

        const [questionsResult, submissionResult, progressResult] = await Promise.all(promises)

        // Process results
        if (questionsResult.data && Array.isArray(questionsResult.data)) {
          setQuestions(questionsResult.data)
          console.log(`✅ [QuizViewer] Loaded ${questionsResult.data.length} questions`)
        }

        if (submissionResult.data) {
          setSubmission(submissionResult.data)
          if (!hasCompletedRef.current) {
            setContentCompleted(content.id, chapterId, courseId, true)
            hasCompletedRef.current = true
          }
          console.log('✅ [QuizViewer] Found existing submission')
        }

        if (progressResult.data && 'is_completed' in progressResult.data && progressResult.data.is_completed) {
          setContentCompleted(content.id, chapterId, courseId, true)
          hasCompletedRef.current = true
          console.log('✅ [QuizViewer] Found existing progress')
        }

        const endTime = performance.now()
        console.log(`⚡ [QuizViewer] Assignment loaded in ${Math.round(endTime - startTime)}ms`)

      } catch (error) {
        console.error('❌ [QuizViewer] Error fetching assignment:', error)
      } finally {
        setLoading(false)
      }
    }

    if (chapterId) {
      fetchAssignment()
    } else {
      setLoading(false)
    }
  }, [content.id, chapterId, setContentCompleted])

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center py-8 flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" aria-hidden="true" />
          <span className="text-gray-600">Loading assignment...</span>
          <span className="text-xs text-gray-400 mt-1">This should only take a moment</span>
        </div>
      </Card>
    )
  }

  if (!assignment) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" aria-hidden="true" />
          <p className="text-gray-500">No quiz available for this content</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h2 className="text-2xl font-bold">{content.title || assignment?.title || 'Assignment'}</h2>
        </div>
        
        {/* Status badges */}
        <div className="flex items-center gap-2">
          {submission && (
            <Badge 
              className={submission.status === 'graded' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
              role="status"
              aria-label={submission.status === 'graded' ? 'Assignment graded' : 'Assignment submitted'}
            >
              {submission.status === 'graded' ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                  Graded: {submission.score}/{assignment.max_score}
                </>
              ) : (
                'Submitted'
              )}
            </Badge>
          )}
          
          {(isCompleted || saving) && !submission && (
            <Badge 
              variant="secondary" 
              className={saving ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
              role="status"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" /> Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" /> Viewed
                </>
              )}
            </Badge>
          )}
        </div>
      </div>

      {(assignment?.description || content.content_text) && (
        <div 
          className="prose prose-lg max-w-none mb-6"
          dangerouslySetInnerHTML={{ 
            __html: assignment?.description || content.content_text || '' 
          }}
          aria-label="Assignment description"
        />
      )}
      
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg" role="region" aria-label="Assignment details">
          {(() => {
            const calculatedMaxScore = questions.reduce((sum, q) => sum + (q.marks || 1), 0)
            const displayMaxScore = calculatedMaxScore > 0 ? calculatedMaxScore : assignment?.max_score
            return displayMaxScore ? (
              <p className="text-sm text-blue-800">
                <strong>Maximum Score:</strong> {displayMaxScore} points
              </p>
            ) : null
          })()}
          {assignment?.auto_grading_enabled && (
            <p className="text-sm text-blue-800 mt-1">
              <strong>Auto-grading:</strong> Enabled
            </p>
          )}
          {questions.length > 0 && (
            <p className="text-sm text-blue-800 mt-1">
              <strong>Questions:</strong> {questions.length}
            </p>
          )}
        </div>

        {assignment?.id && (
          <Button 
            className="w-full transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]" 
            size="lg"
            onClick={() => {
              // Mark as viewed when starting
              if (!hasCompletedRef.current) {
                debouncedMarkComplete()
              }
              router.push(`/student/assignments/${assignment.id}?courseId=${courseId}&chapterId=${chapterId}`)
            }}
            aria-label={submission ? 'View your submission' : questions.length > 0 ? 'Start this assignment' : 'View assignment details'}
          >
            <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
            {submission ? 'View Submission' : questions.length > 0 ? 'Start Assignment' : 'View Assignment'}
          </Button>
        )}
        
        {questions.length > 0 && !submission && (
          <div className="mt-6">
            <h3 className="font-semibold mb-3">Preview Questions:</h3>
            <div className="space-y-3" role="list" aria-label="Question preview">
              {questions.slice(0, 3).map((q: any, idx: number) => (
                <div key={q.id} className="p-3 bg-gray-50 rounded-lg" role="listitem">
                  <p className="text-sm font-medium">
                    {idx + 1}. {q.question_text}
                  </p>
                  {q.question_type === 'MCQ' && q.options && (
                    <div className="mt-2 text-xs text-gray-600">
                      Options: {q.options.length} choices
                    </div>
                  )}
                </div>
              ))}
              {questions.length > 3 && (
                <p className="text-sm text-gray-500 text-center">
                  + {questions.length - 3} more questions
                </p>
              )}
            </div>
          </div>
        )}

        {/* Manual complete button if not already completed */}
        {!isCompleted && !submission && (
          <div className="mt-4 pt-4 border-t">
            <Button 
              variant="outline"
              onClick={debouncedMarkComplete}
              disabled={saving}
              className="w-full"
              aria-label="Mark this assignment as viewed"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark as Viewed
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { CheckCircle, Loader2, Clock } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useCourseProgressStore } from '../../../store/course-progress-store'
import { useToast } from '../../ui/toast'
import { useQueryClient } from '@tanstack/react-query'

interface TextContentViewerProps {
  content: {
    id: string
    title: string
    content_text?: string
    content_url?: string
    chapter_id?: string
    course_id?: string
  }
  courseId?: string
  chapterId?: string
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

export default function TextContentViewer({ 
  content, 
  courseId,
  chapterId,
  onComplete 
}: TextContentViewerProps) {
  const textContent = content.content_text || 'No content available.'
  const [timeRemaining, setTimeRemaining] = useState(15)
  const [timerStarted, setTimerStarted] = useState(false)
  
  const hasCompletedRef = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)

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

  // Resolve IDs
  const resolvedCourseId = courseId || content.course_id || ''
  const resolvedChapterId = chapterId || content.chapter_id || ''

  // Check server for existing completion
  useEffect(() => {
    const checkCompletion = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: progress } = await supabase
          .from('student_progress')
          .select('is_completed')
          .eq('student_id', user.id)
          .eq('content_id', content.id)
          .maybeSingle()

        if (progress?.is_completed) {
          setContentCompleted(content.id, resolvedChapterId, resolvedCourseId, true)
          hasCompletedRef.current = true
        }
      } catch (error) {
        console.warn('Failed to check completion:', error)
      }
    }

    checkCompletion()
  }, [content.id, resolvedChapterId, resolvedCourseId, setContentCompleted])

  // Mark as complete - delegate to parent for database saving
  const handleMarkComplete = useCallback(
    debounce(() => {
      if (hasCompletedRef.current) return
      hasCompletedRef.current = true

      console.log('📖 [TextViewer] Marking as complete, calling parent onComplete...')
      
      // Call parent's onComplete which handles database saving
      onComplete?.()
      
      // Update local UI state
      setContentCompleted(content.id, resolvedChapterId, resolvedCourseId, true)
      
      console.log('✅ [TextViewer] Marked as complete')
    }, 500),
    [content.id, resolvedCourseId, resolvedChapterId, onComplete, setContentCompleted]
  )

  // Start timer when content becomes visible
  useEffect(() => {
    if (isCompleted || hasCompletedRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !timerStarted) {
          setTimerStarted(true)
        }
      },
      { threshold: 0.5 }
    )

    if (contentRef.current) {
      observer.observe(contentRef.current)
    }

    return () => observer.disconnect()
  }, [isCompleted, timerStarted])

  // Countdown timer
  useEffect(() => {
    if (!timerStarted || isCompleted || hasCompletedRef.current) return

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          handleMarkComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [timerStarted, isCompleted, handleMarkComplete])

  return (
    <Card className="p-6" ref={contentRef}>
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-2xl font-bold">{content.title}</h2>
        <div className="flex items-center gap-2">
          {/* Timer indicator */}
          {!isCompleted && timerStarted && timeRemaining > 0 && (
            <Badge 
              variant="outline" 
              className="text-gray-600"
              role="timer"
              aria-label={`Auto-complete in ${timeRemaining} seconds`}
            >
              <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
              {timeRemaining}s
            </Badge>
          )}
          
          {/* Completion status */}
          {(isCompleted || saving) && (
            <Badge 
              variant="secondary" 
              className={saving ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
              role="status"
              aria-label={saving ? 'Saving progress' : 'Content completed'}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" /> Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" /> Read
                </>
              )}
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <article 
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: textContent }}
        aria-label="Lesson content"
      />

      {/* Manual complete button */}
      {!isCompleted && !hasCompletedRef.current && (
        <div className="mt-6 pt-6 border-t">
          <Button 
            onClick={() => {
              setTimeRemaining(0)
              handleMarkComplete()
            }} 
            className="flex items-center gap-2"
            disabled={saving}
            aria-label="Mark this lesson as complete"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Mark as Complete
          </Button>
          <p className="text-xs text-gray-500 mt-2">
            Or wait {timeRemaining > 0 ? `${timeRemaining} seconds` : 'a moment'} for auto-completion
          </p>
        </div>
      )}
    </Card>
  )
}













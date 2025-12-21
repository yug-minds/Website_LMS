'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Download, File, CheckCircle, Loader2, Clock, ExternalLink } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useCourseProgressStore } from '../../../store/course-progress-store'
import { useToast } from '../../ui/toast'
import { useQueryClient } from '@tanstack/react-query'

interface PDFContentViewerProps {
  content: {
    id: string
    title: string
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

export default function PDFContentViewer({ 
  content, 
  courseId,
  chapterId,
  onComplete 
}: PDFContentViewerProps) {
  const [timeRemaining, setTimeRemaining] = useState(15)
  const [timerStarted, setTimerStarted] = useState(false)
  const [pdfLoaded, setPdfLoaded] = useState(false)
  
  const hasCompletedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
  const handleMarkComplete = useCallback(() => {
    if (hasCompletedRef.current) return
    hasCompletedRef.current = true

    console.log('📄 [PDFViewer] Marking as complete, calling parent onComplete...')
    
    // Call parent's onComplete which handles database saving
    onComplete?.()
    
    // Update local UI state
    setContentCompleted(content.id, resolvedChapterId, resolvedCourseId, true)
    
    console.log('✅ [PDFViewer] Marked as complete')
  }, [content.id, resolvedCourseId, resolvedChapterId, onComplete, setContentCompleted])

  // Debounced version for UI interactions
  const debouncedMarkComplete = useMemo(
    () => debounce(handleMarkComplete, 500),
    [handleMarkComplete]
  )

  // Start timer when PDF loads
  useEffect(() => {
    if (pdfLoaded && !timerStarted && !isCompleted && !hasCompletedRef.current) {
      setTimerStarted(true)
    }
  }, [pdfLoaded, timerStarted, isCompleted])

  // Countdown timer
  useEffect(() => {
    if (!timerStarted || isCompleted || hasCompletedRef.current) return

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          debouncedMarkComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [timerStarted, isCompleted, debouncedMarkComplete])

  return (
    <Card className="p-6" ref={containerRef}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <File className="h-5 w-5 text-red-600" aria-hidden="true" />
          <h2 className="text-xl font-semibold">{content.title}</h2>
        </div>
        
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
              aria-label={saving ? 'Saving progress' : 'Document viewed'}
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
          
          {/* Download button */}
          {content.content_url && (
            <a 
              href={content.content_url} 
              download 
              target="_blank" 
              rel="noopener noreferrer"
              aria-label={`Download ${content.title}`}
            >
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Download
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* PDF Viewer */}
      {content.content_url ? (
        <div className="border rounded-lg overflow-hidden bg-gray-100">
          <iframe
            src={content.content_url}
            className="w-full h-[600px]"
            title={content.title}
            onLoad={() => setPdfLoaded(true)}
            aria-label={`PDF document: ${content.title}`}
          />
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
          <File className="h-16 w-16 mx-auto mb-4 text-gray-300" aria-hidden="true" />
          <p>PDF not available</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        {/* Open in new tab */}
        {content.content_url && (
          <a 
            href={content.content_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            aria-label="Open PDF in new tab"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open in new tab
          </a>
        )}

        {/* Manual complete button */}
        {!isCompleted && !hasCompletedRef.current && (
          <Button 
            onClick={() => {
              setTimeRemaining(0)
              debouncedMarkComplete()
            }} 
            className="flex items-center gap-2"
            disabled={saving}
            aria-label="Mark this document as viewed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Mark as Complete
          </Button>
        )}
      </div>

      {/* Timer hint */}
      {!isCompleted && !hasCompletedRef.current && timerStarted && timeRemaining > 0 && (
        <p className="text-xs text-gray-500 mt-2 text-right">
          Auto-completing in {timeRemaining} seconds...
        </p>
      )}
    </Card>
  )
}













'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CourseHeader from './CourseHeader'
import CourseSidebar from './CourseSidebar'
import VideoContentViewer from './VideoContentViewer'
import TextContentViewer from './TextContentViewer'
import PDFContentViewer from './PDFContentViewer'
import QuizContentViewer from './QuizContentViewer'
import ErrorBoundary from './ErrorBoundary'
import { useCourseWithRealtime, useCourseChapters, useChapterContents, useCourseMaterials } from '../../../hooks/useStudentData'
import { Badge } from '../../ui/badge'
import { Progress } from '../../ui/progress'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { useCourseProgressStore } from '../../../store/course-progress-store'
import { useToast } from '../../ui/toast'

import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle,
  FileText,
  Loader2,
  BookOpen,
  Play
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'

interface CoursePlayerProps {
  courseId: string
}

export default function CoursePlayer({ courseId: propCourseId }: CoursePlayerProps) {
  const router = useRouter()
  const params = useParams()
  const chapterId = params?.chapterId as string | undefined
  const contentId = params?.contentId as string | undefined
  const courseId = propCourseId || (params?.courseId as string | undefined)
  
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Use empty string as fallback to ensure hooks are always called with valid parameters
  const { data: course, isLoading: courseLoading, error: courseError } = useCourseWithRealtime(courseId || '')
  const { data: chapters, isLoading: chaptersLoading, error: chaptersError } = useCourseChapters(courseId || '')
  const { data: contents, isLoading: contentsLoading, error: contentsError } = useChapterContents(chapterId || '', courseId || undefined)
  const [currentContentIndex, setCurrentContentIndex] = useState(0)
  const [retryCount, setRetryCount] = useState(0)

  // Global progress store for optimistic UI
  const { 
    isContentCompleted, 
    setContentCompleted,
    setChapterCompleted,
    isChapterCompleted
  } = useCourseProgressStore()
  
  const toast = useToast()

  // Find current chapter
  const currentChapter = chapters?.find((c: any) => c.id === chapterId)
  
  // Get current content - prioritize contentId if available, otherwise use index
  let currentContent = null
  if (contents && Array.isArray(contents) && contents.length > 0) {
    if (contentId) {
      // Find content by ID (most reliable when contentId is in URL)
      currentContent = contents.find((c: any) => c.id === contentId) || null
      // If found by ID, update index to match
      if (currentContent) {
        const foundIndex = contents.findIndex((c: any) => c.id === contentId)
        if (foundIndex >= 0 && foundIndex !== currentContentIndex) {
          setCurrentContentIndex(foundIndex)
        }
      }
    }
    // Fallback to index-based selection if contentId not found or not provided
    if (!currentContent) {
      currentContent = contents[currentContentIndex] || null
    }
  } else if (contents && !Array.isArray(contents)) {
    // Handle non-array contents (shouldn't happen, but handle gracefully)
    currentContent = contents?.[currentContentIndex] || null
  }
  
  // Check completion from global store (must be after currentContent is defined)
  const isCompleted = currentContent ? isContentCompleted(currentContent.id) : false

  // Calculate progress - use server-side progress data from API
  // The chapters API already includes progress from course_progress table in is_completed field
  const completedChapters = chapters?.filter((c: any) => {
    // Server-side progress is already included in is_completed field from API
    // Also check local store for optimistic updates
    return c.is_completed === true || isChapterCompleted(c.id)
  }).length || 0
  const totalChapters = chapters?.length || 0
  
  // Sort chapters by order to find next chapter correctly
  const sortedChapters = chapters && chapters.length > 0
    ? [...chapters].sort((a: any, b: any) => {
        const orderA = a.order_number || a.order_index || 0
        const orderB = b.order_number || b.order_index || 0
        return orderA - orderB
      })
    : []
  
  // Find next chapter: first chapter after current one in order
  // Always find the next chapter by order, regardless of completion status
  // This ensures students can always navigate forward
  let nextChapter = null
  if (chapterId && sortedChapters.length > 0) {
    const currentChapterIndex = sortedChapters.findIndex((c: any) => c.id === chapterId)
    if (currentChapterIndex >= 0 && currentChapterIndex < sortedChapters.length - 1) {
      // Get the next chapter in order (regardless of completion or unlock status)
      // Students should be able to navigate to next chapter even if current isn't complete
      nextChapter = sortedChapters[currentChapterIndex + 1]
      console.log(`🔍 [CoursePlayer] Found next chapter:`, {
        currentIndex: currentChapterIndex,
        nextIndex: currentChapterIndex + 1,
        nextChapterId: nextChapter?.id,
        nextChapterName: nextChapter?.name || nextChapter?.title,
        isUnlocked: nextChapter?.is_unlocked,
        isCompleted: nextChapter?.is_completed
      })
    } else if (currentChapterIndex >= 0) {
      console.log(`ℹ️ [CoursePlayer] Current chapter is the last one (index ${currentChapterIndex} of ${sortedChapters.length - 1})`)
    }
  } else if (sortedChapters.length > 0) {
    // If no current chapter, use first chapter
    nextChapter = sortedChapters[0]
  }
  
  const firstChapter = sortedChapters.length > 0 ? sortedChapters[0] : null

  // Debug logging
  useEffect(() => {
    console.log('📚 [CoursePlayer] Debug State:', {
      courseId,
      chapterId,
      contentId,
      courseLoading,
      chaptersLoading,
      contentsLoading,
      courseError: courseError ? {
        message: courseError.message,
        code: (courseError as any)?.code,
        details: (courseError as any)?.details
      } : null,
      chaptersError: chaptersError ? {
        message: chaptersError.message,
        code: (chaptersError as any)?.code,
        details: (chaptersError as any)?.details
      } : null,
      contentsError: contentsError ? {
        message: contentsError.message,
        code: (contentsError as any)?.code,
        details: (contentsError as any)?.details
      } : null,
      chaptersCount: chapters?.length || 0,
      contentsCount: contents?.length || 0,
      hasChapters: !!chapters && chapters.length > 0,
      hasContents: !!contents && contents.length > 0,
      currentContentExists: !!currentContent
    })
    
    if (courseError) {
      console.error('❌ [CoursePlayer] Course Error:', courseError)
    }
    
    if (chaptersError) {
      console.error('❌ [CoursePlayer] Chapters Error:', chaptersError)
    }
    
    if (contentsError) {
      console.error('❌ [CoursePlayer] Contents Error:', contentsError)
    }
    
    if (!chaptersLoading && (!chapters || chapters.length === 0)) {
      console.warn('⚠️ [CoursePlayer] No chapters found after loading completed')
      console.warn('   This may indicate:')
      console.warn('   1. No chapters exist for this course')
      console.warn('   2. Chapters exist but are not published')
      console.warn('   3. RLS policy is blocking access')
      console.warn('   4. Query failed silently')
    }
    
    if (chapterId && !contentsLoading && (!contents || contents.length === 0)) {
      console.warn('⚠️ [CoursePlayer] No contents found for chapter', chapterId)
      console.warn('   This may indicate:')
      console.warn('   1. No contents exist for this chapter')
      console.warn('   2. Contents exist but are not published')
      console.warn('   3. RLS policy is blocking access')
      console.warn('   4. Query failed silently')
    }
  }, [courseId, chapterId, contentId, courseLoading, courseError, chaptersLoading, chaptersError, contentsLoading, contentsError, chapters, contents, currentContent, totalChapters, completedChapters])

  // Update content index when contentId changes (keep in sync)
  useEffect(() => {
    if (contents && Array.isArray(contents) && contentId) {
      const index = contents.findIndex((c: any) => c.id === contentId)
      if (index >= 0 && index !== currentContentIndex) {
        console.log(`🔄 [CoursePlayer] Updating content index to ${index} for contentId ${contentId}`)
        setCurrentContentIndex(index)
      } else if (index < 0) {
        console.warn(`⚠️ [CoursePlayer] Content with ID ${contentId} not found in contents array`)
        console.warn(`   Current chapterId: ${chapterId}`)
        console.warn(`   Available content IDs:`, contents.map((c: any) => c.id))
        
        // If content not found in current chapter, try to find which chapter it belongs to
        if (chapters && Array.isArray(chapters)) {
          console.log(`   Searching other chapters for content ${contentId}...`)
          // This is a fallback - ideally the URL should have the correct chapterId
        }
      }
    } else if (contents && Array.isArray(contents) && !contentId && contents.length > 0) {
      // If no contentId but we have contents, ensure index is valid
      if (currentContentIndex >= contents.length) {
        setCurrentContentIndex(0)
      }
    }
  }, [contentId, contents, currentContentIndex, chapterId, chapters])

  // Auto-navigate to first content when chapter is opened (if no contentId in URL)
  useEffect(() => {
    if (!courseId || !chapterId) return
    
    // Wait for contents to finish loading
    if (contentsLoading) return
    
    // If we have contents but no contentId, navigate to first content
    if (!contentId && contents && contents.length > 0) {
      const firstContent = contents[0]
      if (firstContent && firstContent.id) {
        // Only navigate if we're not already on a content page
        const currentPath = window.location.pathname
        if (!currentPath.includes('/content/')) {
          console.log(`🔄 [CoursePlayer] Auto-navigating to first content: ${firstContent.id}`)
          router.push(
            `/student/my-courses/${courseId}/chapters/${chapterId}/content/${firstContent.id}`,
            { scroll: false }
          )
        }
      }
    }
  }, [chapterId, contentId, contents, contentsLoading, courseId, router])

  // Sync completion status from server to global store
  useEffect(() => {
    const syncCompletion = async () => {
      if (!currentContent || !chapterId || !courseId) return
      
      // Skip if already marked complete in store
      if (isContentCompleted(currentContent.id)) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Try to fetch progress from server
      const { data: progress, error: progressError } = await supabase
        .from('student_progress')
        .select('is_completed')
        .eq('student_id', user.id)
        .eq('content_id', currentContent.id)
        .maybeSingle()

      if (progressError) {
        // Log but don't block - 406 or other errors are non-critical
        if (progressError.code !== 'PGRST301' && !progressError.message?.includes('406')) {
          console.warn('⚠️ [CoursePlayer] Error checking completion status (non-critical):', progressError)
        }
      } else if (progress?.is_completed) {
        // Sync server state to global store
        setContentCompleted(currentContent.id, chapterId, courseId, true)
      }
    }

    syncCompletion()
  }, [currentContent, chapterId, courseId, isContentCompleted, setContentCompleted])

  // Check and update chapter completion when contents change
  useEffect(() => {
    if (!contents || !Array.isArray(contents) || !chapterId || !courseId) return

    const checkChapterCompletion = async () => {
      // Check both local store completion AND server-side completion (is_completed field)
      const allContentCompletedLocal = contents.every((content: any) => 
        isContentCompleted(content.id)
      )
      
      const allContentCompletedServer = contents.every((content: any) => 
        content.is_completed === true
      )
      
      const currentlyMarkedComplete = isChapterCompleted(chapterId)
      
      console.log('🔍 [CoursePlayer] Chapter completion check on load:', {
        chapterId,
        totalContents: contents.length,
        completedContentsLocal: contents.filter((c: any) => isContentCompleted(c.id)).length,
        completedContentsServer: contents.filter((c: any) => c.is_completed === true).length,
        allCompletedLocal: allContentCompletedLocal,
        allCompletedServer: allContentCompletedServer,
        currentlyMarkedComplete,
        contentsWithCompletion: contents.map((c: any) => ({
          id: c.id,
          title: c.title,
          localComplete: isContentCompleted(c.id),
          serverComplete: c.is_completed === true
        }))
      })

      // If server shows all content complete but local store doesn't, sync local store
      if (allContentCompletedServer && !allContentCompletedLocal) {
        console.log('🔄 [CoursePlayer] Syncing server completion to local store...')
        contents.forEach((content: any) => {
          if (content.is_completed === true && !isContentCompleted(content.id)) {
            console.log(`📝 [CoursePlayer] Syncing content ${content.id} to local store`)
            setContentCompleted(content.id, chapterId, courseId, true)
          }
        })
      }

      // Mark chapter complete if all content is complete (either local or server)
      const allContentCompleted = allContentCompletedLocal || allContentCompletedServer
      
      if (allContentCompleted && !currentlyMarkedComplete) {
        console.log('🎉 [CoursePlayer] All chapter content completed! Marking chapter as complete.')
        setChapterCompleted(chapterId, courseId, true, 100)
        
        // Also update server-side chapter completion
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            console.log('📝 [CoursePlayer] Updating server-side chapter completion...')
            const response = await fetch('/api/student/simple-progress', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                studentId: user.id,
                courseId,
                chapterId,
                isCompleted: true
              })
            })
            
            if (response.ok) {
              console.log('✅ [CoursePlayer] Chapter completion saved to server')
            } else {
              console.warn('⚠️ [CoursePlayer] Failed to save chapter completion to server')
            }
          }
        } catch (error) {
          console.warn('⚠️ [CoursePlayer] Error saving chapter completion:', error)
        }
      } else if (!allContentCompleted && currentlyMarkedComplete) {
        console.log('⚠️ [CoursePlayer] Chapter marked complete but not all content done. Unmarking.')
        setChapterCompleted(chapterId, courseId, false, 0)
      }
    }

    checkChapterCompletion()
  }, [contents, chapterId, courseId, isContentCompleted, isChapterCompleted, setChapterCompleted, setContentCompleted])

  // Auto-redirect to first chapter if no chapter selected and chapters are loaded
  // This must be called before any conditional returns
  useEffect(() => {
    if (!courseId) return
    if (!chapterId && !chaptersLoading && chapters && chapters.length > 0) {
      const sortedChapters = [...chapters].sort((a: any, b: any) => {
        const orderA = a.order_number || a.order_index || 0
        const orderB = b.order_number || b.order_index || 0
        return orderA - orderB
      })
      const firstChapter = sortedChapters[0]
      
      if (firstChapter) {
        const completedChapters = chapters.filter((c: any) => c.is_completed).length
        // Only auto-redirect if user hasn't started the course yet (no progress)
        if (completedChapters === 0) {
          router.push(`/student/my-courses/${courseId}/chapters/${firstChapter.id}`)
        }
      }
    }
  }, [chapterId, chaptersLoading, chapters, courseId, router])

  const handleNext = () => {
    console.log('🔄 [handleNext] Button clicked', {
      hasContents: !!contents,
      contentsLength: contents?.length || 0,
      currentContentIndex,
      isLastContent: currentContentIndex >= (contents?.length || 0) - 1,
      hasNextChapter: !!nextChapter,
      nextChapterId: nextChapter?.id,
      nextChapterName: nextChapter?.name || nextChapter?.title
    })
    
    if (contents && Array.isArray(contents) && currentContentIndex < contents.length - 1) {
      // Move to next content in current chapter
      const nextIndex = currentContentIndex + 1
      const nextContent = contents[nextIndex]
      if (nextContent && nextContent.id) {
        console.log(`🔄 [handleNext] Navigating to next content: ${nextContent.id}`)
        setCurrentContentIndex(nextIndex)
        router.push(
          `/student/my-courses/${courseId}/chapters/${chapterId}/content/${nextContent.id}`,
          { scroll: false }
        )
      } else {
        console.warn('⚠️ [handleNext] Next content not found or missing ID')
      }
    } else if (nextChapter && nextChapter.id) {
      // Move to next chapter
      console.log(`🔄 [handleNext] Navigating to next chapter: ${nextChapter.id}`)
      router.push(`/student/my-courses/${courseId}/chapters/${nextChapter.id}`)
    } else if (chapterId && sortedChapters.length > 0) {
      // Fallback: Find next chapter by order even if not found by previous logic
      const currentChapterIndex = sortedChapters.findIndex((c: any) => c.id === chapterId)
      if (currentChapterIndex >= 0 && currentChapterIndex < sortedChapters.length - 1) {
        const fallbackNextChapter = sortedChapters[currentChapterIndex + 1]
        if (fallbackNextChapter && fallbackNextChapter.id) {
          console.log(`🔄 [handleNext] Using fallback: Navigating to next chapter by order: ${fallbackNextChapter.id}`)
          router.push(`/student/my-courses/${courseId}/chapters/${fallbackNextChapter.id}`)
          return
        }
      }
      console.warn('⚠️ [handleNext] No next chapter found (current chapter is last)')
    } else {
      const sortedChaptersForLog = chapters && chapters.length > 0
        ? [...chapters].sort((a: any, b: any) => {
            const orderA = a.order_number || a.order_index || 0
            const orderB = b.order_number || b.order_index || 0
            return orderA - orderB
          })
        : []
      console.warn('⚠️ [handleNext] No next content or chapter available', {
        hasContents: !!contents,
        contentsLength: contents?.length || 0,
        currentContentIndex,
        hasNextChapter: !!nextChapter,
        sortedChaptersLength: sortedChaptersForLog.length,
        currentChapterIndex: chapterId ? sortedChaptersForLog.findIndex((c: any) => c.id === chapterId) : -1,
        allChapterIds: sortedChaptersForLog.map((c: any) => ({ id: c.id, name: c.name || c.title, order: c.order_number || c.order_index, is_unlocked: c.is_unlocked }))
      })
      toast.warning('No next chapter available')
    }
  }

  const handlePrevious = () => {
    if (currentContentIndex > 0) {
      const prevIndex = currentContentIndex - 1
      setCurrentContentIndex(prevIndex)
      const prevContent = contents?.[prevIndex]
      if (prevContent) {
        router.push(
          `/student/my-courses/${courseId}/chapters/${chapterId}/content/${prevContent.id}`,
          { scroll: false }
        )
      }
    }
  }

  const handleMarkComplete = useCallback(async () => {
    console.log('🎯 [handleMarkComplete] Starting completion process...', {
      contentId: currentContent?.id,
      chapterId,
      courseId
    })
    
    if (!currentContent || !chapterId || !courseId) {
      console.warn('⚠️ [handleMarkComplete] Missing required data')
      return
    }

    // Get user first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('❌ [handleMarkComplete] No user found')
      toast.error('Please log in to save progress')
      return
    }

    // Update local store for immediate UI feedback
    setContentCompleted(currentContent.id, chapterId, courseId, true)

    // Check if all content in this chapter is now completed
    let allContentCompleted = false
    if (contents && Array.isArray(contents)) {
      allContentCompleted = contents.every((content: any) => 
        content.id === currentContent.id || isContentCompleted(content.id)
      )
      
      console.log('🔍 [handleMarkComplete] Chapter completion check:', {
        totalContents: contents.length,
        allCompleted: allContentCompleted
      })

      if (allContentCompleted) {
        setChapterCompleted(chapterId, courseId, true, 100)
      }
    }

    // ALWAYS save to database - this is the critical fix
    // Save chapter progress to course_progress table (for admin dashboard)
    console.log('📝 [handleMarkComplete] Saving to database...', {
      studentId: user.id,
      courseId,
      chapterId,
      completed: allContentCompleted
    })

    try {
      // Use the new simpler API that directly saves to database
      const response = await fetch('/api/student/save-chapter-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.id,
          courseId,
          chapterId,
          completed: allContentCompleted
        })
      })

      let result
      const responseText = await response.text()
      
      try {
        result = responseText ? JSON.parse(responseText) : {}
      } catch (parseError) {
        console.error('❌ [handleMarkComplete] Failed to parse response:', {
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          responseText: responseText.substring(0, 500), // First 500 chars for debugging
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        })
        result = { 
          error: 'Invalid response format', 
          status: response.status, 
          statusText: response.statusText,
          responseText: responseText.substring(0, 200)
        }
      }
      
      if (!response.ok) {
        console.error('❌ [handleMarkComplete] API error:', {
          status: response.status,
          statusText: response.statusText,
          result: result,
          url: response.url,
          responseText: responseText.substring(0, 500)
        })
        toast.error(`Failed to save progress: ${result?.error || response.statusText || 'Unknown error'}`)
        return
      }

      console.log('✅ [handleMarkComplete] Progress saved to database:', result)

      // Also save content-level progress to student_progress table
      const { error: contentError } = await supabase
        .from('student_progress')
        .upsert({
          student_id: user.id,
          course_id: courseId,
          chapter_id: chapterId,
          content_id: currentContent.id,
          is_completed: true,
          completed_at: new Date().toISOString()
        }, { onConflict: 'student_id,content_id' })

      if (contentError) {
        console.warn('⚠️ [handleMarkComplete] Content progress warning:', contentError)
      } else {
        console.log('✅ [handleMarkComplete] Content progress saved')
      }

      // Show success message
      if (allContentCompleted) {
        toast.success('Chapter completed! 🎉', 3000)
      } else {
        toast.success('Progress saved!', 2000)
      }

    } catch (error) {
      console.error('❌ [handleMarkComplete] Unexpected error:', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error),
        studentId: user.id,
        courseId,
        chapterId,
        allContentCompleted,
        timestamp: new Date().toISOString()
      })
      toast.error(`Failed to save progress: ${error instanceof Error ? error.message : 'Unexpected error'}`)
    }
  }, [currentContent, chapterId, courseId, contents, isContentCompleted, setContentCompleted, setChapterCompleted, toast])

  const renderContentViewer = () => {
    // Show loading state while contents are loading
    if (contentsLoading) {
      return (
        <div className="text-center py-12 text-gray-500">
          <Loader2 className="h-16 w-16 mx-auto mb-4 text-gray-300 animate-spin" />
          <p>Loading content...</p>
        </div>
      )
    }

    // Show error state if there's an error
    if (contentsError) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <p className="text-red-600 mb-2">Error loading content</p>
          <p className="text-sm text-gray-400">{contentsError.message}</p>
          {contentId && (
            <Button
              onClick={() => router.push(`/student/my-courses/${courseId}/chapters/${chapterId}`)}
              className="mt-4"
            >
              Back to Chapter
            </Button>
          )}
        </div>
      )
    }

    // Show message if no contents available
    if (!contents || contents.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <p>No content available for this chapter</p>
          {chapterId && (
            <Button
              onClick={() => router.push(`/student/my-courses/${courseId}/chapters/${chapterId}`)}
              className="mt-4"
              variant="outline"
            >
              Back to Chapter
            </Button>
          )}
        </div>
      )
    }

    // Show message if contentId is specified but content not found
    if (contentId && !currentContent) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <p className="mb-2">Content not found</p>
          <p className="text-sm text-gray-400 mb-4">
            The requested content (ID: {contentId}) could not be found in this chapter.
          </p>
          {contents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm">Available content:</p>
              {contents.map((c: any, idx: number) => (
                <Button
                  key={c.id || idx}
                  onClick={() => router.push(`/student/my-courses/${courseId}/chapters/${chapterId}/content/${c.id}`)}
                  variant="outline"
                  className="mr-2"
                >
                  {c.title || c.name || `Content ${idx + 1}`}
                </Button>
              ))}
            </div>
          )}
        </div>
      )
    }

    // Show message if no current content (shouldn't happen, but handle gracefully)
    if (!currentContent) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <p>No content available</p>
          <p className="text-sm text-gray-400 mt-2">
            {contentId ? `Content ID: ${contentId}` : 'Please select a content item from the sidebar'}
          </p>
        </div>
      )
    }

    const contentType = (currentContent.content_type || '').toLowerCase()

    switch (contentType) {
      case 'video':
      case 'video_link':
        return (
          <VideoContentViewer
            content={currentContent}
            courseId={courseId}
            chapterId={chapterId}
            onComplete={handleMarkComplete}
          />
        )
      case 'text':
      case 'html':
        return (
          <TextContentViewer
            content={currentContent}
            courseId={courseId}
            chapterId={chapterId}
            onComplete={handleMarkComplete}
          />
        )
      case 'pdf':
      case 'file':
        return (
          <PDFContentViewer
            content={currentContent}
            courseId={courseId}
            chapterId={chapterId}
            onComplete={handleMarkComplete}
          />
        )
      case 'quiz':
      case 'assignment':
        return (
          <QuizContentViewer
            content={currentContent}
            courseId={courseId || ''}
            chapterId={chapterId || ''}
            onComplete={handleMarkComplete}
          />
        )
      default:
        return (
          <div className="text-center py-12 text-gray-500">
            <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <p>Unsupported content type: {contentType}</p>
          </div>
        )
    }
  }

  // Enhanced error logging
  useEffect(() => {
    if (courseError || chaptersError || contentsError) {
      const error = courseError || chaptersError || contentsError
      const errorCode = (error as any)?.code
      
      // Better error serialization for logging
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : typeof error === 'object' 
          ? JSON.stringify(error, null, 2)
          : String(error)

      console.error('❌ [CoursePlayer] Error detected:', {
        courseId,
        chapterId,
        contentId,
        errorDetails,
        errorCode,
        retryCount,
        timestamp: new Date().toISOString(),
      })
    }
  }, [courseError, chaptersError, contentsError, courseId, chapterId, contentId, retryCount])

  // Retry handler
  const handleRetry = () => {
    if (retryCount < 3) {
      console.log(`🔄 [CoursePlayer] Retrying (attempt ${retryCount + 1}/3)...`)
      setRetryCount(prev => prev + 1)
      // Force refetch by invalidating queries
      window.location.reload()
    } else {
      console.error('❌ [CoursePlayer] Max retries reached')
    }
  }

  // Handle errors with specific messages based on error codes
  if (courseError || chaptersError || contentsError) {
    const error = courseError || chaptersError || contentsError
    const errorCode = (error as any)?.code
    
    // Determine error message based on error code
    let errorTitle = 'Error Loading Course'
    let errorMessage = error instanceof Error ? error.message : 'Unknown error'
    let actionMessage = ''
    let canRetry = retryCount < 3 && errorCode !== 'NO_ACCESS' && errorCode !== 'ACCESS_DENIED'

    if (errorCode === 'NO_ACCESS') {
      errorTitle = 'Access Denied'
      errorMessage = 'You do not have access to this course content.'
      actionMessage = 'Please contact your administrator to enroll you in this course.'
      canRetry = false
    } else if (errorCode === 'ENROLLMENT_PENDING') {
      errorTitle = 'Enrollment Processing'
      errorMessage = 'Your enrollment is being processed.'
      actionMessage = 'Please refresh the page in a moment. If the issue persists, contact your administrator.'
      canRetry = true
    } else if (errorCode === 'ACCESS_DENIED') {
      errorTitle = 'Permission Denied'
      errorMessage = 'You do not have permission to access this content.'
      actionMessage = 'Please contact your administrator if you believe this is an error.'
      canRetry = false
    } else if (chaptersError) {
      errorTitle = 'Chapters Not Available'
      errorMessage = 'Failed to load course chapters.'
      actionMessage = 'The course may not have published chapters yet, or there may be an access issue. Please contact your administrator.'
      canRetry = true
    } else if (contentsError) {
      errorTitle = 'Content Not Available'
      errorMessage = 'Failed to load course content.'
      actionMessage = 'Please try refreshing the page. If the issue persists, contact your administrator.'
      canRetry = true
    }

    return (
      <div className="container mx-auto px-4 py-6">
        <Card className="p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">{errorTitle}</h2>
            <p className="text-gray-700 mb-2">{errorMessage}</p>
            {actionMessage && (
              <p className="text-sm text-gray-500 mb-4">{actionMessage}</p>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              <Button onClick={() => router.push('/student/my-courses')} variant="outline">
                Back to Courses
              </Button>
              {canRetry && (
                <Button onClick={handleRetry} variant="default">
                  {retryCount > 0 ? `Retry (${retryCount}/3)` : 'Retry'}
                </Button>
              )}
              <Button onClick={() => window.location.reload()} variant="default">
                Refresh Page
              </Button>
            </div>
            {retryCount > 0 && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Retry attempt {retryCount} of 3
              </p>
            )}
          </div>
        </Card>
      </div>
    )
  }

  if (courseLoading || chaptersLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Guard against missing courseId - after all hooks are called
  if (!courseId) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Course ID is missing</p>
          <Button onClick={() => router.push('/student/my-courses')} className="mt-4">
            Back to Courses
          </Button>
        </div>
      </div>
    )
  }

  // If course is null but chapters exist, we can still show the course
  // This handles cases where RLS blocks course query but allows chapters
  if (!course) {
    // If we have chapters, we can infer the course exists and has access
    // Create a minimal course object from the first chapter
    if (chapters && chapters.length > 0) {
      console.warn('⚠️ [CoursePlayer] Course query returned null but chapters exist - using fallback course data')
      const fallbackCourse = {
        id: courseId,
        name: 'Course',
        title: 'Course',
        course_name: 'Course',
        description: 'Course content is available',
        is_published: true,
        status: 'Published',
      }
      
      // Use fallback course but log the issue
      console.log('ℹ️ [CoursePlayer] Using fallback course data from chapters')
      
      // If we have chapterId or contentId, render the content viewer (same as normal flow)
      if (chapterId) {
        // Render the main player layout with content viewer
        return (
          <ErrorBoundary>
            <div className="min-h-screen bg-gray-50 flex flex-col">
              {/* Course Header */}
              <CourseHeader
                course={fallbackCourse as any}
                totalChapters={totalChapters}
                completedChapters={completedChapters}
              />

              <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                  
                  {/* Left Sidebar - Navigation */}
                  <div className="lg:col-span-3 xl:col-span-3 h-full">
                     <div className="lg:sticky lg:top-8 space-y-4">
                       <CourseSidebar
                          courseId={courseId}
                          chapters={(chapters || []) as any[]}
                          currentChapterId={chapterId}
                          currentContentId={currentContent?.id}
                        />
                        
                        {/* Progress Summary Card */}
                        <Card className="p-4 bg-white shadow-sm border-blue-100">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Course Progress</h4>
                          <div className="space-y-2">
                             <div className="flex justify-between text-xs text-gray-500">
                               <span>{completedChapters} of {totalChapters} chapters</span>
                               <span>{totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0}%</span>
                             </div>
                             <Progress value={totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0} className="h-2" />
                          </div>
                        </Card>
                     </div>
                  </div>

                  {/* Main Content Area */}
                  <div className="lg:col-span-9 xl:col-span-9 space-y-6">
                    
                    {/* Content Viewer Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
                      {/* Content Header */}
                      {currentContent && (
                        <div className="border-b px-6 py-4 bg-gray-50 flex justify-between items-center">
                          <div>
                            <h2 className="text-xl font-bold text-gray-900 line-clamp-1">{currentContent.title}</h2>
                            <p className="text-sm text-gray-500 mt-1">
                              {currentChapter?.name || currentChapter?.title || 'Chapter'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCompleted && (
                              <Badge className="bg-green-500 text-white">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Content Viewer */}
                      <div className="flex-1 p-6 overflow-y-auto">
                        {renderContentViewer()}
                      </div>

                      {/* Navigation Footer */}
                      <div className="border-t px-6 py-4 bg-gray-50 flex justify-between items-center">
                        <Button
                          variant="outline"
                          onClick={handlePrevious}
                          disabled={currentContentIndex === 0 && !chapters?.find((c: any, idx: number) => idx > 0 && c.id === chapterId)}
                        >
                          <ChevronLeft className="h-4 w-4 mr-2" />
                          Previous
                        </Button>
                        
                        <div className="text-sm text-gray-500">
                          {currentContentIndex + 1} of {contents?.length || 0}
                        </div>
                        
                        <Button
                          variant="outline"
                          onClick={handleNext}
                          disabled={currentContentIndex >= (contents?.length || 0) - 1 && !nextChapter}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ErrorBoundary>
        )
      }
      
      // If no chapterId, show overview
      return (
        <div className="container mx-auto px-4 py-6">
          <CourseHeader
            course={fallbackCourse as any}
            totalChapters={totalChapters}
            completedChapters={completedChapters}
            nextChapterId={nextChapter?.id || firstChapter?.id}
          />
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <CourseSidebar
                courseId={courseId}
                chapters={(chapters || []) as any[]}
              />
            </div>
            <div className="lg:col-span-3">
              <Card className="p-6">
                <h2 className="text-2xl font-bold mb-4">Course Content</h2>
                <p className="text-gray-600 mb-6">Select a chapter from the sidebar to begin learning.</p>
                {totalChapters === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500 mb-2">No chapters available for this course yet.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold mb-2">Total Chapters</h3>
                        <p className="text-2xl font-bold">{totalChapters}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold mb-2">Completed</h3>
                        <p className="text-2xl font-bold text-green-600">{completedChapters}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold mb-2">Progress</h3>
                        <p className="text-2xl font-bold">
                          {totalChapters > 0 ? ((completedChapters / totalChapters) * 100).toFixed(0) : 0}%
                        </p>
                      </div>
                    </div>
                    {(nextChapter || firstChapter) && (
                      <div className="mt-6 text-center">
                        <Link href={`/student/my-courses/${courseId}/chapters/${(nextChapter || firstChapter)?.id}`}>
                          <Button size="lg" className="w-full md:w-auto">
                            <Play className="h-5 w-5 mr-2" />
                            {completedChapters > 0 ? 'Continue Learning' : 'Start Course'}
                          </Button>
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          </div>
        </div>
      )
    }
    
    // If no chapters either, show error
    return (
      <div className="container mx-auto px-4 py-6">
        <Card className="p-6">
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">Course not found</p>
            <p className="text-sm text-gray-400 mb-4">
              {courseError ? `Error: ${(courseError as any) instanceof Error ? (courseError as Error).message : String(courseError)}` : 'The course may not exist or you may not have access to it.'}
            </p>
            <Button onClick={() => router.push('/student/my-courses')} variant="outline">
              Back to Courses
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!chapterId) {
    // Show course overview
    return (
      <div className="container mx-auto px-4 py-6">
        <CourseHeader
          course={course}
          totalChapters={totalChapters}
          completedChapters={completedChapters}
          nextChapterId={nextChapter?.id || firstChapter?.id}
        />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <CourseSidebar
              courseId={courseId}
              chapters={(chapters || []) as any[]}
            />
          </div>
          <div className="lg:col-span-3">
            <Card className="p-6">
              <h2 className="text-2xl font-bold mb-4">Course Overview</h2>
              <p className="text-gray-600 mb-6">{course.description || 'No description available.'}</p>
              
              {totalChapters === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 mb-2">No chapters available for this course yet.</p>
                  <p className="text-xs text-gray-400">
                    {chaptersLoading 
                      ? 'Loading chapters...' 
                      : 'Chapters may need to be published or created by your instructor.'}
                  </p>
                  {!chaptersLoading && chaptersError && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm font-semibold text-red-800 mb-2">Error Loading Chapters:</p>
                      <p className="text-xs text-red-600 mb-1">
                        {chaptersError && typeof chaptersError === 'object' && 'message' in chaptersError ? (chaptersError as Error).message : 'Failed to load chapters'}
                      </p>
                      {(chaptersError as any)?.code && (
                        <p className="text-xs text-red-500">Error Code: {(chaptersError as any).code}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Check browser console for detailed error information.
                      </p>
                    </div>
                  )}
                  {!chaptersLoading && !chaptersError && (
                    <p className="text-xs text-gray-500 mt-2">
                      Check browser console for debugging information.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2">Total Chapters</h3>
                      <p className="text-2xl font-bold">{totalChapters}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2">Completed</h3>
                      <p className="text-2xl font-bold text-green-600">{completedChapters}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2">Progress</h3>
                      <p className="text-2xl font-bold">
                        {totalChapters > 0 ? ((completedChapters / totalChapters) * 100).toFixed(0) : 0}%
                      </p>
                    </div>
                  </div>
                  
                  {(nextChapter || firstChapter) && (
                    <div className="mt-6 text-center">
                      <Link href={`/student/my-courses/${courseId}/chapters/${(nextChapter || firstChapter)?.id}`}>
                        <Button size="lg" className="w-full md:w-auto">
                          <Play className="h-5 w-5 mr-2" />
                          {completedChapters > 0 ? 'Continue Learning' : 'Start Course'}
                        </Button>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Render main player layout
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col">

        
        {/* Course Header - Simplified for player view */}
        <CourseHeader
          course={course}
          totalChapters={totalChapters}
          completedChapters={completedChapters}
        />

        <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 lg:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            
            {/* Left Sidebar - Navigation */}
            <div className="lg:col-span-3 xl:col-span-3 h-full">
               <div className="lg:sticky lg:top-8 space-y-4">
                 <CourseSidebar
                    courseId={courseId}
                    chapters={(chapters || []) as any[]}
                    currentChapterId={chapterId}
                    currentContentId={currentContent?.id}
                  />
                  
                  {/* Progress Summary Card */}
                  <Card className="p-4 bg-white shadow-sm border-blue-100">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Course Progress</h4>
                    <div className="space-y-2">
                       <div className="flex justify-between text-xs text-gray-500">
                         <span>{completedChapters} of {totalChapters} chapters</span>
                         <span>{totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0}%</span>
                       </div>
                       <Progress value={totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0} className="h-2" />
                    </div>
                    

                  </Card>
               </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-9 xl:col-span-9 space-y-6">
              
              {/* Content Viewer Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
                {/* Content Header */}
                {currentContent && (
                  <div className="border-b px-6 py-4 bg-gray-50 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 line-clamp-1">{currentContent.title}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {currentChapter && ((currentChapter as any).name || currentChapter.title)}
                      </p>
                    </div>
                    {isCompleted && (
                       <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                         <CheckCircle className="w-3 h-3 mr-1" /> Completed
                       </Badge>
                    )}
                  </div>
                )}

                {/* Content Body */}
                <div className="flex-1 p-6 relative">
                  {contentsLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
                      <div className="text-center">
                        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">Loading lesson...</p>
                      </div>
                    </div>
                  ) : !contents || contents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-20 px-4">
                      <div className="bg-gray-100 p-4 rounded-full mb-4">
                         <FileText className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Content Available</h3>
                      <p className="text-gray-500 max-w-sm">This chapter doesn't have any published content yet.</p>
                       {contentsError && (
                          <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded max-w-md">
                            <p className="font-semibold mb-1">Error Details:</p>
                            <p>{(contentsError as any)?.message || 'Failed to load content'}</p>
                            {(contentsError as any)?.code && (
                              <p className="text-xs mt-1">Code: {(contentsError as any).code}</p>
                            )}
                          </div>
                       )}
                    </div>
                  ) : !currentContent ? (
                     <div className="flex flex-col items-center justify-center h-full text-center py-20 px-4">
                        <Play className="h-12 w-12 text-blue-200 mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Learn?</h3>
                        <p className="text-gray-500 mb-6">Select a lesson from the sidebar to start.</p>
                        {contents[0] && (
                           <Link href={`/student/my-courses/${courseId}/chapters/${chapterId}/content/${contents[0].id}`}>
                             <Button>Start Chapter</Button>
                           </Link>
                        )}
                     </div>
                  ) : (
                    renderContentViewer()
                  )}
                </div>

                {/* Content Footer / Navigation */}
                <div className="border-t px-6 py-4 bg-gray-50 flex justify-between items-center">
                   <Button
                      variant="outline"
                      onClick={handlePrevious}
                   >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Previous
                    </Button>
                   <Button 
                      onClick={handleNext} 
                      className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
                      disabled={!nextChapter && currentContentIndex >= (contents?.length || 0) - 1}
                   >
                      {contents && currentContentIndex < contents.length - 1 ? 'Next Lesson' : 'Next Chapter'} 
                      <ChevronRight className="h-4 w-4 ml-2" />
                   </Button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
    </ErrorBoundary>
  )
}



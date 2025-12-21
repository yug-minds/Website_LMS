'use client'

import { useState, useEffect } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Progress } from '../../ui/progress'
import { 
  BookOpen, 
  CheckCircle, 
  Lock, 
  Play,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Video,
  FileText,
  ClipboardList,
  Link as LinkIcon,
  Loader2
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '../../../lib/utils'
import { useChapterContents } from '../../../hooks/useStudentData'
import { useCourseProgressStore } from '../../../store/course-progress-store'

interface Chapter {
  id: string
  name?: string
  title?: string
  description?: string
  order_number?: number
  order_index?: number
  is_completed: boolean
  is_unlocked: boolean
  learning_outcomes?: string[]
}

interface CourseSidebarProps {
  courseId: string
  chapters: Chapter[]
  currentChapterId?: string
  currentContentId?: string
  className?: string
}

export default function CourseSidebar({
  courseId,
  chapters,
  currentChapterId,
  currentContentId,
  className,
}: CourseSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set(currentChapterId ? [currentChapterId] : [])
  )

  // Global progress store for optimistic UI
  const { isChapterCompleted } = useCourseProgressStore()

  // Auto-expand current chapter
  useEffect(() => {
    if (currentChapterId) {
      // Use a timeout to avoid setState in effect
      const timer = setTimeout(() => {
        setExpandedChapters(prev => new Set([...prev, currentChapterId]))
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [currentChapterId])

  const toggleChapter = (chapterId: string) => {
    const newExpanded = new Set(expandedChapters)
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId)
    } else {
      newExpanded.add(chapterId)
    }
    setExpandedChapters(newExpanded)
  }

  const sortedChapters = [...chapters].sort((a: any, b: any) => {
    const orderA = a.order_number || a.order_index || 0
    const orderB = b.order_number || b.order_index || 0
    return orderA - orderB
  })

  // Calculate overall progress
  const completedCount = sortedChapters.filter(
    ch => ch.is_completed || isChapterCompleted(ch.id)
  ).length
  const progressPercent = sortedChapters.length > 0 
    ? (completedCount / sortedChapters.length) * 100 
    : 0

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden mb-4">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full"
          aria-expanded={isOpen}
          aria-controls="course-sidebar"
          aria-label={isOpen ? 'Close course menu' : 'Open course menu'}
        >
          {isOpen ? (
            <>
              <X className="h-4 w-4 mr-2" aria-hidden="true" />
              Close Menu
            </>
          ) : (
            <>
              <Menu className="h-4 w-4 mr-2" aria-hidden="true" />
              Course Content
            </>
          )}
        </Button>
      </div>

      {/* Sidebar */}
      <Card
        id="course-sidebar"
        className={cn(
          'h-full overflow-y-auto',
          'lg:block',
          isOpen ? 'block' : 'hidden',
          className
        )}
        role="navigation"
        aria-label="Course chapters"
      >
        <div className="p-4">
          <h2 className="font-semibold text-lg mb-2 flex items-center">
            <BookOpen className="h-5 w-5 mr-2" aria-hidden="true" />
            Course Content
          </h2>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{completedCount} of {sortedChapters.length} chapters</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress 
              value={progressPercent} 
              className="h-2"
              aria-label={`Course progress: ${Math.round(progressPercent)}%`}
            />
          </div>

          <nav className="space-y-2" aria-label="Chapter list">
            {sortedChapters.length > 0 ? (
              sortedChapters.map((chapter, index) => {
                const isLocked = !chapter.is_unlocked
                // Check both server state and optimistic state
                const isCompleted = chapter.is_completed || isChapterCompleted(chapter.id)
                const isCurrent = chapter.id === currentChapterId
                const isExpanded = expandedChapters.has(chapter.id)
                const chapterNumber = chapter.order_number || chapter.order_index || index + 1

                return (
                  <div
                    key={chapter.id}
                    className={cn(
                      'border rounded-lg transition-all',
                      isLocked
                        ? 'bg-gray-50 opacity-60'
                        : isCurrent
                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <div className="p-3">
                      <div className="flex items-center gap-3">
                        {/* Chapter status icon */}
                        <div
                          className={cn(
                            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors',
                            isCompleted
                              ? 'bg-green-100 text-green-700'
                              : isCurrent
                              ? 'bg-blue-100 text-blue-700'
                              : isLocked
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-gray-100 text-gray-700'
                          )}
                          aria-hidden="true"
                        >
                          {isCompleted ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : isLocked ? (
                            <Lock className="h-5 w-5" />
                          ) : (
                            chapterNumber
                          )}
                        </div>

                        {/* Chapter info */}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={isLocked ? '#' : `/student/my-courses/${courseId}/chapters/${chapter.id}`}
                            onClick={(e) => {
                              if (isLocked) {
                                e.preventDefault()
                              } else {
                                setIsOpen(false)
                              }
                            }}
                            className={cn(
                              'block',
                              isLocked && 'cursor-not-allowed'
                            )}
                            aria-disabled={isLocked}
                            aria-current={isCurrent ? 'page' : undefined}
                          >
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                'font-medium text-sm truncate transition-colors',
                                isLocked 
                                  ? 'text-gray-500' 
                                  : 'text-gray-900 hover:text-blue-600'
                              )}>
                                {chapter.name || chapter.title || `Chapter ${chapterNumber}`}
                              </h3>
                              {isCompleted && (
                                <Badge 
                                  className="bg-green-100 text-green-800 text-xs"
                                  aria-label="Chapter completed"
                                >
                                  Done
                                </Badge>
                              )}
                              {isCurrent && !isCompleted && (
                                <Badge 
                                  className="bg-blue-100 text-blue-800 text-xs animate-pulse"
                                  aria-label="Current chapter"
                                >
                                  Current
                                </Badge>
                              )}
                            </div>
                          </Link>
                        </div>

                        {/* Expand/Collapse button */}
                        {!isLocked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-shrink-0 p-1"
                            onClick={(e) => {
                              e.preventDefault()
                              toggleChapter(chapter.id)
                            }}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Collapse chapter contents' : 'Expand chapter contents'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Chapter Contents - Expandable */}
                    {isExpanded && !isLocked && (
                      <ChapterContents
                        courseId={courseId}
                        chapterId={chapter.id}
                        currentContentId={currentContentId}
                        onContentClick={() => setIsOpen(false)}
                      />
                    )}
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-300" aria-hidden="true" />
                <p className="text-sm mb-2">No chapters available</p>
                <p className="text-xs text-gray-400">
                  Chapters may need to be published by your instructor.
                </p>
              </div>
            )}
          </nav>
        </div>
      </Card>
    </>
  )
}

// Component to display chapter contents
function ChapterContents({
  courseId,
  chapterId,
  currentContentId,
  onContentClick,
}: {
  courseId: string
  chapterId: string
  currentContentId?: string
  onContentClick?: () => void
}) {
  const { data: contents, isLoading } = useChapterContents(chapterId, courseId)
  const { isContentCompleted } = useCourseProgressStore()

  if (isLoading) {
    return (
      <div className="px-3 pb-3 flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Loading...
      </div>
    )
  }

  if (!contents || contents.length === 0) {
    return (
      <div className="px-3 pb-3">
        <div className="text-xs text-gray-400 italic">No content available</div>
      </div>
    )
  }

  return (
    <div 
      className="px-3 pb-3 space-y-1 border-t border-gray-100 pt-2"
      role="list"
      aria-label="Chapter lessons"
    >
      {contents.map((content: any, index: number) => {
        const isCurrent = content.id === currentContentId
        // Check both server state and optimistic state
        const completed = content.is_completed || isContentCompleted(content.id)
        const ContentIcon = getContentIcon(content.content_type)

        return (
          <Link
            key={content.id || index}
            href={`/student/my-courses/${courseId}/chapters/${chapterId}/content/${content.id}`}
            onClick={onContentClick}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
              isCurrent
                ? 'bg-blue-100 text-blue-700 font-medium'
                : completed
                ? 'text-green-700 bg-green-50/50'
                : 'text-gray-600 hover:bg-gray-50'
            )}
            role="listitem"
            aria-current={isCurrent ? 'page' : undefined}
          >
            <ContentIcon 
              className={cn(
                'h-3.5 w-3.5 flex-shrink-0',
                completed && 'text-green-600'
              )} 
              aria-hidden="true" 
            />
            <span className="truncate flex-1">
              {content.title || content.name || `Content ${index + 1}`}
            </span>
            {completed && (
              <CheckCircle 
                className="h-3 w-3 text-green-600 flex-shrink-0" 
                aria-label="Completed"
              />
            )}
            {isCurrent && !completed && (
              <div 
                className="h-1.5 w-1.5 rounded-full bg-blue-600 flex-shrink-0 animate-pulse" 
                aria-label="Currently viewing"
              />
            )}
          </Link>
        )
      })}
    </div>
  )
}

function getContentIcon(contentType: string) {
  const type = contentType?.toLowerCase() || ''
  if (type.includes('video') || type === 'video_link') return Video
  if (type === 'assignment' || type === 'quiz') return ClipboardList
  if (type === 'pdf' || type === 'file') return FileText
  if (type === 'text' || type === 'html') return FileText
  if (type === 'link') return LinkIcon
  return FileText
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  CheckCircle,
  RotateCcw,
  Loader2
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useCourseProgressStore } from '../../../store/course-progress-store'
import { useToast } from '../../ui/toast'
import { useQueryClient } from '@tanstack/react-query'

interface VideoContentViewerProps {
  content: {
    id: string
    title: string
    content_url?: string
    content_type?: string
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

export default function VideoContentViewer({ 
  content, 
  courseId,
  chapterId,
  onComplete 
}: VideoContentViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [resumePosition, setResumePosition] = useState<number | null>(null)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasCompletedRef = useRef(false)
  const lastSavedPositionRef = useRef(0)

  // Global progress store for optimistic updates
  const { 
    setContentCompleted, 
    isContentCompleted, 
    setVideoPosition,
    getVideoPosition,
    setSavingProgress,
    isSaving 
  } = useCourseProgressStore()

  // Toast notifications
  const toast = useToast()
  const queryClient = useQueryClient()

  // Check if already completed from store
  const isCompleted = isContentCompleted(content.id)
  const saving = isSaving(content.id)

  // Resolve courseId and chapterId
  const resolvedCourseId = courseId || content.course_id || ''
  const resolvedChapterId = chapterId || content.chapter_id || ''

  // Extract YouTube video ID
  const extractYouTubeVideoId = (url: string): string | null => {
    if (!url) return null
    const patterns = [
      /(?:youtu\.be\/)([^?&#]+)/,
      /(?:embed\/)([^?&#]+)/,
      /(?:watch\?v=)([^&?#]+)/,
      /(?:youtube\.com\/v\/)([^?&#]+)/,
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) return match[1]
    }
    return null
  }

  const isYouTube = content.content_url?.includes('youtube.com') || 
                    content.content_url?.includes('youtu.be')
  const videoId = isYouTube ? extractYouTubeVideoId(content.content_url || '') : null

  // Load saved position on mount
  useEffect(() => {
    const loadSavedPosition = async () => {
      if (isYouTube) return

      // First check local store
      const localPosition = getVideoPosition(content.id)
      if (localPosition > 0) {
        setResumePosition(localPosition)
        return
      }

      // Then check server
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: progress } = await supabase
          .from('student_progress')
          .select('last_position, is_completed')
          .eq('student_id', user.id)
          .eq('content_id', content.id)
          .maybeSingle()

        if (progress?.last_position && progress.last_position > 5) {
          setResumePosition(progress.last_position)
        }
        if (progress?.is_completed) {
          setContentCompleted(content.id, resolvedChapterId, resolvedCourseId, true)
        }
      } catch (error) {
        console.warn('Failed to load video position:', error)
      }
    }

    loadSavedPosition()
  }, [content.id, isYouTube, getVideoPosition, setContentCompleted, resolvedChapterId, resolvedCourseId])

  // Save position periodically (debounced)
  const savePosition = useCallback(
    debounce(async (position: number) => {
      if (isYouTube || position < 5) return
      if (Math.abs(position - lastSavedPositionRef.current) < 10) return // Only save if changed by 10+ seconds

      lastSavedPositionRef.current = position
      setVideoPosition(content.id, position)

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error: rpcError } = await supabase.rpc('upsert_video_position', {
          p_student_id: user.id,
          p_course_id: resolvedCourseId,
          p_chapter_id: resolvedChapterId,
          p_content_id: content.id,
          p_position: position,
          p_time_spent: 10
        });
        
        if (rpcError) {
          // Fallback to direct upsert if function doesn't exist
          await supabase.from('student_progress').upsert({
            student_id: user.id,
            course_id: resolvedCourseId,
            chapter_id: resolvedChapterId,
            content_id: content.id,
            last_position: position,
          }, { onConflict: 'student_id,content_id' });
        }
      } catch (error) {
        console.warn('Failed to save video position:', error)
      }
    }, 5000),
    [content.id, resolvedCourseId, resolvedChapterId, isYouTube, setVideoPosition]
  )

  // Mark as complete - delegate to parent for database saving
  const handleMarkComplete = useCallback(
    debounce(async () => {
      if (hasCompletedRef.current) return
      hasCompletedRef.current = true

      console.log('🎬 [VideoPlayer] Marking as complete, calling parent onComplete...')
      
      // Call parent's onComplete which handles database saving
      // The parent (CoursePlayer) will save to both student_progress and course_progress
      onComplete?.()
      
      // Update local UI state
      setContentCompleted(content.id, resolvedChapterId, resolvedCourseId, true)
      
      console.log('✅ [VideoPlayer] Marked as complete')
    }, 500),
    [content.id, resolvedCourseId, resolvedChapterId, onComplete, setContentCompleted]
  )

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current
    if (!video || isYouTube) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      savePosition(video.currentTime)

      // Auto-complete at 80%
      if (video.duration > 0 && !hasCompletedRef.current) {
        const progress = video.currentTime / video.duration
        if (progress >= 0.8) {
          handleMarkComplete()
        }
      }
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
      setIsLoading(false)

      // Resume from saved position
      if (resumePosition && resumePosition > 5 && resumePosition < video.duration - 5) {
        video.currentTime = resumePosition
        setCurrentTime(resumePosition)
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      if (!hasCompletedRef.current) {
        handleMarkComplete()
      }
    }

    const handleCanPlay = () => setIsLoading(false)
    const handleWaiting = () => setIsLoading(true)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('waiting', handleWaiting)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('waiting', handleWaiting)
    }
  }, [isYouTube, resumePosition, savePosition, handleMarkComplete])

  // Playback rate effect
  useEffect(() => {
    if (videoRef.current && !isYouTube) {
      videoRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, isYouTube])

  const togglePlay = () => {
    if (isYouTube) {
      window.open(content.content_url || '', '_blank')
      return
    }
    
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (videoRef.current) {
      videoRef.current.volume = newVolume
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleResumeFromStart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      setCurrentTime(0)
      setResumePosition(null)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  // YouTube auto-completion timer
  useEffect(() => {
    if (!isYouTube || hasCompletedRef.current) return

    const timer = setTimeout(() => {
      if (!hasCompletedRef.current) {
        handleMarkComplete()
      }
    }, 30000)

    return () => clearTimeout(timer)
  }, [isYouTube, handleMarkComplete])

  // YouTube embed
  if (isYouTube && videoId) {
    return (
      <Card className="overflow-hidden">
        <div className="relative aspect-video bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={content.title}
          />
        </div>
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-lg">{content.title}</h3>
            {isCompleted && (
              <Badge 
                variant="secondary" 
                className="bg-green-100 text-green-800 shrink-0 ml-2"
                role="status"
                aria-label="Video completed"
              >
                <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" /> Completed
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600">
            Watch the video above. Progress will be saved automatically.
          </p>
        </div>
      </Card>
    )
  }

  // Regular video player
  return (
    <Card className="overflow-hidden" ref={containerRef}>
      <div 
        className="relative bg-black group" 
        onMouseEnter={() => setShowControls(true)} 
        onMouseLeave={() => setShowControls(false)}
      >
        {/* Resume prompt */}
        {resumePosition && resumePosition > 5 && currentTime < 5 && (
          <div className="absolute top-4 left-4 right-4 z-20 bg-black/80 rounded-lg p-3 flex items-center justify-between">
            <span className="text-white text-sm">
              Resume from {formatTime(resumePosition)}?
            </span>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-white hover:bg-white/20"
                onClick={handleResumeFromStart}
                aria-label="Start from beginning"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Start Over
              </Button>
              <Button 
                size="sm" 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  if (videoRef.current && resumePosition) {
                    videoRef.current.currentTime = resumePosition
                    videoRef.current.play()
                    setIsPlaying(true)
                  }
                }}
                aria-label={`Resume from ${formatTime(resumePosition)}`}
              >
                Resume
              </Button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={content.content_url}
          className="w-full aspect-video"
          onClick={togglePlay}
          aria-label={`Video: ${content.title}`}
        />
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-12 w-12 text-white animate-spin" />
          </div>
        )}

        {/* Play/Pause overlay */}
        {showControls && !isLoading && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity">
            <Button
              size="lg"
              variant="ghost"
              onClick={togglePlay}
              className="bg-white/20 hover:bg-white/30 rounded-full p-4"
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
            >
              {isPlaying ? (
                <Pause className="h-12 w-12 text-white" />
              ) : (
                <Play className="h-12 w-12 text-white fill-white" />
              )}
            </Button>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="space-y-2">
            {/* Progress Bar */}
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                aria-label="Video progress"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={currentTime}
                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
              />
              <span className="text-white text-sm w-24 text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 text-white" />
                  ) : (
                    <Play className="h-4 w-4 text-white fill-white" />
                  )}
                </Button>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4 text-white" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white" />
                  )}
                </Button>
                
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 accent-white"
                  aria-label="Volume"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                  className="bg-black/50 text-white text-sm px-2 py-1 rounded border-none"
                  aria-label="Playback speed"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-lg">{content.title}</h3>
          {(isCompleted || saving) && (
            <Badge 
              variant="secondary" 
              className={`shrink-0 ml-2 ${saving ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}
              role="status"
              aria-label={saving ? 'Saving progress' : 'Video completed'}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" /> Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" /> Completed
                </>
              )}
            </Badge>
          )}
        </div>
        
        {/* Progress indicator */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Video progress"
            />
          </div>
        </div>
      </div>
    </Card>
  )
}













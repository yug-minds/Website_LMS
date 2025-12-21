'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'

import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Settings,
  SkipBack,
  SkipForward
} from 'lucide-react'

interface VideoPlayerProps {
  url: string
  title?: string
  onProgress?: (progress: number) => void
  onComplete?: () => void
}

export default function VideoPlayer({ url, title, onProgress, onComplete }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showControls, setShowControls] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => setCurrentTime(video.currentTime)
    const updateDuration = () => setDuration(video.duration)
    const handleEnded = () => {
      setIsPlaying(false)
      onComplete?.()
    }

    video.addEventListener('timeupdate', updateTime)
    video.addEventListener('loadedmetadata', updateDuration)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('timeupdate', updateTime)
      video.removeEventListener('loadedmetadata', updateDuration)
      video.removeEventListener('ended', handleEnded)
    }
  }, [onComplete])

  useEffect(() => {
    if (duration > 0) {
      const progress = (currentTime / duration) * 100
      onProgress?.(progress)
    }
  }, [currentTime, duration, onProgress])

  const togglePlay = () => {
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
    const vol = parseFloat(e.target.value)
    setVolume(vol)
    if (videoRef.current) {
      videoRef.current.volume = vol
    }
    setIsMuted(vol === 0)
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
  }

  const skip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds
    }
  }

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (!document.fullscreenElement) {
        videoRef.current.requestFullscreen()
      } else {
        document.exitFullscreen()
      }
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Check if URL is YouTube embed
  const isYouTubeEmbed = url.includes('youtube.com/embed') || url.includes('youtu.be') || url.includes('youtube.com/watch');

  // Helper to convert embed URL back to watch URL
  const getYouTubeWatchUrl = (embedUrl: string): string => {
    // Handle youtu.be short URLs (with or without query parameters)
    const youtuBeMatch = embedUrl.match(/(?:youtu\.be\/)([^?&#]+)/);
    if (youtuBeMatch && youtuBeMatch[1]) {
      return `https://youtu.be/${youtuBeMatch[1]}`;
    }
    
    // Handle embed URLs
    const embedMatch = embedUrl.match(/(?:embed\/)([^?&#]+)/);
    if (embedMatch && embedMatch[1]) {
      return `https://youtu.be/${embedMatch[1]}`;
    }
    
    // Handle watch URLs
    const watchMatch = embedUrl.match(/(?:watch\?v=)([^&?#]+)/);
    if (watchMatch && watchMatch[1]) {
      return `https://youtu.be/${watchMatch[1]}`;
    }
    
    // Handle v/ URLs
    const vMatch = embedUrl.match(/(?:youtube\.com\/v\/)([^?&#]+)/);
    if (vMatch && vMatch[1]) {
      return `https://youtu.be/${vMatch[1]}`;
    }
    
    return embedUrl;
  };

  // Helper to get YouTube thumbnail
  const getYouTubeThumbnail = (embedUrl: string): string => {
    // Handle youtu.be short URLs
    const youtuBeMatch = embedUrl.match(/(?:youtu\.be\/)([^?&#]+)/);
    if (youtuBeMatch && youtuBeMatch[1]) {
      return `https://img.youtube.com/vi/${youtuBeMatch[1]}/maxresdefault.jpg`;
    }
    
    // Handle embed URLs
    const embedMatch = embedUrl.match(/(?:embed\/)([^?&#]+)/);
    if (embedMatch && embedMatch[1]) {
      return `https://img.youtube.com/vi/${embedMatch[1]}/maxresdefault.jpg`;
    }
    
    // Handle watch URLs
    const watchMatch = embedUrl.match(/(?:watch\?v=)([^&?#]+)/);
    if (watchMatch && watchMatch[1]) {
      return `https://img.youtube.com/vi/${watchMatch[1]}/maxresdefault.jpg`;
    }
    
    // Handle v/ URLs
    const vMatch = embedUrl.match(/(?:youtube\.com\/v\/)([^?&#]+)/);
    if (vMatch && vMatch[1]) {
      return `https://img.youtube.com/vi/${vMatch[1]}/maxresdefault.jpg`;
    }
    
    return '';
  };

  // If YouTube video, show clickable thumbnail instead of trying to embed
  if (isYouTubeEmbed) {
    return (
      <div className="space-y-2">
        <a
          href={getYouTubeWatchUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <Card className="overflow-hidden bg-black cursor-pointer hover:opacity-90 transition-opacity">
            <div className="relative aspect-video group">
              {/* YouTube Thumbnail */}
              <Image
                src={getYouTubeThumbnail(url)}
                alt={title || 'Video thumbnail'}
                fill
                className="object-cover"
                onError={(e) => {
                  // Fallback background if thumbnail fails
                  e.currentTarget.style.display = 'none';
                }}
              />
              
              {/* Play Button Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 group-hover:bg-opacity-60 transition-all">
                <div className="bg-red-600 rounded-full p-4 group-hover:scale-110 transition-transform">
                  <Play className="h-12 w-12 text-white fill-white" />
                </div>
              </div>
              
              {/* YouTube Logo */}
              <div className="absolute top-4 right-4 bg-red-600 px-3 py-1 rounded-md">
                <span className="text-white text-xs font-bold">YouTube</span>
              </div>
              
              {/* Video Title */}
              {title && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
                  <h3 className="text-white font-medium">{title}</h3>
                </div>
              )}
            </div>
          </Card>
        </a>
        
        {/* Click instruction */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Click to watch on YouTube</strong> - Opens in a new tab
          </p>
        </div>
      </div>
    );
  }

  // Regular video player for uploaded videos
  return (
    <div className="space-y-2">
      <Card className="overflow-hidden bg-black">
        <div 
          className="relative"
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(false)}
        >
          {/* Video Element */}
          <video
            ref={videoRef}
            src={url}
            className="w-full aspect-video"
            onClick={togglePlay}
          />

        {/* Play/Pause Overlay - Only for non-YouTube videos */}
        {!isYouTubeEmbed && !isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 cursor-pointer"
            onClick={togglePlay}
          >
            <Button size="lg" className="rounded-full h-16 w-16">
              <Play className="h-8 w-8" />
            </Button>
          </div>
        )}

        {/* Controls */}
        {showControls && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-white mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={togglePlay}
                  className="text-white hover:text-white hover:bg-white/20"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>

                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => skip(-10)}
                  className="text-white hover:text-white hover:bg-white/20"
                >
                  <SkipBack className="h-4 w-4" />
                  <span className="text-xs ml-1">10s</span>
                </Button>

                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => skip(10)}
                  className="text-white hover:text-white hover:bg-white/20"
                >
                  <span className="text-xs mr-1">10s</span>
                  <SkipForward className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2 ml-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={toggleMute}
                    className="text-white hover:text-white hover:bg-white/20"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={playbackRate}
                  onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
                  className="bg-transparent text-white text-sm border border-white/20 rounded px-2 py-1"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>

                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={toggleFullscreen}
                  className="text-white hover:text-white hover:bg-white/20"
                >
                  <Maximize className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Video Info */}
      {title && (
        <div className="p-4 bg-gray-900 text-white">
          <h3 className="font-medium">{title}</h3>
        </div>
      )}
    </Card>
  </div>
  )
}


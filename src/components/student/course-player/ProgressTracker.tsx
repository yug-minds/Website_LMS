'use client'

import { Progress } from '../../ui/progress'
import { CheckCircle, Circle } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface ProgressTrackerProps {
  progress: number // 0-100
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export default function ProgressTracker({ 
  progress, 
  size = 'md',
  showLabel = true 
}: ProgressTrackerProps) {
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium">{progress.toFixed(0)}%</span>
        </div>
      )}
      <Progress value={progress} className={cn(sizeClasses[size])} />
    </div>
  )
}



















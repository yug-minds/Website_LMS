'use client'

import { CheckCircle, Lock, Circle } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface ChapterProgressProps {
  isCompleted: boolean
  isUnlocked: boolean
  progress?: number // 0-100
  size?: number
}

export default function ChapterProgress({
  isCompleted,
  isUnlocked,
  progress = 0,
  size = 40,
}: ChapterProgressProps) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  if (isCompleted) {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center',
          'bg-green-100 text-green-700'
        )}
        style={{ width: size, height: size }}
      >
        <CheckCircle className="h-5 w-5" />
      </div>
    )
  }

  if (!isUnlocked) {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center',
          'bg-gray-100 text-gray-400'
        )}
        style={{ width: size, height: size }}
      >
        <Lock className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-blue-600 transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold text-gray-700">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  )
}



















'use client'

import { Progress } from '../ui/progress'
import { cn } from '../../lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  showPercentage?: boolean
  showLabel?: boolean
  label?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export default function ProgressBar({
  value,
  max = 100,
  className,
  showPercentage = true,
  showLabel = false,
  label,
  size = 'md',
  variant = 'default'
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100)
  
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }

  const variantClasses = {
    default: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500'
  }

  return (
    <div className={cn('space-y-2', className)}>
      {(showLabel || showPercentage) && (
        <div className="flex justify-between text-sm">
          {showLabel && (
            <span className="text-gray-600">{label || 'Progress'}</span>
          )}
          {showPercentage && (
            <span className="font-medium text-gray-900">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      
      <div className={cn('w-full bg-gray-200 rounded-full', sizeClasses[size])}>
        <div 
          className={cn(
            'h-full rounded-full transition-all duration-300',
            variantClasses[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}


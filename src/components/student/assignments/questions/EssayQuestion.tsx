'use client'

import { memo } from 'react'
import { Card } from '../../../ui/card'
import { Badge } from '../../../ui/badge'
import { Textarea } from '../../../ui/textarea'
import { Label } from '../../../ui/label'
import { cn } from '../../../../lib/utils'

interface EssayQuestionProps {
  question: {
    id?: string
    question: string
    question_text?: string
    marks?: number
    word_limit?: number
  }
  index: number
  totalQuestions: number
  answer: string
  onAnswerChange: (answer: string) => void
  disabled?: boolean
}

function EssayQuestion({
  question,
  index,
  totalQuestions,
  answer,
  onAnswerChange,
  disabled = false
}: EssayQuestionProps) {
  const questionText = question.question || question.question_text || ''
  const wordLimit = question.word_limit
  const wordCount = answer.trim().split(/\s+/).filter((word: any) => word.length > 0).length
  const isOverLimit = wordLimit ? wordCount > wordLimit : false

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-600">
            Question {index + 1} of {totalQuestions}
          </span>
          {question.marks && (
            <Badge variant="outline" className="text-xs">
              {question.marks} {question.marks === 1 ? 'point' : 'points'}
            </Badge>
          )}
        </div>
        {wordLimit && (
          <span className={cn(
            "text-xs font-medium",
            isOverLimit ? "text-red-600" : "text-gray-600"
          )}>
            {wordCount} / {wordLimit} words
          </span>
        )}
      </div>

      <Label 
        htmlFor={`essay-${index}`}
        className="font-medium text-lg mb-4 block"
        aria-label={`Question ${index + 1}: ${questionText}`}
      >
        {questionText}
      </Label>

      <div className="space-y-2">
        <Textarea
          id={`essay-${index}`}
          value={answer}
          onChange={(e) => !disabled && onAnswerChange(e.target.value)}
          disabled={disabled}
          rows={12}
          placeholder="Type your answer here..."
          className={cn(
            "font-mono text-sm",
            isOverLimit && "border-red-500 focus:border-red-500 focus:ring-red-500"
          )}
          aria-label={`Answer for question ${index + 1}`}
          aria-describedby={wordLimit ? `word-count-${index}` : undefined}
        />
        {wordLimit && (
          <p 
            id={`word-count-${index}`}
            className={cn(
              "text-xs",
              isOverLimit ? "text-red-600" : "text-gray-500"
            )}
            role="status"
            aria-live="polite"
          >
            {isOverLimit 
              ? `Word limit exceeded by ${wordCount - wordLimit} words`
              : `${wordLimit - wordCount} words remaining`
            }
          </p>
        )}
      </div>
    </Card>
  )
}

export default memo(EssayQuestion)



















'use client'

import { memo, useMemo } from 'react'
import { Card } from '../../../ui/card'
import { Badge } from '../../../ui/badge'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { cn } from '../../../../lib/utils'

interface FillBlankQuestionProps {
  question: {
    id?: string
    question: string
    question_text?: string
    correct_answer: string | string[]
    marks?: number
    hints?: string[]
  }
  index: number
  totalQuestions: number
  answers: string[]
  onAnswerChange: (blankIndex: number, answer: string) => void
  showCorrectAnswer?: boolean
  disabled?: boolean
}

function FillBlankQuestion({
  question,
  index,
  totalQuestions,
  answers,
  onAnswerChange,
  showCorrectAnswer = false,
  disabled = false
}: FillBlankQuestionProps) {
  const questionText = question.question || question.question_text || ''
  
  // Debug logging
  console.log('🔍 FillBlankQuestion Debug:', {
    questionText,
    questionId: question.id,
    correctAnswer: question.correct_answer,
    answersLength: answers.length
  })
  
  // Parse question text to find blanks (represented by ___ or [blank])
  const { parts, blankCount } = useMemo(() => {
    // More comprehensive blank pattern - matches 3 or more underscores, or [blank] variations
    const blankPattern = /(_{3,}|\[blank\]|\[BLANK\]|\{blank\}|\{BLANK\})/gi
    const parts: Array<{ text: string; isBlank: boolean; index: number }> = []
    let lastIndex = 0
    let blankIndex = 0
    
    // Create a fresh regex instance to avoid issues with global flag
    const matches = Array.from(questionText.matchAll(blankPattern))
    
    if (matches.length === 0) {
      // No blanks found - return empty parts array to trigger fallback
      return {
        parts: [],
        blankCount: 1
      }
    }
    
    matches.forEach((match) => {
      // Add text before blank
      if (match.index !== undefined && match.index > lastIndex) {
        parts.push({
          text: questionText.substring(lastIndex, match.index),
          isBlank: false,
          index: -1
        })
      }
      
      // Add blank
      parts.push({
        text: '',
        isBlank: true,
        index: blankIndex++
      })
      
      lastIndex = (match.index || 0) + match[0].length
    })
    
    // Add remaining text
    if (lastIndex < questionText.length) {
      parts.push({
        text: questionText.substring(lastIndex),
        isBlank: false,
        index: -1
      })
    }
    
    console.log('🔍 Parsed parts:', { parts, blankCount: blankIndex, questionText })
    return { parts, blankCount: blankIndex }
  }, [questionText])

  // Normalize correct answers
  const correctAnswers = useMemo(() => {
    // Handle undefined/null correct_answer
    if (!question.correct_answer) {
      return []
    }
    
    if (Array.isArray(question.correct_answer)) {
      return question.correct_answer
        .filter((ans: any) => ans != null)
        .map((ans: any) => String(ans).toLowerCase().trim())
        .filter((ans: any) => ans.length > 0)
    }
    
    // If single answer, split by comma or semicolon for multiple correct answers
    const answerStr = String(question.correct_answer || '')
    if (!answerStr.trim()) {
      return []
    }
    
    return answerStr
      .split(/[,;]/)
      .map((ans: any) => ans.toLowerCase().trim())
      .filter((ans: any) => ans.length > 0)
  }, [question.correct_answer])

  const checkAnswer = (blankIndex: number, answer: string): boolean | undefined => {
    if (!showCorrectAnswer || answer.trim().length === 0) return undefined
    const normalizedAnswer = answer.toLowerCase().trim()
    // For multiple blanks, check against corresponding correct answer
    const correctAnswerForBlank = correctAnswers[blankIndex] || correctAnswers[0]
    return correctAnswerForBlank === normalizedAnswer || 
           correctAnswers.some((ca: any) => ca === normalizedAnswer)
  }

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
      </div>

      <div className="mb-6">
        <Label 
          className="font-medium text-lg block mb-4"
          aria-label={`Question ${index + 1}: Fill in the blanks`}
        >
          Fill in the blanks:
        </Label>
        <div className="text-base leading-relaxed">
          {parts.length > 0 ? (
            // Render question with inline blanks
            <div className="flex flex-wrap items-center gap-2">
              {parts.map((part, partIndex) => {
                if (part.isBlank) {
                  const answer = answers[part.index] || ''
                  const isCorrect = checkAnswer(part.index, answer)
                  
                  return (
                    <div key={partIndex} className="inline-flex items-center space-x-2">
                      <Input
                        type="text"
                        value={answer}
                        onChange={(e) => !disabled && onAnswerChange(part.index, e.target.value)}
                        disabled={disabled}
                        placeholder="Your answer"
                        className={cn(
                          "inline-block w-auto min-w-[150px] max-w-[200px]",
                          showCorrectAnswer && isCorrect === true && "border-green-500 bg-green-50",
                          showCorrectAnswer && isCorrect === false && answer.trim().length > 0 && "border-red-500 bg-red-50"
                        )}
                        aria-label={`Blank ${part.index + 1} of ${blankCount}`}
                      />
                      {showCorrectAnswer && isCorrect === false && answer.trim().length > 0 && (
                        <Badge variant="outline" className="bg-red-100 text-red-800 text-xs">
                          Incorrect
                        </Badge>
                      )}
                      {showCorrectAnswer && isCorrect === true && (
                        <Badge variant="outline" className="bg-green-100 text-green-800 text-xs">
                          Correct
                        </Badge>
                      )}
                    </div>
                  )
                } else {
                  return (
                    <span key={partIndex} className="text-base whitespace-pre-wrap">
                      {part.text}
                    </span>
                  )
                }
              })}
            </div>
          ) : (
            // Fallback: render as single blank question
            <div className="space-y-4">
              <p className="text-base mb-4">{questionText}</p>
              <div className="flex items-center space-x-2">
                <Input
                  type="text"
                  value={answers[0] || ''}
                  onChange={(e) => !disabled && onAnswerChange(0, e.target.value)}
                  disabled={disabled}
                  placeholder="Your answer"
                  className={cn(
                    "w-full max-w-md",
                    showCorrectAnswer && checkAnswer(0, answers[0] || '') === true && "border-green-500 bg-green-50",
                    showCorrectAnswer && checkAnswer(0, answers[0] || '') === false && (answers[0] || '').trim().length > 0 && "border-red-500 bg-red-50"
                  )}
                  aria-label="Answer"
                />
                {showCorrectAnswer && checkAnswer(0, answers[0] || '') === false && (answers[0] || '').trim().length > 0 && (
                  <Badge variant="outline" className="bg-red-100 text-red-800 text-xs">
                    Incorrect
                  </Badge>
                )}
                {showCorrectAnswer && checkAnswer(0, answers[0] || '') === true && (
                  <Badge variant="outline" className="bg-green-100 text-green-800 text-xs">
                    Correct
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {question.hints && question.hints.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs font-medium text-blue-900 mb-1">Hint:</p>
          <p className="text-sm text-blue-800">{question.hints[0]}</p>
        </div>
      )}
    </Card>
  )
}

export default memo(FillBlankQuestion)



















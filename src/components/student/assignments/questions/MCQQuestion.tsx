'use client'

import React from 'react'
import { Card } from '../../../ui/card'
import { Badge } from '../../../ui/badge'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '../../../../lib/utils'

interface MCQQuestionProps {
  question: {
    id?: string
    question: string
    question_text?: string
    options: string[]
    correct_answer?: number | string
    marks?: number
  }
  index: number
  totalQuestions: number
  selectedAnswer?: number
  onAnswerChange: (answerIndex: number) => void
  showCorrectAnswer?: boolean
  disabled?: boolean
}

function MCQQuestion({
  question,
  index,
  totalQuestions,
  selectedAnswer,
  onAnswerChange,
  showCorrectAnswer = false,
  disabled = false
}: MCQQuestionProps) {
  const questionText = question.question || question.question_text || ''
  const options = question.options || []
  
  // Determine the correct answer index
  // correct_answer can be either:
  // 1. A number (index) - e.g., 2
  // 2. A string number - e.g., "2"
  // 3. The actual option text - e.g., "MIT"
  const correctAnswerIndex = (() => {
    if (question.correct_answer === undefined || question.correct_answer === null) {
      return undefined
    }
    
    // If it's a number, use it directly
    if (typeof question.correct_answer === 'number') {
      return question.correct_answer
    }
    
    // If it's a string
    if (typeof question.correct_answer === 'string') {
      // Try to parse as number first
      const parsed = parseInt(question.correct_answer)
      if (!isNaN(parsed) && parsed >= 0 && parsed < options.length) {
        return parsed
      }
      
      // Otherwise, find the index of the matching option text
      const matchIndex = options.findIndex(opt => 
        opt.toLowerCase().trim() === question.correct_answer?.toString().toLowerCase().trim()
      )
      return matchIndex >= 0 ? matchIndex : undefined
    }
    
    return undefined
  })()

  const isCorrect = showCorrectAnswer && selectedAnswer !== undefined && correctAnswerIndex !== undefined
    ? selectedAnswer === correctAnswerIndex
    : undefined
  
  // Debug logging
  console.log('🔍 MCQ Debug:', {
    questionText,
    correctAnswer: question.correct_answer,
    correctAnswerType: typeof question.correct_answer,
    correctAnswerIndex,
    selectedAnswer,
    isCorrect,
    options,
    showCorrectAnswer,
    questionObject: question
  })

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
        {showCorrectAnswer && isCorrect !== undefined && (
          <Badge 
            className={cn(
              "text-xs",
              isCorrect ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            )}
          >
            {isCorrect ? 'Correct' : 'Incorrect'}
          </Badge>
        )}
      </div>

      <p 
        className="font-medium text-lg mb-6"
        aria-label={`Question ${index + 1}: ${questionText}`}
      >
        {questionText}
      </p>

      <div className="space-y-3" role="radiogroup" aria-label={`Answer options for question ${index + 1}`}>
        {options.length > 0 ? (
          options.map((option, optIndex) => {
            const isSelected = selectedAnswer === optIndex
            const isCorrectOption = showCorrectAnswer && correctAnswerIndex === optIndex
            const isWrongSelection = showCorrectAnswer && isSelected && !isCorrectOption

            return (
              <label
                key={optIndex}
                className={cn(
                  "flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all duration-200",
                  disabled && "cursor-not-allowed opacity-60",
                  isSelected && !showCorrectAnswer && "border-blue-600 bg-blue-50",
                  isCorrectOption && showCorrectAnswer && "border-green-500 bg-green-50",
                  isWrongSelection && "border-red-500 bg-red-50",
                  !isSelected && !showCorrectAnswer && "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
                )}
              >
                <input
                  type="radio"
                  name={`question-${index}`}
                  value={optIndex}
                  checked={isSelected}
                  onChange={() => !disabled && onAnswerChange(optIndex)}
                  disabled={disabled}
                  className="sr-only"
                  aria-label={`Option ${String.fromCharCode(65 + optIndex)}: ${option}`}
                />
                <div className="flex items-center w-full">
                  <div className="mr-4 flex-shrink-0">
                    {isSelected ? (
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <span className="font-medium mr-3 text-gray-500 min-w-[24px]">
                    {String.fromCharCode(65 + optIndex)}.
                  </span>
                  <span className="flex-1">{option}</span>
                  {showCorrectAnswer && isCorrectOption && (
                    <Badge className="ml-2 bg-green-100 text-green-800 text-xs">
                      Correct Answer
                    </Badge>
                  )}
                </div>
              </label>
            )
          })
        ) : (
          <p className="text-sm text-gray-500 italic">No options available</p>
        )}
      </div>

      {showCorrectAnswer && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-medium text-yellow-900 mb-1">Correct Answer:</p>
          {correctAnswerIndex !== undefined ? (
            <p className="text-sm text-yellow-800">
              {String.fromCharCode(65 + correctAnswerIndex)}. {options[correctAnswerIndex]}
            </p>
          ) : (
            <div className="text-sm text-red-800">
              <p>❌ Could not determine correct answer</p>
              <p className="text-xs mt-1">
                Raw correct_answer: {JSON.stringify(question.correct_answer)} (type: {typeof question.correct_answer})
              </p>
              <p className="text-xs">Options: {JSON.stringify(options)}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default MCQQuestion



















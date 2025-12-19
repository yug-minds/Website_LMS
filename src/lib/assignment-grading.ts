/**
 * Auto-grading service for assignments
 */

import { normalizeAnswer, answersMatch, matchesAnyAnswer, calculatePartialCredit, generateFeedback } from './grading-utils'

export interface Question {
  id: string
  question_type: string
  question_text: string
  correct_answer: string | string[] | number
  marks: number
  options?: string[]
}

export interface StudentAnswer {
  questionId: string
  answer: string | number | string[]
}

export interface GradingResult {
  questionId: string
  isCorrect: boolean
  score: number
  maxScore: number
  feedback: string
  studentAnswer: string | number | string[]
  correctAnswer: string | string[] | number
}

export interface AssignmentGradingResult {
  totalScore: number
  maxScore: number
  percentage: number
  results: GradingResult[]
  canAutoGrade: boolean
}

/**
 * Grade a single question
 */
function gradeQuestion(
  question: Question,
  studentAnswer: StudentAnswer
): GradingResult {
  const { questionId, answer } = studentAnswer
  const { question_type, correct_answer, marks } = question
  
  let isCorrect = false
  let score = 0
  let feedback = ''
  
  // Debug logging
  console.log('🔍 Grading Question:', {
    questionId,
    questionType: question_type,
    correctAnswer: correct_answer,
    correctAnswerType: typeof correct_answer,
    studentAnswer: answer,
    studentAnswerType: typeof answer,
    options: question.options
  })
  
  // Normalize student answer
  const normalizedStudentAnswer = typeof answer === 'string' 
    ? normalizeAnswer(answer) 
    : answer
  
  // Handle different question types
  switch (question_type.toLowerCase()) {
    case 'mcq':
    case 'multiple_choice':
      // For MCQ, handle different formats of correct_answer and student answer
      if (typeof correct_answer === 'number') {
        // correct_answer is an index
        isCorrect = answer === correct_answer
      } else if (typeof correct_answer === 'string') {
        // correct_answer could be:
        // 1. A numeric string (index) - e.g., "2"
        // 2. The actual option text - e.g., "MIT"
        
        const parsedCorrectIndex = parseInt(correct_answer)
        
        if (!isNaN(parsedCorrectIndex) && parsedCorrectIndex >= 0 && 
            question.options && parsedCorrectIndex < question.options.length) {
          // correct_answer is a numeric string (index)
          isCorrect = answer === parsedCorrectIndex
        } else {
          // correct_answer is option text, need to compare text values
          let studentOptionText: string
          let correctOptionText: string = correct_answer
          
          if (typeof answer === 'number') {
            // Student answer is index, get the option text
            studentOptionText = question.options?.[answer] || ''
          } else {
            // Student answer is already text
            studentOptionText = String(answer)
          }
          
          // Compare normalized text
          isCorrect = normalizeAnswer(studentOptionText) === normalizeAnswer(correctOptionText)
        }
      }
      score = isCorrect ? marks : 0
      feedback = generateFeedback(isCorrect, 'mcq', String(answer), String(correct_answer))
      break
      
    case 'fillblank':
    case 'fill_blank':
      // For fill-in-the-blank, correct_answer can be a string or array of strings
      const correctAnswers = Array.isArray(correct_answer) 
        ? correct_answer 
        : [correct_answer]
      
      // Handle both string and array answers
      if (Array.isArray(answer)) {
        // Multiple blanks - check each one
        const correctAnswersArray = Array.isArray(correct_answer) ? correct_answer : [correct_answer]
        let correctCount = 0
        const totalBlanks = Math.max(answer.length, correctAnswersArray.length)
        
        for (let i = 0; i < totalBlanks; i++) {
          const studentBlank = String(answer[i] || '')
          const correctBlank = String(correctAnswersArray[i] || '')
          if (matchesAnyAnswer(studentBlank, [correctBlank])) {
            correctCount++
          }
        }
        
        isCorrect = correctCount === totalBlanks
        score = isCorrect ? marks : Math.round((correctCount / totalBlanks) * marks)
        feedback = isCorrect 
          ? `All blanks correct!`
          : `${correctCount} out of ${totalBlanks} blanks correct.`
      } else if (typeof answer === 'string') {
        // Single blank answer
        isCorrect = matchesAnyAnswer(answer, correctAnswers.map(String))
        if (!isCorrect) {
          // Check for partial credit
          const partialScore = calculatePartialCredit(
            answer,
            correctAnswers[0] as string,
            0.8 // 80% similarity threshold
          )
          if (partialScore > 0) {
            score = Math.round(marks * partialScore)
            feedback = `Partially correct. The correct answer is: ${correctAnswers[0]}`
          } else {
            score = 0
            feedback = generateFeedback(false, 'fill_blank', answer, correctAnswers[0] as string)
          }
        } else {
          score = marks
          feedback = generateFeedback(true, 'fill_blank', answer, correctAnswers[0] as string)
        }
      } else {
        score = 0
        feedback = 'Invalid answer format'
      }
      break
      
    case 'true_false':
      // For true/false, compare boolean values
      const correctBool = typeof correct_answer === 'string'
        ? correct_answer.toLowerCase() === 'true'
        : Boolean(correct_answer)
      const studentBool = typeof answer === 'string'
        ? answer.toLowerCase() === 'true'
        : Boolean(answer)
      isCorrect = correctBool === studentBool
      score = isCorrect ? marks : 0
      feedback = generateFeedback(isCorrect, 'true_false', String(answer), String(correct_answer))
      break
      
    default:
      // For essay and other types, cannot auto-grade
      score = 0
      feedback = 'This question requires manual grading'
      break
  }
  
  return {
    questionId,
    isCorrect,
    score,
    maxScore: marks,
    feedback,
    studentAnswer: answer,
    correctAnswer: correct_answer
  }
}

/**
 * Grade an entire assignment
 */
export function gradeAssignment(
  questions: Question[],
  studentAnswers: StudentAnswer[],
  autoGradingEnabled: boolean = true
): AssignmentGradingResult {
  const results: GradingResult[] = []
  let totalScore = 0
  let maxScore = 0
  let canAutoGrade = true
  
  // Create a map of student answers by question ID
  const answerMap = new Map<string, StudentAnswer>()
  studentAnswers.forEach(ans => {
    answerMap.set(ans.questionId, ans)
  })
  
  // Grade each question
  questions.forEach(question => {
    maxScore += question.marks
    
    const studentAnswer = answerMap.get(question.id)
    
    // Check if this question type can be auto-graded
    const canGradeThisQuestion = [
      'mcq',
      'multiple_choice',
      'fillblank',
      'fill_blank',
      'true_false'
    ].includes(question.question_type.toLowerCase())
    
    if (!canGradeThisQuestion) {
      canAutoGrade = false
      results.push({
        questionId: question.id,
        isCorrect: false,
        score: 0,
        maxScore: question.marks,
        feedback: 'This question requires manual grading',
        studentAnswer: studentAnswer?.answer || '',
        correctAnswer: question.correct_answer
      })
      return
    }
    
    if (!studentAnswer) {
      // No answer provided
      results.push({
        questionId: question.id,
        isCorrect: false,
        score: 0,
        maxScore: question.marks,
        feedback: 'No answer provided',
        studentAnswer: '',
        correctAnswer: question.correct_answer
      })
      return
    }
    
    // Grade the question
    const result = gradeQuestion(question, studentAnswer)
    results.push(result)
    totalScore += result.score
  })
  
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0
  
  return {
    totalScore,
    maxScore,
    percentage,
    results,
    canAutoGrade: canAutoGrade && autoGradingEnabled
  }
}


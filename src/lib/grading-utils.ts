/**
 * Utility functions for grading assignments
 */

/**
 * Normalize a string for comparison (lowercase, trim, remove extra spaces)
 */
export function normalizeAnswer(answer: string | null | undefined): string {
  if (!answer) return ''
  return answer
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Check if two answers match (with normalization)
 */
export function answersMatch(studentAnswer: string, correctAnswer: string): boolean {
  return normalizeAnswer(studentAnswer) === normalizeAnswer(correctAnswer)
}

/**
 * Check if student answer matches any of the correct answers
 */
export function matchesAnyAnswer(studentAnswer: string, correctAnswers: string[]): boolean {
  const normalizedStudent = normalizeAnswer(studentAnswer)
  return correctAnswers.some((correct: any) => normalizeAnswer(correct) === normalizedStudent)
}

/**
 * Calculate partial credit for fill-in-the-blank questions
 * Returns a score between 0 and 1
 */
export function calculatePartialCredit(
  studentAnswer: string,
  correctAnswer: string,
  threshold: number = 0.8
): number {
  const normalizedStudent = normalizeAnswer(studentAnswer)
  const normalizedCorrect = normalizeAnswer(correctAnswer)
  
  if (normalizedStudent === normalizedCorrect) return 1.0
  
  // Simple Levenshtein distance-based similarity
  const similarity = calculateSimilarity(normalizedStudent, normalizedCorrect)
  return similarity >= threshold ? similarity : 0
}

/**
 * Calculate string similarity using Levenshtein distance
 * Returns a value between 0 and 1
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0
  if (str1.length === 0 || str2.length === 0) return 0.0
  
  const maxLength = Math.max(str1.length, str2.length)
  const distance = levenshteinDistance(str1, str2)
  return 1 - (distance / maxLength)
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1       // deletion
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

/**
 * Generate feedback message for a question
 */
export function generateFeedback(
  isCorrect: boolean,
  questionType: string,
  studentAnswer?: string,
  correctAnswer?: string
): string {
  if (isCorrect) {
    return 'Correct! Well done.'
  }
  
  if (questionType === 'mcq') {
    return `Incorrect. The correct answer is: ${correctAnswer || 'N/A'}`
  }
  
  if (questionType === 'fill_blank' || questionType === 'FillBlank') {
    return `Incorrect. The correct answer is: ${correctAnswer || 'N/A'}`
  }
  
  return 'Incorrect answer. Please review the question.'
}



















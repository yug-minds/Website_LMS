import { describe, it, expect } from 'vitest'
import {
  normalizeAnswer,
  answersMatch,
  matchesAnyAnswer,
  calculatePartialCredit,
  generateFeedback
} from '../grading-utils'

describe('grading-utils', () => {
  describe('normalizeAnswer', () => {
    it('should normalize strings to lowercase and trim', () => {
      expect(normalizeAnswer('  HELLO  ')).toBe('hello')
      expect(normalizeAnswer('World')).toBe('world')
    })

    it('should handle null and undefined', () => {
      expect(normalizeAnswer(null)).toBe('')
      expect(normalizeAnswer(undefined)).toBe('')
    })

    it('should remove extra spaces', () => {
      expect(normalizeAnswer('hello    world')).toBe('hello world')
    })
  })

  describe('answersMatch', () => {
    it('should match identical answers', () => {
      expect(answersMatch('hello', 'hello')).toBe(true)
      expect(answersMatch('Hello', 'hello')).toBe(true)
      expect(answersMatch('  HELLO  ', 'hello')).toBe(true)
    })

    it('should not match different answers', () => {
      expect(answersMatch('hello', 'world')).toBe(false)
    })
  })

  describe('matchesAnyAnswer', () => {
    it('should match if answer is in array', () => {
      expect(matchesAnyAnswer('hello', ['hello', 'world'])).toBe(true)
      expect(matchesAnyAnswer('Hello', ['hello', 'world'])).toBe(true)
    })

    it('should not match if answer is not in array', () => {
      expect(matchesAnyAnswer('foo', ['hello', 'world'])).toBe(false)
    })
  })

  describe('calculatePartialCredit', () => {
    it('should return 1.0 for exact match', () => {
      expect(calculatePartialCredit('hello', 'hello')).toBe(1.0)
    })

    it('should return 0 for completely different answers', () => {
      expect(calculatePartialCredit('hello', 'xyzabc')).toBeLessThan(0.3)
    })

    it('should return partial credit for similar answers', () => {
      const credit = calculatePartialCredit('helo', 'hello', 0.8)
      expect(credit).toBeGreaterThan(0)
      expect(credit).toBeLessThan(1.0)
    })
  })

  describe('generateFeedback', () => {
    it('should generate correct feedback', () => {
      const feedback = generateFeedback(true, 'mcq')
      expect(feedback).toContain('Correct')
    })

    it('should generate incorrect feedback', () => {
      const feedback = generateFeedback(false, 'mcq', 'A', 'B')
      expect(feedback).toContain('Incorrect')
      expect(feedback).toContain('B')
    })
  })
})


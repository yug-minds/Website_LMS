import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MCQQuestion from '../questions/MCQQuestion'

describe('MCQQuestion', () => {
  const mockQuestion = {
    id: '1',
    question: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    correct_answer: 1,
    marks: 1
  }

  const mockOnAnswerChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders question text and options', () => {
    render(
      <MCQQuestion
        question={mockQuestion}
        index={0}
        totalQuestions={1}
        onAnswerChange={mockOnAnswerChange}
      />
    )

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('calls onAnswerChange when option is selected', () => {
    render(
      <MCQQuestion
        question={mockQuestion}
        index={0}
        totalQuestions={1}
        onAnswerChange={mockOnAnswerChange}
      />
    )

    const option = screen.getByLabelText(/Option B: 4/)
    fireEvent.click(option)

    expect(mockOnAnswerChange).toHaveBeenCalledWith(1)
  })

  it('shows correct answer when showCorrectAnswer is true', () => {
    render(
      <MCQQuestion
        question={mockQuestion}
        index={0}
        totalQuestions={1}
        selectedAnswer={1}
        onAnswerChange={mockOnAnswerChange}
        showCorrectAnswer={true}
      />
    )

    expect(screen.getByText('Correct')).toBeInTheDocument()
  })

  it('disables interaction when disabled prop is true', () => {
    render(
      <MCQQuestion
        question={mockQuestion}
        index={0}
        totalQuestions={1}
        onAnswerChange={mockOnAnswerChange}
        disabled={true}
      />
    )

    const option = screen.getByLabelText(/Option A: 3/)
    expect(option).toBeDisabled()
  })
})


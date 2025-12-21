import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SchoolGradeSelector } from '../SchoolGradeSelector';

// Mock the fetchWithCsrf function
vi.mock('../../../lib/csrf-client', () => ({
  fetchWithCsrf: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        schools: [
          { id: '1', name: 'School 1', school_code: 'SCH1' },
          { id: '2', name: 'School 2', school_code: 'SCH2' },
        ],
      }),
    })
  ),
}));

describe('SchoolGradeSelector', () => {
  const mockOnSchoolChange = vi.fn();
  const mockOnGradeChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders school and grade selection fields', () => {
    render(
      <SchoolGradeSelector
        selectedSchoolIds={[]}
        selectedGrades={[]}
        onSchoolChange={mockOnSchoolChange}
        onGradeChange={mockOnGradeChange}
      />
    );

    expect(screen.getByLabelText(/schools/i)).toBeInTheDocument();
    expect(screen.getByText(/grades/i)).toBeInTheDocument();
  });

  it('displays selected schools as badges', () => {
    render(
      <SchoolGradeSelector
        selectedSchoolIds={['1', '2']}
        selectedGrades={[]}
        onSchoolChange={mockOnSchoolChange}
        onGradeChange={mockOnGradeChange}
      />
    );

    // Should show selected schools (mocked data)
    expect(screen.getByText(/School 1/i)).toBeInTheDocument();
  });

  it('calls onGradeChange when a grade is selected', () => {
    render(
      <SchoolGradeSelector
        selectedSchoolIds={[]}
        selectedGrades={[]}
        onSchoolChange={mockOnSchoolChange}
        onGradeChange={mockOnGradeChange}
      />
    );

    const gradeCheckbox = screen.getByLabelText(/Grade 1/i);
    fireEvent.click(gradeCheckbox);

    expect(mockOnGradeChange).toHaveBeenCalledWith(['grade1']);
  });

  it('shows validation error when required and no schools selected', () => {
    render(
      <SchoolGradeSelector
        selectedSchoolIds={[]}
        selectedGrades={[]}
        onSchoolChange={mockOnSchoolChange}
        onGradeChange={mockOnGradeChange}
        required
        error="Please select at least one school"
      />
    );

    expect(screen.getByText(/Please select at least one school/i)).toBeInTheDocument();
  });

  it('disables interaction when disabled prop is true', () => {
    render(
      <SchoolGradeSelector
        selectedSchoolIds={[]}
        selectedGrades={[]}
        onSchoolChange={mockOnSchoolChange}
        onGradeChange={mockOnGradeChange}
        disabled
      />
    );

    const input = screen.getByLabelText(/schools/i);
    expect(input).toBeDisabled();
  });
});






















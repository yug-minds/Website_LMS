"use client";

import React, { useEffect } from "react";
import { useStudentAssignment } from "../../../../../hooks/useStudentData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { Button } from "../../../../../components/ui/button";
import { Badge } from "../../../../../components/ui/badge";
import { 
  ArrowLeft,
  CheckCircle,
  XCircle,
  FileText,
  Download,
  AlertCircle
} from "lucide-react";
import Link from "next/link";

interface Question {
  id: string;
  question?: string;
  question_text?: string;
  question_type?: string;
  options?: string[];
  correct_answer?: number | string | string[];
  marks?: number;
  word_limit?: number;
  explanation?: string;
  order_index?: number;
}

interface AnswerValue {
  type: 'mcq' | 'essay' | 'fill_blank';
  value: number | string | string[];
}

type PageProps = {
  params: Promise<{ assignmentId: string }>;
};

export default function ViewSubmissionPage(props: PageProps) {
  const params = React.use(props.params);
  const assignmentId = params.assignmentId;

  const { data, isLoading, error } = useStudentAssignment(assignmentId);

  const assignment = data?.assignment;
  const submission = data?.submission;
  const questions = assignment?.questions || [];

  // Debug logging
  useEffect(() => {
    console.log('🔍 [ViewSubmissionPage] Data loaded:', {
      isLoading,
      hasData: !!data,
      hasAssignment: !!assignment,
      hasSubmission: !!submission,
      submissionId: submission?.id,
      submissionStatus: submission?.status,
      submissionGrade: submission?.grade,
      submissionSubmittedAt: submission?.submitted_at,
      submissionAnswersJson: !!submission?.answers_json,
      submissionTextContent: !!submission?.text_content,
      submissionStudentId: submission?.student_id,
      submissionAssignmentId: submission?.assignment_id,
      questionsCount: questions.length,
      assignmentId: assignmentId,
      rawData: data,
      rawSubmission: submission
    });
  }, [isLoading, data, assignment, submission, questions, assignmentId]);

  // Wait for data to load before checking for submission
  if (isLoading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <p className="text-gray-600">Loading submission...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-300" />
              <p className="text-lg font-medium mb-2">Error Loading Submission</p>
              <p className="text-gray-600 mb-4">{(error as any)?.message || 'An error occurred'}</p>
              <Link href="/student/assignments">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Assignments
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine effective submission - use the submission directly if it exists
  const submissionToUse = submission;

  // Extract student answers from submission
  const studentAnswers: { [questionId: string]: AnswerValue } = {};
  
  if (submissionToUse && questions.length > 0) {
    // Handle answers from answers_json (MCQ, FillBlank, and Essay stored by index)
    if (submissionToUse.answers_json && typeof submissionToUse.answers_json === 'object') {
      Object.entries(submissionToUse.answers_json).forEach(([index, value]) => {
        const questionIndex = parseInt(index);
        if (!isNaN(questionIndex) && questions[questionIndex]) {
          const question = questions[questionIndex];
          const questionType = question.question_type?.toLowerCase();
          
          if (questionType === 'mcq') {
            studentAnswers[question.id] = {
              type: 'mcq',
              value: value as number
            };
          } else if (questionType === 'fillblank' || questionType === 'fill_blank') {
            studentAnswers[question.id] = {
              type: 'fill_blank',
              value: Array.isArray(value) ? value : [value as string]
            };
          } else if (questionType === 'essay' && typeof value === 'string') {
            studentAnswers[question.id] = {
              type: 'essay',
              value: value
            };
          }
        }
      });
    }
    
    // Handle Essay answers from text_content (fallback if not in answers_json)
    if (submissionToUse.text_content) {
      const essayQuestion = questions.find((q: Question) => {
        const qType = q.question_type?.toLowerCase();
        return qType === 'essay' && !studentAnswers[q.id];
      });
      if (essayQuestion) {
        studentAnswers[essayQuestion.id] = {
          type: 'essay',
          value: submissionToUse.text_content
        };
      }
    }
  }

  // Normalize answer for comparison (same logic as grading)
  const normalizeAnswer = (text: string): string => {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  };

  // Check if answer is correct - matches grading logic exactly
  const isAnswerCorrect = (question: Question, answer: AnswerValue | undefined): boolean | undefined => {
    if (!answer || !question.correct_answer) return undefined;
    
    const questionType = question.question_type?.toLowerCase();
    
    if (questionType === 'mcq' || questionType === 'multiple_choice') {
      // Student answer is stored as index (number)
      if (answer.type !== 'mcq' || typeof answer.value !== 'number') {
        return undefined;
      }
      
      const studentAnswerIndex = answer.value;
      const correctAnswer = question.correct_answer;
      
      // Handle different formats of correct_answer
      if (typeof correctAnswer === 'number') {
        // correct_answer is an index
        return studentAnswerIndex === correctAnswer;
      } else if (typeof correctAnswer === 'string') {
        // correct_answer could be:
        // 1. A numeric string (index) - e.g., "2"
        // 2. The actual option text - e.g., "MIT"
        
        const parsedCorrectIndex = parseInt(correctAnswer);
        
        if (!isNaN(parsedCorrectIndex) && parsedCorrectIndex >= 0 && 
            question.options && parsedCorrectIndex < question.options.length) {
          // correct_answer is a numeric string (index)
          return studentAnswerIndex === parsedCorrectIndex;
        } else {
          // correct_answer is option text, need to compare text values
          const studentOptionText = question.options?.[studentAnswerIndex] || '';
          const correctOptionText = correctAnswer;
          
          // Compare normalized text
          return normalizeAnswer(studentOptionText) === normalizeAnswer(correctOptionText);
        }
      }
      
      return undefined;
    }
    
    if (questionType === 'fillblank' || questionType === 'fill_blank') {
      const correctAnswers = Array.isArray(question.correct_answer) 
        ? question.correct_answer.map((a: any) => String(a).toLowerCase().trim())
        : [String(question.correct_answer).toLowerCase().trim()];
      
      if (answer.type === 'fill_blank' && Array.isArray(answer.value)) {
        const studentAnswers = answer.value.map((a: any) => String(a).toLowerCase().trim());
        return correctAnswers.length === studentAnswers.length &&
               correctAnswers.every((correct, idx) => correct === studentAnswers[idx]);
      }
    }
    
    // Essay questions are manually graded, so we can't determine correctness automatically
    return undefined;
  };

  // Render question with answer evaluation
  const renderQuestionWithEvaluation = (question: Question, index: number) => {
    const answer = studentAnswers[question.id];
    const isCorrect = isAnswerCorrect(question, answer);
    const questionType = question.question_type?.toLowerCase() || '';
    const normalizedType = questionType === 'fillblank' ? 'fill_blank' : questionType;

    switch (normalizedType) {
      case 'mcq':
        return (
          <Card key={question.id} className={`mb-6 ${isCorrect === false ? 'border-red-200 bg-red-50/30' : isCorrect === true ? 'border-green-200 bg-green-50/30' : ''}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-600">
                    Question {index + 1} of {questions.length}
                  </span>
                  {question.marks && (
                    <Badge variant="outline" className="text-xs">
                      {question.marks} {question.marks === 1 ? 'point' : 'points'}
                    </Badge>
                  )}
                </div>
                {isCorrect !== undefined && (
                  <Badge 
                    className={`text-xs font-semibold ${
                      isCorrect 
                        ? 'bg-green-100 text-green-800 border-green-300' 
                        : 'bg-red-100 text-red-800 border-red-300'
                    }`}
                  >
                    {isCorrect ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1 inline" />
                        Correct
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1 inline" />
                        Incorrect
                      </>
                    )}
                  </Badge>
                )}
              </div>

              <p className="font-medium text-lg mb-6">
                {question.question || question.question_text || 'Question'}
              </p>

              <div className="space-y-3">
                {question.options && question.options.map((option, optIndex) => {
                  const isSelected = answer?.type === 'mcq' && typeof answer.value === 'number' && answer.value === optIndex;
                  
                  // Determine if this option is correct - handle both index and text formats
                  let isCorrectOption = false;
                  if (question.correct_answer !== undefined && question.correct_answer !== null) {
                    if (typeof question.correct_answer === 'number') {
                      isCorrectOption = question.correct_answer === optIndex;
                    } else if (typeof question.correct_answer === 'string') {
                      const parsedIndex = parseInt(question.correct_answer);
                      if (!isNaN(parsedIndex) && parsedIndex >= 0 && question.options && parsedIndex < question.options.length) {
                        // It's a numeric string (index)
                        isCorrectOption = parsedIndex === optIndex;
                      } else {
                        // It's option text - compare normalized
                        isCorrectOption = normalizeAnswer(option) === normalizeAnswer(question.correct_answer);
                      }
                    }
                  }
                  
                  return (
                    <div
                      key={optIndex}
                      className={`p-4 border-2 rounded-lg ${
                        isCorrectOption 
                          ? 'border-green-500 bg-green-50' 
                          : isSelected && !isCorrectOption
                          ? 'border-red-500 bg-red-50'
                          : isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="font-medium text-gray-500 min-w-[24px]">
                            {String.fromCharCode(65 + optIndex)}.
                          </span>
                          <span className="flex-1">{option}</span>
                        </div>
                        {isCorrectOption && (
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            Correct Answer
                          </Badge>
                        )}
                        {isSelected && !isCorrectOption && (
                          <Badge className="bg-red-100 text-red-800 text-xs">
                            Your Answer
                          </Badge>
                        )}
                        {isSelected && isCorrectOption && (
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            Your Answer ✓
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isCorrect === false && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-medium text-yellow-800 mb-1">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    Correct Answer:
                  </p>
                  {(() => {
                    // Determine correct answer display - handle both index and text formats
                    if (question.correct_answer !== undefined && question.correct_answer !== null) {
                      if (typeof question.correct_answer === 'number') {
                        // Index format
                        const correctOption = question.options?.[question.correct_answer];
                        return correctOption ? (
                          <p className="text-sm text-yellow-700">
                            {String.fromCharCode(65 + question.correct_answer)}. {correctOption}
                          </p>
                        ) : (
                          <p className="text-sm text-red-800">Could not find option at index {question.correct_answer}</p>
                        );
                      } else if (typeof question.correct_answer === 'string') {
                        const parsedIndex = parseInt(question.correct_answer);
                        if (!isNaN(parsedIndex) && parsedIndex >= 0 && question.options && parsedIndex < question.options.length) {
                          // Numeric string (index)
                          const correctOption = question.options[parsedIndex];
                          return correctOption ? (
                            <p className="text-sm text-yellow-700">
                              {String.fromCharCode(65 + parsedIndex)}. {correctOption}
                            </p>
                          ) : (
                            <p className="text-sm text-red-800">Could not find option at index {parsedIndex}</p>
                          );
                        } else {
                          // Option text format
                          // Find the index of the matching option
                          const correctIndex = question.options?.findIndex(opt => 
                            normalizeAnswer(opt) === normalizeAnswer(question.correct_answer as string)
                          );
                          if (correctIndex !== undefined && correctIndex >= 0 && question.options) {
                            return (
                              <p className="text-sm text-yellow-700">
                                {String.fromCharCode(65 + correctIndex)}. {question.options[correctIndex]}
                              </p>
                            );
                          } else {
                            return (
                              <p className="text-sm text-yellow-700">
                                {question.correct_answer as string}
                              </p>
                            );
                          }
                        }
                      }
                    }
                    return <p className="text-sm text-red-800">Correct answer not available</p>;
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 'essay':
        return (
          <Card key={question.id} className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-600">
                    Question {index + 1} of {questions.length}
                  </span>
                  {question.marks && (
                    <Badge variant="outline" className="text-xs">
                      {question.marks} {question.marks === 1 ? 'point' : 'points'}
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                  Manually Graded
                </Badge>
              </div>

              <p className="font-medium text-lg mb-4">
                {question.question || question.question_text || 'Question'}
              </p>

              <div className="space-y-3">
                <div className="p-4 border-2 border-blue-300 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-2">Your Answer:</p>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {answer?.type === 'essay' && typeof answer.value === 'string' 
                      ? answer.value 
                      : 'No answer submitted'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'fill_blank':
        return (
          <Card key={question.id} className={`mb-6 ${isCorrect === false ? 'border-red-200 bg-red-50/30' : isCorrect === true ? 'border-green-200 bg-green-50/30' : ''}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-600">
                    Question {index + 1} of {questions.length}
                  </span>
                  {question.marks && (
                    <Badge variant="outline" className="text-xs">
                      {question.marks} {question.marks === 1 ? 'point' : 'points'}
                    </Badge>
                  )}
                </div>
                {isCorrect !== undefined && (
                  <Badge 
                    className={`text-xs font-semibold ${
                      isCorrect 
                        ? 'bg-green-100 text-green-800 border-green-300' 
                        : 'bg-red-100 text-red-800 border-red-300'
                    }`}
                  >
                    {isCorrect ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1 inline" />
                        Correct
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1 inline" />
                        Incorrect
                      </>
                    )}
                  </Badge>
                )}
              </div>

              <p className="font-medium text-lg mb-6">
                {question.question || question.question_text || 'Question'}
              </p>

              <div className="space-y-3">
                {answer?.type === 'fill_blank' && Array.isArray(answer.value) && (
                  <div className="space-y-2">
                    {answer.value.map((studentAnswer, blankIndex) => {
                      const correctAnswer = Array.isArray(question.correct_answer)
                        ? question.correct_answer[blankIndex]
                        : question.correct_answer;
                      const isBlankCorrect = String(studentAnswer).toLowerCase().trim() === 
                                           String(correctAnswer).toLowerCase().trim();
                      
                      return (
                        <div
                          key={blankIndex}
                          className={`p-3 border-2 rounded-lg ${
                            isBlankCorrect
                              ? 'border-green-500 bg-green-50'
                              : 'border-red-500 bg-red-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Blank {blankIndex + 1}:</p>
                              <p className="font-medium">{studentAnswer || '(empty)'}</p>
                            </div>
                            {!isBlankCorrect && (
                              <div className="text-right">
                                <p className="text-xs text-gray-600 mb-1">Correct:</p>
                                <p className="font-medium text-green-700">{correctAnswer}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );

      default:
        return (
          <Card key={question.id} className="mb-6">
            <CardContent className="p-6">
              <p className="font-medium mb-2">
                {index + 1}. {question.question || question.question_text || 'Question'}
              </p>
              <p className="text-sm text-gray-500">Unknown question type: {questionType}</p>
            </CardContent>
          </Card>
        );
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <p className="text-lg font-medium mb-2">Error Loading Submission</p>
              <p className="text-gray-600 mb-4">{(error as any)?.message || 'Failed to load submission data'}</p>
              <Link href="/student/assignments">
                <Button>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Assignments
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No assignment found
  if (!assignment) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Assignment not found</p>
              <Link href="/student/assignments">
                <Button className="mt-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Assignments
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No submission found
  if (!submissionToUse) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">No Submission Found</p>
              <p className="text-gray-600 mb-4">
                You haven&apos;t submitted this assignment yet.
              </p>
              <div className="text-xs text-gray-500 mb-4 p-3 bg-gray-50 rounded max-h-96 overflow-y-auto">
                <p><strong>Debug Info:</strong></p>
                <p>Assignment ID: {assignmentId}</p>
                <p>Is loading: {isLoading ? 'Yes' : 'No'}</p>
                <p>Has data object: {data ? 'Yes' : 'No'}</p>
                <p>Has assignment: {assignment ? 'Yes' : 'No'}</p>
                <p>Has submission data: {submission ? 'Yes' : 'No'}</p>
                {submission && (
                  <>
                    <p>Submission ID: {submission.id}</p>
                    <p>Status: {submission.status || 'null'}</p>
                    <p>Student ID: {submission.student_id}</p>
                    <p>Assignment ID: {submission.assignment_id}</p>
                    <p>Has answers_json: {submission.answers_json ? 'Yes' : 'No'}</p>
                    <p>Has text_content: {submission.text_content ? 'Yes' : 'No'}</p>
                    <p>Grade: {submission.grade !== null && submission.grade !== undefined ? submission.grade : 'null'}</p>
                    <p>Submitted at: {submission.submitted_at || 'null'}</p>
                  </>
                )}
                {data && (
                  <>
                    <p>Raw data keys: {Object.keys(data).join(', ')}</p>
                    <p>Raw submission from data: {data.submission ? 'Yes' : 'No'}</p>
                    {data.submission && (
                      <p>Raw submission ID: {data.submission.id}</p>
                    )}
                  </>
                )}
                {error && (
                  <>
                    <p className="text-red-600">Error: {(error as any)?.message || 'Unknown error'}</p>
                  </>
                )}
              </div>
              <div className="flex gap-3 justify-center">
                <Link href="/student/assignments">
                  <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Assignments
                  </Button>
                </Link>
                <Link href={`/student/assignments/${assignmentId}`}>
                  <Button>
                    Start Assignment
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasGrade = submissionToUse.grade !== null && submissionToUse.grade !== undefined;
  const gradeValue = typeof submissionToUse.grade === 'number' 
    ? submissionToUse.grade 
    : parseFloat(submissionToUse.grade || '0');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/student/assignments">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Assignments
          </Button>
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{assignment.title}</h1>
              <Badge variant="outline">SUBMISSION REVIEW</Badge>
            </div>
            <p className="text-gray-600">{assignment.courses?.[0]?.title || 'Assignment'}</p>
          </div>
        </div>
      </div>

      {/* Submission Summary Card */}
      <Card className={hasGrade ? 'border-green-200 shadow-md' : 'border-blue-200'}>
        <CardHeader className={hasGrade ? 'bg-green-50 border-b border-green-200' : 'bg-blue-50 border-b border-blue-200'}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                {hasGrade ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span>Assignment Graded</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span>Your Submission</span>
                  </>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {submissionToUse.submitted_at 
                  ? `Submitted on ${new Date(submissionToUse.submitted_at).toLocaleString()}`
                  : submissionToUse.created_at
                  ? `Created on ${new Date(submissionToUse.created_at).toLocaleString()}`
                  : 'Submission details'}
              </CardDescription>
            </div>
            {hasGrade && (
              <Badge className={`text-lg font-bold px-4 py-2 ${
                gradeValue >= 70 
                  ? 'bg-green-600 text-white' 
                  : gradeValue >= 50
                  ? 'bg-yellow-600 text-white'
                  : 'bg-red-600 text-white'
              }`}>
                {gradeValue}%
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {submissionToUse.feedback && (
            <div className={`p-4 rounded-lg mb-4 ${
              hasGrade ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
            }`}>
              <p className="text-sm font-medium mb-1">Feedback:</p>
              <p className="text-gray-700">{submissionToUse.feedback}</p>
            </div>
          )}

          {submissionToUse.file_url && (
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Uploaded File:</p>
              <a href={submissionToUse.file_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download Submission
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Questions with Answers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Your Answers</h2>
          {hasGrade && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Correct answers shown
            </Badge>
          )}
        </div>

        {questions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">No questions found for this assignment.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {questions.map((question: Question, index: number) => 
              renderQuestionWithEvaluation(question, index)
            )}
          </div>
        )}
      </div>
    </div>
  );
}


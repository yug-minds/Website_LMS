"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { 
  FileText, 
  ArrowLeft,
  Calendar,
  Clock,
  Award,
  Upload,
  CheckCircle,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { useStudentAssignment, useSubmitAssignment } from "../../../../hooks/useStudentData";
import { useAutoSaveForm } from "../../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../../lib/form-persistence";
import MCQQuestion from "../../../../components/student/assignments/questions/MCQQuestion";
import EssayQuestion from "../../../../components/student/assignments/questions/EssayQuestion";
import FillBlankQuestion from "../../../../components/student/assignments/questions/FillBlankQuestion";

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
  value: number | string | string[]; // MCQ: option index, Essay: text, FillBlank: array of strings
}

type PageProps = {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function AssignmentDetailPage(props: PageProps) {
  const router = useRouter();
  const params = React.use(props.params);
  const searchParams = React.use(props.searchParams);
  const assignmentId = params.assignmentId;

  const { data, isLoading } = useStudentAssignment(assignmentId);
  const submitAssignment = useSubmitAssignment();

  // Load saved assignment submission data
  const savedSubmissionData = typeof window !== 'undefined' 
    ? loadFormData<{
        answers: { [questionId: string]: AnswerValue };
        fileName?: string;
      }>(`student-assignment-${assignmentId}`)
    : null;

  // Initialize submission mode based on data availability
  // Don't allow submission mode if assignment is already submitted/graded
  const [submissionMode, setSubmissionMode] = useState(false);
  // Unified answers state: { [questionId]: { type, value } }
  const [answers, setAnswers] = useState<{ [questionId: string]: AnswerValue }>(
    savedSubmissionData?.answers || {}
  );
  const [fileUpload, setFileUpload] = useState<File | null>(null);
  const [fileUploadName, setFileUploadName] = useState<string | null>(
    savedSubmissionData?.fileName || null
  );
  const [uploading, setUploading] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const assignment = data?.assignment;
  const submission = data?.submission;
  const questions = assignment?.questions || [];
  
  // Infer assignment type from questions if assignment_type is not set or doesn't match
  const effectiveAssignmentType = useMemo(() => {
    if (assignment?.assignment_type) {
      return assignment.assignment_type.toLowerCase();
    }
    // Infer from questions
    if (questions.length > 0) {
      const firstQuestion = questions[0];
      if (firstQuestion?.question_type) {
        const questionType = firstQuestion.question_type.toLowerCase();
        if (questionType === 'mcq') return 'mcq';
        if (questionType === 'essay') return 'essay';
        if (questionType === 'fillblank' || questionType === 'fill_blank') return 'fill_blank';
      }
      // Check if question has options (MCQ indicator)
      if (firstQuestion?.options && Array.isArray(firstQuestion.options) && firstQuestion.options.length > 0) {
        return 'mcq';
      }
    }
    // Default fallback
    return assignment?.assignment_type?.toLowerCase() || 'essay';
  }, [assignment?.assignment_type, questions]);
  
  // Debug logging for assignment type detection
  useEffect(() => {
    if (assignment && questions.length > 0) {
      console.log('📝 Assignment type detection:', {
        assignment_type: assignment.assignment_type,
        effective_type: effectiveAssignmentType,
        questions_count: questions.length,
        first_question_type: questions[0]?.question_type,
        first_question_has_options: questions[0]?.options?.length > 0,
        first_question_options: questions[0]?.options
      });
    }
  }, [assignment, questions, effectiveAssignmentType]);
  
  // Calculate progress - count questions with answers
  const answeredQuestions = useMemo(() => {
    return questions.filter((q: Question) => {
      const answer = answers[q.id];
      if (!answer) return false;
      
      switch (answer.type) {
        case 'mcq':
          return typeof answer.value === 'number' && answer.value >= 0;
        case 'essay':
          return typeof answer.value === 'string' && answer.value.trim().length > 0;
        case 'fill_blank':
          return Array.isArray(answer.value) && answer.value.some((v: string) => v && v.trim().length > 0);
        default:
          return false;
      }
    }).length;
  }, [answers, questions]);
  
  const progressPercentage = questions.length > 0 
    ? Math.round((answeredQuestions / questions.length) * 100) 
    : 0;

  // Auto-save assignment submission
  const { isDirty: isSubmissionDirty, clearSavedData } = useAutoSaveForm({
    formId: `student-assignment-${assignmentId}`,
    formData: {
      answers,
      fileName: fileUploadName || fileUpload?.name || undefined,
    },
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: true, // Use sessionStorage for assignment drafts
    onLoad: (data) => {
      if (data && !submission) {
        // Only load if no existing submission
        if (data.answers) setAnswers(data.answers);
        if (data.fileName) setFileUploadName(data.fileName);
      }
    },
    markDirty: true,
  });

  // Load submission data into answers state
  useEffect(() => {
    if (submission && questions.length > 0) {
      const submissionAnswers: { [questionId: string]: AnswerValue } = {};
      
      // Handle answers from answers_json (MCQ, FillBlank, and Essay stored by index)
      if (submission.answers_json && typeof submission.answers_json === 'object') {
        Object.entries(submission.answers_json).forEach(([index, value]) => {
          const questionIndex = parseInt(index);
          if (!isNaN(questionIndex) && questions[questionIndex]) {
            const question = questions[questionIndex];
            const questionType = question.question_type?.toLowerCase();
            
            if (questionType === 'mcq') {
              submissionAnswers[question.id] = {
                type: 'mcq',
                value: value as number
              };
            } else if (questionType === 'fillblank' || questionType === 'fill_blank') {
              // FillBlank answers are stored as arrays
              submissionAnswers[question.id] = {
                type: 'fill_blank',
                value: Array.isArray(value) ? value : [value as string]
              };
            } else if (questionType === 'essay' && typeof value === 'string') {
              // Essay can also be stored in answers_json by index
              submissionAnswers[question.id] = {
                type: 'essay',
                value: value
              };
            }
          }
        });
      }
      
      // Handle Essay answers from text_content (fallback if not in answers_json)
      if (submission.text_content) {
        const essayQuestion = questions.find((q: Question) => {
          const qType = q.question_type?.toLowerCase();
          return qType === 'essay' && !submissionAnswers[q.id];
        });
        if (essayQuestion) {
          submissionAnswers[essayQuestion.id] = {
            type: 'essay',
            value: submission.text_content
          };
        }
      }
      
      if (Object.keys(submissionAnswers).length > 0) {
        setAnswers(submissionAnswers);
      }
      
      // Clear saved draft if submission exists
      clearFormData(`student-assignment-${assignmentId}`);
      clearSavedData();
    }
  }, [submission, questions, assignmentId, clearSavedData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileUpload(file);
      setFileUploadName(file.name);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${assignmentId}/${Date.now()}.${fileExt}`;
    const filePath = `submissions/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('student-uploads')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('student-uploads')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  // Determine if assignment can be submitted - must be calculated before early returns
  const hasGrade = submission && (submission.grade !== null && submission.grade !== undefined);
  const isSubmittedOrGraded = submission && (
    submission.status === 'submitted' || 
    submission.status === 'graded' || 
    hasGrade ||
    (submission.submitted_at !== null && submission.submitted_at !== undefined)
  );
  const canSubmit = !isSubmittedOrGraded;
  
  // Prevent submission mode if already submitted/graded
  // This must run before the query param check and whenever submission data changes
  // IMPORTANT: This hook must be called BEFORE any early returns to avoid hooks order violation
  useEffect(() => {
    const action = searchParams.action;
    if (isSubmittedOrGraded) {
      // Force view mode if already submitted/graded
      setSubmissionMode(false);
    } else if (action === 'submit' && canSubmit && !submissionMode) {
      // Only allow submission mode if not already submitted and query param says so
      setSubmissionMode(true);
    }
  }, [isSubmittedOrGraded, canSubmit, searchParams, submissionMode]);

  const handleSubmit = async () => {
    try {
      setUploading(true);

      let fileUrl: string | undefined;
      if (fileUpload) {
        fileUrl = await uploadFile(fileUpload);
      }

      // Transform unified answers state to API format
      const mcqAnswersMap: { [key: number]: number } = {};
      let essayTextContent: string | undefined;
      const fillBlankAnswers: string[][] = [];

      questions.forEach((q: Question, index: number) => {
        const answer = answers[q.id];
        if (!answer) return;

        const questionType = q.question_type?.toLowerCase();
        
        if (questionType === 'mcq' && answer.type === 'mcq' && typeof answer.value === 'number') {
          mcqAnswersMap[index] = answer.value;
        } else if (questionType === 'essay' && answer.type === 'essay' && typeof answer.value === 'string') {
          essayTextContent = answer.value;
        } else if ((questionType === 'fillblank' || questionType === 'fill_blank') && 
                   answer.type === 'fill_blank' && Array.isArray(answer.value)) {
          fillBlankAnswers[index] = answer.value;
        }
      });

      // Determine which format to send based on question types
      const hasMCQ = Object.keys(mcqAnswersMap).length > 0;
      const hasEssay = !!essayTextContent;
      const hasFillBlank = fillBlankAnswers.length > 0;

      // For mixed types, we'll send answers_json with all answers
      // The API should handle this appropriately
      const allAnswers: Record<string, unknown> = {};
      if (hasMCQ) {
        Object.assign(allAnswers, mcqAnswersMap);
      }
      if (hasFillBlank) {
        fillBlankAnswers.forEach((ans, idx) => {
          allAnswers[idx] = ans;
        });
      }

      await submitAssignment.mutateAsync({
        assignmentId,
        answers: hasMCQ || hasFillBlank ? allAnswers : undefined,
        fileUrl: fileUrl,
        textContent: hasEssay ? essayTextContent : undefined
      });

      // Clear saved draft after successful submission
      clearFormData(`student-assignment-${assignmentId}`);
      clearSavedData();

      alert('Assignment submitted successfully!');
      setSubmissionMode(false);
      router.push('/student/assignments');
    } catch (error: unknown) {
      console.error('Error submitting assignment:', error);
      const errorMessage =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message || "Failed to submit assignment. Please try again.")
          : 'Failed to submit assignment. Please try again.';
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

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

  // Safely parse due date
  let dueDate: Date | null = null
  let daysUntilDue = 0
  let isOverdue = false
  
  if (assignment?.due_date) {
    try {
      dueDate = new Date(assignment.due_date)
      // Check if date is valid
      if (isNaN(dueDate.getTime())) {
        console.warn('Invalid due_date:', assignment.due_date)
        dueDate = null
      } else {
        const now = new Date()
        daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        isOverdue = dueDate < now && !submission
      }
    } catch (e) {
      console.error('Error parsing due_date:', e)
      dueDate = null
    }
  }

  // Render question based on its type
  const renderQuestion = (question: Question, index: number, disabled: boolean = false, showCorrectAnswer: boolean = false) => {
    const questionType = question.question_type?.toLowerCase() || '';
    const answer = answers[question.id];
    
    // Debug logging
    console.log('🔍 RenderQuestion Debug:', {
      questionId: question.id,
      questionType,
      correctAnswer: question.correct_answer,
      correctAnswerType: typeof question.correct_answer,
      options: question.options,
      showCorrectAnswer,
      answer
    });
    
    // Normalize question type
    let normalizedType = questionType;
    if (normalizedType === 'fillblank' || normalizedType === 'fill_blank') {
      normalizedType = 'fill_blank';
    }

    switch (normalizedType) {
      case 'mcq':
        return (
          <MCQQuestion
            key={question.id}
            question={{
              id: question.id,
              question: question.question || question.question_text || '',
              question_text: question.question_text,
              options: question.options || [],
              correct_answer: Array.isArray(question.correct_answer) ? question.correct_answer[0] : question.correct_answer,
              marks: question.marks
            }}
            index={index}
            totalQuestions={questions.length}
            selectedAnswer={answer?.type === 'mcq' && typeof answer.value === 'number' ? answer.value : undefined}
            onAnswerChange={(answerIndex: number) => {
              setAnswers(prev => ({
                ...prev,
                [question.id]: { type: 'mcq', value: answerIndex }
              }));
            }}
            showCorrectAnswer={showCorrectAnswer}
            disabled={disabled}
          />
        );

      case 'essay':
        return (
          <EssayQuestion
            key={question.id}
            question={{
              id: question.id,
              question: question.question || question.question_text || '',
              question_text: question.question_text,
              marks: question.marks,
              word_limit: question.word_limit
            }}
            index={index}
            totalQuestions={questions.length}
            answer={answer?.type === 'essay' && typeof answer.value === 'string' ? answer.value : ''}
            onAnswerChange={(answerText: string) => {
              setAnswers(prev => ({
                ...prev,
                [question.id]: { type: 'essay', value: answerText }
              }));
            }}
            disabled={disabled}
          />
        );

      case 'fill_blank':
        return (
          <FillBlankQuestion
            key={question.id}
            question={{
              id: question.id,
              question: question.question || question.question_text || '',
              question_text: question.question_text,
              correct_answer: question.correct_answer as string | string[],
              marks: question.marks
            }}
            index={index}
            totalQuestions={questions.length}
            answers={answer?.type === 'fill_blank' && Array.isArray(answer.value) ? answer.value : []}
            onAnswerChange={(blankIndex: number, blankAnswer: string) => {
              const currentAnswers = answer?.type === 'fill_blank' && Array.isArray(answer.value) 
                ? [...answer.value] 
                : [];
              currentAnswers[blankIndex] = blankAnswer;
              setAnswers(prev => ({
                ...prev,
                [question.id]: { type: 'fill_blank', value: currentAnswers }
              }));
            }}
            showCorrectAnswer={showCorrectAnswer}
            disabled={disabled}
          />
        );

      default:
        return (
          <Card key={question.id} className="p-6">
            <p className="font-medium mb-2">
              {index + 1}. {question.question || question.question_text || 'Question'}
            </p>
            <p className="text-sm text-gray-500">Unknown question type: {questionType}</p>
            {question.marks && (
              <p className="text-xs text-gray-500 mt-2">Marks: {question.marks}</p>
            )}
          </Card>
        );
    }
  };

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
              <Badge variant="outline">{(effectiveAssignmentType || 'assignment').toUpperCase()}</Badge>
            </div>
            <p className="text-gray-600">{assignment.courses?.[0]?.title}</p>
          </div>
          {canSubmit && !submissionMode && !isSubmittedOrGraded && (
            <Button onClick={() => setSubmissionMode(true)} size="lg" className="ml-6">
              <Upload className="h-5 w-5 mr-2" />
              {submission ? 'Resubmit' : 'Submit Assignment'}
            </Button>
          )}
          {(isSubmittedOrGraded || (submission && submission.submitted_at)) && (
            <Badge className="ml-6 px-4 py-2 text-sm" variant="outline">
              {hasGrade || (submission && submission.grade !== null && submission.grade !== undefined) ? (
                <>
                  <Award className="h-4 w-4 mr-2 inline" />
                  Graded - View Only
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2 inline" />
                  Submitted - View Only
                </>
              )}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {dueDate ? dueDate.toLocaleDateString() : 'Not set'}
            </div>
            <p className="text-xs text-muted-foreground">
              {dueDate ? (
                isOverdue ? (
                  <span className="text-red-600">Overdue by {Math.abs(daysUntilDue)} days</span>
                ) : (
                  <span>{daysUntilDue} days remaining</span>
                )
              ) : (
                <span className="text-gray-400">No due date</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Marks</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{assignment.max_marks}</div>
            <p className="text-xs text-muted-foreground">Total points</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attempts</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {isSubmittedOrGraded ? '1' : '0'} / {assignment.max_attempts || 1}
            </div>
            <p className="text-xs text-muted-foreground">Submissions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            {isSubmittedOrGraded && hasGrade ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : isSubmittedOrGraded ? (
              <Upload className="h-4 w-4 text-blue-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-lg font-bold capitalize ${
              isSubmittedOrGraded && hasGrade ? 'text-green-600' : 
              isSubmittedOrGraded ? 'text-blue-600' : 
              'text-gray-900'
            }`}>
              {isSubmittedOrGraded && hasGrade 
                ? 'Graded' 
                : isSubmittedOrGraded 
                ? 'Submitted' 
                : 'Not Started'}
            </div>
            {hasGrade && (
              <p className="text-xs text-muted-foreground">Grade: {submission.grade}%</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      {submissionMode && questions.length > 0 && (
        <Card className="border-none shadow-none bg-transparent">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm text-gray-600">{answeredQuestions} / {questions.length} answered</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-3000"
                style={{ width: `${progressPercentage}%` }}
                role="progressbar"
                aria-valuenow={progressPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
        </Card>
      )}

      {/* Timer */}
      {dueDate && submissionMode && (
        <div className={`p-4 rounded-lg flex items-center justify-between mb-4 border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-2">
            <Clock className={`h-5 w-5 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`} />
            <span className={`font-medium ${isOverdue ? 'text-red-700' : 'text-blue-700'}`}>
              {isOverdue ? 'Assignment Overdue' : 'Time Remaining'}
            </span>
          </div>
          <span className={`font-bold ${isOverdue ? 'text-red-700' : 'text-blue-700'}`}>
             {isOverdue ? (
                  <span>Overdue by {Math.abs(daysUntilDue)} days</span>
                ) : (
                  <span>{daysUntilDue} days remaining</span>
                )}
          </span>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignment Details & Submission */}
        <div className="lg:col-span-2 space-y-6">
          {/* Assignment Description */}
          <Card className="overflow-hidden">
            <div className="bg-gray-50 border-b p-4">
               <h3 className="font-semibold text-gray-900">Instructions</h3>
            </div>
            <CardContent className="p-6">
              <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed">
                 <p>{assignment.description || 'No specific instructions provided.'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Assignment Questions - Show only if not submitted/graded, otherwise show in submission details */}
          {assignment.questions && assignment.questions.length > 0 && !submissionMode && !isSubmittedOrGraded && (
            <Card>
              <CardHeader className="border-b bg-gray-50/50">
                <CardTitle className="flex justify-between items-center text-lg">
                    <span>Assignment Content</span>
                    <Badge variant="secondary">{questions.length} Question{questions.length !== 1 ? 's' : ''}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                  <div className="divide-y">
                     {questions.map((q: Question, index: number) => (
                       <div key={q.id} className="p-6 bg-white opacity-60 hover:opacity-100 transition-opacity">
                            {renderQuestion(q, index, true, false)}
                       </div>
                     ))}
                  </div>
                
                {canSubmit && !submission && !isSubmittedOrGraded && (
                  <div className="p-6 bg-gray-50 border-t flex justify-center">
                    <Button onClick={() => setSubmissionMode(true)} size="lg" className="px-8 shadow-md hover:shadow-lg transition-all text-base">
                      <Upload className="h-5 w-5 mr-2" />
                      Start Assignment
                    </Button>
                  </div>
                )}
                {isSubmittedOrGraded && (
                  <div className="p-6 bg-blue-50 border-t flex justify-center">
                    <div className="text-center">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                      <p className="text-sm font-medium text-gray-700">Assignment already submitted</p>
                      <p className="text-xs text-gray-500 mt-1">View your submission below</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submission Form */}
          {submissionMode && canSubmit && (
            <Card className="border-blue-200 shadow-lg ring-1 ring-blue-100">
               <div className="bg-blue-600 text-white p-4 flex justify-between items-center rounded-t-lg">
                    <h3 className="font-semibold text-lg">Assignment Submission</h3>
                    <div className="text-xs bg-blue-700 px-2 py-1 rounded text-blue-100">Auto-saving enabled</div>
               </div>

              <CardContent className="p-6 space-y-8">
                {questions.length > 1 ? (
                  // Show one question at a time if multiple questions
                  <div className="min-h-[200px]">
                      {renderQuestion(questions[currentQuestionIndex] as Question, currentQuestionIndex, false, false)}
                      
                      {/* Navigation Logic */}
                      <div className="flex justify-between mt-8 pt-4 border-t">
                          <Button 
                            variant="outline" 
                            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentQuestionIndex === 0}
                          >
                             <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                          </Button>
                          <div className="flex items-center gap-1">
                             {questions.map((_: Question, idx: number) => (
                                 <div 
                                    key={idx} 
                                    className={`h-2 w-2 rounded-full cursor-pointer transition-colors ${idx === currentQuestionIndex ? 'bg-blue-600' : 'bg-gray-200'}`}
                                    onClick={() => setCurrentQuestionIndex(idx)}
                                 />
                             ))}
                          </div>
                           <Button 
                            variant="outline" 
                            onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                            disabled={currentQuestionIndex === questions.length - 1}
                          >
                             Next <ChevronRight className="h-4 w-4 ml-2" />
                          </Button>
                      </div>
                  </div>
                ) : (
                  // Show all questions if only one
                  <div className="space-y-8 divide-y divide-gray-100">
                    {questions.map((q: Question, index: number) => (
                        <div key={q.id} className="pt-4 first:pt-0">
                            {renderQuestion(q, index, false, false)}
                        </div>
                    ))}
                  </div>
                )}

                {/* Project/File Upload Type - only for project/quiz assignments */}
                {(effectiveAssignmentType === 'project' || effectiveAssignmentType === 'quiz') && (
                  <div className="space-y-4 p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <Label htmlFor="file" className="text-base font-semibold block mb-2">Upload Your Work</Label>
                    <div className="flex items-center gap-4">
                        <Input
                        id="file"
                        type="file"
                        onChange={handleFileChange}
                        accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
                        className="bg-white"
                        />
                        {fileUpload && (
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-green-600 flex items-center">
                                    <CheckCircle2 className="h-4 w-4 mr-1"/> Ready to upload
                                </span>
                                <span className="text-xs text-gray-500">{fileUpload.name}</span>
                            </div>
                        )}
                    </div>
                     <p className="text-xs text-gray-500">Supported formats: PDF, Word, Images, ZIP. </p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                  <Button variant="ghost" onClick={() => setSubmissionMode(false)} className="text-gray-500 hover:text-gray-700">
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={uploading} size="lg" className="px-8 bg-blue-600 hover:bg-blue-700">
                    {uploading ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Submit Assignment
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submission Details - View Only Mode - Always show if submission exists */}
          {submission && (
            <Card className={(submission.status === 'graded' || hasGrade) ? 'border-green-200 shadow-md' : 'border-blue-200'}>
              <CardHeader className={(submission.status === 'graded' || hasGrade) ? 'bg-green-50 border-b border-green-200' : 'bg-blue-50 border-b border-blue-200'}>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      {(submission.status === 'graded' || hasGrade) ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <span>Assignment Graded</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-blue-600" />
                          <span>Your Submission</span>
                        </>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Submitted on {new Date(submission.submitted_at).toLocaleString()}
                    </CardDescription>
                  </div>
                  {(submission.status === 'graded' || hasGrade) && submission.grade !== null && (
                    <Badge className={`text-lg font-bold px-4 py-2 ${
                      (typeof submission.grade === 'number' ? submission.grade : parseFloat(submission.grade)) >= 70 
                        ? 'bg-green-600 text-white' 
                        : (typeof submission.grade === 'number' ? submission.grade : parseFloat(submission.grade)) >= 50
                        ? 'bg-yellow-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}>
                      {typeof submission.grade === 'number' ? submission.grade : parseFloat(submission.grade)}%
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Submitted Answers - Render each question with its answer and show correct answers if graded */}
                {questions.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-lg">Review Your Answers</h3>
                      {(submission.status === 'graded' || hasGrade) && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Correct answers shown
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-6">
                      {questions.map((q: Question, index: number) => 
                        renderQuestion(q, index, true, (submission.status === 'graded' || hasGrade))
                      )}
                    </div>
                  </div>
                )}

                {/* File Upload */}
                {submission.file_url && (
                  <div>
                    <h3 className="font-medium mb-2">Uploaded File:</h3>
                    <a href={submission.file_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download Submission
                      </Button>
                    </a>
                  </div>
                )}

                {/* Grade & Feedback */}
                {submission.status === 'graded' && (
                  <div className={`border-t pt-4 mt-4 ${
                    submission.grade && submission.grade >= 70 
                      ? 'bg-green-50 border-green-200' 
                      : submission.grade && submission.grade >= 50
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-red-50 border-red-200'
                  } rounded-lg p-4`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Award className={`h-6 w-6 ${
                          submission.grade && submission.grade >= 70 
                            ? 'text-green-600' 
                            : submission.grade && submission.grade >= 50
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`} />
                        <h3 className="font-semibold text-lg text-gray-900">Your Grade</h3>
                      </div>
                      <Badge className={`text-2xl font-bold px-6 py-3 ${
                        submission.grade && submission.grade >= 70 
                          ? 'bg-green-600 text-white' 
                          : submission.grade && submission.grade >= 50
                          ? 'bg-yellow-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}>
                        {submission.grade}%
                      </Badge>
                    </div>
                    {submission.feedback && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <h4 className="font-semibold text-sm mb-2 text-gray-900 flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
                          Feedback:
                        </h4>
                        <p className="text-gray-700 leading-relaxed">{submission.feedback}</p>
                      </div>
                    )}
                  </div>
                )}
                {submission.status === 'submitted' && submission.grade === null && (
                  <div className="border-t pt-4 mt-4 bg-blue-50 border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="h-5 w-5 text-blue-600" />
                        <div>
                          <h3 className="font-semibold text-gray-900">Submission Received</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            Your assignment has been submitted successfully. It will be graded soon.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/debug/regrade-assignment', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                assignmentId: assignmentId,
                                submissionId: submission.id
                              })
                            })
                            const result = await response.json()
                            if (result.success) {
                              alert('Assignment re-graded successfully!')
                              window.location.reload()
                            } else {
                              alert('Error re-grading: ' + result.error)
                            }
                          } catch (error) {
                            alert('Error: ' + error)
                          }
                        }}
                      >
                        Re-grade
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Debug re-grade button for graded assignments too */}
                {(submission.status === 'graded' || hasGrade) && (
                  <div className="border-t pt-4 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/debug/regrade-assignment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              assignmentId: assignmentId,
                              submissionId: submission.id
                            })
                          })
                          const result = await response.json()
                          if (result.success) {
                            alert('Assignment re-graded successfully!')
                            window.location.reload()
                          } else {
                            alert('Error re-grading: ' + result.error)
                          }
                        } catch (error) {
                          alert('Error: ' + error)
                        }
                      }}
                    >
                      🔄 Re-grade (Debug)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Question Navigation - Only show in submission mode with multiple questions */}
          {submissionMode && questions.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Questions</CardTitle>
                <CardDescription>
                  Navigate between questions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q: Question, index: number) => {
                    const answer = answers[q.id];
                    const isAnswered = answer && (
                      (answer.type === 'mcq' && typeof answer.value === 'number' && answer.value >= 0) ||
                      (answer.type === 'essay' && typeof answer.value === 'string' && answer.value.trim().length > 0) ||
                      (answer.type === 'fill_blank' && Array.isArray(answer.value) && answer.value.some((v: string) => v && v.trim().length > 0))
                    );
                    const isCurrent = index === currentQuestionIndex;
                    const questionType = q.question_type?.toLowerCase() || '';
                    
                    // Get type badge
                    const getTypeBadge = () => {
                      if (questionType === 'mcq') return 'M';
                      if (questionType === 'essay') return 'E';
                      if (questionType === 'fillblank' || questionType === 'fill_blank') return 'F';
                      return '?';
                    };
                    
                    return (
                      <button
                        key={index}
                        onClick={() => setCurrentQuestionIndex(index)}
                        className={`
                          aspect-square rounded-lg border-2 flex flex-col items-center justify-center
                          transition-all duration-200 text-xs
                          ${isCurrent 
                            ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' 
                            : isAnswered
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                          }
                        `}
                        aria-label={`Question ${index + 1} (${questionType})${isAnswered ? ', answered' : ''}${isCurrent ? ', current' : ''}`}
                        aria-current={isCurrent ? 'true' : 'false'}
                        title={`Question ${index + 1}: ${questionType.toUpperCase()}`}
                      >
                        {isAnswered ? (
                          <CheckCircle2 className="h-4 w-4 mb-1" />
                        ) : (
                          <Circle className="h-4 w-4 mb-1" />
                        )}
                        <span className="text-[10px] font-medium">{getTypeBadge()}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-4 flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                    disabled={currentQuestionIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
                    disabled={currentQuestionIndex === questions.length - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assignment Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Assignment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-gray-600">Course</p>
                <p className="font-medium">{assignment.courses?.[0]?.title}</p>
              </div>
              <div>
                <p className="text-gray-600">Type</p>
                <p className="font-medium capitalize">{effectiveAssignmentType}</p>
              </div>
              <div>
                <p className="text-gray-600">Max Marks</p>
                <p className="font-medium">{assignment.max_marks} points</p>
              </div>
              <div>
                <p className="text-gray-600">Due Date</p>
                <p className="font-medium">
                  {dueDate 
                    ? `${dueDate.toLocaleDateString()} at ${dueDate.toLocaleTimeString()}`
                    : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Attempts Allowed</p>
                <p className="font-medium">{assignment.max_attempts || 1}</p>
              </div>
            </CardContent>
          </Card>

          {/* Help */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Need Help?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                If you have questions about this assignment, reach out to your teacher.
              </p>
              <Button variant="outline" size="sm" className="w-full">
                Contact Teacher
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}







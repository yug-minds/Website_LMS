"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTeacherSchool } from "../context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Badge } from "../../../components/ui/badge";
import { 
  useTeacherClasses, 
  useTeacherReports, 
  useSubmitReport,
  useTeacherPeriods,
  useTeacherSchedules
} from "../../../hooks/useTeacherData";
import { Calendar, FileText, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { useAutoSaveForm } from "../../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../../lib/form-persistence";

/**
 * Submit Daily Teaching Report Page
 * 
 * Allows teachers to submit daily teaching reports.
 * When a report is submitted, attendance is automatically marked as Present
 * (unless there's an existing Leave-Approved status).
 */
export default function SubmitReportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedSchool } = useTeacherSchool();
  
  const initialFormData = {
    period_id: '',
    grade: '', // Use grade instead of class_id
    date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    topics_taught: '',
    activities: '',
    notes: ''
  };
  
  // Load saved form data if available
  const savedFormData = typeof window !== 'undefined' 
    ? loadFormData<typeof initialFormData>('teacher-report-form') 
    : null;
  
  const [formData, setFormData] = useState(savedFormData || initialFormData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Enhanced auto-save with useAutoSaveForm hook
  const { isDirty: isFormDirty, clearSavedData } = useAutoSaveForm({
    formId: 'teacher-report-form',
    formData,
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && (!savedFormData || Object.keys(savedFormData).length === 0)) {
        setFormData(data);
      }
    },
    markDirty: true,
  });
  
  // Check if form has unsaved data
  const hasUnsavedData = () => {
    return isFormDirty && (
      formData.period_id !== '' ||
      formData.topics_taught !== '' ||
      formData.activities !== '' ||
      formData.notes !== ''
    );
  };

  const { data: classes, isLoading: classesLoading, refetch: refetchClasses } = useTeacherClasses(selectedSchool?.id);
  const { data: reports, isLoading: reportsLoading, refetch: refetchReports } = useTeacherReports(
    selectedSchool?.id,
    { date: formData.date }
  );
  const submitReport = useSubmitReport();

  // Get today's day name (Monday, Tuesday, etc.)
  const todayDayName = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    // Parse the date string (format: YYYY-MM-DD)
    const dateStr = formData.date;
    const date = new Date(dateStr + 'T00:00:00'); // Add time to avoid timezone issues
    
    // Validate the date
    if (isNaN(date.getTime())) {
      console.error('❌ Invalid date:', dateStr);
      return days[new Date().getDay()]; // Fallback to today
    }
    
    const dayIndex = date.getDay();
    const dayName = days[dayIndex];
    
    console.log('📅 Date calculation:', {
      dateStr,
      parsedDate: date.toISOString(),
      dayIndex,
      dayName,
      currentDate: new Date().toISOString()
    });
    
    return dayName;
  }, [formData.date]);

  const { data: periods, isLoading: periodsLoading, error: periodsError, refetch: refetchPeriods } = useTeacherPeriods(selectedSchool?.id, todayDayName);
  
  // Force refetch periods when school or day changes to ensure fresh data
  useEffect(() => {
    if (selectedSchool?.id && todayDayName) {
      console.log('🔄 Refetching periods for fresh data:', { schoolId: selectedSchool.id, day: todayDayName });
      refetchPeriods();
    }
  }, [selectedSchool?.id, todayDayName, refetchPeriods]);
  const { data: schedules, refetch: refetchSchedules } = useTeacherSchedules(selectedSchool?.id);

  // Get schedules for today
  const todaysSchedules = useMemo(() => {
    if (!schedules) return [];
     
    return schedules.filter((s: any) => s.day_of_week === todayDayName);
  }, [schedules, todayDayName]);

  // Refresh function to reload all data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate and refetch all queries
      // Note: Using partial query keys to invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher', 'periods', selectedSchool?.id, todayDayName] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'schedules', selectedSchool?.id] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'classes', selectedSchool?.id] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'reports', selectedSchool?.id] }),
        refetchPeriods(),
        refetchSchedules(),
        refetchClasses(),
        refetchReports()
      ]);
      console.log('✅ Data refreshed successfully');
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Use smart refresh hook instead of manual event listeners
  useSmartRefresh({
    queryKeys: [
      ['teacher', 'periods', selectedSchool?.id, todayDayName],
      ['teacher', 'schedules', selectedSchool?.id],
      ['teacher', 'reports', selectedSchool?.id]
    ],
    hasUnsavedData,
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  // Debug logging
  useEffect(() => {
    console.log('📊 Periods Debug:', {
      selectedSchool: selectedSchool?.id,
      todayDayName,
      formDataDate: formData.date,
      periodsCount: periods?.length || 0,
      periodsLoading,
      periodsError,
      periods: periods,
      todaysSchedulesCount: todaysSchedules.length,
      todaysSchedules: todaysSchedules
    });
  }, [selectedSchool, todayDayName, formData.date, periods, periodsLoading, periodsError, todaysSchedules]);

  // Get selected period details for display
  const selectedPeriod = useMemo(() => {
    if (!formData.period_id || !periods) return null;
     
    return periods.find((p: any) => p.id === formData.period_id);
  }, [formData.period_id, periods]);

  // Get matching schedule details for display
  const matchingSchedule = useMemo(() => {
    if (!formData.period_id || todaysSchedules.length === 0) return null;
     
    return todaysSchedules.find((s: any) => s.period_id === formData.period_id);
  }, [formData.period_id, todaysSchedules]);

  // When period is selected, auto-populate grade from the period's schedule
  // Use grade as the primary identifier (same as scheduling)
  useEffect(() => {
    if (!formData.period_id) {
      return; // No period selected
    }
    
    if (periodsLoading) {
      console.log('⏳ Periods are still loading, waiting...');
      return; // Wait for periods to load
    }
    
    if (!periods || periods.length === 0) {
      console.warn('⚠️ Periods list is empty or not loaded yet');
      return;
    }
    
    // Find the selected period from the periods list
     
    const period = periods.find((p: any) => p.id === formData.period_id);
    
    if (!period) {
      console.warn('⚠️ Period not found in periods list:', {
        period_id: formData.period_id,
         
        available_periods: periods.map((p: any) => ({ id: p.id, period_number: p.period_number }))
      });
      return;
    }
    
    // Get grade directly from the selected period
    // The period gets this information from the schedule (as assigned when period was scheduled)
    const periodGrade = period.grade; // Grade from the schedule
    
    // Debug logging
    console.log('🔍 Auto-populating grade from period\'s schedule:', {
      period_id: formData.period_id,
      periodGrade,
      period: {
        id: period.id,
        subject: period.subject,
        grade: period.grade, // Grade from schedule
        schedule_id: period.schedule_id
      }
    });
    
    // Auto-populate form fields from period
    // IMPORTANT: Use grade as the primary identifier (same as scheduling)
    if (periodGrade && periodGrade.trim() !== '') {
      setFormData(prev => {
        // Only update if the grade is different to avoid unnecessary re-renders
        if (prev.grade !== periodGrade) {
          console.log('✅ Setting grade in formData:', periodGrade);
          return {
            ...prev,
            grade: periodGrade, // Always set from period
            start_time: period.start_time || prev.start_time,
            end_time: period.end_time || prev.end_time,
          };
        }
        return prev;
      });
      console.log('✅ Successfully set grade from period\'s schedule:', periodGrade);
    } else {
      console.error('❌ No grade found in period!', {
        period_id: formData.period_id,
        period: {
          id: period.id,
          period_number: period.period_number,
          subject: period.subject,
          grade: period.grade,
          schedule_id: period.schedule_id
        }
      });
      
      // Clear grade if period doesn't have it
      setFormData(prev => ({
        ...prev,
        grade: '', // Clear if period doesn't have grade
        start_time: period.start_time || prev.start_time,
        end_time: period.end_time || prev.end_time,
      }));
    }
  }, [formData.period_id, periods, periodsLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!selectedSchool) {
      alert('Please select a school first');
      return;
    }

    if (!formData.period_id) {
      alert('Please select a period');
      return;
    }

    // Use the calculated finalGrade
    if (!finalGrade) {
      alert('Please select a period to get the grade information. If the issue persists, please contact support.');
      console.error('No grade available:', {
        formData,
        matchingSchedule,
        selectedPeriod,
        finalGrade
      });
      return;
    }

    // Check if topics_taught has content (not just whitespace)
    const topicsTrimmed = formData.topics_taught?.trim() || '';
    if (!topicsTrimmed) {
      alert('Please enter the topics you taught');
      return;
    }

    try {
      await submitReport.mutateAsync({
        school_id: selectedSchool.id,
        grade: finalGrade, // Use grade instead of class_id (same as scheduling)
        date: formData.date,
        start_time: formData.start_time || undefined,
        end_time: formData.end_time || undefined,
        topics_taught: formData.topics_taught || undefined,
        activities: formData.activities || undefined,
        notes: formData.notes || undefined
      });

      // Refetch reports to update the UI
      await refetchReports();
      
      // Reset form
      setFormData({
        period_id: '',
        grade: '', // Use grade instead of class_id
        date: new Date().toISOString().split('T')[0],
        start_time: '',
        end_time: '',
        topics_taught: '',
        activities: '',
        notes: ''
      });
      
      // Clear saved form data
      clearFormData('teacher-report-form');
      clearSavedData();

      alert('Report submitted successfully! Your attendance has been marked as Present.');
     
    } catch (error: any) {
      console.error('❌ Error submitting report:', {
        error,
        message: error?.message,
        response: error?.response,
        data: error?.data,
        details: error?.details,
        hint: error?.hint
      });
      
      // Extract error message from response if available
      let errorMessage = 'Unknown error';
      if (error?.response) {
        try {
          const errorData = await error.response.json();
          errorMessage = errorData.details || errorData.error || error.message;
        } catch (e) {
          errorMessage = error.message || 'Failed to submit report';
        }
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (error?.data?.details) {
        errorMessage = error.data.details;
      } else if (error?.data?.error) {
        errorMessage = error.data.error;
      }
      
      alert(`Error submitting report: ${errorMessage}`);
    }
  };

  const handleCancel = () => {
    router.push('/teacher');
  };

  // Calculate final grade from the selected period
  // Use grade as the primary identifier (same as scheduling)
  const finalGrade = useMemo(() => {
    // First, check if we have a period selected
    if (!formData.period_id) {
      return null;
    }
    
    // Priority 1: Use grade from form (which should be set from the period)
    if (formData.grade && formData.grade.trim() !== '') {
      console.log('✅ Using grade from formData:', formData.grade);
      return formData.grade;
    }
    
    // Priority 2: Find period from periods list and get grade
    if (periods && periods.length > 0) {
       
      const period = periods.find((p: any) => p.id === formData.period_id);
      if (period && period.grade) {
        console.log('✅ Using grade from period in periods list:', period.grade);
        return period.grade;
      }
    }
    
    // Priority 3: Use selectedPeriod if available
    if (selectedPeriod && selectedPeriod.grade) {
      console.log('✅ Using grade from selectedPeriod:', selectedPeriod.grade);
      return selectedPeriod.grade;
    }
    
    console.warn('⚠️ No grade found from any source:', {
      formData_grade: formData.grade,
      period_id: formData.period_id,
      periods_count: periods?.length || 0,
      selectedPeriod_exists: !!selectedPeriod
    });
    
    return null;
  }, [formData.grade, formData.period_id, periods, selectedPeriod]);

   
  const existingReport = reports?.find((r: any) => r.grade === finalGrade);

  // Separate periods into available and already submitted
  const { availablePeriods, submittedPeriods } = useMemo(() => {
    if (!periods || !reports) {
      return { availablePeriods: periods || [], submittedPeriods: [] };
    }

    // Get all grades that have reports for the selected date
    const submittedGrades = new Set(
      reports
         
        .filter((r: any) => r.date === formData.date)
         
        .map((r: any) => r.grade)
        .filter(Boolean)
    );

    // Separate periods
     
    const available: any[] = [];
     
    const submitted: any[] = [];

     
    periods.forEach((period: any) => {
      if (period.grade && submittedGrades.has(period.grade)) {
        // Find the report for this period
         
        const report = reports.find((r: any) => 
          r.grade === period.grade && r.date === formData.date
        );
        submitted.push({ ...period, report });
      } else {
        available.push(period);
      }
    });

    return { availablePeriods: available, submittedPeriods: submitted };
  }, [periods, reports, formData.date]);

  // Debug logging for button state
  useEffect(() => {
    console.log('🔍 Submit Button Debug:', {
      period_id: formData.period_id,
      grade: formData.grade,
      finalGrade,
      topics_taught: formData.topics_taught ? 'Yes' : 'No',
      topics_taught_length: formData.topics_taught?.length || 0,
      existingReport: existingReport ? 'Yes' : 'No',
      existingReportId: existingReport?.id,
      isPending: submitReport.isPending,
      buttonDisabled: submitReport.isPending || !formData.period_id || !finalGrade || !formData.topics_taught || existingReport,
      disabledReasons: {
        isPending: submitReport.isPending,
        noPeriod: !formData.period_id,
        noGrade: !finalGrade,
        noTopics: !formData.topics_taught,
        existingReport: !!existingReport
      },
      selectedPeriod: selectedPeriod ? {
        id: selectedPeriod.id,
        grade: selectedPeriod.grade,
        subject: selectedPeriod.subject
      } : null
    });
  }, [formData.period_id, formData.grade, formData.topics_taught, finalGrade, existingReport, submitReport.isPending, selectedPeriod]);

  if (!selectedSchool) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
              <p className="text-lg font-medium">No school selected</p>
              <p className="text-sm text-gray-600 mt-2">
                Please select a school from the dropdown to submit reports.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Submit Daily Report</h1>
          <p className="text-gray-600 mt-2">
            Submit your daily teaching report for {selectedSchool.name}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing || periodsLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submit Report Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Daily Teaching Report</CardTitle>
              <CardDescription>
                Fill in the details of your teaching session. Submitting this report will automatically mark your attendance as Present for today.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Period Selection */}
                <div className="space-y-2">
                  <Label htmlFor="period_id">Period *</Label>
                  <Select
                    value={formData.period_id}
                    onValueChange={(value) => setFormData({ ...formData, period_id: value })}
                    disabled={periodsLoading}
                    required
                  >
                    <SelectTrigger id="period_id">
                      <SelectValue placeholder="Select a period" />
                    </SelectTrigger>
                    <SelectContent>
                      {periodsLoading ? (
                        <SelectItem value="loading" disabled>Loading periods...</SelectItem>
                      ) : availablePeriods && availablePeriods.length > 0 ? (
                         
                        availablePeriods.map((period: any) => {
                          const formatTime = (time: string) => {
                            if (!time) return '';
                            const [hours, minutes] = time.split(':');
                            const hour = parseInt(hours);
                            const ampm = hour >= 12 ? 'PM' : 'AM';
                            const displayHour = hour % 12 || 12;
                            return `${displayHour}:${minutes} ${ampm}`;
                          };
                          
                          // Display period with grade information from schedule
                          // Grade is the primary identifier
                          const gradeInfo = period.grade ? ` [${period.grade}]` : '';
                          const subjectInfo = period.subject ? ` (${period.subject})` : '';
                          
                          return (
                            <SelectItem key={period.id} value={period.id}>
                              Period {period.period_number} - {formatTime(period.start_time)} to {formatTime(period.end_time)}{gradeInfo}{subjectInfo}
                            </SelectItem>
                          );
                        })
                      ) : (
                        <SelectItem value="no-periods" disabled>No periods available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedPeriod && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800 font-medium mb-1">
                        Period information for {todayDayName} (from schedule):
                      </p>
                      {/* Grade from schedule - displayed prominently */}
                      {selectedPeriod.grade && (
                        <p className="text-xs text-blue-700 mb-1">
                          <strong>Grade:</strong> {selectedPeriod.grade} <span className="text-blue-600">(from schedule)</span>
                        </p>
                      )}
                      <p className="text-xs text-blue-700">
                        <strong>Class:</strong> {
                          selectedPeriod.class_name || 
                          (selectedPeriod.subject && selectedPeriod.grade 
                            ? `${selectedPeriod.subject} - ${selectedPeriod.grade}` 
                            : selectedPeriod.subject || selectedPeriod.grade || 'N/A')
                        }
                      </p>
                      {selectedPeriod.subject && (
                        <p className="text-xs text-blue-700">
                          <strong>Subject:</strong> {selectedPeriod.subject}
                        </p>
                      )}
                      <p className="text-xs text-blue-700">
                        <strong>Time:</strong> {selectedPeriod.start_time} - {selectedPeriod.end_time}
                      </p>
                    </div>
                  )}
                  
                  {/* Show submitted periods */}
                  {submittedPeriods && submittedPeriods.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Already Submitted Periods</Label>
                      <div className="space-y-2">
                        {submittedPeriods.map((periodWithReport: any) => {
                          const formatTime = (time: string) => {
                            if (!time) return '';
                            const [hours, minutes] = time.split(':');
                            const hour = parseInt(hours);
                            const ampm = hour >= 12 ? 'PM' : 'AM';
                            const displayHour = hour % 12 || 12;
                            return `${displayHour}:${minutes} ${ampm}`;
                          };
                          
                          const gradeInfo = periodWithReport.grade ? ` [${periodWithReport.grade}]` : '';
                          const subjectInfo = periodWithReport.subject ? ` (${periodWithReport.subject})` : '';
                          
                          return (
                            <div 
                              key={periodWithReport.id} 
                              className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <span className="text-sm text-green-800">
                                  Period {periodWithReport.period_number} - {formatTime(periodWithReport.start_time)} to {formatTime(periodWithReport.end_time)}{gradeInfo}{subjectInfo}
                                </span>
                              </div>
                              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                Already Submitted
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Class Information (from selected period's schedule) */}
                {finalGrade && selectedPeriod && (
                  <div className="space-y-2">
                    <Label>Class Information (from schedule)</Label>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-1">
                      {/* Display grade prominently - this comes from the schedule form */}
                      {/* Display grade */}
                      <p className="text-sm font-medium text-gray-900">
                        <span className="text-gray-600">Grade:</span> {
                          selectedPeriod.grade || 'N/A'
                        }
                        {selectedPeriod.subject && selectedPeriod.grade && (
                          <span className="text-gray-500"> • {selectedPeriod.subject}</span>
                        )}
                      </p>
                      {selectedPeriod.subject && (
                        <p className="text-sm text-gray-700">
                          <span className="text-gray-600">Subject:</span> {selectedPeriod.subject}
                        </p>
                      )}
                    </div>
                    {existingReport && (
                      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-sm text-yellow-800">
                          <AlertCircle className="h-4 w-4 inline mr-2" />
                          You have already submitted a report for this class today.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Date */}
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>

                {/* Time Display (read-only from period) */}
                {(formData.start_time || formData.end_time) && (
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                      <p className="text-sm font-medium text-gray-900">
                        {formData.start_time && formData.end_time
                          ? `${formData.start_time} - ${formData.end_time}`
                          : formData.start_time
                          ? `Start: ${formData.start_time}`
                          : formData.end_time
                          ? `End: ${formData.end_time}`
                          : 'Time will be set from selected period'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Topics Taught */}
                <div className="space-y-2">
                  <Label htmlFor="topics_taught">Topics Taught *</Label>
                  <Textarea
                    id="topics_taught"
                    placeholder="Enter the topics you taught today..."
                    value={formData.topics_taught}
                    onChange={(e) => setFormData({ ...formData, topics_taught: e.target.value })}
                    rows={4}
                    required
                  />
                </div>

                {/* Activities */}
                <div className="space-y-2">
                  <Label htmlFor="activities">Activities Conducted</Label>
                  <Textarea
                    id="activities"
                    placeholder="Enter the activities conducted..."
                    value={formData.activities}
                    onChange={(e) => setFormData({ ...formData, activities: e.target.value })}
                    rows={4}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes or observations..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Submit Button */}
                <div className="space-y-2">
                  {/* Show why button is disabled */}
                  {(!formData.period_id || !finalGrade || !formData.topics_taught?.trim() || existingReport) && !submitReport.isPending && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800">
                      <p className="font-medium mb-1">Please complete the following:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {!formData.period_id && <li>Select a period</li>}
                        {!finalGrade && formData.period_id && (
                          <li>
                            Grade information is missing (try selecting the period again or refresh the page)
                            {selectedPeriod && (
                              <span className="block mt-1 text-yellow-700">
                                Debug: Period has grade: {selectedPeriod.grade ? `"${selectedPeriod.grade}"` : 'null/empty'}
                              </span>
                            )}
                          </li>
                        )}
                        {!formData.topics_taught?.trim() && <li>Enter topics taught</li>}
                        {existingReport && <li>You have already submitted a report for this grade today</li>}
                      </ul>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <Button
                      type="submit"
                      disabled={submitReport.isPending || !formData.period_id || !finalGrade || !formData.topics_taught?.trim() || existingReport}
                      className="flex-1"
                    >
                      {submitReport.isPending ? 'Submitting...' : 'Submit Report'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Recent Reports Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Recent Reports</CardTitle>
              <CardDescription>Your latest submitted reports</CardDescription>
            </CardHeader>
            <CardContent>
              {reportsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : reports && reports.length > 0 ? (
                <div className="space-y-3">
                  {reports.slice(0, 5).map((report: any) => (
                    <div
                      key={report.id}
                      className="p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {report.grade || report.classes?.[0]?.grade || 'N/A'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {new Date(report.date).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={
                          report.report_status === 'Approved' ? 'default' :
                          report.report_status === 'Flagged' ? 'destructive' :
                          'secondary'
                        }>
                          {report.report_status}
                        </Badge>
                      </div>
                      {report.topics_taught && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {report.topics_taught}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No reports yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

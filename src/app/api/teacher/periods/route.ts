import { NextRequest, NextResponse } from 'next/server';
import { getTeacherUserId } from '../../../../lib/teacher-auth';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET /api/teacher/periods
// Fetch periods with associated class information for the authenticated teacher on a given day
export async function GET(request: NextRequest) {
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

try {
    const teacherId = await getTeacherUserId(request);
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id') || undefined;
    const day = searchParams.get('day'); // Day of the week (e.g., "Monday")
    
    // Validate day parameter
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (day && !validDays.includes(day)) {
      console.error(`❌ Invalid day parameter: ${day}. Valid days are: ${validDays.join(', ')}`);
      return NextResponse.json(
        { error: 'Invalid day parameter', details: `Day must be one of: ${validDays.join(', ')}` },
        { status: 400 }
      );
    }
    
    console.log(`📅 Periods API called with day: ${day}, schoolId: ${schoolId || 'undefined'}`);

    // Get teacher's school_id if not provided
    let finalSchoolId = schoolId;
    
    if (!finalSchoolId) {
      logger.debug('Fetching teacher school assignment', { 
        userId: teacherId, 
        endpoint: '/api/teacher/periods' 
      });

      // Get teacher's school_id from teacher_schools (primary source of truth)
      const { data: teacherSchools, error: teacherSchoolsError } = await supabaseAdmin
        .from('teacher_schools')
        .select('school_id, is_primary')
        .eq('teacher_id', teacherId)
        .order('is_primary', { ascending: false })
         
        .limit(1) as any;

      if (teacherSchoolsError) {
        logger.error('Failed to fetch teacher school assignment', {
          userId: teacherId,
          endpoint: '/api/teacher/periods',
        }, teacherSchoolsError);
        
        const errorInfo = await handleApiError(
          teacherSchoolsError,
          { userId: teacherId, endpoint: '/api/teacher/periods' },
          'Failed to fetch teacher school assignment'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }

      if (teacherSchools && teacherSchools.length > 0) {
        // Use primary school if available, otherwise first school
        finalSchoolId = teacherSchools[0].school_id;
        logger.info('Teacher school assignment found', {
          userId: teacherId,
          schoolId: finalSchoolId,
          isPrimary: teacherSchools[0].is_primary,
          endpoint: '/api/teacher/periods',
        });
      } else {
        logger.warn('Teacher has no school assignment', {
          userId: teacherId,
          endpoint: '/api/teacher/periods',
        });
        
        return NextResponse.json(
          {
            error: 'Teacher not assigned to any school',
            details: 'Please contact your administrator to assign you to a school.',
            status: 404,
          },
          { status: 404 }
        );
      }
    }

    if (!finalSchoolId) {
      logger.error('Unable to determine school for teacher', {
        userId: teacherId,
        endpoint: '/api/teacher/periods',
      });
      
      return NextResponse.json(
        {
          error: 'Unable to determine school for teacher',
          details: 'School ID is required but could not be determined.',
          status: 404,
        },
        { status: 404 }
      );
    }

    // If day is provided, fetch schedules for that day and get periods with class info
    if (day) {
      // Fetch schedules for that day to get periods with class info
      // Use a simpler query that doesn't require the classes join (which may fail if class_id is null)
      const { data: schedules, error: schedulesError } = await supabaseAdmin
        .from('class_schedules')
        .select(`
          id,
          period_id,
          class_id,
          subject,
          grade,
          day_of_week,
          start_time,
          end_time,
          created_at,
          period:periods!period_id (
            id,
            period_number,
            start_time,
            end_time
          )
        `)
        .eq('teacher_id', teacherId)
        .eq('school_id', finalSchoolId)
        .eq('day_of_week', day)
        .eq('is_active', true)
         
        .order('created_at', { ascending: false }) as any; // Most recent first

      if (schedulesError) {
        logger.error('Failed to fetch schedules for periods', {
          userId: teacherId,
          schoolId: finalSchoolId,
          day,
          endpoint: '/api/teacher/periods',
        }, schedulesError);
        
        const errorInfo = await handleApiError(
          schedulesError,
          { userId: teacherId, schoolId: finalSchoolId, day, endpoint: '/api/teacher/periods' },
          'Failed to fetch periods'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }

      console.log(`🔍 Fetching periods for day: ${day}, teacher: ${teacherId}, school: ${finalSchoolId}`);
      console.log(`📅 Found ${schedules?.length || 0} schedules for ${day}`);
      
      // If no schedules found, return empty array
      if (!schedules || schedules.length === 0) {
        console.warn(`⚠️ No schedules found for day: ${day}, teacher: ${teacherId}, school: ${finalSchoolId}`);
        return NextResponse.json({ periods: [] });
      }
      
      if (schedules && schedules.length > 0) {
         
        console.log('📋 Schedule details:', schedules.map((s: any) => ({
          id: s.id,
          period_id: s.period_id,
          class_id: s.class_id,
          hasClassId: !!s.class_id,
          period: s.period ? { id: s.period.id, period_number: s.period.period_number } : null,
          subject: s.subject,
          grade: s.grade,
          day_of_week: s.day_of_week
        })));
        
        // Check for duplicate period_ids on the same day (this shouldn't happen, but let's log it)
        const periodIdCounts = new Map();
         
        schedules.forEach((s: any) => {
          const periodId = s.period?.id || s.period_id;
          if (periodId) {
            periodIdCounts.set(periodId, (periodIdCounts.get(periodId) || 0) + 1);
          }
        });
        
        const duplicatePeriods = Array.from(periodIdCounts.entries()).filter(([_, count]) => count > 1);
        if (duplicatePeriods.length > 0) {
          console.warn('⚠️ Found multiple schedules for the same period on the same day:', duplicatePeriods.map(([periodId, count]) => {
             
            const matchingSchedules = schedules.filter((s: any) => (s.period?.id || s.period_id) === periodId);
            return {
              period_id: periodId,
              count,
               
              schedules: matchingSchedules.map((s: any) => ({
                id: s.id,
                subject: s.subject,
                grade: s.grade,
                class_id: s.class_id
              }))
            };
          }));
        }
        
        // Check if any schedules are missing class_id
         
        const schedulesWithoutClassId = schedules.filter((s: any) => !s.class_id);
        if (schedulesWithoutClassId.length > 0) {
           
          console.warn('⚠️ Found schedules without class_id:', schedulesWithoutClassId.map((s: any) => ({
            id: s.id,
            period_id: s.period_id,
            subject: s.subject,
            grade: s.grade
          })));
        }
      }

      // Collect all period_ids from schedules (even if join failed)
      const periodIds = new Set<string>();
      if (schedules && schedules.length > 0) {
         
        schedules.forEach((schedule: any) => {
          if (schedule.period_id) {
            periodIds.add(schedule.period_id);
          }
        });
      }

      console.log(`🔍 Found ${periodIds.size} unique period IDs from schedules`);

      // Fetch all period details in one query
      const periodDetailsMap = new Map();
      if (periodIds.size > 0) {
        const { data: periodDetails, error: periodDetailsError } = await supabaseAdmin
          .from('periods')
          .select('id, period_number, start_time, end_time')
          .in('id', Array.from(periodIds))
           
          .eq('school_id', finalSchoolId) as any;
        
        if (periodDetailsError) {
          console.error('Error fetching period details:', periodDetailsError);
        } else if (periodDetails) {
           
          periodDetails.forEach((pd: any) => {
            periodDetailsMap.set(pd.id, pd);
          });
          console.log(`✅ Fetched ${periodDetails.length} period details`);
        }
      }

      // Transform schedules into unique periods with class information
      // IMPORTANT: If there are multiple schedules for the same period on the same day,
      // we need to handle them properly. We'll create a unique key combining period_id and schedule_id
      // to ensure all schedules are represented, or at least the most recent/active one.
      const periodsMap = new Map();

      // Helper function to find or create class_id from classes table when schedule doesn't have it
      // Uses grade (and subject) to find or create a class entry
      const findClassIdFromClasses = async (subject: string, grade: string, schoolId: string) => {
        if (!grade || !schoolId) {
          console.warn('⚠️ Cannot find class_id: missing grade or schoolId', { grade, schoolId: schoolId || undefined });
          return null;
        }
        
        try {
          console.log(`🔍 Searching for class_id with grade: ${grade}, subject: ${subject || 'N/A'}, schoolId: ${schoolId || 'undefined'}`);
          
          // First, try to find by subject and grade
          if (subject && subject.trim() !== '') {
            const { data: classesBySubject, error: errorBySubject } = await supabaseAdmin
              .from('classes')
              .select('id')
              .eq('school_id', schoolId)
              .eq('grade', grade)
              .eq('subject', subject)
              .eq('is_active', true)
               
              .limit(1) as any;
            
            if (errorBySubject) {
              console.error('❌ Error searching by subject+grade:', errorBySubject);
            } else if (classesBySubject && classesBySubject.length > 0) {
              console.log(`✅ Found class_id from classes table (by subject+grade): ${classesBySubject[0].id} for subject: ${subject}, grade: ${grade}`);
              return classesBySubject[0].id;
            } else {
              console.log(`ℹ️ No class found by subject+grade: ${subject}, ${grade}`);
            }
          }
          
          // Fallback: try to find by grade only (use grade as class identifier)
          console.log(`🔍 Searching for class_id by grade only: ${grade}`);
          const { data: classesByGrade, error: errorByGrade } = await supabaseAdmin
            .from('classes')
            .select('id')
            .eq('school_id', schoolId)
            .eq('grade', grade)
            .eq('is_active', true)
             
            .limit(1) as any;
          
          if (errorByGrade) {
            console.error('❌ Error searching by grade:', errorByGrade);
          } else if (classesByGrade && classesByGrade.length > 0) {
            console.log(`✅ Found class_id from classes table (by grade only): ${classesByGrade[0].id} for grade: ${grade}`);
            return classesByGrade[0].id;
          } else {
            console.log(`ℹ️ No class found by grade: ${grade}`);
          }
          
          // If not found, create a new class entry using grade (and subject if available)
          console.log(`🔍 Class not found, creating new class entry for grade: ${grade}, subject: ${subject || 'N/A'}`);
          const className = subject && subject.trim() !== ''
            ? `${subject} - ${grade}`
            : `Class - ${grade}`;
          
          console.log(`📝 Creating class with name: ${className}, grade: ${grade}, subject: ${subject || null}`);
           
          const { data: newClass, error: createError } = await ((supabaseAdmin as any)
            .from('classes')
            .insert({
              school_id: schoolId,
              class_name: className,
              grade: grade,
              subject: subject && subject.trim() !== '' ? subject : null,
              academic_year: '2024-25',
              is_active: true
             
            } as any)
            .select('id')
             
            .single() as any) as any;
          
          if (createError) {
            console.error('❌ Error creating class entry:', createError);
            // If there's a unique constraint error, try to find the existing class
            if (createError.code === '23505' || createError.message.includes('duplicate')) {
              console.log('🔄 Duplicate detected, trying to find existing class...');
              const { data: existingClass } = await supabaseAdmin
                .from('classes')
                .select('id')
                .eq('school_id', schoolId)
                .eq('grade', grade)
                .eq('is_active', true)
                 
                .limit(1) as any;
              
              if (existingClass && existingClass.length > 0) {
                console.log(`✅ Found existing class after duplicate error: ${existingClass[0].id}`);
                return existingClass[0].id;
              }
            }
            return null;
          }
          
          if (newClass && newClass.id) {
            console.log(`✅ Created new class entry with class_id: ${newClass.id} for grade: ${grade}, subject: ${subject || 'N/A'}`);
            return newClass.id;
          }
          
          console.warn('⚠️ Class creation returned no ID');
          return null;
        } catch (error) {
          logger.warn('Exception finding/creating class_id (non-critical)', {
            endpoint: '/api/teacher/periods',
          }, error instanceof Error ? error : new Error(String(error)));
          return null;
        }
      };

      if (schedules && schedules.length > 0) {
        // Sort schedules by creation time (most recent first) to prioritize newer schedules
        // This ensures if there are multiple schedules for the same period, we use the most recent one
        const sortedSchedules = [...schedules].sort((a: any, b: any) => {
          // If schedules have created_at, use that; otherwise use id as fallback
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime; // Most recent first
        });

        // Process schedules and find class_id if missing
        for (const schedule of sortedSchedules) {
          const periodId = (Array.isArray(schedule.period) && schedule.period[0]?.id) || schedule.period_id;
          
          if (!periodId) {
            console.warn('⚠️ Schedule has no period_id:', schedule.id);
            continue;
          }
          
          // If period already exists, check if we should replace it
          // We'll use the most recent schedule (since we sorted above)
          // But also log if we're skipping a schedule
          if (periodsMap.has(periodId)) {
            const existingPeriod = periodsMap.get(periodId);
            console.warn(`⚠️ Multiple schedules found for period ${periodId} on ${day}:`, {
              existing: {
                schedule_id: existingPeriod.schedule_id,
                subject: existingPeriod.subject,
                grade: existingPeriod.grade,
                class_id: existingPeriod.class_id
              },
              new: {
                schedule_id: schedule.id,
                subject: schedule.subject,
                grade: schedule.grade,
                class_id: schedule.class_id
              }
            });
            // Only replace if the new schedule is more recent or has a class_id when the existing doesn't
            const existingHasClassId = !!existingPeriod.class_id;
            const newHasClassId = !!schedule.class_id;
            
            // Prefer schedule with class_id, or if both have it, keep the existing (first one we saw)
            if (!existingHasClassId && newHasClassId) {
              console.log(`✅ Replacing period ${periodId} with schedule that has class_id`);
            } else {
              // Keep the existing one (it was processed first in sorted order)
              continue;
            }
          }
          
          const periodDetail = periodDetailsMap.get(periodId);
          
          // Debug logging
          console.log('🔍 Processing schedule for period:', {
            periodId,
            scheduleId: schedule.id,
            subject: schedule.subject,
            grade: schedule.grade,
            class_id: schedule.class_id,
            hasClassId: !!schedule.class_id,
            day_of_week: schedule.day_of_week || day
          });
          
          // IMPORTANT: Use class_id from schedule first (as selected when scheduling)
          // If schedule doesn't have class_id, find it from classes table using grade (grade == class)
          let finalClassId = schedule.class_id;
          
          if (finalClassId) {
            console.log(`✅ Using class_id from schedule: ${finalClassId} (selected when scheduling)`);
          } else if (schedule.grade && finalSchoolId) {
            // Schedule doesn't have class_id, find it from classes table using grade
            // Grade == Class, so we use grade to find the class
            console.log(`🔍 Schedule missing class_id, searching classes table using grade: ${schedule.grade} (grade == class)`);
            try {
              // First try with subject + grade
              if (schedule.subject) {
                finalClassId = await findClassIdFromClasses(schedule.subject, schedule.grade, finalSchoolId);
                if (finalClassId) {
                  console.log(`✅ Found class_id from classes table (by subject+grade): ${finalClassId}`);
                }
              }
              
              // If not found, try with grade only (grade == class)
              // This is the primary fallback: grade == class
              if (!finalClassId) {
                console.log(`🔄 Trying with grade only (grade == class): ${schedule.grade}`);
                finalClassId = await findClassIdFromClasses('', schedule.grade, finalSchoolId);
                if (finalClassId) {
                  console.log(`✅ Found/created class_id using grade only (grade == class): ${finalClassId}`);
                } else {
                  console.error(`❌ CRITICAL: Could not find or create class_id from classes table for grade: ${schedule.grade}`);
                  // Last resort: try one more time with just grade, this time with more aggressive creation
                  console.log(`🔄 Last resort: trying to create class with grade only: ${schedule.grade}`);
                  try {
                    // Directly create a class if we can't find one
                     
                    const { data: newClass, error: createError } = await ((supabaseAdmin as any)
                      .from('classes')
                      .insert({
                        school_id: finalSchoolId,
                        class_name: `Class - ${schedule.grade}`,
                        grade: schedule.grade,
                        subject: schedule.subject || null,
                        academic_year: '2024-25',
                        is_active: true
                       
                      } as any)
                      .select('id')
                       
                      .single() as any) as any;
                    
                    if (!createError && newClass && newClass.id) {
                      finalClassId = newClass.id;
                      console.log(`✅ Created class directly with class_id: ${finalClassId} for grade: ${schedule.grade}`);
                    } else if (createError && (createError.code === '23505' || createError.message.includes('duplicate'))) {
                      // Duplicate error - try to find the existing class
                      const { data: existingClass } = await supabaseAdmin
                        .from('classes')
                        .select('id')
                        .eq('school_id', finalSchoolId)
                        .eq('grade', schedule.grade)
                        .eq('is_active', true)
                         
                        .limit(1) as any;
                      
                      if (existingClass && existingClass.length > 0) {
                        finalClassId = existingClass[0].id;
                        console.log(`✅ Found existing class after duplicate error: ${finalClassId}`);
                      }
                    } else {
                      console.error(`❌ Error creating class directly:`, createError);
                    }
                  } catch (directCreateError) {
                    logger.warn('Exception creating class directly (non-critical)', {
                      endpoint: '/api/teacher/periods',
                    }, directCreateError instanceof Error ? directCreateError : new Error(String(directCreateError)));
                  }
                }
              }
            } catch (error) {
              logger.warn('Error finding/creating class_id (non-critical)', {
                endpoint: '/api/teacher/periods',
              }, error instanceof Error ? error : new Error(String(error)));
              // Try one more time with just grade
              if (schedule.grade) {
                try {
                  console.log(`🔄 Retrying with grade only after error: ${schedule.grade}`);
                  finalClassId = await findClassIdFromClasses('', schedule.grade, finalSchoolId);
                  if (finalClassId) {
                    console.log(`✅ Found/created class_id using grade only after error: ${finalClassId}`);
                  }
                } catch (retryError) {
                  logger.warn('Error on retry (non-critical)', {
                    endpoint: '/api/teacher/periods',
                  }, retryError instanceof Error ? retryError : new Error(String(retryError)));
                }
              }
            }
          } else if (!finalClassId) {
            console.warn(`⚠️ Cannot find class_id: missing grade or schoolId. Grade: ${schedule.grade}, SchoolId: ${finalSchoolId}`);
          }
          
          // Build class_name from subject and grade
          const classDisplayName = schedule.subject && schedule.grade
            ? `${schedule.subject} - ${schedule.grade}`
            : schedule.subject || schedule.grade || 'N/A';
          
          console.log('📝 Setting class_name to:', classDisplayName);
          console.log('📝 Setting class_id to:', finalClassId || 'NULL');
          
          // IMPORTANT: class_id comes from the schedule (as selected when scheduling)
          // If schedule doesn't have it, we find it from classes table using grade (grade == class)
          // We MUST have a class_id - if we don't have one, we MUST create one
          if (!finalClassId) {
            console.error(`❌ CRITICAL: No class_id found for period ${periodId}! Attempting final creation...`, {
              schedule_id: schedule.id,
              period_id: periodId,
              subject: schedule.subject,
              grade: schedule.grade,
              school_id: finalSchoolId,
              schedule_class_id: schedule.class_id
            });
            
            // FINAL RESORT: Create class directly if we still don't have one
            if (schedule.grade && finalSchoolId) {
              try {
                console.log(`🚨 FINAL RESORT: Creating class directly for grade: ${schedule.grade}`);
                 
                const { data: emergencyClass, error: emergencyError } = await ((supabaseAdmin as any)
                  .from('classes')
                  .insert({
                    school_id: finalSchoolId,
                    class_name: schedule.subject ? `${schedule.subject} - ${schedule.grade}` : `Class - ${schedule.grade}`,
                    grade: schedule.grade,
                    subject: schedule.subject || null,
                    academic_year: '2024-25',
                    is_active: true
                   
                  } as any)
                  .select('id')
                   
                  .single() as any) as any;
                
                if (!emergencyError && emergencyClass && emergencyClass.id) {
                  finalClassId = emergencyClass.id;
                  console.log(`✅ FINAL RESORT SUCCESS: Created class with class_id: ${finalClassId}`);
                } else if (emergencyError && (emergencyError.code === '23505' || emergencyError.message.includes('duplicate'))) {
                  // Duplicate - find existing
                  const { data: existingEmergencyClass } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('school_id', finalSchoolId)
                    .eq('grade', schedule.grade)
                    .eq('is_active', true)
                     
                    .limit(1) as any;
                  
                  if (existingEmergencyClass && existingEmergencyClass.length > 0) {
                    finalClassId = existingEmergencyClass[0].id;
                    console.log(`✅ FINAL RESORT: Found existing class: ${finalClassId}`);
                  }
                } else {
                  console.error(`❌ FINAL RESORT FAILED:`, emergencyError);
                  // Even if creation failed, try one more time to find by grade
                  const { data: lastResortClass } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('school_id', finalSchoolId)
                    .eq('grade', schedule.grade)
                     
                    .limit(1) as any;
                  
                  if (lastResortClass && lastResortClass.length > 0) {
                    finalClassId = lastResortClass[0].id;
                    console.log(`✅ FINAL RESORT: Found class by grade only: ${finalClassId}`);
                  }
                }
              } catch (emergencyException) {
                logger.warn('Final resort exception (non-critical)', {
                  endpoint: '/api/teacher/periods',
                }, emergencyException instanceof Error ? emergencyException : new Error(String(emergencyException)));
                // Try one last time to find by grade
                try {
                  const { data: lastResortClass } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('school_id', finalSchoolId)
                    .eq('grade', schedule.grade)
                     
                    .limit(1) as any;
                  
                  if (lastResortClass && lastResortClass.length > 0) {
                    finalClassId = lastResortClass[0].id;
                    console.log(`✅ FINAL RESORT: Found class after exception: ${finalClassId}`);
                  }
                } catch (lastResortError) {
                  logger.warn('Final resort also failed (non-critical)', {
                    endpoint: '/api/teacher/periods',
                  }, lastResortError instanceof Error ? lastResortError : new Error(String(lastResortError)));
                }
              }
            }
            
            // If we STILL don't have a class_id, log error but STILL ADD THE PERIOD
            // We'll use grade as a fallback identifier
            if (!finalClassId) {
              console.error(`❌❌❌ CRITICAL ERROR: Unable to create class_id for period ${periodId}! Adding period anyway with grade as identifier.`, {
                schedule_id: schedule.id,
                period_id: periodId,
                subject: schedule.subject,
                grade: schedule.grade,
                school_id: finalSchoolId
              });
              // Use grade as a temporary identifier - frontend can handle this
              // We'll still add the period so it shows up
            }
          }
          
          // Add period to map - even if class_id is null, we'll use grade as fallback
          // The frontend can handle periods without class_id by using grade
          const periodObj = Array.isArray(schedule.period) ? schedule.period[0] : schedule.period;
          periodsMap.set(periodId, {
            id: periodId,
            period_number: periodDetail?.period_number || periodObj?.period_number || 0,
            start_time: periodDetail?.start_time || periodObj?.start_time || schedule.start_time,
            end_time: periodDetail?.end_time || periodObj?.end_time || schedule.end_time,
            class_id: finalClassId || null, // May be null, but we'll still return the period
            class_name: classDisplayName, // Use schedule data directly
            subject: schedule.subject,
            grade: schedule.grade,
            schedule_id: schedule.id // Keep track of schedule ID for auto-population
          });
          console.log(`✅ Added period ${periodId} to map with class_id: ${finalClassId || 'NULL (using grade as fallback)'}`);
        }
      }

      const periods = Array.from(periodsMap.values()).sort((a: any, b: any) => a.period_number - b.period_number);
      
      console.log(`✅ Processed ${periods.length} periods from ${schedules.length} schedules for day: ${day}`);
      
      // VALIDATION: Log periods without class_id but DON'T filter them out
      // We'll return all periods, even if some don't have class_id
      // The frontend can handle periods without class_id by using grade
       
      const periodsWithoutClassId = periods.filter((p: any) => !p.class_id || (typeof p.class_id === 'string' && p.class_id.trim() === ''));
      if (periodsWithoutClassId.length > 0) {
         
        console.warn(`⚠️ WARNING: Found ${periodsWithoutClassId.length} periods without class_id! They will still be returned.`, periodsWithoutClassId.map((p: any) => ({
          id: p.id,
          period_number: p.period_number,
          class_id: p.class_id,
          grade: p.grade,
          subject: p.subject
        })));
        console.warn(`⚠️ Frontend can use grade (${periodsWithoutClassId[0]?.grade}) as fallback for class_id`);
      }
      
      console.log(`✅ Fetched ${periods.length} periods with class info for day: ${day}`);
       
      console.log('📋 Period details:', periods.map((p: any) => ({
        id: p.id,
        period_number: p.period_number,
        subject: p.subject,
        grade: p.grade,
        class_id: p.class_id || 'NULL (will use grade)',
        class_name: p.class_name,
        has_class_id: !!p.class_id && (typeof p.class_id !== 'string' || p.class_id.trim() !== '')
      })));
      
      // Return ALL periods, even if some don't have class_id
      // The frontend can handle this by using grade as fallback
      return NextResponse.json({ periods });
    }

    // If no day provided, just return all periods for the school (without class info)
    const { data: periods, error } = await supabaseAdmin
      .from('periods')
      .select('id, school_id, period_number, start_time, end_time, is_active, created_at, updated_at')
      .eq('school_id', finalSchoolId)
      .eq('is_active', true)
       
      .order('period_number', { ascending: true }) as any;

    if (error) {
      logger.error('Failed to fetch periods', {
        userId: teacherId,
        schoolId: finalSchoolId,
        endpoint: '/api/teacher/periods',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { userId: teacherId, schoolId: finalSchoolId, endpoint: '/api/teacher/periods' },
        'Failed to fetch periods'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Periods fetched successfully', {
      userId: teacherId,
      schoolId: finalSchoolId,
      periodCount: periods?.length || 0,
      endpoint: '/api/teacher/periods',
    });

    return NextResponse.json({ periods: periods || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/periods', {
      endpoint: '/api/teacher/periods',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/periods' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


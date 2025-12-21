/**
 * Unified Account Creation Service
 * 
 * This service handles creating accounts for all roles:
 * - Admin
 * - School Admin
 * - Teacher
 * - Student
 * 
 * Usage:
 *   const result = await AccountCreationService.createAccount({
 *     role: 'student',
 *     email: 'student@example.com',
 *     password: 'password123',
 *     full_name: 'John Doe',
 *     school_id: 'uuid-here',
 *     grade: 'Grade 5'
 *   });
 */

import { supabaseAdmin } from './supabase';

export interface CreateAccountParams {
  role: 'admin' | 'school_admin' | 'teacher' | 'student';
  email: string;
  password: string;
  full_name: string;
  
  // Role-specific fields (optional based on role)
  school_id?: string;
  grade?: string;
  school_assignments?: Array<{
    school_id: string;
    grades_assigned: string[];
    subjects: string[];
  }>;
  phone?: string;
  address?: string;
  parent_name?: string;
  parent_phone?: string;
  qualification?: string;
  experience_years?: number;
  specialization?: string;
  permissions?: Record<string, any>;
  is_super_admin?: boolean;
}

export interface CreateAccountResult {
  success: boolean;
  userId?: string;
   
  data?: any;
  error?: string;
}

export class AccountCreationService {
  /**
   * Main method to create any type of account
   */
  static async createAccount(params: CreateAccountParams): Promise<CreateAccountResult> {
    try {
      // 1. Validate role
      const validRoles = ['admin', 'school_admin', 'teacher', 'student'];
      if (!validRoles.includes(params.role)) {
        return {
          success: false,
          error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
        };
      }

      // 2. Validate role-specific requirements
      const validation = this.validateRoleRequirements(params);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // 3. Check if email exists in profiles
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .eq('email', params.email)
         
        .maybeSingle() as any;

      if (existingProfile) {
        return {
          success: false,
          error: `Email ${params.email} already exists`
        };
      }

      // 4. Check if auth user already exists
      let userId: string | null = null;
      try {
        const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!listError && authUsers?.users) {
           
          const existingAuthUser = authUsers.users.find((user: any) => user.email === params.email);
          if (existingAuthUser) {
            // Check if profile exists for this user
            const { data: profileForUser } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('id', existingAuthUser.id)
               
              .maybeSingle() as any;
            
            if (profileForUser) {
              return {
                success: false,
                error: `Email ${params.email} already exists`
              };
            }
            
            // User exists in auth but no profile - use existing user ID
            userId = existingAuthUser.id;
          }
        }
      } catch (error) {
        console.error('Error checking existing auth users:', error);
        // Continue to create new user
      }

      // 5. Create auth user if it doesn't exist
      if (!userId) {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: params.email,
          password: params.password,
          email_confirm: true,
          user_metadata: {
            full_name: params.full_name,
            role: params.role // IMPORTANT: Set role in metadata
          }
        });

        if (authError) {
          // If user already exists error, try to get the existing user
          if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
            try {
              const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
               
              const existingUser = authUsers?.users?.find((user: any) => user.email === params.email);
              if (existingUser) {
                // Check if profile exists
                const { data: profileCheck } = await supabaseAdmin
                  .from('profiles')
                  .select('id')
                  .eq('id', existingUser.id)
                   
                  .maybeSingle() as any;
                
                if (profileCheck) {
                  return {
                    success: false,
                    error: `Email ${params.email} already exists`
                  };
                }
                
                userId = existingUser.id;
                // Update password for existing user
                await supabaseAdmin.auth.admin.updateUserById(userId, { password: params.password });
              } else {
                return {
                  success: false,
                  error: `Failed to create auth user: ${authError.message}`
                };
              }
            } catch (error) {
              return {
                success: false,
                error: `Failed to create auth user: ${authError.message}`
              };
            }
          } else {
            return {
              success: false,
              error: `Failed to create auth user: ${authError.message}`
            };
          }
        } else {
          userId = authData.user.id;
        }
      } else {
        // Update password for existing auth user
        try {
          await supabaseAdmin.auth.admin.updateUserById(userId, { password: params.password });
        } catch (error) {
          console.warn('Could not update password for existing user:', error);
        }
      }

      if (!userId) {
        return {
          success: false,
          error: 'Failed to get user ID'
        };
      }

      // 6. Create role-specific records
      let result: CreateAccountResult;
      
      switch (params.role) {
        case 'student':
          result = await this.createStudent(userId, params);
          break;
        case 'teacher':
          result = await this.createTeacher(userId, params);
          break;
        case 'school_admin':
          result = await this.createSchoolAdmin(userId, params);
          break;
        case 'admin':
          result = await this.createAdmin(userId, params);
          break;
        default:
          // This should never happen due to validation above
          try {
            await supabaseAdmin.auth.admin.deleteUser(userId);
          } catch (error) {
            console.error('Error deleting user:', error);
          }
          return {
            success: false,
            error: 'Invalid role'
          };
      }

      // 7. If role-specific creation failed, clean up auth user (only if we created it)
      if (!result.success) {
        // Only delete if we created the user in this call
        // Don't delete if it was an existing user
        try {
          const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
           
          const user = authUsers?.users?.find((u: any) => u.id === userId);
          // If user was just created (no profile exists), we can safely delete
          const { data: profileCheck } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', userId)
             
            .maybeSingle() as any;
          
          if (!profileCheck) {
            // No profile exists, safe to delete
            await supabaseAdmin.auth.admin.deleteUser(userId);
          }
        } catch (error) {
          console.error('Error cleaning up auth user:', error);
        }
        return result;
      }

      return {
        success: true,
        userId,
        data: result.data
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate role-specific requirements
   */
  private static validateRoleRequirements(params: CreateAccountParams): { valid: boolean; error?: string } {
    switch (params.role) {
      case 'student':
        if (!params.school_id) {
          return { valid: false, error: 'school_id is required for students' };
        }
        break;

      case 'teacher':
        if (!params.school_assignments || params.school_assignments.length === 0) {
          return { valid: false, error: 'school_assignments array is required for teachers' };
        }
        break;

      case 'school_admin':
        if (!params.school_id) {
          return { valid: false, error: 'school_id is required for school admins' };
        }
        break;

      case 'admin':
        // Admins don't need special fields
        break;
    }

    return { valid: true };
  }

  /**
   * Create student account
   */
  private static async createStudent(userId: string, params: CreateAccountParams): Promise<CreateAccountResult> {
    const { data, error } = await supabaseAdmin.rpc('create_student_enrollment', {
      p_user_id: userId,
      p_full_name: params.full_name,
      p_email: params.email,
      p_school_id: params.school_id!,
      p_grade: params.grade || 'Not Specified',
      p_phone: params.phone || null,
      p_address: params.address || null,
      p_parent_name: params.parent_name || null,
      p_parent_phone: params.parent_phone || null,
      p_joining_code: null
     
    } as any);

    if (error) {
      return {
        success: false,
        error: error?.message || 'Failed to create student enrollment'
      };
    }

    const result = data as any;
    if (!result?.success) {
      return {
        success: false,
        error: result?.error || 'Failed to create student enrollment'
      };
    }

    return { success: true, data: result };
  }

  /**
   * Create teacher account
   */
  private static async createTeacher(userId: string, params: CreateAccountParams): Promise<CreateAccountResult> {
    const { data, error } = await supabaseAdmin.rpc('create_teacher_enrollment', {
      p_user_id: userId,
      p_full_name: params.full_name,
      p_email: params.email,
      p_phone: params.phone || null,
      p_address: params.address || null,
      p_qualification: params.qualification || null,
      p_experience_years: params.experience_years || 0,
      p_specialization: params.specialization || null,
      p_teacher_id: null,
      p_school_assignments: JSON.stringify(params.school_assignments || [])
     
    } as any);

    if (error) {
      return {
        success: false,
        error: error?.message || 'Failed to create teacher enrollment'
      };
    }

    const result = data as any;
    if (!result?.success) {
      return {
        success: false,
        error: result?.error || 'Failed to create teacher enrollment'
      };
    }

    return { success: true, data: result };
  }

  /**
   * Create school admin account
   */
  private static async createSchoolAdmin(userId: string, params: CreateAccountParams): Promise<CreateAccountResult> {
    // Verify school exists
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('id')
      .eq('id', params.school_id!)
       
      .single() as any;

    if (schoolError || !school) {
      return { success: false, error: 'School not found' };
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        full_name: params.full_name,
        email: params.email,
        role: 'school_admin',
        school_id: params.school_id,
        phone: params.phone || null
       
      } as any);

    if (profileError) {
      return { success: false, error: profileError.message };
    }

    // Create school_admins record
    const { data: schoolAdmin, error: adminError } = await supabaseAdmin
      .from('school_admins')
      .insert({
        profile_id: userId,
        school_id: params.school_id!,
        full_name: params.full_name,
        email: params.email,
        phone: params.phone || null,
        is_active: true,
        permissions: params.permissions || {}
       
      } as any)
      .select()
       
      .single() as any;

    if (adminError) {
      return { success: false, error: adminError.message };
    }

    return { success: true, data: schoolAdmin };
  }

  /**
   * Create admin account
   */
  private static async createAdmin(userId: string, params: CreateAccountParams): Promise<CreateAccountResult> {
    // Note: The database trigger automatically creates a profile when auth user is created
    // Wait a moment for the trigger to execute, then update the profile
    
    // Wait for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Try to update the profile (created by trigger)
    // Retry logic in case trigger hasn't executed yet
    let profile = null;
    let lastError = null;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      const updateData = {
        full_name: params.full_name,
        email: params.email,
        role: 'admin',
        school_id: null
      };
      
      const { data: updatedProfile, error: updateError } = await (supabaseAdmin
         
        .from('profiles') as any)
        .update(updateData)
        .eq('id', userId)
        .select()
         
        .single() as any;

      if (!updateError && updatedProfile) {
        profile = updatedProfile;
        break;
      }
      
      lastError = updateError;
      
      // If update failed, wait a bit more for trigger
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    if (!profile) {
      // Last resort: try upsert (in case profile wasn't created by trigger)
       
      const upsertData: any = {
        id: userId,
        full_name: params.full_name,
        email: params.email,
        role: 'admin',
        school_id: null
      };
      
      const { data: upsertProfile, error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert(upsertData, {
          onConflict: 'id'
        })
        .select()
         
        .single() as any;

      if (upsertError) {
        return { 
          success: false, 
          error: upsertError.message || lastError?.message || 'Failed to create admin profile' 
        };
      }

      return { success: true, data: upsertProfile };
    }

    // TODO: If you create an admins table (similar to school_admins), insert record here
    // For now, just the profile is enough

    return { success: true, data: profile };
  }
}


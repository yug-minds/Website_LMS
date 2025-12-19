/**
 * Admin User Initialization
 * 
 * Automatically creates or updates the admin user on server startup.
 * This ensures the admin account exists with correct credentials in all environments.
 * 
 * The function is idempotent - safe to run multiple times.
 */

import { AccountCreationService } from './account-creation-service';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';

/**
 * Admin user configuration
 * Can be overridden via environment variables
 */
const ADMIN_CONFIG = {
  email: process.env.ADMIN_EMAIL || 'likithkarnekota@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'Likith@1808',
  full_name: process.env.ADMIN_FULL_NAME || 'Admin User',
  role: 'admin' as const,
};

/**
 * Initialize admin user on server startup
 * 
 * This function:
 * 1. Checks if admin user exists
 * 2. Creates user if it doesn't exist
 * 3. Updates password and role if user exists (to ensure credentials are correct)
 * 
 * The function is idempotent and non-blocking - failures won't prevent server startup.
 */
export async function initializeAdminUser(): Promise<void> {
  try {
    logger.info('Initializing admin user...', {
      email: ADMIN_CONFIG.email,
    });

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      logger.warn('Failed to list users for admin initialization', {
        error: listError.message,
      });
      return;
    }

    const existingUser = existingUsers?.users?.find(
      (user: any) => user.email === ADMIN_CONFIG.email
    );

    if (existingUser) {
      // User exists - update password and ensure role is correct
      logger.info('Admin user exists, updating credentials...', {
        userId: existingUser.id,
        email: ADMIN_CONFIG.email,
      });

      // Update password
      const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        {
          password: ADMIN_CONFIG.password,
          user_metadata: {
            full_name: ADMIN_CONFIG.full_name,
            role: ADMIN_CONFIG.role,
          },
        }
      );

      if (updatePasswordError) {
        logger.warn('Failed to update admin password', {
          error: updatePasswordError.message,
          userId: existingUser.id,
        });
      } else {
        logger.info('Admin password updated successfully');
      }

      // Ensure profile has correct role
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', existingUser.id)
        .maybeSingle() as any;

      if (profileError) {
        logger.warn('Failed to check admin profile', {
          error: profileError.message,
        });
      } else if (profile) {
        // Update profile if role is incorrect
        if (profile.role !== ADMIN_CONFIG.role) {
          const { error: updateProfileError } = await supabaseAdmin
            .from('profiles')
            .update({
              role: ADMIN_CONFIG.role,
              full_name: ADMIN_CONFIG.full_name,
              email: ADMIN_CONFIG.email,
            })
            .eq('id', existingUser.id);

          if (updateProfileError) {
            logger.warn('Failed to update admin profile role', {
              error: updateProfileError.message,
            });
          } else {
            logger.info('Admin profile role updated successfully');
          }
        }
      } else {
        // Profile doesn't exist - create it
        const { error: createProfileError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: existingUser.id,
            full_name: ADMIN_CONFIG.full_name,
            email: ADMIN_CONFIG.email,
            role: ADMIN_CONFIG.role,
            school_id: null,
          }, {
            onConflict: 'id',
          });

        if (createProfileError) {
          logger.warn('Failed to create admin profile', {
            error: createProfileError.message,
          });
        } else {
          logger.info('Admin profile created successfully');
        }
      }

      logger.info('Admin user initialization complete (updated existing user)');
      return;
    }

    // User doesn't exist - create new admin user
    logger.info('Creating new admin user...', {
      email: ADMIN_CONFIG.email,
    });

    const result = await AccountCreationService.createAccount({
      role: ADMIN_CONFIG.role,
      email: ADMIN_CONFIG.email,
      password: ADMIN_CONFIG.password,
      full_name: ADMIN_CONFIG.full_name,
    });

    if (result.success) {
      logger.info('Admin user created successfully', {
        userId: result.userId,
        email: ADMIN_CONFIG.email,
      });
    } else {
      logger.warn('Failed to create admin user', {
        error: result.error,
        email: ADMIN_CONFIG.email,
      });
    }
  } catch (error) {
    // Log error but don't throw - initialization failure shouldn't block server startup
    logger.warn('Admin user initialization failed', {
      error: error instanceof Error ? error.message : String(error),
      email: ADMIN_CONFIG.email,
    });
  }
}


import { z } from 'zod';

/**
 * Password Validation Utilities
 * 
 * Enforces strong password requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character (optional but recommended)
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @param requireSpecialChar - Whether to require special characters (default: false)
 * @returns Validation result with errors array
 */
export function validatePassword(
  password: string,
  requireSpecialChar: boolean = false
): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return { valid: false, errors };
  }

  // Minimum length: 8 characters
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // At least one lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // At least one digit
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Optional: At least one special character
  if (requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get user-friendly password requirements message
 */
export function getPasswordRequirementsMessage(requireSpecialChar: boolean = false): string {
  const requirements = [
    'At least 8 characters',
    'At least one uppercase letter (A-Z)',
    'At least one lowercase letter (a-z)',
    'At least one number (0-9)'
  ];

  if (requireSpecialChar) {
    requirements.push('At least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }

  return requirements.join(', ');
}

/**
 * Client-side password validation (synchronous, for use in React components)
 * Returns first error message or null if valid
 */
export function validatePasswordClient(password: string, requireSpecialChar: boolean = false): string | null {
  if (!password) {
    return 'Password is required';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }

  if (requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character';
  }

  return null; // Valid
}

/**
 * Zod password schema with complexity requirements
 * @param requireSpecialChar - Whether to require special characters (default: false)
 */
export const passwordSchema = (requireSpecialChar: boolean = false) => {
  return z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine((password) => /[A-Z]/.test(password), {
      message: 'Password must contain at least one uppercase letter'
    })
    .refine((password) => /[a-z]/.test(password), {
      message: 'Password must contain at least one lowercase letter'
    })
    .refine((password) => /[0-9]/.test(password), {
      message: 'Password must contain at least one number'
    })
    .refine((password) => {
      if (requireSpecialChar) {
        return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
      }
      return true;
    }, {
      message: 'Password must contain at least one special character'
    });
};


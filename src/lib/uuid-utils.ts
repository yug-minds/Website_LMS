/**
 * UUID Utility Functions
 * Provides consistent UUID generation across the application
 */

/**
 * Generate a permanent UUID for use in the application
 * Uses crypto.randomUUID() if available, with fallback for compatibility
 * 
 * @returns A UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateUUID(): string {
  try {
    // Use browser's crypto API if available (modern browsers)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    console.warn('UUID generation via crypto.randomUUID failed, falling back to manual method.', e);
  }
  
  // Fallback: Generate UUID v4-like string manually
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validate if a string is a valid UUID format
 * 
 * @param id - String to validate
 * @returns true if the string is a valid UUID format
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Check if an ID is a temporary ID (starts with "temp-")
 * 
 * @param id - ID to check
 * @returns true if the ID is a temporary ID
 */
export function isTempId(id: string | undefined | null): boolean {
  return !!(id && typeof id === 'string' && id.startsWith('temp-'));
}





















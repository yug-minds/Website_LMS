import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Shortens a UUID for display in logs
 * Converts "00000000-0000-0000-0000-000000000001" to "00000000...0001"
 * @param userId - The full UUID string
 * @returns Shortened version (first 8 chars + "..." + last 4 chars)
 */
export function shortenUserId(userId: string | undefined | null): string {
  if (!userId) return 'null';
  if (userId.length <= 12) return userId; // Already short enough
  return `${userId.substring(0, 8)}...${userId.substring(userId.length - 4)}`;
}

'use client';

/**
 * Client component that suppresses Next.js Promise warnings
 * This must be a client component to run the suppression code
 */
export default function SuppressPromiseWarnings() {
  // This component doesn't render anything, it just runs the suppression code
  // when it mounts (which happens early in the React tree)
  if (typeof window !== 'undefined') {
    // Import and run the suppression utility
    import('@/lib/suppress-nextjs-promise-warnings');
  }
  return null;
}



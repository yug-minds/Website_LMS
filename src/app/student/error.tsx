"use client";

import { useEffect } from "react";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Student dashboard error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-red-600 text-sm font-bold">!</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Oops! Something went wrong</h2>
        </div>
        <p className="text-gray-600 mb-4">
          We encountered an error while loading your dashboard.
        </p>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700 font-mono break-words">
            {error.message || 'An unexpected error occurred'}
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <span>↻</span>
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/student'}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
          >
            <span>🏠</span>
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}


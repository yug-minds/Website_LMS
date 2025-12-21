"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin dashboard error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-red-600 text-sm font-bold">!</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Admin Dashboard Error</h2>
        </div>
        <p className="text-gray-600 mb-4">
          An error occurred while loading the admin dashboard.
        </p>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-800 font-semibold mb-2">Error Details:</p>
          <p className="text-sm text-red-700 font-mono break-words">
            {error.message || 'An unexpected error occurred'}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-800 font-semibold mb-2">Possible Solutions:</p>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Clear your browser cache and cookies</li>
            <li>Try refreshing the page</li>
            <li>Check your internet connection</li>
            <li>Contact support if the issue persists</li>
          </ul>
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
            onClick={() => window.location.href = '/admin'}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
          >
            <span>🏠</span>
            Go to Dashboard
          </button>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="text-xs text-gray-500 space-y-1 mt-4">
            {error.digest && <p>Error digest: {error.digest}</p>}
            {error.stack && (
              <details className="mt-2">
                <summary className="cursor-pointer hover:text-gray-700">
                  Stack trace (development only)
                </summary>
                <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

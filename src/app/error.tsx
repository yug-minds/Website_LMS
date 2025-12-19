"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Error:", error);
  }, [error]);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Something went wrong!</h2>
        <p style={{ marginBottom: '16px', color: '#666' }}>{error.message || "An unexpected error occurred"}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = "/"}
            style={{ padding: '10px 20px', backgroundColor: '#f3f4f6', color: '#111', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";

function NotFoundContent() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', padding: '20px' }}>
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '72px', fontWeight: 'bold', color: '#111827', margin: '0 0 8px 0' }}>404</h1>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#374151', margin: '0 0 8px 0' }}>
            This page could not be found.
          </h2>
          <p style={{ color: '#6b7280', maxWidth: '400px', margin: '0 auto' }}>
            The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '24px' }}>
          <button
            onClick={() => router.back()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f3f4f6',
              color: '#111827',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
          >
            ← Go Back
          </button>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          >
            🏠 Go Home
          </button>
          <button
            onClick={() => router.push("/login")}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
          >
            Login
          </button>
        </div>

        <div style={{ marginTop: '32px', fontSize: '14px', color: '#9ca3af' }}>
          <p>If you believe this is an error, please contact support.</p>
        </div>
      </div>
    </div>
  );
}

export default function NotFound() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <NotFoundContent />
    </Suspense>
  );
}

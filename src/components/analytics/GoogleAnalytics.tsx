'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { trackPageView } from '@/lib/analytics';

// Extend Window interface to include gtag
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

interface GoogleAnalyticsProps {
  measurementId?: string;
}

/**
 * Google Analytics Component
 * 
 * Implements Google tag (gtag.js) exactly as provided by Google Analytics
 * Measurement ID: G-VLEC0XTTY5
 * 
 * Uses Next.js Script component which automatically adds scripts to the head
 * This is the recommended approach for Next.js App Router
 */
// ... imports

function GoogleAnalyticsContent({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Use provided ID, environment variable, or default to G-VLEC0XTTY5
  const gaId = measurementId || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-VLEC0XTTY5';

  useEffect(() => {
    // Track page views on route change
    if (pathname && typeof window !== 'undefined' && (window as any).gtag) {
      const fullPath = searchParams?.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;
      
      trackPageView(fullPath, gaId);
    }
  }, [pathname, searchParams, gaId]);

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="lazyOnload"
        onError={(e) => {
          console.warn('Failed to load Google Analytics:', e);
        }}
      />
      <Script id="google-analytics" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}');
        `}
      </Script>
    </>
  );
}

export default function GoogleAnalytics(props: GoogleAnalyticsProps) {
  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsContent {...props} />
    </Suspense>
  );
}


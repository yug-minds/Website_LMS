"use client";

import { useEffect } from "react";
import { initWebVitalsTracking } from "../lib/performance-monitor";

export function PerformanceMonitor() {
  useEffect(() => {
    // Defer Web Vitals tracking until browser is idle
    // This prevents blocking the initial page render
    const initTracking = () => {
      // Wait for page to be interactive before initializing
      if (document.readyState === 'complete') {
        initWebVitalsTracking();
      } else {
        window.addEventListener('load', () => {
          // Further defer with requestIdleCallback
          if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
              initWebVitalsTracking();
            }, { timeout: 2000 });
          } else {
            setTimeout(() => {
              initWebVitalsTracking();
            }, 1000);
          }
        }, { once: true });
      }
    };

    // Defer initialization
    if ('requestIdleCallback' in window) {
      requestIdleCallback(initTracking, { timeout: 1000 });
    } else {
      setTimeout(initTracking, 500);
    }
  }, []);

  return null; // This component doesn't render anything
}



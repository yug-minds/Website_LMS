"use client";

import { useState, useEffect, ReactNode } from "react";
import { SkeletonChart } from "../ui/skeleton-chart";

interface LazyChartProps {
  children: (Charts: any) => ReactNode;
  fallback?: ReactNode;
}

export default function LazyChart({ children, fallback }: LazyChartProps) {
  const [Charts, setCharts] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Dynamically import recharts only when component mounts
    import("recharts")
      .then((module) => {
        setCharts(module);
      })
      .catch((err) => {
        setError(err);
        console.error("Failed to load recharts:", err);
      });
  }, []);

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>Failed to load chart library</p>
      </div>
    );
  }

  if (!Charts) {
    return fallback || <SkeletonChart />;
  }

  return <>{children(Charts)}</>;
}



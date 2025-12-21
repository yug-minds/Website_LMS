import { Card, CardContent, CardHeader } from "./card";

export function SkeletonChart() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full bg-gray-200 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

export function SkeletonBarChart() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
      <div className="h-48 w-full bg-gray-200 rounded animate-pulse" />
      <div className="flex justify-between">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonLineChart() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
      <div className="h-64 w-full bg-gray-200 rounded animate-pulse" />
    </div>
  );
}



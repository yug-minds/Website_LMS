import type { MetadataRoute } from "next";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://website-lms-seven.vercel.app";

/**
 * Public pages to include in sitemap. These are the main entry points
 * that help search engines (and sitelinks) discover your site structure.
 * Excludes dashboard/admin/teacher/student areas (auth-required).
 */
const publicRoutes: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.9 },
  { path: "/programs", changeFrequency: "monthly", priority: 0.9 },
  { path: "/success-stories", changeFrequency: "weekly", priority: 0.9 },
  { path: "/for-schools", changeFrequency: "monthly", priority: 0.9 },
  { path: "/for-parents", changeFrequency: "monthly", priority: 0.9 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
  { path: "/login", changeFrequency: "yearly", priority: 0.5 },
  { path: "/signup", changeFrequency: "yearly", priority: 0.5 },
  { path: "/student-registration", changeFrequency: "yearly", priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return publicRoutes.map(({ path, changeFrequency, priority }) => ({
    url: path ? `${baseUrl.replace(/\/$/, "")}${path}` : baseUrl.replace(/\/$/, ""),
    lastModified,
    changeFrequency,
    priority,
  }));
}

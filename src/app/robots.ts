import type { MetadataRoute } from "next";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://website-lms-seven.vercel.app";

export default function robots(): MetadataRoute.Robots {
  const sitemapUrl = `${baseUrl?.replace(/\/$/, "") ?? "https://website-lms-seven.vercel.app"}/sitemap.xml`;
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/school-admin/", "/teacher/", "/student/", "/api/", "/auth/callback", "/redirect"] },
    ],
    sitemap: sitemapUrl,
  };
}

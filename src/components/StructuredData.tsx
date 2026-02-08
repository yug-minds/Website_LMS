/**
 * JSON-LD structured data for search engines (Google sitelinks, rich results).
 * WebSite + Organization help Google show your site name, logo, and sitelinks.
 */

const siteName = "Robo Coders™";
const siteDescription =
  "Empowering the Next Generation with STEM Education. An EdTech initiative by YugMinds – AI, robotics, and programming for students.";

function getBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "https://website-lms-seven.vercel.app";
  return url.replace(/\/$/, "");
}

export function StructuredData() {
  const cleanBase = getBaseUrl();

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    description: siteDescription,
    url: cleanBase,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${cleanBase}/programs?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "YugMinds",
    url: cleanBase,
    logo: `${cleanBase}/icon.png`,
    description: siteDescription,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
    </>
  );
}

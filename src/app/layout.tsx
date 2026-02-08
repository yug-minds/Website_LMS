import type { Metadata, Viewport } from "next";
import { ABeeZee } from "next/font/google";
import "./globals.css";
import QueryProvider from "../components/providers/QueryProvider";
import SuppressPromiseWarnings from "../components/SuppressPromiseWarnings";
import { StructuredData } from "../components/StructuredData";

const abeezee = ABeeZee({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-abeezee",
});

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://website-lms-seven.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl ?? "https://website-lms-seven.vercel.app"),
  title: "Robo Coders™ - Empowering the Next Generation with STEM Education",
  description:
    "Join Robo Coders™ and discover the exciting world of AI, robotics, and programming. An EdTech initiative by YugMinds, empowering students with cutting-edge STEM education.",
  keywords: ["Robo Coders", "STEM education", "YugMinds", "robotics", "coding", "programming", "students", "EdTech"],
  openGraph: {
    title: "Robo Coders™ - Empowering the Next Generation with STEM Education",
    description:
      "Join Robo Coders™ and discover the exciting world of AI, robotics, and programming. An EdTech initiative by YugMinds.",
    url: "/",
    siteName: "Robo Coders™",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Robo Coders™ - STEM Education by YugMinds",
    description: "Empowering students with AI, robotics, and programming.",
  },
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${abeezee.variable} font-abeezee antialiased`}
      >
        <StructuredData />
        <SuppressPromiseWarnings />
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}

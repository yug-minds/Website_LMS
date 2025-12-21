import type { Metadata } from "next";
import { ABeeZee } from "next/font/google";
import "./globals.css";
import QueryProvider from "../components/providers/QueryProvider";
import SuppressPromiseWarnings from "../components/SuppressPromiseWarnings";

const abeezee = ABeeZee({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-abeezee",
});

export const metadata: Metadata = {
  title: "Robo Coders™ - Empowering the Next Generation with STEM Education",
  description: "Join Robo Coders™ and discover the exciting world of AI, robotics, and programming. An EdTech initiative by YugMinds, empowering students with cutting-edge STEM education.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
  },
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
        <SuppressPromiseWarnings />
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}

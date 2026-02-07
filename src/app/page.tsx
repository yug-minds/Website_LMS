"use client";

import ResizableNavbar from "../components/ResizableNavbar";
import HomeHero from "../components/public/HomeHero";
import HomeFeatures from "../components/public/HomeFeatures";
import CombinedSchoolsTestimonials from "../components/public/CombinedSchoolsTestimonials";
import Footer from "../components/Footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <ResizableNavbar />

      {/* Main Content */}
      <main>
        <HomeHero />
        <HomeFeatures />
        <CombinedSchoolsTestimonials />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
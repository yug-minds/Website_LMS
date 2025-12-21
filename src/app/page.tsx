"use client";

import ResizableNavbar from "../components/ResizableNavbar";
import HomeHero from "../components/public/HomeHero";
import HomeFeatures from "../components/public/HomeFeatures";
import HomeTestimonials from "../components/public/HomeTestimonials";
import Logos3 from "../components/ui/logos3";
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
        <Logos3 heading="Our Leading Schools" />
        <HomeTestimonials />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
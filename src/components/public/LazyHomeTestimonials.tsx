"use client";

import dynamic from "next/dynamic";

const HomeTestimonials = dynamic(() => import("./HomeTestimonials"), {
  loading: () => (
    <section className="bg-blue-600/90 py-10 md:py-12 relative overflow-hidden min-h-[260px]">
      <div className="container relative z-10 flex items-center justify-center min-h-[260px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    </section>
  ),
});

export default function LazyHomeTestimonials() {
  return <HomeTestimonials />;
}

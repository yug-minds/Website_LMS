"use client";

import Link from "next/link";
import { Button } from "../ui/button";

export default function FlexiblePricing() {
  return (
    <section className="bg-blue-600 py-20 md:py-24 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(#fff 2px, transparent 2px)", backgroundSize: "30px 30px" }}></div>
      
      <div className="container mx-auto px-4 md:px-6 lg:px-8 relative z-10">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6">
            Flexible Pricing
          </h2>
          <p className="text-blue-100 text-lg md:text-xl max-w-2xl mx-auto mb-10">
            Affordable options with payment plans available
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/for-parents">
              <Button size="lg" variant="secondary" className="bg-white text-blue-600 hover:bg-gray-100 px-8 text-base py-6">
                View Pricing Plans
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 text-base py-6">
                Get Custom Quote
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
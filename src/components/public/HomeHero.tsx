"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "../ui/button";
import { ArrowRight } from "lucide-react";

export default function HomeHero() {

  return (
    <section className="min-h-screen flex items-center relative overflow-hidden pt-20 lg:pt-0">
      {/* Background Image - Optimized with Next.js Image */}
      <div className="absolute inset-0 pointer-events-none opacity-10 z-0">
        <Image
          src={`/${encodeURI('Doodle icon robotics , coding background.png')}`}
          alt="Robotics and coding background pattern"
          fill
          className="object-cover"
          quality={60}
          sizes="100vw"
          priority={false}
          loading="lazy"
        />
      </div>
      <div className="w-full relative z-10">
        <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-0">
          {/* Left Column - Text */}
          <div className="flex-1 w-full flex flex-col justify-center pl-8 pr-4 md:pl-16 md:pr-8 lg:pl-24 lg:pr-12 xl:pl-32 xl:pr-16 py-12 md:py-16 lg:py-20 text-center lg:text-left">
            <div className="relative z-10 max-w-2xl lg:max-w-none mx-auto lg:mx-0">
              <h1 className="text-4xl md:text-6xl lg:text-7xl xl:text-8xl font-extrabold leading-tight">
                <span className="block text-gray-900">Empowering</span>
                <span className="block text-gray-900">Students to</span>
                <span className="block text-blue-600 font-extrabold">Code, Create,</span>
                <span className="block text-blue-600 font-extrabold">and Innovate</span>
              </h1>
              <p className="mt-6 text-gray-700 text-lg md:text-xl lg:text-2xl leading-relaxed max-w-2xl mx-auto lg:mx-0">
                Join Robo Coders™ and discover the exciting world of AI, robotics, and programming. 
                Build the future, one line of code at a time.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="lg" className="w-full sm:w-auto px-8 text-lg bg-blue-600 hover:bg-blue-700 text-white">
                  Explore Programs <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Link href="/contact" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto px-8 text-lg border-blue-600 text-blue-600 hover:bg-blue-50" size="lg">
                    Book a Demo
                  </Button>
                </Link>
              </div>
            </div>
          </div>
          {/* Right Column - Image */}
          <div className="w-full lg:w-[45%] xl:w-[50%] relative h-[300px] sm:h-[400px] md:h-[450px] lg:h-auto lg:min-h-[450px] rounded-none lg:rounded-l-[61px] overflow-hidden bg-white shadow-2xl">
            <Image 
              src="/image.png"  
              alt="Students Learning STEM Activity" 
              fill
              sizes="(max-width: 1023px) 100vw, (max-width: 1279px) 45vw, 50vw"
              className="object-cover"
              priority
            />
            <div className="absolute left-0 top-0 bottom-0 w-[10px] lg:w-[20px] bg-blue-600 lg:rounded-l-[61px] z-20 pointer-events-none"></div>
          </div>
        </div>
      </div>
    </section>
  );
}


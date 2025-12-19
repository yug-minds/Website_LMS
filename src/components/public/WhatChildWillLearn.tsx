"use client";

import Image from "next/image";
import { Check } from "lucide-react";

export default function WhatChildWillLearn() {
  const learningSkills = [
    "Programming languages including Python, Scratch, Scratch Jr.",
    "Building and programming robots with Esp32, Arduino.",
    "Creating mobile apps and video games",
    "Understanding AI and machine learning concepts",
    "Critical thinking and problem-solving skills",
    "Teamwork and project collaboration",
    "Presentation and communication abilities"
  ];

  return (
    <section className="bg-gray-50 py-20 md:py-24">
      <div className="container mx-auto px-4 md:px-6 lg:px-8">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-center mb-4 md:mb-6">
          What Your Child Will Learn
        </h2>
        <div className="grid md:grid-cols-2 gap-8 md:gap-10 lg:gap-12 items-center mt-12">
          <div className="space-y-4">
            {learningSkills.map((skill, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="h-4 w-4 text-white" />
                </div>
                <p className="text-gray-700 text-base md:text-lg leading-relaxed">{skill}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl overflow-hidden bg-white shadow-xl aspect-[4/3] relative">
            <Image
              src="/Kids Dong Robotics.png"
              alt="Kids learning robotics and coding"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              loading="lazy"
              quality={75}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
"use client";

import { Zap, Users, Award } from "lucide-react";

export default function HomeFeatures() {
  const features = [
    {
      icon: Zap,
      title: "Hands-On Learning",
      description: "Interactive projects that make learning fun and engaging"
    },
    {
      icon: Users,
      title: "Expert Instructors",
      description: "Learn from industry professionals and experienced educators"
    },
    {
      icon: Award,
      title: "Proven Results",
      description: "Students winning competitions and building amazing projects"
    }
  ];

  return (
    <section className="bg-blue-600 py-20 md:py-24 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(#fff 2px, transparent 2px)", backgroundSize: "30px 30px" }}></div>
      
      <div className="container mx-auto px-4 md:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 max-w-5xl mx-auto">
            Why Choose Robo Coders™?
          </h2>
          <p className="text-blue-100 text-lg md:text-xl max-w-2xl mx-auto">
            Discover what makes our STEM education programs exceptional
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div 
                key={feature.title}
                className="flex flex-col items-center p-8 bg-white rounded-2xl shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300"
              >
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                  <IconComponent className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 text-center">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-center text-base md:text-lg leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
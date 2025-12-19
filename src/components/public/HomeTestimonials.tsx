"use client";

import { TestimonialStack, type Testimonial } from "../ui/glass-testimonial-swiper";
import { Star, Award } from "lucide-react";

const testimonialsData: Testimonial[] = [
  {
    id: 1,
    initials: "SG",
    name: "Student, Grade 9",
    role: "Robotics Enthusiast",
    quote: "Robo Coders transformed my understanding of tech. I built my first robot and even won a science fair!",
    tags: [{ text: "Robotics", type: "featured" }, { text: "Science Fair", type: "default" }],
    stats: [{ icon: Star, text: "5.0 Rating" }, { icon: Award, text: "Winner" }],
    avatarGradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)"
  },
  {
    id: 2,
    initials: "P",
    name: "Parent",
    role: "Satisfied Parent",
    quote: "My son's confidence has soared since joining. The instructors genuinely care about each student.",
    tags: [{ text: "Confidence Building", type: "featured" }, { text: "Expert Instructors", type: "default" }],
    stats: [{ icon: Star, text: "5.0 Rating" }],
    avatarGradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)"
  },
  {
    id: 3,
    initials: "S8",
    name: "Student, Grade 8",
    role: "Game Developer",
    quote: "The coding skills I learned here helped me create my own Games . Thank you Robo Coders!",
    tags: [{ text: "Coding", type: "featured" }, { text: "Game Development", type: "default" }],
    stats: [{ icon: Star, text: "5.0 Rating" }, { icon: Award, text: "Game Creator" }],
    avatarGradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"
  }
];

export default function HomeTestimonials() {
  return (
    <section
      id="stories"
      className="testimonial-section bg-blue-600 py-12 md:py-16 relative overflow-hidden"
    >
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(#fff 2px, transparent 2px)", backgroundSize: "30px 30px" }}></div>
      
      <div className="container mx-auto px-4 md:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-10 md:mb-12">
          <h3 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 max-w-5xl mx-auto">What Our Students and Parents Say</h3>
          <p className="text-blue-100 text-lg md:text-xl max-w-2xl mx-auto">Real feedback from our community of learners and families</p>
        </div>
        <div className="w-full flex items-center justify-center">
          <div className="w-full max-w-5xl mx-auto relative">
            <TestimonialStack testimonials={testimonialsData} visibleBehind={2} />
          </div>
        </div>
      </div>
    </section>
  );
}



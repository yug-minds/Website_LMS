import Link from "next/link";
import Image from "next/image";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import ResizableNavbar from "../../components/ResizableNavbar";
import Footer from "../../components/Footer";
import { 
  Code,
  Cpu,
  Brain,
  BookOpen,
  Award,
  Rocket,
  RefreshCw,
  Check
} from "lucide-react";

// Enable ISR - revalidate every hour
export const revalidate = 3600;

export default function ProgramsPage() {

  const programs = [
    {
      icon: Code,
      title: "Coding Fundamentals",
      description: "Learn the logic behind coding through block and text programming. Perfect for beginners to build strong computational thinking skills.",
      badges: ["Ages 6-18", "8-12 weeks", "Beginner to Advanced"]
    },
    {
      icon: Cpu,
      title: "Robotics & Electronics",
      description: "Build and program robots using Arduino, Esp32 and sensors. Learn electronics fundamentals while creating interactive projects.",
      badges: ["Ages 6-18", "8-12 weeks", "Beginner to Advanced"]
    },
    {
      icon: Brain,
      title: "AI & Machine Learning",
      description: "Explore artificial intelligence and machine learning concepts. Build intelligent applications and understand neural networks.",
      badges: ["Ages 6-18", "8-12 weeks", "Beginner to Advanced"]
    }
  ];

  const kitContents = [
    "Esp32-compatible microcontroller board",
    "30+ electronic components & sensors",
    "Motors, wheels, and chassis",
    "USB cable and power supply",
    "Complete assembly instructions",
    "Access to online video tutorials",
    "Project ideas and coding examples"
  ];

  const whatsIncluded = [
    {
      icon: Award,
      title: "Certification",
      description: "Recognized certificate upon successful completion."
    },
    {
      icon: Rocket,
      title: "Project Portfolio",
      description: "Build real projects to showcase your skills."
    },
    {
      icon: RefreshCw,
      title: "Lifetime Access",
      description: "Access to course materials even after completion."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <ResizableNavbar />

      {/* Combined Header & Program Offerings Section */}
      <section className="min-h-screen flex flex-col justify-center bg-gray-50 py-20">
        <div className="container flex-1 flex flex-col justify-center py-8 md:py-12">
          {/* Header Content */}
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl font-extrabold mb-4 md:mb-6 max-w-6xl mx-auto">Our Programs</h1>
            <p className="text-lg md:text-xl lg:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Discover the perfect STEM learning journey for every student, from coding basics to advanced AI and robotics.
            </p>
          </div>

          {/* Program Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {programs.map(({ icon: Icon, title, description, badges }) => (
              <Card key={title} className="bg-blue-600 text-white border-2 border-white hover:transform hover:scale-105 transition-all duration-300">
                <CardContent className="p-6 md:p-8 flex flex-col">
                  <div className="flex items-start gap-4 md:gap-5 mb-4 md:mb-5">
                    <div className="w-16 h-16 md:w-18 md:h-18 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-8 w-8 md:h-9 md:w-9 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl md:text-2xl lg:text-3xl font-bold mb-2 md:mb-3 text-white">{title}</h3>
                    </div>
                  </div>
                  <p className="text-white/90 text-sm md:text-base leading-relaxed mb-6 md:mb-8">{description}</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {badges.map((badge, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-white text-blue-600 rounded-full text-xs md:text-sm font-medium whitespace-nowrap"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Textbooks Section */}
      <section className="min-h-screen flex items-center justify-center bg-blue-600 py-20">
        <div className="container">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-center mb-4 md:mb-6 text-white max-w-5xl mx-auto">Our Latest Textbooks</h2>
          <p className="text-white/90 text-center mb-10 md:mb-12 max-w-2xl mx-auto text-base md:text-lg lg:text-xl">
            Comprehensive learning materials designed by experts.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-12">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-md aspect-[3/4] overflow-hidden hover:shadow-xl transition-shadow border-[5px] border-white max-w-full">
                {i === 1 ? (
                  <Image
                    src="/kids Level 1 TextBook.png"
                    alt="ROBO CODERS TECH EXPLORERS LEVEL - 1 KIDS EDITION"
                    width={400}
                    height={533}
                    className="w-full h-full object-cover"
                  />
                ) : i === 2 ? (
                  <Image
                    src="/Level 1 TextBook.png"
                    alt="ROBO CODERS TECH EXPLORERS LEVEL - 1"
                    width={400}
                    height={533}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Image
                    src="/Level 2 TextBook .png"
                    alt="ROBO CODERS TECH EXPLORERS LEVEL - 2"
                    width={400}
                    height={533}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-white/90 max-w-3xl mx-auto text-base md:text-lg lg:text-xl">
            A complete beginner-friendly guide to Programming, AI, and Robotics concepts, featuring hands-on exercises and projects for all the books we offer.
          </p>
        </div>
      </section>

      {/* Robotics Kit Section */}
      <section className="min-h-screen flex items-center justify-center bg-white py-20">
        <div className="container">
          <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-center mb-10 md:mb-16 max-w-5xl mx-auto">Our Robotics Kit</h2>
          <div className="grid lg:grid-cols-2 gap-10 md:gap-12 items-center">
            <div className="order-2 lg:order-1">
              <p className="text-lg text-gray-700 leading-relaxed mb-8">
                Everything you need to start building and programming robots. Our comprehensive kit includes high-quality components and step-by-step tutorials.
              </p>
              <ul className="space-y-4 mb-8">
                {kitContents.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="mt-1 bg-green-100 rounded-full p-1">
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-gray-700 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 h-12 text-lg">
                  Order Robotics Kit
                </Button>
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-blue-600 text-blue-600 hover:bg-blue-50 h-12 text-lg">
                  For More Information
                </Button>
              </div>
            </div>
            <div className="order-1 lg:order-2 bg-gray-100 rounded-3xl overflow-hidden w-full max-w-[408px] ml-auto">
              <video
                src="/instagram-reel.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-auto"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Combined What's Included & CTA Section */}
      <section className="min-h-screen flex flex-col m-0 overflow-hidden">
        {/* What's Included Section */}
        <div className="flex-1 flex items-center justify-center bg-blue-600 min-h-0 py-8 md:py-12 overflow-y-auto">
          <div className="container py-4 md:py-8">
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-extrabold text-center mb-3 md:mb-4 lg:mb-6 text-white max-w-5xl mx-auto">What&apos;s Included</h2>
            <p className="text-white/90 text-center mb-6 md:mb-8 lg:mb-12 max-w-2xl mx-auto text-sm md:text-base lg:text-lg xl:text-xl px-4">
              Every program comes with comprehensive support.
            </p>
            <div className="grid md:grid-cols-3 gap-4 md:gap-6 lg:gap-8 px-4">
              {whatsIncluded.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="border-none shadow-md hover:shadow-xl transition-shadow bg-white">
                  <CardContent className="p-6 md:p-8 text-center h-full flex flex-col items-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 md:mb-6">
                      <Icon className="h-8 w-8 md:h-10 md:w-10 text-blue-600" />
                    </div>
                    <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4 text-gray-900">{title}</h3>
                    <p className="text-sm md:text-base text-gray-600 leading-relaxed">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="flex-1 flex items-center justify-center bg-white min-h-0 py-8 md:py-12 overflow-y-auto">
          <div className="container text-center py-4 md:py-8 px-4">
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl font-extrabold mb-3 md:mb-4 lg:mb-6 text-gray-900 max-w-5xl mx-auto">
              Ready to Start Your STEM Journey?
            </h2>
            <p className="text-gray-600 mb-6 md:mb-8 lg:mb-10 max-w-2xl mx-auto text-sm md:text-base lg:text-lg xl:text-xl">
              Schedule a free consultation with our education counselors.
            </p>
            <Link href="/contact">
              <Button size="lg" variant="secondary" className="bg-blue-600 text-white hover:bg-blue-700 px-8 md:px-10 py-5 md:py-6 text-base md:text-lg h-auto font-bold shadow-xl">
                Book Free Consultation
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}


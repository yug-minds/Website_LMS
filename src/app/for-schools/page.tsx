import Link from "next/link";
import Image from "next/image";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import ResizableNavbar from "../../components/ResizableNavbar";
import Footer from "../../components/Footer";
import { 
  BookOpen,
  User,
  Rocket,
  Trophy,
  Tag,
  Info,
  ArrowRight
} from "lucide-react";

// Enable ISR - revalidate every hour
export const revalidate = 3600;

export default function ForSchoolsPage() {

  const whyChooseUs = [
    {
      icon: BookOpen,
      title: "Curriculum Integration",
      description: "Seamlessly integrate our programs into your existing curriculum with flexible scheduling options."
    },
    {
      icon: User,
      title: "Trained Instructors",
      description: "Our certified educators work alongside your staff or deliver classes independently."
    },
    {
      icon: Rocket,
      title: "Enhanced Reputation",
      description: "Position your school as a technology leader with cutting-edge STEM programs."
    },
    {
      icon: Trophy,
      title: "Student Success",
      description: "Boost student engagement and achievement with hands-on, project-based learning."
    },
    {
      icon: Tag,
      title: "Flexible Pricing",
      description: "Affordable, scalable solutions for any budget, from pilot programs to district-wide implementations."
    },
    {
      icon: Info,
      title: "24/7 Tech Support",
      description: "24/7 tech support and troubleshooting for smooth program operation."
    }
  ];

  const onboardingSteps = [
    {
      number: "1",
      title: "Consultation",
      description: "Discuss your school's needs and goals"
    },
    {
      number: "2",
      title: "Customize",
      description: "Tailor programs to your requirements"
    },
    {
      number: "3",
      title: "Setup",
      description: "We handle logistics and training"
    },
    {
      number: "4",
      title: "Launch",
      description: "Start classes and track progress"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <ResizableNavbar />

      {/* Hero Section */}
      <section className="min-h-screen flex items-center relative overflow-hidden pt-20 lg:pt-0">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ backgroundImage: `url('/${encodeURI('Doodle icon robotics , coding background.png')}')`, opacity: 0.1 }}
        />
        <div className="w-full relative z-10">
          <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-0">
            {/* Left Column - Text */}
            <div className="flex-1 w-full flex flex-col justify-center pl-8 pr-4 md:pl-16 md:pr-8 lg:pl-24 lg:pr-12 xl:pl-32 xl:pr-16 py-12 md:py-16 lg:py-20 text-center lg:text-left">
              <div className="relative z-10 max-w-2xl lg:max-w-none mx-auto lg:mx-0">
                <h1 className="text-4xl md:text-6xl lg:text-7xl xl:text-8xl font-extrabold leading-tight">
                  <span className="block">Empower Your</span>
                  <span className="block">School with</span>
                  <span className="block text-blue-600 font-extrabold">World-Class</span>
                  <span className="block text-blue-600 font-extrabold">Tech Education</span>
                </h1>
                <p className="mt-6 text-gray-700 text-lg md:text-xl lg:text-2xl leading-relaxed max-w-2xl mx-auto lg:mx-0">
                  Partner with Robo Coders™ to bring comprehensive coding and robotics programs to your students. Join 10+ schools already transforming their STEM education.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                  <Button size="lg" className="w-full sm:w-auto px-8 text-lg bg-blue-600 hover:bg-blue-700 text-white">
                    Schedule a Consultation <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Link href="/programs" className="w-full sm:w-auto">
                    <Button variant="outline" className="w-full sm:w-auto px-8 text-lg border-blue-600 text-blue-600 hover:bg-blue-50" size="lg">
                      View Programs
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
            {/* Right Column - Image */}
            <div className="w-full lg:w-[45%] xl:w-[50%] relative h-[300px] sm:h-[400px] md:h-[450px] lg:h-auto lg:min-h-[450px] rounded-none lg:rounded-l-[61px] overflow-hidden bg-white shadow-2xl">
              <Image 
                src="/For School.png"  
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

      {/* Why Schools Choose Us Section */}
      <section className="min-h-screen flex items-center justify-center bg-blue-600 text-white py-20">
        <div className="container">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-center mb-4 md:mb-6">Why Schools Choose Us</h2>
          <p className="text-center text-blue-100 mb-10 md:mb-12 max-w-2xl mx-auto text-base md:text-lg lg:text-xl">
            We make it easy to bring cutting-edge technology education to your campus
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {whyChooseUs.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="bg-white text-gray-900 border-2 border-blue-200">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Icon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-2">{title}</h3>
                      <p className="text-gray-700 text-sm leading-relaxed">{description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Combined Simple Onboarding Process & CTA Section */}
      <section className="h-screen flex flex-col m-0 overflow-hidden">
        {/* Simple Onboarding Process Section */}
        <div className="flex-1 flex items-center justify-center bg-white min-h-0 py-8 md:py-12 overflow-y-auto">
          <div className="container py-4 md:py-6">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-center mb-3 md:mb-4">
              <span className="text-gray-900">Simple</span>{" "}
              <span className="text-blue-600">Onboarding Process</span>
            </h2>
            <p className="text-center text-gray-600 mb-6 md:mb-8 max-w-2xl mx-auto text-sm md:text-base lg:text-lg">
              Get started in just 4 easy steps
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
              {onboardingSteps.map(({ number, title, description }) => (
                <div key={number} className="text-center">
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-3 md:mb-4">
                    <span className="text-xl md:text-2xl font-extrabold">{number}</span>
                  </div>
                  <h3 className="font-bold text-base md:text-lg mb-2">{title}</h3>
                  <p className="text-gray-600 text-xs md:text-sm">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Call to Action Section */}
        <div className="flex-1 flex items-center justify-center bg-blue-600 text-white min-h-0 py-8 md:py-12 overflow-y-auto">
          <div className="container text-center py-4 md:py-6">
            <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold mb-4 md:mb-6">
              Ready to Transform Your School&apos;s Tech Education?
            </h2>
            <p className="text-blue-100 mb-6 md:mb-8 max-w-2xl mx-auto text-base md:text-lg lg:text-xl">
              Schedule a free consultation to discuss how we can support your students
            </p>
            <Button size="lg" variant="secondary" className="bg-white text-blue-600 hover:bg-gray-100 px-8">
              Get Started Today <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}


import Link from "next/link";
import Image from "next/image";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import ResizableNavbar from "../../components/ResizableNavbar";
import Footer from "../../components/Footer";
import FAQAccordion from "../../components/FAQAccordion";
import { 
  BookOpen,
  Cpu,
  Rocket,
  Check,
  RefreshCw,
  ArrowRight
} from "lucide-react";

// Enable ISR - revalidate every hour
export const revalidate = 3600;

export default function ForParentsPage() {

  const whyTrustUs = [
    {
      icon: BookOpen,
      title: "Future-Ready Skills",
      description: "Equip your child with coding, robotics, and problem-solving skills essential for tomorrow's careers."
    },
    {
      icon: RefreshCw,
      title: "Confidence Building",
      description: "Watch your child's self-esteem soar as they create real projects and solve complex challenges."
    },
    {
      icon: Rocket,
      title: "Competitive Edge",
      description: "Certifications and portfolio projects that strengthen student learning and future opportunities."
    }
  ];

  const learningSkills = [
    "Programming languages including Python, Scratch, Scratch Jr.",
    "Building and programming robots with Esp32, Arduino.",
    "Creating mobile apps and video games",
    "Understanding AI and machine learning concepts",
    "Critical thinking and problem-solving skills",
    "Teamwork and project collaboration",
    "Presentation and communication abilities"
  ];

  const pricingPlans = [
    {
      title: "Single Course",
      price: "₹ 999/per course",
      features: [
        "Duration: 12-14 weeks",
        "All materials included",
        "Certificate of completion",
        "Progress reports"
      ]
    },
    {
      title: "Semester Plan",
      price: "₹ 1499/per semester",
      features: [
        "2 courses of your choice",
        "All materials included",
        "Certificate of completion",
        "Portfolio development",
        "Career guidance"
      ]
    },
    {
      title: "Annual Pass",
      price: "₹ 1999/per year",
      features: [
        "Unlimited courses",
        "VIP support access",
        "Certificate of completion",
        "Career guidance",
        "Competition preparation"
      ]
    }
  ];

  const faqs = [
    {
      question: "What age is appropriate to start?",
      answer: "We offer programs for ages 6-18. Our Coding Fundamentals course is perfect for beginners aged 6-12, while older students can dive into more advanced topics like AI and App development."
    },
    {
      question: "Does my child need prior experience?",
      answer: "No! We have programs for complete beginners through advanced students. Our instructors assess each student's level and provide appropriate challenges."
    },
    {
      question: "What if my child falls behind?",
      answer: "We offer one-on-one guidance sessions and recorded class materials. Our instructors provide extra support to ensure no student is left behind."
    },
    {
      question: "What equipment is needed?",
      answer: "For coding classes, just a computer with internet. For robotics, we provide all kits and materials. We'll send you a detailed equipment list upon enrollment."
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
              <div className="relative z-10 max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto lg:mx-0">
                <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl font-extrabold leading-tight max-w-full">
                  <span className="block">Give Your Child</span>
                  <span className="block">a <span className="text-blue-600">Head Start</span> in</span>
                  <span className="block text-blue-600 font-extrabold">Technology</span>
                </h1>
                <p className="mt-6 text-gray-700 text-lg md:text-xl lg:text-2xl leading-relaxed max-w-2xl mx-auto lg:mx-0">
                  Robo Coders™ helps children develop critical 21st-century skills through engaging coding and robotics programs. Join thousands of parents who trust us with their child&apos;s future.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                  <Button size="lg" className="w-full sm:w-auto px-8 text-lg bg-blue-600 hover:bg-blue-700 text-white">
                    Book Free Trial Class <ArrowRight className="ml-2 h-5 w-5" />
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
            <div className="w-full lg:w-[45%] xl:w-[50%] relative h-[300px] sm:h-[400px] md:h-[450px] lg:h-auto lg:min-h-[450px] max-h-[800px] rounded-none lg:rounded-l-[61px] overflow-hidden bg-white shadow-2xl">
              <Image 
                src="/child-making-robot.jpg"  
                alt="Child Learning STEM Activity" 
                fill
                sizes="(max-width: 1023px) 100vw, (max-width: 1279px) 45vw, 50vw"
                className="object-cover max-w-full max-h-full"
                priority
              />
              <div className="absolute left-0 top-0 bottom-0 w-[10px] lg:w-[20px] bg-blue-600 lg:rounded-l-[61px] z-20 pointer-events-none"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Combined Why Parents Trust Us & What Your Child Will Learn Section */}
      <section className="min-h-screen flex flex-col m-0">
        {/* Why Parents Trust Us Section */}
        <div className="flex-1 flex items-start justify-center bg-blue-600 text-white flex-shrink-0 py-8 md:py-12">
          <div className="container w-full py-4 md:py-6">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-center mb-3 md:mb-4 max-w-5xl mx-auto">Why Parents Trust Us</h2>
            <p className="text-center text-blue-100 mb-6 md:mb-8 max-w-2xl mx-auto text-sm md:text-base lg:text-lg">
              We&apos;re more than just coding classes—we&apos;re partners in your child&apos;s development.
            </p>
            <div className="grid md:grid-cols-3 gap-6 md:gap-8">
              {whyTrustUs.map(({ icon: Icon, title, description }) => (
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
        </div>

        {/* What Your Child Will Learn Section */}
        <div className="flex-1 flex items-start justify-center bg-white flex-shrink-0 py-8 md:py-12">
          <div className="container w-full py-4 md:py-6">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-4 md:mb-6 max-w-5xl mx-auto">What Your Child Will Learn</h2>
            <div className="grid md:grid-cols-2 gap-8 md:gap-10 items-center">
              <div className="space-y-4">
                {learningSkills.map((skill, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <Check className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 leading-relaxed text-sm md:text-base">{skill}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-100 rounded-2xl aspect-video relative overflow-hidden max-h-[600px]">
                <Image
                  src="/Kids Dong Robotics.png"
                  alt="Students Learning Robotics Activity"
                  fill
                  className="object-cover max-w-full max-h-full"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Flexible Pricing Section */}
      <section className="flex items-center justify-center bg-blue-600 text-white py-12 md:py-16">
        <div className="container">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-center mb-3 md:mb-4 max-w-5xl mx-auto">Flexible Pricing</h2>
          <p className="text-center text-blue-100 mb-6 md:mb-8 max-w-2xl mx-auto text-sm md:text-base lg:text-lg">
            Affordable options with payment plans available
          </p>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {pricingPlans.map(({ title, price, features }) => (
              <Card key={title} className="bg-white text-gray-900 border-2 border-blue-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-xl mb-2">{title}</h3>
                  <div className="text-2xl font-extrabold text-blue-600 mb-4">{price}</div>
                  <ul className="space-y-3 mb-6">
                    {features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/contact">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions Section */}
      <section className="min-h-screen flex items-center justify-center bg-gray-50 py-20">
        <div className="container py-8">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-center mb-8 md:mb-10 max-w-5xl mx-auto">Frequently Asked Questions</h2>
        <FAQAccordion faqs={faqs} />
        </div>
      </section>

      {/* CTA Section */}
      <section className="flex items-center justify-center bg-blue-600 text-white py-12 md:py-16">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold mb-4 md:mb-6 max-w-5xl mx-auto">
            Start Your Child&apos;s Tech Journey Today
          </h2>
          <p className="text-blue-100 mb-6 md:mb-8 max-w-2xl mx-auto text-base md:text-lg lg:text-xl">
            Give your child the gift of future-ready skills. Join thousands of families who&apos;ve chosen Robo Coders™ for their child&apos;s technology education.
          </p>
          <Link href="/contact">
            <Button size="lg" variant="secondary" className="bg-white text-blue-600 hover:bg-gray-100 px-8">
              Start Enrollment <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}


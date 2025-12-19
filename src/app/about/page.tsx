import Link from "next/link";
import Image from "next/image";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import ResizableNavbar from "../../components/ResizableNavbar";
import Footer from "../../components/Footer";
import { 
  Target,
  Eye,
  Heart,
  Lightbulb,
  Users,
  Trophy,
  BookOpen,
  Network
} from "lucide-react";

// Enable ISR - revalidate every hour
export const revalidate = 3600;

export default function AboutPage() {

  const whyChoose = [
    { 
      icon: Heart, 
      title: "Student-Centric", 
      desc: "Every decision we make prioritizes student success, engagement, and well-being." 
    },
    { 
      icon: Lightbulb, 
      title: "Innovation", 
      desc: "We continuously evolve our curriculum to reflect the latest technological advances." 
    },
    { 
      icon: Users, 
      title: "Inclusivity", 
      desc: "Technology education should be accessible to all, regardless of background or ability." 
    },
    { 
      icon: Trophy, 
      title: "Excellence", 
      desc: "We maintain the highest standards in teaching, content, and student outcomes." 
    },
    { 
      icon: BookOpen, 
      title: "Practical Learning", 
      desc: "Theory meets practice through hands-on projects and real-world applications." 
    },
    { 
      icon: Network, 
      title: "Community", 
      desc: "Building a supportive network of learners, educators, and innovators." 
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <ResizableNavbar />

      {/* Combined Hero & Mission & Vision Section */}
      <section className="min-h-screen flex flex-col justify-center bg-gray-50 py-20">
        <div className="container flex-1 flex flex-col justify-center py-8 md:py-12">
          {/* Hero Content */}
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl font-extrabold mb-4 md:mb-6 max-w-6xl mx-auto">
              About <span className="text-blue-600">Robo Coders™</span>
            </h1>
            <p className="text-lg md:text-xl lg:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Transforming education through innovative coding and robotics programs powered by Yugminds
            </p>
          </div>

          {/* Mission & Vision Cards */}
          <div className="grid md:grid-cols-2 gap-6 md:gap-8 lg:gap-10 mt-5">
            {/* Mission Card */}
            <Card className="bg-blue-600 text-white border-0">
              <CardContent className="p-8 md:p-12 lg:p-16">
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Target className="h-8 w-8 md:h-10 md:w-10 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4">Our Mission</h2>
                    <p className="text-white/90 leading-relaxed text-sm md:text-base lg:text-lg">
                      To empower the next generation with essential coding and robotics skills, fostering creativity, critical thinking, and innovation. We strive to make technology education accessible, engaging, and transformative for every student.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Vision Card */}
            <Card className="bg-blue-600 text-white border-0">
              <CardContent className="p-8 md:p-12 lg:p-16">
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Eye className="h-8 w-8 md:h-10 md:w-10 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4">Our Vision</h2>
                    <p className="text-white/90 leading-relaxed text-sm md:text-base lg:text-lg">
                      To be the leading EdTech platform that bridges the gap between traditional education and future technology needs. We envision a world where every student has the opportunity to become a confident creator and problem solver in the digital age.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="min-h-screen flex items-center justify-center bg-blue-600 py-20">
        <div className="container">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-8 md:mb-12 text-center text-white max-w-5xl mx-auto">Our Story</h2>
          <div className="grid md:grid-cols-2 gap-10 md:gap-12 items-center">
            <div className="space-y-6 md:space-y-8">
              <p className="text-white leading-relaxed text-base md:text-lg lg:text-xl">
                Founded by Yugminds, Robo Coders™ was born from a simple observation: students were eager to learn technology, but lacked engaging, practical programs that truly prepared them for the future.
              </p>
              <p className="text-white leading-relaxed text-base md:text-lg lg:text-xl">
                Since our inception, we&apos;ve trained over 2,000 students across 10+ partner schools, delivering hands-on coding and robotics education that sparks curiosity and builds confidence.
              </p>
              <p className="text-white leading-relaxed text-base md:text-lg lg:text-xl">
                Our team of expert instructors combines industry experience with a passion for teaching, creating an environment where students don&apos;t just learn—they thrive.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden bg-gray-100 aspect-[4/3] relative max-h-[600px]">
              <Image
                src={`/${encodeURI('About Us.jpg')}`}
                alt="Students learning robotics and coding"
                fill
                className="object-cover max-w-full max-h-full"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Robo Coders™? Section */}
      <section className="min-h-screen flex items-center justify-center bg-white py-20">
        <div className="container">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-center mb-4 md:mb-6 max-w-5xl mx-auto">
            Why Choose <span className="text-blue-600">Robo Coders™</span>?
          </h2>
          <p className="text-gray-600 text-center mb-10 md:mb-12 max-w-2xl mx-auto text-base md:text-lg lg:text-xl">
            Experience the future of education with our innovative approach to STEM learning
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {whyChoose.map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="bg-blue-600 text-white border-0">
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-start gap-4 md:gap-5">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-6 w-6 md:h-7 md:w-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg md:text-xl lg:text-2xl mb-2 md:mb-3">{title}</h3>
                      <p className="text-white/90 text-sm md:text-base leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Join Our Mission CTA Section */}
      <section className="flex items-center justify-center bg-blue-600 text-white py-16 md:py-20">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-4 md:mb-6 max-w-5xl mx-auto">Join Our Mission</h2>
          <p className="text-blue-100 mb-8 md:mb-10 max-w-3xl mx-auto text-base md:text-lg lg:text-xl leading-relaxed">
            Be part of the educational revolution that&apos;s preparing students for tomorrow&apos;s world
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact">
              <Button size="lg" variant="secondary" className="bg-white text-blue-600 hover:bg-gray-100 px-8 text-base py-6">
                Partner With Us
              </Button>
            </Link>
            <Link href="/programs">
              <Button size="lg" variant="secondary" className="bg-white text-blue-600 hover:bg-gray-100 px-8 text-base py-6">
                Explore Programs
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


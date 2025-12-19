"use client";

import { useState } from "react";
import { Button } from "../../components/ui/button";
import { useAutoSaveForm } from "../../hooks/useAutoSaveForm";
import { loadFormData, clearFormData } from "../../lib/form-persistence";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import ResizableNavbar from "../../components/ResizableNavbar";
import Footer from "../../components/Footer";
import { 
  Phone,
  Mail,
  Clock,
  MapPin,
  Instagram,
  Youtube,
  Facebook
} from "lucide-react";

export default function ContactPage() {
  // Load saved contact form data
  const savedFormData = typeof window !== 'undefined'
    ? loadFormData<{
        firstName: string;
        lastName: string;
        areaCode: string;
        phoneNumber: string;
        email: string;
        purpose: string;
        message: string;
      }>('contact-form')
    : null;

  const [formData, setFormData] = useState(savedFormData || {
    firstName: "",
    lastName: "",
    areaCode: "+91",
    phoneNumber: "",
    email: "",
    purpose: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-save contact form
  const { clearSavedData } = useAutoSaveForm({
    formId: 'contact-form',
    formData,
    autoSave: true,
    autoSaveInterval: 2000,
    debounceDelay: 500,
    useSession: false,
    onLoad: (data) => {
      if (data && !savedFormData) {
        setFormData(data);
      }
    },
    markDirty: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        // Clear saved form data after successful submission
        clearFormData('contact-form');
        clearSavedData();

        alert("Thank you for your message! We'll get back to you soon.");
        setFormData({
          firstName: "",
          lastName: "",
          areaCode: "+91",
          phoneNumber: "",
          email: "",
          purpose: "",
          message: ""
        });
      } else {
        alert("Something went wrong. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <ResizableNavbar />

      {/* Combined Get in Touch & Find Us Section */}
      <section className="min-h-screen flex flex-col m-0">
        {/* Get in Touch Section */}
        <div className="flex-1 flex items-start justify-center bg-gray-50 flex-shrink-0 py-8 md:py-12 min-h-0">
          <div className="container w-full py-4 md:py-6">
            <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold mb-3 md:mb-4 text-center">
              Get in <span className="text-blue-600">Touch</span>
            </h1>
            <p className="text-sm md:text-base lg:text-lg text-gray-700 mb-4 md:mb-6 max-w-2xl mx-auto leading-relaxed text-center">
              Have questions? We&apos;d love to hear from you. Send us a message and we&apos;ll respond as soon as possible.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <Card className="bg-blue-600 text-white border-0">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Phone className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Phone</h3>
                  <p className="text-white/90 mb-1">+91 85003 45655</p>
                  <p className="text-white/70 text-sm">Mon-Fri, 9am-6pm EST</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-600 text-white border-0">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Email</h3>
                  <p className="text-white/90 mb-1">robocoders07@gmail.com</p>
                  <p className="text-white/70 text-sm">We reply within 24 hours</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-600 text-white border-0">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Office Hours</h3>
                  <p className="text-white/90 mb-1">Mon-Fri: 9am-6pm</p>
                  <p className="text-white/70 text-sm">Saturday: 10am-4pm</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Find Us Section */}
        <div className="flex-1 flex items-start justify-center bg-blue-600 flex-shrink-0 py-8 md:py-12 min-h-0">
          <div className="container w-full py-4 md:py-6">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-6 md:mb-8 text-white">Find Us</h2>
            <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start justify-start">
              <Card className="bg-white border-0 w-full max-w-sm mx-auto md:mx-auto mt-6 md:mt-8">
                <CardContent className="p-3 md:p-4 flex flex-col items-center text-center">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-600 rounded-full flex items-center justify-center mb-2 md:mb-3 mx-auto">
                    <MapPin className="h-6 w-6 md:h-7 md:w-7 text-white" />
                  </div>
                  <h3 className="font-bold text-base md:text-lg mb-1.5 md:mb-2 text-center text-gray-900">Address</h3>
                  <p className="text-gray-700 leading-relaxed text-xs md:text-sm text-center">
                    Begumpet, Hyderabad, Telangana, India.
                  </p>
                </CardContent>
              </Card>
              <a 
                href="https://www.google.com/maps?q=17.447081,78.460012"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-100 rounded-xl overflow-hidden shadow-lg w-full md:flex-1 mx-auto md:mx-0 self-start block cursor-pointer hover:opacity-90 transition-opacity"
              >
                <div className="w-full aspect-[2/1] pointer-events-none relative">
                  <iframe
                    src="https://maps.google.com/maps?q=17.447081,78.460012&hl=en&z=15&output=embed"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="w-full h-full"
                  ></iframe>
                  <div className="absolute inset-0 z-10"></div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="min-h-screen flex items-center justify-center bg-gray-50 py-20">
        <div className="container py-8 px-4 md:px-8 lg:px-12 xl:px-16">
          <h2 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold mb-8 md:mb-10 text-center">Contact Us</h2>
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-8">
            <div>
              <Label htmlFor="firstName" className="text-base md:text-lg font-medium">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
                className="mt-2 text-base md:text-lg h-12 md:h-14"
                placeholder="John"
              />
            </div>
            <div>
              <Label htmlFor="lastName" className="text-base md:text-lg font-medium">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
                className="mt-2 text-base md:text-lg h-12 md:h-14"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="mb-6 md:mb-8">
            <Label htmlFor="phone" className="text-base md:text-lg font-medium">
              Phone Number <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-[120px_1fr] gap-3 md:gap-4 mt-2">
              <div>
                <Input
                  id="areaCode"
                  value={formData.areaCode}
                  onChange={(e) => setFormData({ ...formData, areaCode: e.target.value })}
                  className="text-base md:text-lg h-12 md:h-14"
                />
                <Label htmlFor="areaCode" className="text-sm md:text-base text-gray-500 mt-1 block">
                  Area Code
                </Label>
              </div>
              <div>
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  required
                  type="tel"
                  className="text-base md:text-lg h-12 md:h-14"
                  placeholder="8500345655"
                />
                <Label htmlFor="phoneNumber" className="text-sm md:text-base text-gray-500 mt-1 block">
                  Phone Number
                </Label>
              </div>
            </div>
          </div>

          <div className="mb-6 md:mb-8">
            <Label htmlFor="email" className="text-base md:text-lg font-medium">
              E-mail <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="mt-2 text-base md:text-lg h-12 md:h-14"
              placeholder="ex: email@yahoo.com"
            />
            <p className="text-sm md:text-base text-gray-500 mt-1">example@example.com</p>
          </div>

          <div className="mb-6 md:mb-8">
            <Label htmlFor="purpose" className="text-base md:text-lg font-medium">
              Select Purpose <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.purpose}
              onValueChange={(value) => setFormData({ ...formData, purpose: value })}
              required
            >
              <SelectTrigger className="mt-2 text-base md:text-lg h-12 md:h-14">
                <SelectValue placeholder="Please Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Inquiry</SelectItem>
                <SelectItem value="school">School Partnership</SelectItem>
                <SelectItem value="parent">Parent Inquiry</SelectItem>
                <SelectItem value="student">Student Enrollment</SelectItem>
                <SelectItem value="support">Technical Support</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mb-6 md:mb-8">
            <Label htmlFor="message" className="text-base md:text-lg font-medium">
              Message: <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              required
              className="mt-2 min-h-[120px] md:min-h-[150px] text-base md:text-lg"
              placeholder="Short message (e.g., 'We'd like to schedule a school demo')"
            />
          </div>

          <div className="flex justify-center">
            <Button
              type="submit"
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 px-12 text-lg md:text-xl h-12 md:h-14"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </form>
        </div>
      </section>

      {/* Connect With Us Section */}
      <section className="flex items-center justify-center bg-white py-12 md:py-16">
        <div className="container">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-3 md:mb-4">
          Connect <span className="text-blue-600">With Us</span>
        </h2>
        <p className="text-gray-700 mb-6 md:mb-8 max-w-2xl mx-auto text-center text-sm md:text-base lg:text-lg">
          Follow us on social media for updates, tips, and student showcases.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a
            href="https://www.instagram.com/robocoders?igsh=MTJweGVsMzg5M2I3MQ=="
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 hover:opacity-80 transition-opacity"
            aria-label="Instagram"
          >
            <Instagram className="h-6 w-6 text-white" />
          </a>
          <a
            href="https://youtube.com/@robocoders?si=KcRjT1jfLJg7jMkq"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 transition-colors"
            aria-label="YouTube"
          >
            <Youtube className="h-6 w-6 text-white" />
          </a>
          <a
            href="https://www.facebook.com/share/1V8yjknAGv/?mibextid=wwXIfr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors"
            aria-label="Facebook"
          >
            <Facebook className="h-6 w-6 text-white" />
          </a>
        </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}







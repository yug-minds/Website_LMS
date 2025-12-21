import Link from "next/link";
import { Instagram, Youtube, Facebook, Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer id="contact" className="footer-section bg-gray-900 text-white pt-20 pb-8 w-full relative z-10 mt-0">
      <div className="container mx-auto px-4 md:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div className="lg:col-span-2">
            <div className="text-3xl md:text-4xl font-extrabold mb-6 text-white">Robo Coders™</div>
            <p className="text-gray-400 mb-8 max-w-lg text-base md:text-lg leading-relaxed">An EdTech initiative by YugMinds, empowering the next generation with cutting‑edge STEM education through AI, robotics, and programming.</p>
            <div className="space-y-3 text-base text-gray-300">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 flex items-center justify-center rounded bg-white/10">
                  <Mail className="h-4 w-4 text-white" />
                </span>
                <span>robocoders07@gmail.com</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 flex items-center justify-center rounded bg-white/10">
                  <Phone className="h-4 w-4 text-white" />
                </span>
                <span>+91 85003 45655</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 flex items-center justify-center rounded bg-white/10 mt-0.5 flex-shrink-0">
                  <MapPin className="h-4 w-4 text-white" />
                </span>
                <span>Begumpet,<br/>Hyderabad, Telangana, India.</span>
              </div>
            </div>
          </div>
          
          <div>
            <div className="font-semibold text-xl mb-6 text-white">Quick Links</div>
            <ul className="space-y-3 text-base text-gray-300">
              <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="/programs" className="hover:text-white transition-colors">Our Programs</Link></li>
              <li><Link href="/success-stories" className="hover:text-white transition-colors">Success Stories</Link></li>
              <li><Link href="/for-schools" className="hover:text-white transition-colors">For Schools</Link></li>
              <li><Link href="/for-parents" className="hover:text-white transition-colors">For Parents</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
            </ul>
          </div>
          
          <div>
            <div className="font-semibold text-xl mb-6 text-white">Follow Us</div>
            <div className="flex gap-4 mb-10">
              <a href="https://www.instagram.com/robocoders?igsh=MTJweGVsMzg5M2I3MQ==" target="_blank" rel="noopener noreferrer" className="w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 hover:opacity-80 transition-opacity shadow-lg" aria-label="Instagram">
                <Instagram className="h-6 w-6 text-white" />
              </a>
              <a href="https://youtube.com/@robocoders?si=KcRjT1jfLJg7jMkq" target="_blank" rel="noopener noreferrer" className="w-12 h-12 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 transition-colors shadow-lg" aria-label="YouTube">
                <Youtube className="h-6 w-6 text-white" />
              </a>
              <a href="https://www.facebook.com/share/1V8yjknAGv/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg" aria-label="Facebook">
                <Facebook className="h-6 w-6 text-white" />
              </a>
            </div>
          </div>
        </div>
        
        <div className="border-t border-white/10 pt-8 mt-8">
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 text-sm text-gray-400">
            <p className="text-center">
              © 2024 Robo Coders™ by Yugminds. All rights reserved. |{" "}
              <Link href="/privacy-policy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>{" "}
              |{" "}
              <Link href="/terms-of-service" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}


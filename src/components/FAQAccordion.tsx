"use client";

import React, { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { HelpCircle, Plus, Minus } from "lucide-react";

interface FAQ {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  faqs: FAQ[];
}

export default function FAQAccordion({ faqs }: FAQAccordionProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {faqs.map(({ question, answer }, idx) => {
        const isOpen = openIndex === idx || hoveredIndex === idx;
        return (
          <Card 
            key={idx} 
            className="bg-white text-gray-900 border-0 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => toggleFAQ(idx)}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 transition-all duration-300">
                  <HelpCircle className="h-6 w-6 text-blue-600 transition-all duration-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-extrabold text-xl md:text-2xl text-gray-900 transition-colors duration-300">{question}</h3>
                    <div className="transition-all duration-300 ease-in-out">
                      {isOpen ? (
                        <Minus className="h-6 w-6 text-blue-600 flex-shrink-0 transition-all duration-300 rotate-0" />
                      ) : (
                        <Plus className="h-6 w-6 text-blue-600 flex-shrink-0 transition-all duration-300 rotate-0" />
                      )}
                    </div>
                  </div>
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <p className="text-gray-700 leading-relaxed mt-3 text-base md:text-lg">
                      {answer}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


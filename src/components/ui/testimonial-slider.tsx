"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "./carousel"
import { Button } from "./button"
import { cn } from "../../lib/utils"

export interface Testimonial {
  id: string | number
  initials: string
  name: string
  role: string
  quote: string
  tags: { text: string; type: 'featured' | 'default' }[]
  stats: { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; text: string }[]
  avatarGradient: string
}

interface TestimonialSliderProps {
  testimonials: Testimonial[]
  className?: string
}

export function TestimonialSlider({
  testimonials,
  className,
}: TestimonialSliderProps) {
  const [api, setApi] = React.useState<CarouselApi>()
  const [current, setCurrent] = React.useState(0)
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)
  const [isPaused, setIsPaused] = React.useState(false)
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null)

  React.useEffect(() => {
    if (!api) {
      return
    }

    const updateState = () => {
      const selectedIndex = api.selectedScrollSnap()
      setCurrent(selectedIndex)
      setCanScrollPrev(api.canScrollPrev())
      setCanScrollNext(api.canScrollNext())
    }

    updateState()
    api.on("select", updateState)
    api.on("reInit", updateState)

    return () => {
      api.off("select", updateState)
      api.off("reInit", updateState)
    }
  }, [api])

  const scrollTo = React.useCallback(
    (index: number) => {
      api?.scrollTo(index)
    },
    [api]
  )

  // Auto-advance testimonials every 2 seconds with direct replacement
  React.useEffect(() => {
    if (!api || isPaused || testimonials.length <= 1) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      if (api) {
        api.scrollNext()
      }
    }, 2000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [api, isPaused, testimonials.length])

  const handleMouseEnter = () => setIsPaused(true)
  const handleMouseLeave = () => setIsPaused(false)
  
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  
  const handleManualNavigation = React.useCallback(() => {
    setIsPaused(true)
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    // Resume after 5 seconds of no interaction
    timeoutRef.current = setTimeout(() => {
      setIsPaused(false)
      timeoutRef.current = null
    }, 5000)
  }, [])
  
  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  if (!testimonials || testimonials.length === 0) {
    return null
  }

  return (
      <div
        className={cn("w-full flex flex-col", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Carousel
          setApi={setApi}
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full relative"
        >
        <CarouselContent className="-ml-2 md:-ml-4">
          {testimonials.map((testimonial, _index) => (
            <CarouselItem key={testimonial.id} className="pl-2 md:pl-4 basis-full">
              <div className="testimonial-slider-card bg-white shadow-xl rounded-2xl border border-gray-100 p-6 md:p-8 relative z-10 w-full max-w-full">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-base shadow-md"
                      style={{ background: testimonial.avatarGradient }}
                    >
                      {testimonial.initials}
                    </div>
                    <div>
                      <h3 className="text-card-foreground font-semibold text-lg">
                        {testimonial.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                </div>

                <blockquote className="text-card-foreground/90 leading-relaxed text-base md:text-lg mb-6">
                  &quot;{testimonial.quote}&quot;
                </blockquote>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-t border-border pt-4 gap-3">
                  <div className="flex flex-wrap gap-2">
                    {testimonial.tags.map((tag, i) => (
                      <span
                        key={i}
                        className={cn(
                          "text-xs px-3 py-1 rounded-full font-medium transition-colors",
                          tag.type === "featured"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-secondary text-secondary-foreground"
                        )}
                      >
                        {tag.text}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {testimonial.stats.map((stat, i) => {
                      const IconComponent = stat.icon
                      return (
                        <span key={i} className="flex items-center gap-1.5">
                          <IconComponent className="h-4 w-4" />
                          {stat.text}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        <div className="flex items-center justify-center gap-4 mt-8 relative z-20">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full bg-white border-white hover:bg-gray-100 text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            onClick={() => {
              api?.scrollPrev()
              handleManualNavigation()
            }}
            disabled={!canScrollPrev}
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  scrollTo(index)
                  handleManualNavigation()
                }}
                className={cn(
                  "h-2 rounded-full transition-all duration-300 cursor-pointer",
                  current === index
                    ? "w-8 bg-white shadow-sm"
                    : "w-2 bg-white/50 hover:bg-white/70"
                )}
                aria-label={`Go to testimonial ${index + 1}`}
              />
            ))}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full bg-white border-white hover:bg-gray-100 text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            onClick={() => {
              api?.scrollNext()
              handleManualNavigation()
            }}
            disabled={!canScrollNext}
            aria-label="Next testimonial"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </Carousel>
    </div>
  )
}


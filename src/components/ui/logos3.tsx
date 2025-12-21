// This template requires the Embla Auto Scroll plugin to be installed:
// npm install embla-carousel-auto-scroll

"use client";

import AutoScroll from "embla-carousel-auto-scroll";
import { useEffect, useState, useMemo } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "./carousel";

interface Logo {
  id: string;
  description: string;
  image: string;
  className?: string;
}

interface Logos3Props {
  heading?: string;
  logos?: Logo[];
  className?: string;
}

const EMPTY_LOGOS: Logo[] = [];

const Logos3 = ({
  heading = "Trusted by Leading Schools",
  logos = EMPTY_LOGOS,
  className,
}: Logos3Props) => {
  const [dynamicLogos, setDynamicLogos] = useState<Logo[]>(logos ?? []);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // If logos are passed in, use them (no fetch).
    if (logos && logos.length > 0) {
      setDynamicLogos(logos);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    async function run() {
      try {
        setIsLoading(true);
        setHasError(false);

        const timeoutId = setTimeout(() => ac.abort(), 12000);
        const res = await fetch("/api/logos", {
          cache: "no-store",
          credentials: "same-origin",
          signal: ac.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!res.ok) throw new Error(`Failed to fetch logos: ${res.status}`);
        // Be defensive: some caches/middleware can cause 200 responses with empty bodies.
        const raw = await res.text();
        let data: any = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (e) {
          throw new Error(`Failed to parse /api/logos JSON. Body: ${raw?.slice(0, 200) ?? ""}`);
        }

        const list = Array.isArray(data?.logos) ? (data.logos as Logo[]) : [];
        const valid = list.filter((l) => typeof l?.image === "string" && l.image.trim() !== "");

        if (cancelled) return;

        if (valid.length > 0) {
          setDynamicLogos(valid);
          setHasError(false);
        } else {
          console.warn("No valid logos in /api/logos response", { data });
          setDynamicLogos([]);
          setHasError(true);
        }
      } catch (e) {
        if (cancelled) return;
        // Abort just means we timed out / navigated away.
        if (!(e instanceof Error && e.name === "AbortError")) {
          console.warn("Failed to load logos:", e);
        }
        setDynamicLogos([]);
        setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [logos]);

  // Duplicate logos for seamless infinite scroll
  const duplicatedLogos = useMemo(() => {
    if (dynamicLogos.length === 0) return [];
    // Create enough duplicates for smooth infinite scroll
    return [...dynamicLogos, ...dynamicLogos, ...dynamicLogos];
  }, [dynamicLogos]);

  // Memoize the AutoScroll plugin - recreate when logos change
  const autoScrollPlugin = useMemo(() => {
    if (dynamicLogos.length === 0) return null;
    return AutoScroll({
      playOnInit: true,
      speed: 1.5, // Higher speed value = faster scrolling
      direction: 'backward', // Moves from right to left
      stopOnInteraction: false,
      stopOnMouseEnter: false,
      stopOnFocusIn: false,
      startDelay: 0,
    });
  }, [dynamicLogos.length]);

  return (
    <section className={`logos-section py-20 md:py-24 ${className || ""}`}>
      <div className="container flex flex-col items-center text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
          {heading}
        </h2>
      </div>
      <div className="pt-6 md:pt-10">
        <div className="relative mx-auto flex items-center justify-center max-w-screen-xl overflow-hidden min-h-[200px]">
          {isLoading && (
            <div className="flex items-center justify-center w-full py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 text-sm">Loading school logos...</p>
              </div>
            </div>
          )}
          
          {!isLoading && hasError && (
            <div className="flex items-center justify-center w-full py-12">
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-4">Unable to load logos at this time</p>
                <button
                  onClick={() => {
                    setIsLoading(true);
                    setHasError(false);
                    setDynamicLogos([]);
                    // Trigger reload by updating a dependency
                    window.location.reload();
                  }}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          
          {!isLoading && !hasError && dynamicLogos.length > 0 && autoScrollPlugin && (
            <>
              <Carousel
                opts={{ loop: true, align: 'start', dragFree: true, skipSnaps: false }}
                plugins={[autoScrollPlugin]}
                className="w-full"
              >
              <CarouselContent className="ml-0">
                {duplicatedLogos.map((logo, index) => (
                  <CarouselItem
                    key={`${logo.id}-${index}`}
                    className="flex basis-1/3 justify-center pl-0 sm:basis-1/4 md:basis-1/5 lg:basis-1/6"
                  >
                    <div className="mx-6 md:mx-10 flex shrink-0 items-center justify-center min-h-[80px] md:min-h-[112px] lg:min-h-[128px]">
                      <div className="relative w-full flex items-center justify-center">
                        <img
                          src={logo.image}
                          alt={logo.description || 'School logo'}
                          className={logo.className || "h-20 md:h-28 lg:h-32 w-auto opacity-60 hover:opacity-100 transition-opacity max-w-[150px] object-contain"}
                          loading="lazy"
                          decoding="async"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            // Hide broken images gracefully
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            console.warn('Failed to load logo image:', logo.image, 'for school:', logo.description);
                          }}
                          onLoad={(e) => {
                            // Ensure image is visible when loaded
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'block';
                            console.log('Successfully loaded logo:', logo.description);
                          }}
                        />
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent pointer-events-none z-10"></div>
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent pointer-events-none z-10"></div>
            </>
          )}
          
          {/* Debug: Show if logos are loaded but not rendering */}
          {!isLoading && !hasError && dynamicLogos.length > 0 && !autoScrollPlugin && (
            <div className="flex items-center justify-center w-full py-12">
              <div className="text-center">
                <p className="text-gray-500 text-sm">Logos loaded ({dynamicLogos.length}) but carousel not initialized</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export { Logos3 };
export default Logos3;

"use client";
import { cn } from "../../lib/utils";
import { IconMenu2, IconX } from "@tabler/icons-react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import React, { useRef, useState, useEffect } from "react";

interface NavbarProps {
  children: React.ReactNode;
  className?: string;
}

interface NavBodyProps {
  children: React.ReactNode;
  className?: string;
  visible?: boolean;
}

interface NavItemsProps {
  items: {
    name: string;
    link: string;
  }[];
  className?: string;
  onItemClick?: () => void;
}

interface MobileNavProps {
  children: React.ReactNode;
  className?: string;
  visible?: boolean;
}

interface MobileNavHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface MobileNavMenuProps {
  children: React.ReactNode;
  className?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const Navbar = ({ children, className }: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    const handleScroll = () => {
      if (typeof window !== 'undefined') {
        const scrollY = window.scrollY || window.pageYOffset;
        if (scrollY > 100) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    };

    // Set initial state
    if (typeof window !== 'undefined') {
      handleScroll();
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <motion.div
      ref={ref}
      // IMPORTANT: Change this to class of `fixed` if you want the navbar to be fixed
      className={cn("fixed inset-x-0 top-0 z-40 w-full", className)}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ visible?: boolean }>,
              { visible },
            )
          : child,
      )}
    </motion.div>
  );
};

export const NavBody = ({ children, className, visible }: NavBodyProps) => {
  const [isDark, setIsDark] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    
    const updateWindowWidth = () => {
      setWindowWidth(window.innerWidth);
    };
    
    checkDarkMode();
    updateWindowWidth();
    
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('resize', updateWindowWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWindowWidth);
    };
  }, []);

  // Calculate responsive width based on screen size
  const getNavbarWidth = () => {
    if (!visible) return "100%";
    if (windowWidth === 0) return "85%"; // Initial render
    if (windowWidth < 1280) return "92%"; // Smaller screens
    if (windowWidth < 1536) return "88%"; // Medium screens
    return "80%"; // Large screens - reduced from 90% to 80%
  };

  const getMinWidth = () => {
    if (!visible) return "100%";
    if (windowWidth === 0) return "auto";
    if (windowWidth < 1280) return "auto"; // No min width on smaller screens
    return "min(900px, 85vw)"; // Reduced from 1100px to 900px to allow tighter layout
  };

  return (
    <motion.div
      animate={{
        backdropFilter: visible ? "blur(10px)" : "none",
        boxShadow: visible
          ? "0 0 24px rgba(34, 42, 53, 0.06), 0 1px 1px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(34, 42, 53, 0.04), 0 0 4px rgba(34, 42, 53, 0.08), 0 16px 68px rgba(47, 48, 55, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset"
          : "none",
        width: getNavbarWidth(),
        y: visible ? 20 : 0,
        backgroundColor: visible 
          ? isDark 
            ? "rgba(10, 10, 10, 0.8)" 
            : "rgba(255, 255, 255, 0.8)"
          : isDark
            ? "rgba(10, 10, 10, 0)"
            : "rgba(255, 255, 255, 0)",
      }}
      transition={{
        type: "spring",
        stiffness: 100,
        damping: 25,
        mass: 0.5,
      }}
      style={{
        minWidth: getMinWidth(),
      }}
      className={cn(
        "relative z-[60] mx-auto hidden w-full max-w-7xl flex-row items-center justify-between self-start rounded-full lg:flex group",
        visible ? "px-2 py-2" : "px-3 py-3", // Reduced padding when scrolled
        className,
      )}
      data-scrolled={visible}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          // Only pass visible prop to React components, not DOM elements
          // DOM elements have string types (like 'div', 'span'), React components have function/object types
          if (typeof child.type === 'string') {
            // It's a DOM element (div, span, etc.) - don't pass visible prop
            return child;
          }
          // It's a React component - safe to pass visible prop
          return React.cloneElement(child as React.ReactElement<any>, { visible });
        }
        return child;
      })}
    </motion.div>
  );
};

export const NavItems = ({ items, className, onItemClick, visible }: NavItemsProps & { visible?: boolean }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const pathname = usePathname();
  const [animationTrigger, setAnimationTrigger] = useState(0);

  // Trigger animation when navbar visible state changes (scrolling)
  useEffect(() => {
    if (visible !== undefined) {
      // Trigger animation by incrementing the key
      setAnimationTrigger(prev => prev + 1);
    }
  }, [visible]);

  // Check if a route is active (exact match for home, or starts with for others)
  const isActive = (link: string) => {
    if (link === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(link);
  };

  return (
    <motion.div
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "absolute inset-0 hidden flex-1 flex-row items-center justify-center text-sm lg:text-sm xl:text-base font-medium text-zinc-600 transition duration-200 hover:text-zinc-800 lg:flex overflow-hidden",
        visible ? "gap-0.5 lg:gap-1 xl:gap-1" : "gap-1 lg:gap-1.5 xl:gap-2", // Reduced gap when scrolled
        className,
      )}
    >
      {items.map((item, idx) => {
        const active = isActive(item.link);
        return (
          <Link
            onMouseEnter={() => setHovered(idx)}
            onClick={onItemClick}
            className={cn(
              "relative py-2 text-neutral-600 dark:text-neutral-300 whitespace-nowrap flex-shrink-0 min-w-0",
              visible ? "px-0.5 lg:px-1 xl:px-1" : "px-1 lg:px-1.5 xl:px-2", // Reduced padding when scrolled
              active && "text-blue-600 dark:text-blue-400" // Active link color
            )}
            key={`link-${idx}`}
            href={item.link}
            prefetch={true}
          >
            {hovered === idx && (
              <motion.div
                layoutId="hovered"
                className="absolute inset-0 h-full w-full rounded-full bg-gray-100 dark:bg-neutral-800"
              />
            )}
            <span className="relative z-20 truncate">{item.name}</span>
            {/* Blue line indicator for active page with animations */}
            {active && (
              <motion.div
                layoutId="activeIndicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 z-30 overflow-hidden"
                style={{ originX: 0.5 }}
              >
                {/* Animated scale layer - triggers on scroll */}
                <motion.div
                  key={`scale-${animationTrigger}`}
                  className="absolute inset-0 h-full bg-blue-600 dark:bg-blue-400"
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 30,
                    duration: 0.4,
                  }}
                >
                  {/* Animated shine effect - always running */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30"
                    initial={{ x: "-100%" }}
                    animate={{
                      x: ["-100%", "200%"],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "linear",
                      repeatDelay: 1,
                    }}
                  />
                </motion.div>
              </motion.div>
            )}
          </Link>
        );
      })}
    </motion.div>
  );
};

export const MobileNav = ({ children, className, visible }: MobileNavProps) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      animate={{
        backdropFilter: visible ? "blur(10px)" : "none",
        boxShadow: visible
          ? "0 0 24px rgba(34, 42, 53, 0.06), 0 1px 1px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(34, 42, 53, 0.04), 0 0 4px rgba(34, 42, 53, 0.08), 0 16px 68px rgba(47, 48, 55, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset"
          : "none",
        width: visible ? "90%" : "100%",
        paddingRight: visible ? "12px" : "0px",
        paddingLeft: visible ? "12px" : "0px",
        borderRadius: visible ? "4px" : "2rem",
        y: visible ? 20 : 0,
        backgroundColor: visible 
          ? isDark 
            ? "rgba(10, 10, 10, 0.8)" 
            : "rgba(255, 255, 255, 0.8)"
          : isDark
            ? "rgba(10, 10, 10, 0)"
            : "rgba(255, 255, 255, 0)",
      }}
      transition={{
        type: "spring",
        stiffness: 100,
        damping: 25,
        mass: 0.5,
      }}
      className={cn(
        "relative z-50 mx-auto flex w-full max-w-[calc(100vw-2rem)] flex-col items-center justify-between px-0 py-2 lg:hidden",
        className,
      )}
    >
      {children}
    </motion.div>
  );
};

export const MobileNavHeader = ({
  children,
  className,
}: MobileNavHeaderProps) => {
  return (
    <div
      className={cn(
        "flex w-full flex-row items-center justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const MobileNavMenu = ({
  children,
  className,
  isOpen,
  onClose,
}: MobileNavMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "absolute inset-x-0 top-16 z-50 flex w-full flex-col items-start justify-start gap-4 rounded-lg bg-white px-4 py-8 shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset] dark:bg-neutral-950",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const MobileNavToggle = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => {
  return isOpen ? (
    <IconX className="text-black dark:text-white" onClick={onClick} />
  ) : (
    <IconMenu2 className="text-black dark:text-white" onClick={onClick} />
  );
};

export const NavbarLogo = ({ visible }: { visible?: boolean }) => {
  return (
    <Link
      href="/"
      className={cn(
        "relative z-20 flex items-center space-x-2 px-2 py-1 text-base font-normal text-black whitespace-nowrap flex-shrink-0",
        visible ? "mr-2" : "mr-4" // Reduced margin when scrolled
      )}
    >
      <Image
        src="/Yugminds_Official_Logo-preview.png"
        alt="YugMinds Logo"
        width={visible ? 32 : 40} // Smaller logo when scrolled
        height={visible ? 32 : 40}
        className="object-contain"
      />
      <span className={cn(
        "font-medium text-black dark:text-white",
        visible ? "text-base" : "text-lg" // Increased text size
      )}>YugMinds</span>
    </Link>
  );
};

export const NavbarButton = ({
  href,
  as: Tag,
  children,
  className,
  variant = "primary",
  ...props
}: {
  href?: string;
  as?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "dark" | "gradient";
} & (
  | React.ComponentPropsWithoutRef<"a">
  | React.ComponentPropsWithoutRef<"button">
)) => {
  const baseStyles =
    "px-4 py-2 rounded-md bg-white button bg-white text-black text-base font-bold relative cursor-pointer hover:-translate-y-0.5 transition duration-200 inline-block text-center";

  const variantStyles = {
    primary:
      "shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]",
    secondary: "bg-transparent shadow-none dark:text-white",
    dark: "bg-black text-white shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]",
    gradient:
      "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-[0px_2px_0px_0px_rgba(255,255,255,0.3)_inset]",
  };

  const Component = Tag || (href ? Link : "button");

  return (
    <Component
      href={href || undefined}
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    >
      {children}
    </Component>
  );
};


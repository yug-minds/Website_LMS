"use client";
import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';

import { 
  Home, 
  User, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight,
  BarChart3,
  FileText,
  Bell,
  Search,
  School,
  Users,
  BookOpen,
  ClipboardList,
  TrendingUp,
  Shield,
  Calendar,
  Clock,
  KeyRound,
  Activity
} from 'lucide-react';

interface NavigationItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
}

interface SidebarProps {
  className?: string;
  userRole?: string;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
  assignmentBadgeCount?: number;
  notificationBadgeCount?: number;
}

// Role-based navigation items
const getNavigationItems = (role: string, assignmentCount?: number, notificationCount?: number): NavigationItem[] => {
  const baseItems = [
    { id: "dashboard", name: "Dashboard", icon: Home, href: "/dashboard" },
    { id: "profile", name: "Profile", icon: User, href: "/profile" },
    { id: "settings", name: "Settings", icon: Settings, href: "/settings" },
  ];

  switch (role) {
    case 'admin':
      return [
        { id: "dashboard", name: "Overview", icon: Home, href: "/admin" },
        { id: "schools", name: "Schools Management", icon: School, href: "/admin/schools" },
        { id: "logos", name: "School Logo Management", icon: School, href: "/admin/logos" },
        { id: "success-stories", name: "Success Stories Management", icon: FileText, href: "/admin/success-stories" },
        { id: "school-admins", name: "School Admin Management", icon: Shield, href: "/admin/school-admins" },
        { id: "teachers", name: "Teachers Management", icon: Users, href: "/admin/teachers" },
        { id: "students", name: "Students Management", icon: User, href: "/admin/students" },
        { id: "courses", name: "Course Management", icon: BookOpen, href: "/admin/courses" },
        { id: "notifications", name: "Notifications", icon: Bell, href: "/admin/notifications", badge: notificationCount && notificationCount > 0 ? String(notificationCount) : undefined },
        { id: "password-reset-requests", name: "Password Reset Requests", icon: KeyRound, href: "/admin/password-reset-requests" },
        { id: "reports", name: "Teacher Reports", icon: ClipboardList, href: "/admin/reports" },
        { id: "analytics", name: "Performance Analytics", icon: TrendingUp, href: "/admin/analytics" },
        { id: "monitoring", name: "System Monitoring", icon: Activity, href: "/admin/monitoring" },
        { id: "settings", name: "Settings", icon: Settings, href: "/admin/settings" },
      ];
    case 'school_admin':
      return [
        { id: "dashboard", name: "Overview", icon: Home, href: "/school-admin" },
        { id: "students", name: "Students Management", icon: User, href: "/school-admin/students" },
        { id: "teachers", name: "Teachers Management", icon: Users, href: "/school-admin/teachers" },
        { id: "schedules", name: "Class Scheduling", icon: Calendar, href: "/school-admin/schedules" },
        { id: "reports", name: "Teacher Reports", icon: ClipboardList, href: "/school-admin/reports" },
        { id: "courses", name: "Courses & Progress", icon: BookOpen, href: "/school-admin/courses" },
        { id: "analytics", name: "Analytics Dashboard", icon: TrendingUp, href: "/school-admin/analytics" },
        { id: "notifications", name: "Notifications", icon: Bell, href: "/school-admin/notifications", badge: notificationCount && notificationCount > 0 ? String(notificationCount) : undefined },
        { id: "password-reset-requests", name: "Password Reset Requests", icon: KeyRound, href: "/school-admin/password-reset-requests" },
        { id: "settings", name: "Settings", icon: Settings, href: "/school-admin/settings" },
      ];
    case 'teacher':
      return [
        { id: "dashboard", name: "Dashboard", icon: Home, href: "/teacher" },
        { id: "classes", name: "My Classes", icon: FileText, href: "/teacher/classes" },
        { id: "reports", name: "Submit Report", icon: ClipboardList, href: "/teacher/reports" },
        { id: "attendance", name: "Attendance", icon: Calendar, href: "/teacher/attendance" },
        { id: "leaves", name: "Leave Requests", icon: Clock, href: "/teacher/leaves" },
        { id: "notifications", name: "Notifications", icon: Bell, href: "/teacher/notifications", badge: notificationCount && notificationCount > 0 ? String(notificationCount) : undefined },
        { id: "analytics", name: "Analytics", icon: TrendingUp, href: "/teacher/analytics" },
        { id: "settings", name: "Settings", icon: Settings, href: "/teacher/settings" },
      ];
    case 'student':
      return [
        { id: "dashboard", name: "Dashboard", icon: Home, href: "/student" },
        { id: "courses", name: "My Courses", icon: BookOpen, href: "/student/my-courses" },
        { id: "assignments", name: "Assignments", icon: ClipboardList, href: "/student/assignments", badge: assignmentCount && assignmentCount > 0 ? String(assignmentCount) : undefined },
        { id: "certificates", name: "Certificates", icon: Shield, href: "/student/certificates" },
        { id: "notifications", name: "Notifications", icon: Bell, href: "/student/notifications", badge: notificationCount && notificationCount > 0 ? String(notificationCount) : undefined },
        { id: "settings", name: "Settings", icon: Settings, href: "/student/settings" },
      ];
    default:
      return baseItems;
  }
};

export function Sidebar({ className = "", userRole = "student", userName = "User", userEmail = "user@example.com", onLogout, assignmentBadgeCount, notificationBadgeCount }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeItem, setActiveItem] = useState("dashboard");
  const [resolvedNotificationCount, setResolvedNotificationCount] = useState<number>(notificationBadgeCount ?? 0);
  const router = useRouter();
  const pathname = usePathname();

  const navigationItems = getNavigationItems(userRole, assignmentBadgeCount, resolvedNotificationCount);

  // Keep local notification count in sync when parent provides it (e.g. student layout)
  useEffect(() => {
    if (typeof notificationBadgeCount === 'number') {
      setResolvedNotificationCount(notificationBadgeCount);
    }
  }, [notificationBadgeCount]);

  // For roles where the layout doesn't pass notificationBadgeCount, fetch unread count periodically
  useEffect(() => {
    // If parent is already providing it, don't duplicate work.
    if (typeof notificationBadgeCount === 'number') return;

    let mounted = true;
    let intervalId: number | null = null;

    const fetchUnreadCount = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const userId = data?.user?.id;
        if (!userId) {
          if (mounted) setResolvedNotificationCount(0);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`/api/notifications/user?user_id=${encodeURIComponent(userId)}&filter=unread&limit=1&t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });

        clearTimeout(timeoutId);

        if (!res.ok) return;
        const json = await res.json();
        const unread = Number(json?.counts?.unread || 0);
        if (mounted) setResolvedNotificationCount(unread);
      } catch {
        // Ignore transient errors; keep last known value
      }
    };

    // Initial fetch + poll every 20s, refresh on tab focus
    fetchUnreadCount();
    intervalId = window.setInterval(fetchUnreadCount, 20000);
    const onFocus = () => fetchUnreadCount();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchUnreadCount();
    });

    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [notificationBadgeCount]);

  // Auto-open sidebar on desktop
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Set active item based on current path
  useEffect(() => {
    console.log('Current pathname:', pathname);
    
    // First try exact match
    const exactMatch = navigationItems.find((item: any) => item.href === pathname);
    if (exactMatch) {
      console.log('Found exact match:', exactMatch.id);
      setActiveItem(exactMatch.id);
      return;
    }
    
    // If no exact match, find parent route matches (routes that the pathname starts with)
    // Sort by length (longest first) to match most specific route first
    // This ensures /student/my-courses matches before /student
    const parentMatches = navigationItems
      .filter((item: any) => {
        // Exclude /admin from parent matching to avoid conflicts
        if (item.href === '/admin') return false;
        // Only match if pathname starts with the href AND it's not just the root
        return pathname.startsWith(item.href + '/') || pathname === item.href;
      })
      .sort((a: any, b: any) => b.href.length - a.href.length); // Longest match first
    
    if (parentMatches.length > 0) {
      const bestMatch = parentMatches[0];
      console.log('Found parent match:', bestMatch.id, 'for path:', pathname);
      setActiveItem(bestMatch.id);
    } else {
      console.log('No match found, keeping current:', activeItem);
    }
  }, [pathname, navigationItems, activeItem]);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const handleItemClick = (itemId: string, href: string) => {
    if (itemId === "logout") {
      onLogout?.();
      return;
    }
    
    setActiveItem(itemId);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsOpen(false);
    }
    
    // Navigate to the page
    router.push(href);
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'System Administrator';
      case 'school_admin': return 'School Administrator';
      case 'teacher': return 'Teacher';
      case 'student': return 'Student';
      default: return 'User';
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name || typeof name !== 'string') {
      return 'U'; // Default to 'U' for User if name is missing
    }
    const initials = name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
    return initials || 'U'; // Fallback to 'U' if no initials found
  };

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={toggleSidebar}
        className="fixed top-6 left-6 z-50 p-3 rounded-lg bg-white shadow-md border border-slate-100 md:hidden hover:bg-slate-50 transition-all duration-200"
        aria-label="Toggle sidebar"
      >
        {isOpen ? 
          <X className="h-5 w-5 text-slate-600" /> : 
          <Menu className="h-5 w-5 text-slate-600" />
        }
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden transition-opacity duration-300" 
          onClick={toggleSidebar} 
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed top-0 left-0 h-full bg-white border-r border-slate-200 z-40 transition-all duration-300 ease-in-out flex flex-col
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          ${isCollapsed ? "w-28" : "w-78"}
          md:translate-x-0 md:static md:z-auto
          ${className}
        `}
      >
        {/* Header with logo and collapse button */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/60">
          {!isCollapsed && (
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-base">SP</span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-800 text-base">Student Portal</span>
                <span className="text-xs text-slate-500">{getRoleDisplayName(userRole)}</span>
              </div>
            </div>
          )}

          {isCollapsed && (
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center mx-auto shadow-sm">
              <span className="text-white font-bold text-base">SP</span>
            </div>
          )}

          {/* Desktop collapse button */}
          <button
            onClick={toggleCollapse}
            className="hidden md:flex p-1.5 rounded-md hover:bg-slate-100 transition-all duration-200"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-slate-500" />
            )}
          </button>
        </div>

        {/* Search Bar */}
        {!isCollapsed && (
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          <ul className="space-y-0.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem === item.id;

              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleItemClick(item.id, item.href)}
                    className={`
                      w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-md text-left transition-all duration-200 group
                      ${isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }
                      ${isCollapsed ? "justify-center px-2" : ""}
                    `}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <div className="flex items-center justify-center min-w-[24px]">
                      <Icon
                        className={`
                          h-4.5 w-4.5 flex-shrink-0
                          ${isActive 
                            ? "text-blue-600" 
                            : "text-slate-500 group-hover:text-slate-700"
                          }
                        `}
                      />
                    </div>
                    
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-sm ${isActive ? "font-medium" : "font-normal"}`}>{item.name}</span>
                        {item.badge && (
                          <span className={`
                            px-1.5 py-0.5 text-xs font-medium rounded-full
                            ${isActive
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                            }
                          `}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Badge for collapsed state */}
                    {isCollapsed && item.badge && (
                      <div className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-blue-100 border border-white">
                        <span className="text-[10px] font-medium text-blue-700">
                          {parseInt(item.badge) > 9 ? '9+' : item.badge}
                        </span>
                      </div>
                    )}

                    {/* Tooltip for collapsed state */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                        {item.name}
                        {item.badge && (
                          <span className="ml-1.5 px-1 py-0.5 bg-slate-700 rounded-full text-[10px]">
                            {item.badge}
                          </span>
                        )}
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-1.5 h-1.5 bg-slate-800 rotate-45" />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section with profile and logout */}
        <div className="mt-auto border-t border-slate-200">
          {/* Profile Section */}
          <div className={`border-b border-slate-200 bg-slate-50/30 ${isCollapsed ? 'py-3 px-2' : 'p-3'}`}>
            {!isCollapsed ? (
              <div className="flex items-center px-3 py-2 rounded-md bg-white hover:bg-slate-50 transition-colors duration-200">
                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                  <span className="text-slate-700 font-medium text-sm">{getInitials(userName)}</span>
                </div>
                <div className="flex-1 min-w-0 ml-2.5">
                  <p className="text-sm font-medium text-slate-800 truncate">{userName || 'User'}</p>
                  <p className="text-xs text-slate-500 truncate">{userEmail || ''}</p>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full ml-2" title="Online" />
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center">
                    <span className="text-slate-700 font-medium text-sm">{getInitials(userName)}</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                </div>
              </div>
            )}
          </div>

          {/* Logout Button */}
          <div className="p-3">
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Logout button clicked, onLogout exists:', !!onLogout);
                if (onLogout) {
                  await onLogout();
                } else {
                  // Fallback: sign out and navigate
                  console.log('No onLogout handler, using fallback');
                  try {
                    const { supabase } = await import('../../lib/supabase');
                    await supabase.auth.signOut();
                    window.location.href = '/login';
                  } catch (error) {
                    console.error('Fallback logout error:', error);
                    window.location.href = '/login';
                  }
                }
              }}
              className={`
                w-full flex items-center rounded-md text-left transition-all duration-200 group
                text-red-600 hover:bg-red-50 hover:text-red-700
                ${isCollapsed ? "justify-center p-2.5" : "space-x-2.5 px-3 py-2.5"}
              `}
              title={isCollapsed ? "Logout" : undefined}
            >
              <div className="flex items-center justify-center min-w-[24px]">
                <LogOut className="h-4.5 w-4.5 flex-shrink-0 text-red-500 group-hover:text-red-600" />
              </div>
              
              {!isCollapsed && (
                <span className="text-sm">Logout</span>
              )}
              
              {/* Tooltip for collapsed state */}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                  Logout
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-1.5 h-1.5 bg-slate-800 rotate-45" />
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

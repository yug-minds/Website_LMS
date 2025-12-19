"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import { Button } from "./ui/button";
import { 
  Menu, 
  X, 
  Home, 
  Users, 
  BookOpen, 
  Settings, 
  LogOut,
  User,
  School,
  GraduationCap,
  UserCheck
} from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  role: string;
  full_name: string;
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Get initial user
    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, email, full_name, role, created_at, updated_at')
          .eq('id', authUser.id)
           
          .single() as any;
        setUser(profile);
      }
      setLoading(false);
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          router.push('/login');
        } else if (session) {
          const { data: profile } = await supabase
            .from('users')
            .select('id, email, full_name, role, created_at, updated_at')
            .eq('id', session.user.id)
             
            .single() as any;
          setUser(profile);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <UserCheck className="h-4 w-4" />;
      case 'school_admin':
        return <School className="h-4 w-4" />;
      case 'teacher':
        return <GraduationCap className="h-4 w-4" />;
      case 'student':
        return <User className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case 'admin':
        return 'System Admin';
      case 'school_admin':
        return 'School Admin';
      case 'teacher':
        return 'Teacher';
      case 'student':
        return 'Student';
      default:
        return 'User';
    }
  };

  const getNavigationItems = (role: string) => {
    const baseItems = [
      { href: '/', label: 'Home', icon: <Home className="h-4 w-4" /> },
    ];

    switch (role) {
      case 'admin':
        return [
          ...baseItems,
          { href: '/admin', label: 'Admin Dashboard', icon: <UserCheck className="h-4 w-4" /> },
          { href: '/admin/schools', label: 'Schools', icon: <School className="h-4 w-4" /> },
          { href: '/admin/users', label: 'Users', icon: <Users className="h-4 w-4" /> },
        ];
      case 'school_admin':
        return [
          ...baseItems,
          { href: '/school-admin', label: 'Dashboard', icon: <School className="h-4 w-4" /> },
          { href: '/school-admin/students', label: 'Students', icon: <Users className="h-4 w-4" /> },
          { href: '/school-admin/teachers', label: 'Teachers', icon: <GraduationCap className="h-4 w-4" /> },
        ];
      case 'teacher':
        return [
          ...baseItems,
          { href: '/teacher', label: 'Dashboard', icon: <GraduationCap className="h-4 w-4" /> },
          { href: '/teacher/classes', label: 'My Classes', icon: <BookOpen className="h-4 w-4" /> },
          { href: '/teacher/assignments', label: 'Assignments', icon: <BookOpen className="h-4 w-4" /> },
        ];
      case 'student':
        return [
          ...baseItems,
          { href: '/student', label: 'Dashboard', icon: <User className="h-4 w-4" /> },
          { href: '/student/classes', label: 'My Classes', icon: <BookOpen className="h-4 w-4" /> },
          { href: '/student/grades', label: 'Grades', icon: <BookOpen className="h-4 w-4" /> },
        ];
      default:
        return baseItems;
    }
  };

  if (loading) {
    return (
      <nav className="bg-background border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold text-foreground">Student Portal</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  const navigationItems = getNavigationItems(user?.role || '');

  return (
    <nav className="bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">Student Portal</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* User Menu */}
          <div className="hidden md:flex items-center space-x-4">
            {user && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                {getRoleIcon(user.role)}
                <span>{user.full_name || user.email} ({getRoleName(user.role)})</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-background border-t border-border">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
                onClick={() => setIsOpen(false)}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
            {user && (
              <div className="px-3 py-2 text-sm text-muted-foreground border-t border-border mt-2 pt-2">
                <div className="flex items-center space-x-2">
                  {getRoleIcon(user.role)}
                  <span>{user.full_name || user.email} ({getRoleName(user.role)})</span>
                </div>
              </div>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}

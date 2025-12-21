import { Card, CardContent } from "../../components/ui/card";
import ResizableNavbar from "../../components/ResizableNavbar";
import Footer from "../../components/Footer";
import { Trophy, Award, Star } from "lucide-react";
import { DynamicSections } from "../../components/public/SuccessStoriesClient";
import { supabaseAdmin } from "../../lib/supabase";
import { getOrSetCache, CacheKeys, CacheTTL } from "../../lib/cache";

interface Section {
  id: string;
  title: string;
  body_primary: string;
  body_secondary?: string | null;
  body_tertiary?: string | null;
  image_url?: string | null;
  background: 'blue' | 'white';
  image_position: 'left' | 'right';
}

// Make this page dynamic to avoid static generation conflicts with database calls
export const dynamic = 'force-dynamic';

// Enable ISR - revalidate every 5 minutes (success stories change more frequently)
export const revalidate = 300;

async function getSuccessStories(): Promise<Section[]> {
  type SuccessStoryRow = Section & {
    storage_path?: string | null;
    order_index?: number;
    is_published?: boolean;
  };

  // During build time, skip Redis caching to avoid static generation conflicts
  const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.VERCEL_URL;
  
  if (isBuildTime) {
    // Direct database query during build
    try {
      const { data, error } = await supabaseAdmin
        .from('success_story_sections')
        .select('id,title,body_primary,body_secondary,body_tertiary,image_url,storage_path,background,image_position,order_index,is_published')
        .eq('is_published', true)
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      
      const rows = (data || []) as SuccessStoryRow[];
      const mapped = await Promise.all(rows.map(async (row) => {
        if (row.storage_path) {
          try {
            const { data: signed } = await supabaseAdmin
              .storage
              .from('school-logos')
              .createSignedUrl(row.storage_path, 600);
            return { ...row, image_url: signed?.signedUrl || row.image_url };
          } catch {
            return row;
          }
        }
        return row;
      }));
      return mapped as Section[];
    } catch (error) {
      console.error('Error loading success stories during build:', error);
      return [];
    }
  }

  // Runtime caching (when serving requests)
  const sections = await getOrSetCache(
    CacheKeys.successStories(),
    async () => {
      const { data, error } = await supabaseAdmin
        .from('success_story_sections')
        .select('id,title,body_primary,body_secondary,body_tertiary,image_url,storage_path,background,image_position,order_index,is_published')
        .eq('is_published', true)
        .order('order_index', { ascending: true });
      if (error) throw error;
      const rows = (data || []) as SuccessStoryRow[];
      const mapped = await Promise.all(rows.map(async (row) => {
        if (row.storage_path) {
          try {
            const { data: signed } = await supabaseAdmin
              .storage
              .from('school-logos')
              .createSignedUrl(row.storage_path, 600);
            return { ...row, image_url: signed?.signedUrl || row.image_url };
          } catch {
            return row;
          }
        }
        return row;
      }));
      return mapped;
    },
    CacheTTL.SHORT
  );
  return sections as Section[];
}

export default async function SuccessStoriesPage() {
  let sections: Section[] = [];
  const loading = false;
  try {
    sections = await getSuccessStories();
  } catch (error) {
    console.error('Error loading success stories:', error);
    sections = [];
  }

  const impactStats = [
    {
      icon: Trophy,
      value: "10+",
      label: "Competition Winners"
    },
    {
      icon: Award,
      value: "500+",
      label: "Certified Students"
    },
    {
      icon: Star,
      value: "95%",
      label: "Parent Satisfaction"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <ResizableNavbar />

      {/* Hero Section */}
      <section className="bg-white py-12 md:py-16 lg:py-20">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold mb-4 md:mb-6 text-gray-900 max-w-6xl mx-auto">Success Stories</h1>
            <p className="text-lg md:text-xl lg:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Discover how our students are building the future, one project at a time
            </p>
          </div>
        </div>
      </section>

      {/* Dynamic Sections from API */}
      <DynamicSections sections={sections} loading={loading} />


      {/* Impact by the Numbers Section */}
      <section className="min-h-screen flex items-center justify-center bg-blue-600 text-white py-20">
        <div className="container">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-center mb-4 md:mb-6 max-w-5xl mx-auto">Impact by the Numbers</h2>
          <p className="text-blue-100 text-center mb-10 md:mb-12 max-w-2xl mx-auto text-base md:text-lg lg:text-xl">
            See how our students are excelling and achieving remarkable results
          </p>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {impactStats.map(({ icon: Icon, value, label }) => (
              <Card key={label} className="bg-white text-gray-900 border-0">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="text-4xl font-extrabold text-blue-600 mb-2">{value}</div>
                  <div className="text-gray-700 font-medium">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}


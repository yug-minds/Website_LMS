"use client";

import { Award } from "lucide-react";

interface Section {
  id: string;
  title: string;
  body_primary: string;
  body_secondary?: string | null;
  body_tertiary?: string | null;
  image_url?: string | null;
  storage_path?: string | null;
  background: 'blue' | 'white';
  image_position: 'left' | 'right';
}

// Character limit for title to fit in 2 lines (for large headings text-3xl to text-6xl)
const TITLE_MAX_LENGTH = 85;

export function SuccessSection({ s }: { s: Section }) {
  const isBlue = s.background === 'blue';
  const bgClass = isBlue ? 'bg-blue-600 text-white' : 'bg-white';
  const textClass = isBlue ? 'text-white/90' : 'text-gray-700';
  const titleClass = isBlue ? 'text-white' : 'text-gray-900';

  const isVideo = Boolean(
    (s.storage_path && /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(s.storage_path)) ||
    (s.image_url && /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(s.image_url))
  );
  
  // Truncate title to fit in 2 lines
  const displayTitle = s.title.length > TITLE_MAX_LENGTH 
    ? s.title.substring(0, TITLE_MAX_LENGTH).trim() + '...'
    : s.title;
  
  // Image container - matches reference with proper styling
  const imageEl = (
    <div className="w-full">
      {s.image_url ? (
        <div className="w-full relative">
          {isVideo ? (
            <video
              src={s.image_url}
              controls
              playsInline
              className="w-full h-auto object-contain bg-black rounded"
              style={{ maxHeight: '600px', maxWidth: '100%' }}
            />
          ) : (
            <img 
              src={s.image_url} 
              alt={s.title} 
              className="w-full h-auto object-contain" 
              style={{ maxHeight: '600px', maxWidth: '100%' }}
            />
          )}
        </div>
      ) : (
        <div className="w-full aspect-video bg-gray-100 rounded-lg flex items-center justify-center min-h-[400px] border-2 border-gray-200">
          <div className="text-center text-gray-400">
            <Award className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-sm">Media</p>
            <p className="text-xs mt-2">Upload via Admin</p>
          </div>
        </div>
      )}
    </div>
  );
  
  // Text content - matches reference with proper alignment
  const textEl = (
    <div className="w-full">
      <div className="w-full space-y-4 text-left">
        <div 
          className={`${textClass} text-base md:text-lg leading-relaxed text-left`}
          dangerouslySetInnerHTML={{ __html: s.body_primary }} 
        />
        {s.body_secondary && (
          <div 
            className={`${textClass} text-base md:text-lg leading-relaxed text-left`}
            dangerouslySetInnerHTML={{ __html: s.body_secondary }} 
          />
        )}
        {s.body_tertiary && (
          <div 
            className={`${textClass} text-base md:text-lg leading-relaxed text-left`}
            dangerouslySetInnerHTML={{ __html: s.body_tertiary }} 
          />
        )}
      </div>
    </div>
  );
  
  return (
    <section className={`min-h-screen flex items-center ${bgClass} py-20 md:py-28`}>
      <div className="container mx-auto px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Heading - large, bold, left-aligned with significant spacing below, limited to 2 lines */}
          <h2 
            className={`text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold mb-12 md:mb-16 lg:mb-20 text-left ${titleClass} leading-tight max-w-5xl`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {displayTitle}
          </h2>
          
          {/* Content Grid - horizontal layout matching reference exactly */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-start">
            {s.image_position === 'left' ? (
              <>
                {/* Image on left - full width of column */}
                <div className="w-full flex items-start">
                  {imageEl}
                </div>
                {/* Text on right - full width of column, left-aligned */}
                <div className="w-full flex items-start">
                  {textEl}
                </div>
              </>
            ) : (
              <>
                {/* Text on left - full width of column, left-aligned */}
                <div className="w-full flex items-start">
                  {textEl}
                </div>
                {/* Image on right - full width of column */}
                <div className="w-full flex items-start">
                  {imageEl}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DynamicSections({ sections, loading }: { sections: Section[]; loading: boolean }) {
  if (loading) return <section className="min-h-[40vh] flex items-center justify-center"><div className="text-gray-500">Loading sections...</div></section>;
  if (!sections || sections.length === 0) return null;
  return (
    <>
      {sections.map((s) => (
        <SuccessSection key={s.id} s={s} />
      ))}
    </>
  );
}


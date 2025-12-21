'use client';

import React, { useRef } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { useMediaQuery } from '@react-hook/media-query';
import { Book, BookPage } from '../data/books';
import { cn } from '../lib/utils';

interface Book3DProps {
  book: Book;
  className?: string;
  width?: number;
  height?: number;
}

export default function Book3D({ 
  book, 
  className,
  width = 300,
  height = 450 
}: Book3DProps) {
  const bookRef = useRef<typeof HTMLFlipBook>(null);
  const isSmallScreen = useMediaQuery('(min-width: 640px)');
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const smallerDevice = !isSmallScreen;
  
  // Responsive sizing to utilize available space
  const bookWidth = isLargeScreen ? width : isSmallScreen ? Math.min(width, 350) : Math.min(width, 280);
  const bookHeight = isLargeScreen ? height : isSmallScreen ? Math.min(height, 525) : Math.min(height, 420);

  // If no pages, show a message or fallback
  const hasPages = book.pages && book.pages.length > 0;

  return (
    <div className={cn('w-full flex justify-center items-center py-10', className)}>
      <HTMLFlipBook
        ref={bookRef}
        width={bookWidth}
        height={bookHeight}
        showCover={true}
        usePortrait={smallerDevice}
        className=""
        style={{}}
        startPage={0}
        size="fixed"
        minWidth={0}
        maxWidth={0}
        minHeight={0}
        maxHeight={0}
        drawShadow={true}
        flippingTime={1000}
        startZIndex={0}
        autoSize={false}
        maxShadowOpacity={0.5}
        mobileScrollSupport={true}
        clickEventForward={true}
        useMouseEvents={true}
        swipeDistance={30}
        showPageCorners={true}
        disableFlipByClick={false}
      >
        {/* Cover Page */}
        <div className="relative w-full h-full bg-transparent border-2 border-gray-300 rounded-lg overflow-hidden shadow-lg cursor-grab active:cursor-grabbing">
          <img
            src={book.coverImage}
            alt={book.title}
            className="w-full h-full object-cover rounded-lg"
          />
        </div>

        {/* Table of Contents / Index Page */}
        <div className="w-full h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-300 box-border">
          <div className="bg-gray-400 text-white p-3 text-center font-semibold">
            Table of Contents
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {hasPages ? (
              <div className="space-y-2">
                {book.pages.map((page, index) => {
                  // Cover (0) + TOC (1) + (blank/back page 2) = content pages start at 3
                  // So Page 1 content is at flip book page 3, Page 2 content is at flip book page 4, etc.
                  const flipBookPageNumber = index + 3;
                  const pageNum = page.pageNumber || index + 1;
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 hover:bg-blue-100 rounded cursor-pointer transition-colors active:bg-blue-200"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Navigate to the specific page (skipping cover and TOC)
                        // Use setTimeout to ensure the flip book is ready
                        setTimeout(() => {
                          try {
                            const flipBook = bookRef.current as any;
                            if (flipBook) {
                              const pageFlip = flipBook.pageFlip?.();
                              if (pageFlip && typeof pageFlip.flip === 'function') {
                                // Flip to the target page (Page 1 -> page 3, Page 2 -> page 4, etc.)
                                pageFlip.flip(flipBookPageNumber);
                              } else {
                                // Alternative method if flip doesn't work
                                if (flipBook.turnPage) {
                                  flipBook.turnPage(flipBookPageNumber);
                                }
                              }
                            }
                          } catch (error) {
                            console.error('Error navigating to page:', error);
                          }
                        }, 50);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setTimeout(() => {
                            const flipBook = bookRef.current as any;
                            if (flipBook) {
                              const pageFlip = flipBook.pageFlip?.();
                              if (pageFlip && typeof pageFlip.flip === 'function') {
                                pageFlip.flip(flipBookPageNumber);
                              } else if (flipBook.turnPage) {
                                flipBook.turnPage(flipBookPageNumber);
                              }
                            }
                          }, 50);
                        }
                      }}
                    >
                      <span className="text-sm text-gray-700 font-medium">
                        Page {pageNum}
                      </span>
                      <span className="text-xs text-blue-600 font-semibold">
                        →
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm">
                Pages coming soon
              </div>
            )}
          </div>
        </div>

        {/* Book Pages */}
        {hasPages ? (
          book.pages.map((page: BookPage, index: number) => (
            <div
              key={index}
              className="w-full h-full flex flex-col bg-white border border-gray-300 box-border cursor-grab active:cursor-grabbing"
            >
              {/* Page Number */}
              <div className="bg-gray-100 text-gray-600 p-2 text-center text-xs font-medium">
                Page {page.pageNumber || index + 1}
              </div>
              
              {/* Page Content */}
              <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-white">
                <img
                  src={page.imageUrl}
                  alt={page.alt || `Page ${page.pageNumber || index + 1}`}
                  className="max-w-full max-h-full object-contain"
                  loading="lazy"
                />
              </div>
            </div>
          ))
        ) : (
          // Fallback when no pages are available - always render at least one page
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 border border-gray-300 box-border p-8">
            <div className="text-center">
              <p className="text-gray-600 mb-4">
                Book pages are being prepared.
              </p>
              <p className="text-sm text-gray-500">
                Check back soon to explore the full book!
              </p>
            </div>
          </div>
        )}

        {/* Back Cover */}
        <div className="w-full h-full bg-white border-2 border-gray-300 rounded-lg flex flex-col items-center justify-center p-8 shadow-lg">
          <h2 className="text-3xl font-bold mb-4 text-center text-gray-900">Thank You!</h2>
          <p className="text-lg text-center mb-6 text-gray-700">
            We hope you enjoyed exploring this book.
          </p>
          {book.title && (
            <p className="text-sm text-gray-600 text-center">
              {book.title}
            </p>
          )}
        </div>
      </HTMLFlipBook>
    </div>
  );
}


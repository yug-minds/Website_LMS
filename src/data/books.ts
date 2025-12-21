/**
 * Book data structure for 3D book components
 * Each book contains a cover image and an array of page images
 */

export interface BookPage {
  imageUrl: string;
  alt?: string;
  pageNumber?: number;
}

export interface Book {
  id: string;
  title: string;
  coverImage: string;
  pages: BookPage[];
  description?: string;
}

/**
 * Level 2 TextBook configuration
 * All 10 pages from Level 2 Book Preview folder
 */
export const level2TextBook: Book = {
  id: 'level-2',
  title: 'ROBO CODERS TECH EXPLORERS LEVEL - 2',
  coverImage: '/Level 2 TextBook .png',
  description: 'A comprehensive guide to Coding, AI, and Robotics',
  pages: [
    { imageUrl: '/Level 2 Book Preview/1.png', alt: 'Page 1', pageNumber: 1 },
    { imageUrl: '/Level 2 Book Preview/2.png', alt: 'Page 2', pageNumber: 2 },
    { imageUrl: '/Level 2 Book Preview/3.png', alt: 'Page 3', pageNumber: 3 },
    { imageUrl: '/Level 2 Book Preview/4.png', alt: 'Page 4', pageNumber: 4 },
    { imageUrl: '/Level 2 Book Preview/5.png', alt: 'Page 5', pageNumber: 5 },
    { imageUrl: '/Level 2 Book Preview/6.png', alt: 'Page 6', pageNumber: 6 },
    { imageUrl: '/Level 2 Book Preview/7.png', alt: 'Page 7', pageNumber: 7 },
    { imageUrl: '/Level 2 Book Preview/8.png', alt: 'Page 8', pageNumber: 8 },
    { imageUrl: '/Level 2 Book Preview/9.png', alt: 'Page 9', pageNumber: 9 },
    { imageUrl: '/Level 2 Book Preview/10.png', alt: 'Page 10', pageNumber: 10 },
  ],
};

/**
 * Helper function to generate page URLs based on a pattern
 * Useful when pages follow a naming convention
 */
export function generatePageUrls(
  basePath: string,
  totalPages: number,
  extension: string = 'png'
): BookPage[] {
  return Array.from({ length: totalPages }, (_, i) => ({
    imageUrl: `${basePath}/page-${i + 1}.${extension}`,
    alt: `Page ${i + 1}`,
    pageNumber: i + 1,
  }));
}

/**
 * Level 1 TextBook configuration
 * All 7 pages from Level 1 Book Preview folder
 */
export const level1TextBook: Book = {
  id: 'level-1',
  title: 'ROBO CODERS TECH EXPLORERS LEVEL - 1',
  coverImage: '/Level 1 TextBook.png',
  description: 'A comprehensive guide to Coding, AI, and Robotics',
  pages: [
    { imageUrl: '/Level 1 Book Preview/1.png', alt: 'Page 1', pageNumber: 1 },
    { imageUrl: '/Level 1 Book Preview/2.png', alt: 'Page 2', pageNumber: 2 },
    { imageUrl: '/Level 1 Book Preview/3.png', alt: 'Page 3', pageNumber: 3 },
    { imageUrl: '/Level 1 Book Preview/4.png', alt: 'Page 4', pageNumber: 4 },
    { imageUrl: '/Level 1 Book Preview/5.png', alt: 'Page 5', pageNumber: 5 },
    { imageUrl: '/Level 1 Book Preview/6.png', alt: 'Page 6', pageNumber: 6 },
    { imageUrl: '/Level 1 Book Preview/7.png', alt: 'Page 7', pageNumber: 7 },
  ],
};

/**
 * Level 1 Kids Edition TextBook configuration
 * All pages from Level 1 Kids Edition Preview folder
 */
export const level1KidsTextBook: Book = {
  id: 'level-1-kids',
  title: 'ROBO CODERS TECH EXPLORERS LEVEL - 1 KIDS EDITION',
  coverImage: '/kids Level 1 TextBook.png',
  description: 'A comprehensive guide to Coding, AI, and Robotics - Kids Edition',
  pages: [
    { imageUrl: '/Level 1 Kids Edition Preview/1.png', alt: 'Page 1', pageNumber: 1 },
    { imageUrl: '/Level 1 Kids Edition Preview/2.png', alt: 'Page 2', pageNumber: 2 },
    { imageUrl: '/Level 1 Kids Edition Preview/3.png', alt: 'Page 3', pageNumber: 3 },
    { imageUrl: '/Level 1 Kids Edition Preview/33.png', alt: 'Page 33', pageNumber: 33 },
    { imageUrl: '/Level 1 Kids Edition Preview/34.png', alt: 'Page 34', pageNumber: 34 },
    { imageUrl: '/Level 1 Kids Edition Preview/39.png', alt: 'Page 39', pageNumber: 39 },
    { imageUrl: '/Level 1 Kids Edition Preview/40.png', alt: 'Page 40', pageNumber: 40 },
    { imageUrl: '/Level 1 Kids Edition Preview/43.png', alt: 'Page 43', pageNumber: 43 },
    { imageUrl: '/Level 1 Kids Edition Preview/44.png', alt: 'Page 44', pageNumber: 44 },
  ],
};

/**
 * Get book by ID
 */
export function getBookById(id: string): Book | undefined {
  const books: Record<string, Book> = {
    'level-1': level1TextBook,
    'level-1-kids': level1KidsTextBook,
    'level-2': level2TextBook,
  };
  return books[id];
}


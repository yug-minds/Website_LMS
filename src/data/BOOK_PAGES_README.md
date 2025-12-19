# Adding Book Pages to the 3D Book Component

## Overview
The 3D book component is now integrated and ready to display book pages. Currently, the Level 2 TextBook is set up but needs page images to be added.

## How to Add Page Images

### Step 1: Prepare Your Page Images
1. Extract individual pages from your book as image files (PNG or JPG format recommended)
2. Name them sequentially: `page-1.png`, `page-2.png`, `page-3.png`, etc.
3. Recommended image dimensions: 800x1200px or similar aspect ratio (2:3)

### Step 2: Add Images to Public Folder
1. Create the folder structure: `public/books/level-2/pages/`
2. Place all page images in this folder

### Step 3: Update Book Data
Edit `src/data/books.ts` and update the `level2TextBook.pages` array:

```typescript
pages: [
  { imageUrl: '/books/level-2/pages/page-1.png', alt: 'Page 1', pageNumber: 1 },
  { imageUrl: '/books/level-2/pages/page-2.png', alt: 'Page 2', pageNumber: 2 },
  { imageUrl: '/books/level-2/pages/page-3.png', alt: 'Page 3', pageNumber: 3 },
  // ... add all pages
],
```

### Alternative: Use Helper Function
If your pages follow a naming pattern, you can use the helper function:

```typescript
import { generatePageUrls } from './books';

pages: generatePageUrls('/books/level-2/pages', 50, 'png')
// This generates 50 pages with URLs: /books/level-2/pages/page-1.png through page-50.png
```

## Current Status
- ✅ 3D book component installed and integrated
- ✅ Level 2 TextBook cover image configured
- ⏳ Waiting for page images to be added

## Features
- **Swipe Navigation**: Users can swipe left/right on mobile or click to flip pages
- **Table of Contents**: Automatically generated from page list (clickable navigation)
- **3D Flip Animation**: Smooth page-turning animation
- **Responsive**: Works on mobile and desktop devices
- **Cover & Back Cover**: Customizable cover and back cover pages

## Testing
Once page images are added:
1. Navigate to `/programs` page
2. Find the Level 2 TextBook (third book in the grid)
3. Click or swipe to interact with the 3D book
4. Test on both mobile and desktop devices






















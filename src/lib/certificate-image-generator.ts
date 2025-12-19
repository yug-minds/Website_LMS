/**
 * Certificate Image Generator
 * 
 * Generates certificate images by overlaying student name and course name
 * on the certificate template PNG.
 */

import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'

export interface CertificateImageData {
  studentName: string
  courseName: string
}

/**
 * Generate certificate image by overlaying text on template
 * @param data - Certificate data containing student name and course name
 * @returns Buffer containing the generated PNG image
 */
export async function generateCertificateImage(
  data: CertificateImageData
): Promise<Buffer> {
  // Validate input data
  if (!data.studentName || data.studentName.trim().length === 0) {
    throw new Error('Student name is required and cannot be empty')
  }
  
  if (!data.courseName || data.courseName.trim().length === 0) {
    throw new Error('Course name is required and cannot be empty')
  }

  // Sanitize and truncate names if too long (to prevent text overflow)
  const maxNameLength = 50
  const maxCourseLength = 60
  const studentName = data.studentName.trim().substring(0, maxNameLength)
  const courseName = data.courseName.trim().substring(0, maxCourseLength)

  // Path to blank template image
  const templatePath = path.join(
    process.cwd(),
    'public',
    'Courses Certificate of Completion blank.png'
  )

  // Verify template exists
  try {
    await fs.access(templatePath)
  } catch (error) {
    throw new Error(
      `Certificate template not found at ${templatePath}. Please ensure the template image exists.`
    )
  }

  // Load template image
  const template = sharp(templatePath)
  const metadata = await template.metadata()
  const width = metadata.width || 1200 // Default fallback
  const height = metadata.height || 800 // Default fallback

  // User provided coordinates for student name area: coords="1511,773,486,612"
  // HTML image map format: x1, y1, x2, y2 (left, top, right, bottom)
  // Parsing: left=486, top=612, right=1511, bottom=773
  const nameAreaLeft = 486
  const nameAreaTop = 612
  const nameAreaRight = 1511
  const nameAreaBottom = 773
  
  // Calculate center of the student name area
  const studentNameX = Math.round((nameAreaLeft + nameAreaRight) / 2) // Center X: (486 + 1511) / 2 = 998.5
  const studentNameY = Math.round((nameAreaTop + nameAreaBottom) / 2) // Center Y: (612 + 773) / 2 = 692.5
  
  // User provided coordinates for course name area: coords="1513,1072,488,911"
  // Parsing: left=488, top=911, right=1513, bottom=1072
  const courseAreaLeft = 488
  const courseAreaTop = 911
  const courseAreaRight = 1513
  const courseAreaBottom = 1072
  
  // Calculate center of the course name area
  const courseNameX = Math.round((courseAreaLeft + courseAreaRight) / 2) // Center X: (488 + 1513) / 2 = 1000.5
  const courseNameY = Math.round((courseAreaTop + courseAreaBottom) / 2) // Center Y: (911 + 1072) / 2 = 991.5

  // Font sizes (proportional to image dimensions)
  // Student name: Large, bold, prominent (dark blue #2A367E)
  const studentNameFontSize = Math.round(width * 0.052) // ~62px for 1200px width
  // Course name: Slightly smaller, bold (black)
  const courseNameFontSize = Math.round(width * 0.040) // ~48px for 1200px width

  // Create SVG overlays for text (use sanitized names)
  const studentNameSVG = createTextSVG({
    text: studentName.toUpperCase(),
    x: studentNameX, // Use exact coordinate from user
    y: studentNameY, // Use exact coordinate from user
    fontSize: studentNameFontSize,
    color: '#2A367E', // Dark blue matching template
    fontWeight: 'bold',
    textAnchor: 'middle',
  })

  const courseNameSVG = createTextSVG({
    text: courseName.toUpperCase(),
    x: courseNameX,
    y: courseNameY,
    fontSize: courseNameFontSize,
    color: '#000000', // Black matching template
    fontWeight: 'bold',
    textAnchor: 'middle',
  })

  // Note: The blank template already has blue lines below the name areas
  // We don't need to add underlines - just place the text in the blank spaces
  // The template's existing lines will serve as the underlines

  // Combine all SVG overlays (no underline needed - template has it)
  const combinedSVG = `
    <svg width="${width}" height="${height}">
      ${studentNameSVG}
      ${courseNameSVG}
    </svg>
  `

  // Overlay text on template
  const certificateBuffer = await template
    .composite([
      {
        input: Buffer.from(combinedSVG),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer()

  return certificateBuffer
}

/**
 * Create SVG text element
 */
function createTextSVG({
  text,
  x,
  y,
  fontSize,
  color,
  fontWeight = 'normal',
  textAnchor = 'middle',
}: {
  text: string
  x: number
  y: number
  fontSize: number
  color: string
  fontWeight?: string
  textAnchor?: string
}): string {
  // Escape XML special characters
  const escapedText = escapeXml(text)

  // Use a professional sans-serif font (Arial, Helvetica, or system default)
  const fontFamily = 'Arial, Helvetica, sans-serif'

  return `
    <text
      x="${x}"
      y="${y}"
      font-family="${fontFamily}"
      font-size="${fontSize}"
      font-weight="${fontWeight}"
      fill="${color}"
      text-anchor="${textAnchor}"
      dominant-baseline="middle"
    >${escapedText}</text>
  `
}

/**
 * Create SVG underline element
 */
function createUnderlineSVG({
  x,
  y,
  width,
  color,
}: {
  x: number
  y: number
  width: number
  color: string
}): string {
  const startX = x - width / 2
  return `
    <line
      x1="${startX}"
      y1="${y}"
      x2="${startX + width}"
      y2="${y}"
      stroke="${color}"
      stroke-width="2"
    />
  `
}

/**
 * Estimate text width based on font size
 * Rough approximation: average character width is ~0.6 * font size
 */
function estimateTextWidth(text: string, fontSize: number): number {
  return Math.round(text.length * fontSize * 0.6)
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}



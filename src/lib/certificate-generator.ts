/**
 * Certificate Generation Utilities
 * 
 * Handles certificate generation for course completion
 */

export interface CertificateData {
  studentName: string
  courseName: string
  completionDate: string
  grade?: number
  courseDescription?: string
  schoolName?: string
}

/**
 * Generate certificate HTML template
 */
export function generateCertificateHTML(data: CertificateData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate of Completion</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    
    .certificate {
      background: white;
      width: 800px;
      height: 600px;
      padding: 60px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      position: relative;
      border: 20px solid #d4af37;
    }
    
    .certificate::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        repeating-linear-gradient(
          45deg,
          transparent,
          transparent 10px,
          rgba(0, 0, 0, 0.02) 10px,
          rgba(0, 0, 0, 0.02) 20px
        );
      pointer-events: none;
    }
    
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    
    .header h1 {
      font-size: 48px;
      color: #2c3e50;
      margin-bottom: 10px;
      letter-spacing: 3px;
    }
    
    .header p {
      font-size: 18px;
      color: #7f8c8d;
      font-style: italic;
    }
    
    .body {
      text-align: center;
      margin: 60px 0;
    }
    
    .body p {
      font-size: 20px;
      color: #34495e;
      line-height: 1.8;
      margin-bottom: 20px;
    }
    
    .student-name {
      font-size: 36px;
      font-weight: bold;
      color: #2c3e50;
      margin: 30px 0;
      text-decoration: underline;
      text-decoration-color: #d4af37;
      text-underline-offset: 10px;
    }
    
    .course-name {
      font-size: 24px;
      color: #34495e;
      font-weight: 600;
      margin: 20px 0;
    }
    
    .footer {
      margin-top: 60px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .signature {
      text-align: center;
      width: 200px;
    }
    
    .signature-line {
      border-top: 2px solid #2c3e50;
      margin-top: 60px;
      padding-top: 10px;
    }
    
    .date {
      text-align: center;
      color: #7f8c8d;
      font-size: 16px;
    }
    
    .grade {
      text-align: center;
      margin-top: 20px;
      font-size: 18px;
      color: #27ae60;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="header">
      <h1>CERTIFICATE</h1>
      <p>of Completion</p>
    </div>
    
    <div class="body">
      <p>This is to certify that</p>
      <div class="student-name">${escapeHtml(data.studentName)}</div>
      <p>has successfully completed the course</p>
      <div class="course-name">${escapeHtml(data.courseName)}</div>
      ${data.grade ? `<div class="grade">Grade: ${data.grade}%</div>` : ''}
    </div>
    
    <div class="footer">
      <div class="signature">
        <div class="signature-line">Date</div>
        <div class="date">${formatDate(data.completionDate)}</div>
      </div>
      <div class="signature">
        <div class="signature-line">Instructor</div>
      </div>
    </div>
  </div>
</body>
</html>
  `
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}



















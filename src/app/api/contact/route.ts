import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { contactFormSchema, validateRequestBody } from '../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';


export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

try {
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(contactFormSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { firstName, lastName, areaCode, phoneNumber, email, purpose, message } = validation.data;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS?.replace(/\s/g, ''), // Remove spaces from app password
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'robocoders07@gmail.com',
      subject: `New Contact Form Submission: ${purpose}`,
      html: `
        <h2>New Contact Request</h2>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${areaCode} ${phoneNumber}</p>
        <p><strong>Purpose:</strong> ${purpose}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ message: 'Email sent successfully' }, { status: 200 });
  } catch (error) {
    logger.error('Unexpected error in POST /api/contact', {
      endpoint: '/api/contact',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/contact' },
      'Failed to send contact email'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { contactFormSchema, validateRequestBody } from '../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Validate CSRF protection (optional for public contact forms, but good practice)
    try {
      const { validateCsrf } = await import('../../../lib/csrf-middleware');
      const csrfError = await validateCsrf(request);
      if (csrfError) {
        // Log but don't block if CSRF fails for now (can be made strict later)
        logger.warn('CSRF validation failed for contact form', {
          endpoint: '/api/contact',
        });
        // Uncomment to enforce CSRF: return csrfError;
      }
    } catch (csrfError) {
      // If CSRF middleware fails, log but continue
      logger.warn('CSRF validation error (continuing anyway)', {
        endpoint: '/api/contact',
        error: csrfError,
      });
    }

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

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(contactFormSchema, body);
    if (!validation.success) {
      const errorMessages = validation.details?.issues?.map((e) => `${(e.path as (string | number)[]).join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Contact form validation failed', {
        endpoint: '/api/contact',
        errors: errorMessages,
      });
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { firstName, lastName, areaCode, phoneNumber, email, purpose, message } = validation.data;

    // Validate email configuration
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    
    if (!emailUser || !emailPass) {
      logger.error('Email configuration missing', {
        endpoint: '/api/contact',
        hasEmailUser: !!emailUser,
        hasEmailPass: !!emailPass,
      });
      return NextResponse.json(
        {
          error: 'Server configuration error',
          message: 'Email service is not configured. Please contact the administrator.',
        },
        { status: 500 }
      );
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass.replace(/\s/g, ''), // Remove spaces from app password
      },
    });

    // Verify transporter configuration
    try {
      await transporter.verify();
    } catch (verifyError) {
      logger.error('Email transporter verification failed', {
        endpoint: '/api/contact',
        error: verifyError instanceof Error ? verifyError.message : String(verifyError),
      });
      return NextResponse.json(
        {
          error: 'Email service error',
          message: 'Failed to connect to email service. Please try again later.',
        },
        { status: 500 }
      );
    }

    // Prepare email content
    const mailOptions = {
      from: emailUser,
      to: 'robocoders07@gmail.com',
      subject: `New Contact Form Submission: ${purpose}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">New Contact Request</h2>
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-top: 20px;">
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Phone:</strong> ${areaCode || ''} ${phoneNumber || 'Not provided'}</p>
            <p><strong>Purpose:</strong> ${purpose}</p>
            <div style="margin-top: 20px;">
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-wrap; background-color: white; padding: 15px; border-radius: 4px;">${message}</p>
            </div>
          </div>
        </div>
      `,
      replyTo: email, // Allow direct replies to the user
    };

    // Send email
    await transporter.sendMail(mailOptions);
    
    logger.info('Contact form email sent successfully', {
      endpoint: '/api/contact',
      email: email,
      purpose: purpose,
    });

    return NextResponse.json({ message: 'Email sent successfully' }, { status: 200 });
  } catch (error) {
    logger.error('Unexpected error in POST /api/contact', {
      endpoint: '/api/contact',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/contact' },
      'Failed to send contact email'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


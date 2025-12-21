import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { validateCsrf } from '../../../../lib/csrf-middleware';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { CacheKeys, invalidateCache } from '../../../../lib/cache';
import { createLogoSchema, logoPaginationSchema, validateRequestBody } from '../../../../lib/validation-schemas';

function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  // PNG signature
  const signature = buffer.slice(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  // IHDR chunk starts at byte 8+8
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 2) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null; // SOI
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    // SOF0 (0xC0) or SOF2 (0xC2)
    if (marker === 0xc0 || marker === 0xc2) {
      const blockLength = buffer.readUInt16BE(offset + 2);
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    } else {
      const blockLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + blockLength;
    }
  }
  return null;
}

function getSvgDimensions(buffer: Buffer): { width: number; height: number } | null {
  const text = buffer.toString('utf8');
  const viewBoxMatch = text.match(/viewBox\s*=\s*"[\d\.\s]+"/i);
  if (viewBoxMatch) {
    const nums = viewBoxMatch[0].match(/[\d\.]+/g);
    if (nums && nums.length === 4) {
      const width = Math.round(parseFloat(nums[2]));
      const height = Math.round(parseFloat(nums[3]));
      return { width, height };
    }
  }
  const widthMatch = text.match(/width\s*=\s*"(\d+(?:\.\d+)?)"/i);
  const heightMatch = text.match(/height\s*=\s*"(\d+(?:\.\d+)?)"/i);
  if (widthMatch && heightMatch) {
    const width = Math.round(parseFloat(widthMatch[1]));
    const height = Math.round(parseFloat(heightMatch[1]));
    return { width, height };
  }
  return null;
}

async function getImageDimensions(mime: string, buffer: Buffer): Promise<{ width: number; height: number } | null> {
  if (mime === 'image/png') return getPngDimensions(buffer);
  if (mime === 'image/jpeg') return getJpegDimensions(buffer);
  if (mime === 'image/svg+xml') return getSvgDimensions(buffer);
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.READ, endpoint: '/api/admin/logos' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) {
      return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    }

    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const { searchParams } = new URL(request.url);
    const validated = validateRequestBody(logoPaginationSchema, Object.fromEntries(searchParams.entries()));
    const limit = validated.success ? validated.data.limit ?? 20 : 20;
    const offset = validated.success ? validated.data.offset ?? 0 : 0;

    const { data, error, count } = await supabaseAdmin
      .from('school_logos')
      .select('id, school_name, description, image_url, storage_path, upload_date, uploaded_by, is_deleted, deleted_at', { count: 'exact' })
      .eq('is_deleted', false)
      .order('upload_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const resp = NextResponse.json({ data: data || [], total: count || 0, limit, offset }, { status: 200, headers });
    return resp;
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/logos' }, 'Failed to list logos');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.UPLOAD, endpoint: '/api/admin/logos' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) {
      return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    }

    const csrfError = await validateCsrf(request);
    if (csrfError) return csrfError;

    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const formData = await request.formData();
    const file = formData.get('file');
    const school_name = String(formData.get('school_name') || '').trim();
    const description = String(formData.get('description') || '').trim() || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid file upload' }, { status: 400, headers });
    }
    const mime = file.type;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(mime)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400, headers });
    }
    const size = file.size;
    if (size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 2MB' }, { status: 400, headers });
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dims = await getImageDimensions(mime, buffer);
    if (!dims || dims.width < 300 || dims.height < 300) {
      return NextResponse.json({ error: 'Image dimensions must be at least 300x300px' }, { status: 400, headers });
    }

    const validation = validateRequestBody(createLogoSchema, {
      school_name,
      description,
      image_type: mime,
      width: dims.width,
      height: dims.height,
      file_size: size,
    });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400, headers });
    }

    // Ensure storage bucket exists
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const hasBucket = buckets?.some((b: any) => b.name === 'school-logos');
    if (!hasBucket) {
      return NextResponse.json({
        error: 'Storage bucket "school-logos" not found. Create it in Supabase Dashboard > Storage.',
      }, { status: 400, headers });
    }

    const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'svg';
    const filePath = `logos/${auth.userId}/${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('school-logos')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: mime,
      });
    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = await supabaseAdmin.storage
      .from('school-logos')
      .getPublicUrl(filePath);
    const image_url = publicUrlData?.publicUrl || null;

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('school_logos')
      .insert({
        school_name,
        description,
        image_url,
        storage_path: filePath,
        uploaded_by: auth.userId,
        is_deleted: false,
      })
      .select('id, school_name, description, image_url, storage_path, upload_date, uploaded_by, is_deleted')
      .single();
    if (insertError) {
      throw insertError;
    }

    await invalidateCache(CacheKeys.homepageLogos());
    logger.info('Logo uploaded', { endpoint: '/api/admin/logos', userId: auth.userId, logoId: inserted.id, school_name });

    return NextResponse.json({ success: true, logo: inserted }, { status: 201, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/logos' }, 'Failed to upload logo');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

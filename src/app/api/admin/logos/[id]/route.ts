import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { validateCsrf } from '../../../../../lib/csrf-middleware';
import { verifyAdmin } from '../../../../../lib/auth-utils';
import { CacheKeys, invalidateCache } from '../../../../../lib/cache';
import { updateLogoSchema, deleteLogoSchema, validateRequestBody } from '../../../../../lib/validation-schemas';

function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  const signature = buffer.slice(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 2) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.WRITE, endpoint: '/api/admin/logos/[id]' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) {
      return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    }

    const csrfError = await validateCsrf(request);
    if (csrfError) return csrfError;

    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const { id } = await params;
    const formData = await request.formData();
    const replace = String(formData.get('replace_image') || 'false') === 'true';
    const school_name = formData.get('school_name');
    const description = formData.get('description');

    const update: any = {};
    if (school_name) update.school_name = String(school_name);
    if (description) update.description = String(description) || null;

    if (replace) {
      const file = formData.get('file');
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

      const validation = validateRequestBody(updateLogoSchema, {
        id,
        replace_image: true,
        image_type: mime,
        width: dims.width,
        height: dims.height,
        file_size: size,
        school_name: update.school_name,
        description: update.description,
      });
      if (!validation.success) {
        return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400, headers });
      }

      // Fetch existing to delete old file
      const { data: existing } = await supabaseAdmin
        .from('school_logos')
        .select('storage_path')
        .eq('id', id)
        .single();

      const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'svg';
      const filePath = `logos/${auth.userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('school-logos')
        .upload(filePath, buffer, { cacheControl: '3600', upsert: false, contentType: mime });
      if (uploadError) throw uploadError;

      // Delete old file if present
      if (existing?.storage_path) {
        await supabaseAdmin.storage.from('school-logos').remove([existing.storage_path]).catch(() => {});
      }

      const { data: publicUrlData } = await supabaseAdmin.storage
        .from('school-logos')
        .getPublicUrl(filePath);
      const image_url = publicUrlData?.publicUrl || null;

      update.image_url = image_url;
      update.storage_path = filePath;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('school_logos')
      .update(update)
      .eq('id', id)
      .select('id, school_name, description, image_url, storage_path, upload_date, uploaded_by, is_deleted')
      .single();
    if (updateError) throw updateError;

    await invalidateCache(CacheKeys.homepageLogos());
    logger.info('Logo updated', { endpoint: '/api/admin/logos/[id]', userId: auth.userId, logoId: id });

    return NextResponse.json({ success: true, logo: updated }, { status: 200, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/logos/[id]' }, 'Failed to update logo');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.WRITE, endpoint: '/api/admin/logos/[id]' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) {
      return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    }

    const csrfError = await validateCsrf(request);
    if (csrfError) return csrfError;

    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const { searchParams } = new URL(request.url);
    const hard = searchParams.get('hard') === 'true';
    const validation = validateRequestBody(deleteLogoSchema, { hard });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400, headers });
    }

    const { id } = await params;

    if (hard) {
      const { data: existing } = await supabaseAdmin
        .from('school_logos')
        .select('storage_path')
        .eq('id', id)
        .single();
      if (existing?.storage_path) {
        await supabaseAdmin.storage.from('school-logos').remove([existing.storage_path]).catch(() => {});
      }
      const { error } = await supabaseAdmin.from('school_logos').delete().eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('school_logos')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }

    await invalidateCache(CacheKeys.homepageLogos());
    logger.info('Logo deleted', { endpoint: '/api/admin/logos/[id]', userId: auth.userId, logoId: id, hard });

    return NextResponse.json({ success: true }, { status: 200, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/logos/[id]' }, 'Failed to delete logo');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

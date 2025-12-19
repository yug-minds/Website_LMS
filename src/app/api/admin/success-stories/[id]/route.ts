import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { validateCsrf } from '../../../../../lib/csrf-middleware';
import { verifyAdmin } from '../../../../../lib/auth-utils';
import { CacheKeys, invalidateCache } from '../../../../../lib/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.WRITE, endpoint: '/api/admin/success-stories/[id]' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });

    const csrfError = await validateCsrf(request);
    if (csrfError) return csrfError;

    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const { id } = await params;
    const form = await request.formData();
    const updates: any = {};
    ['title','body_primary','body_secondary','body_tertiary','background','image_position','order_index','is_published'].forEach(k => {
      const v = form.get(k);
      if (v !== null) {
        if (k === 'order_index') updates[k] = Number(v);
        else if (k === 'is_published') updates[k] = String(v) === 'true';
        else updates[k] = String(v);
      }
    });

    const file = form.get('image');
    if (file instanceof File) {
      const mime = file.type;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const extFromMime = (m: string) => {
        if (m === 'image/png') return 'png';
        if (m === 'image/jpeg') return 'jpg';
        if (m === 'image/webp') return 'webp';
        if (m === 'image/svg+xml') return 'svg';
        if (m === 'video/mp4') return 'mp4';
        if (m === 'video/webm') return 'webm';
        if (m === 'video/quicktime') return 'mov';
        if (m === 'video/ogg') return 'ogv';
        const subtype = m.split('/')[1] || '';
        return subtype && subtype.length <= 10 ? subtype : 'bin';
      };

      const isImage = mime?.startsWith('image/');
      const isVideo = mime?.startsWith('video/');
      if (!mime || (!isImage && !isVideo)) {
        return NextResponse.json(
          { error: 'Unsupported media type', details: `Received: ${mime || 'unknown'}` },
          { status: 400, headers }
        );
      }

      // Default limits: images 5MB, videos 100MB (bucket limit may still be enforced server-side).
      const maxSize = isVideo ? (100 * 1024 * 1024) : (5 * 1024 * 1024);
      if (file.size > maxSize) {
        return NextResponse.json(
          { error: 'File too large', details: `Max allowed: ${isVideo ? '100MB' : '5MB'}` },
          { status: 400, headers }
        );
      }

      const ext = extFromMime(mime);
      const path = `success-stories/${auth.userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('school-logos')
        .upload(path, buffer, { cacheControl: '3600', upsert: false, contentType: mime });
      if (uploadError) throw uploadError;
      const { data: urlData } = await supabaseAdmin.storage.from('school-logos').getPublicUrl(path);
      updates.image_url = urlData?.publicUrl || null;
      updates.storage_path = path;
    }

    // If publishing, create a version snapshot
    const insertedVersion: any = null;
    if (updates.is_published === true) {
      updates.published_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabaseAdmin
      .from('success_story_sections')
      .update({ ...updates, updated_by: auth.userId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, title, body_primary, body_secondary, body_tertiary, image_url, background, image_position, order_index, is_published, published_at, created_at, updated_at')
      .single();
    if (error) throw error;

    if (updated) {
      const snapshot = {
        id: updated.id,
        title: updated.title,
        body_primary: updated.body_primary,
        body_secondary: updated.body_secondary,
        body_tertiary: (updated as any).body_tertiary,
        image_url: updated.image_url,
        background: updated.background,
        image_position: updated.image_position,
        order_index: updated.order_index,
        is_published: updated.is_published,
        published_at: updated.published_at,
      };
      const { data: versions } = await supabaseAdmin
        .from('success_story_versions')
        .select('version_number')
        .eq('section_id', id)
        .order('version_number', { ascending: false })
        .limit(1);
      const nextVersion = (versions && versions[0]?.version_number) ? Number(versions[0].version_number) + 1 : 1;
      const { error: vErr } = await supabaseAdmin
        .from('success_story_versions')
        .insert({ section_id: id, version_number: nextVersion, snapshot, created_by: auth.userId });
      if (vErr) logger.warn('Version insert error', { endpoint: '/api/admin/success-stories/[id]' }, vErr);
    }

    await invalidateCache(CacheKeys.successStories());
    return NextResponse.json({ section: updated }, { status: 200, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/success-stories/[id]' }, 'Failed to update section');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.WRITE, endpoint: '/api/admin/success-stories/[id]' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });

    const csrfError = await validateCsrf(request);
    if (csrfError) return csrfError;
    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const { id } = await params;
    const { error } = await supabaseAdmin
      .from('success_story_sections')
      .delete()
      .eq('id', id);
    if (error) throw error;

    await invalidateCache(CacheKeys.successStories());
    return NextResponse.json({ success: true }, { status: 200, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/success-stories/[id]' }, 'Failed to delete section');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

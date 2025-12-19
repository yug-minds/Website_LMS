import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { handleApiError, logger } from '../../../../../../lib/logger';
import { verifyAdmin } from '../../../../../../lib/auth-utils';
import { validateCsrf } from '../../../../../../lib/csrf-middleware';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.WRITE, endpoint: '/api/admin/success-stories/[id]/revert' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    const csrfError = await validateCsrf(request);
    if (csrfError) return csrfError;
    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const versionId = String(body.version_id || '');
    if (!versionId) return NextResponse.json({ error: 'version_id required' }, { status: 400, headers });

    const { data: vData, error: vErr } = await supabaseAdmin
      .from('success_story_versions')
      .select('snapshot,version_number')
      .eq('id', versionId)
      .single();
    if (vErr) throw vErr;
    const snap = vData.snapshot as any;

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('success_story_sections')
      .update({
        title: snap.title,
        body_primary: snap.body_primary,
        body_secondary: snap.body_secondary,
        body_tertiary: snap.body_tertiary,
        image_url: snap.image_url,
        background: snap.background,
        image_position: snap.image_position,
        order_index: snap.order_index,
        is_published: snap.is_published,
        published_at: snap.published_at,
      })
      .eq('id', id)
      .select('id, title, body_primary, body_secondary, body_tertiary, image_url, background, image_position, order_index, is_published, published_at, created_at, updated_at')
      .single();
    if (uErr) throw uErr;

    const { error: vInsErr } = await supabaseAdmin
      .from('success_story_versions')
      .insert({ section_id: id, version_number: Number(vData.version_number) + 1, snapshot: updated, created_by: auth.userId });
    if (vInsErr) logger.warn('Version insert error on revert', { endpoint: '/api/admin/success-stories/[id]/revert' }, vInsErr);

    return NextResponse.json({ section: updated }, { status: 200, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/success-stories/[id]/revert' }, 'Failed to revert section');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../../lib/logger';
import { verifyAdmin } from '../../../../../../lib/auth-utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.READ, endpoint: '/api/admin/success-stories/[id]/versions' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    const auth = await verifyAdmin(request);
    if (!auth.success) return auth.response;
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from('success_story_versions')
      .select('id,version_number,snapshot,created_at,created_by')
      .eq('section_id', id)
      .order('version_number', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ versions: data || [] }, { status: 200, headers });
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/admin/success-stories/[id]/versions' }, 'Failed to list versions');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

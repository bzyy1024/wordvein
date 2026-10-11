import { NextResponse } from 'next/server';
import { suggest } from '@/lib/queries';

/**
 * 搜索建议（F1 下拉补全）
 * GET /api/suggest?q=pred
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';

  if (!q.trim()) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await suggest(q, 10);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('[api/suggest]', error);
    return NextResponse.json({ items: [], error: '查询失败' }, { status: 500 });
  }
}

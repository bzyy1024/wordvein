import { NextResponse } from 'next/server';
import { isValidUid, touchVisitor } from '@/lib/store';

/**
 * 访客活跃上报
 * POST /api/track  { uid, event: 'visit' | 'query', ref? }
 *
 * 只写匿名 uuid 与计数，不收集 IP、手机号等个人信息。
 * 上报失败不影响页面使用，前端静默忽略。
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { uid?: unknown; event?: unknown; ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: '请求体不是合法 JSON' }, { status: 400 });
  }

  if (!isValidUid(body.uid)) {
    return NextResponse.json({ ok: false, error: 'uid 不合法' }, { status: 400 });
  }

  try {
    await touchVisitor(body.uid, {
      ua: request.headers.get('user-agent'),
      ref: typeof body.ref === 'string' ? body.ref : null,
      queryDelta: body.event === 'query' ? 1 : 0,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/track]', error);
    return NextResponse.json({ ok: false, error: '写入失败' }, { status: 500 });
  }
}

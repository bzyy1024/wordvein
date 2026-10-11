import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { claimAnonymousFavorites } from '@/lib/auth-store';
import { isValidUid } from '@/lib/store';

/**
 * 把匿名收藏并入当前账号
 *
 * POST /api/auth/claim { uid }   uid 为登录前 localStorage 里的匿名标识
 *   -> { ok: true, moved: n }
 *
 * 只做一次：匿名 uid 是浏览器本地的，服务端无从得知，由客户端登录后上报。
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: '请先登录', needLogin: true }, { status: 401 });
  }

  let body: { uid?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: '参数缺失' }, { status: 400 });
  }

  const uid = body.uid;
  if (!isValidUid(uid) || uid === user.id) {
    return NextResponse.json({ ok: true, moved: 0 });
  }

  try {
    const moved = await claimAnonymousFavorites(uid, user.id);
    return NextResponse.json({ ok: true, moved });
  } catch (error) {
    console.error('[api/auth/claim]', error);
    return NextResponse.json({ ok: false, error: '归并失败' }, { status: 500 });
  }
}

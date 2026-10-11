import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { addFavorite, listFavorites, removeFavorite } from '@/lib/store';

/**
 * 收藏（第三期：需要登录）
 *
 * GET    /api/favorite          收藏列表
 * POST   /api/favorite {word}   加入收藏
 * DELETE /api/favorite {word}   取消收藏
 *
 * 不再接受客户端传 uid —— 收藏归属由会话 Cookie 决定，未登录一律 401。
 */

export const dynamic = 'force-dynamic';

/** 未登录的统一响应：客户端据此跳转登录页 */
const UNAUTHORIZED = NextResponse.json(
  { ok: false, error: '请先登录后再收藏', needLogin: true },
  { status: 401 },
);

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ items: [], needLogin: true }, { status: 401 });

  try {
    return NextResponse.json({ items: await listFavorites(user.id) });
  } catch (error) {
    console.error('[api/favorite] GET', error);
    return NextResponse.json({ items: [], error: '查询失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const word = await readWord(request);
  if (!word) {
    return NextResponse.json({ ok: false, error: '参数缺失' }, { status: 400 });
  }

  try {
    const added = await addFavorite(user.id, word);
    return NextResponse.json(
      added ? { ok: true } : { ok: false, error: '词库中没有这个单词' },
      { status: added ? 200 : 404 },
    );
  } catch (error) {
    console.error('[api/favorite] POST', error);
    return NextResponse.json({ ok: false, error: '写入失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const word = await readWord(request);
  if (!word) {
    return NextResponse.json({ ok: false, error: '参数缺失' }, { status: 400 });
  }

  try {
    await removeFavorite(user.id, word);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/favorite] DELETE', error);
    return NextResponse.json({ ok: false, error: '删除失败' }, { status: 500 });
  }
}

async function readWord(request: Request): Promise<string> {
  try {
    const body = (await request.json()) as { word?: unknown };
    return typeof body.word === 'string' ? body.word.trim() : '';
  } catch {
    return '';
  }
}

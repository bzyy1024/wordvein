import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

/**
 * 当前登录态（客户端组件用）
 *
 * GET /api/auth/me -> { user: { id, email } | null }
 *
 * 服务端渲染的地方直接调 getSessionUser()，不用绕这个接口。
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ user: await getSessionUser() });
  } catch (error) {
    console.error('[api/auth/me]', error);
    return NextResponse.json({ user: null });
  }
}

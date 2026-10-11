import { NextResponse } from 'next/server';
import { createExpiredSessionCookie } from '@/lib/auth';

/**
 * 登出：让会话 Cookie 立即过期
 *
 * POST /api/auth/logout
 */

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const cookie = createExpiredSessionCookie();
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}

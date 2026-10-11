import { NextResponse } from 'next/server';
import { getAuthBaseUrl, LOGIN_TOKEN_MINUTES, safeNextPath } from '@/lib/auth';
import {
  createLoginToken,
  isRateLimited,
  isValidEmail,
  normalizeEmail,
} from '@/lib/auth-store';
import { sendLoginLink } from '@/lib/mail';

/**
 * 申请邮箱登录 / 注册链接
 *
 * POST /api/auth/magic-link { email, next? }
 *   -> { ok: true }              邮件已发出
 *   -> { ok: true, devLink }     开发环境未配置 SMTP，直接把链接给前端
 *
 * 注册与登录不分家：邮箱没注册过就顺带建号，用户不需要判断自己有没有账号。
 * 无论邮箱是否存在都返回同样结果，避免被用来探测注册用户。
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { email?: unknown; next?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: '参数缺失' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: '请填写有效的邮箱地址' }, { status: 400 });
  }

  const nextPath = safeNextPath(body.next, '/account');

  try {
    if (await isRateLimited(email)) {
      return NextResponse.json(
        { ok: false, error: '申请太频繁了，请稍后再试' },
        { status: 429 },
      );
    }

    const token = await createLoginToken(email, nextPath);
    const url = `${getAuthBaseUrl()}/api/auth/callback?token=${encodeURIComponent(token)}`;

    const sent = await sendLoginLink(email, url);
    if (sent === 'dev') {
      return NextResponse.json({ ok: true, devLink: url, minutes: LOGIN_TOKEN_MINUTES });
    }

    return NextResponse.json({ ok: true, minutes: LOGIN_TOKEN_MINUTES });
  } catch (error) {
    console.error('[api/auth/magic-link]', error);
    const message =
      error instanceof Error && error.message.includes('未配置')
        ? error.message
        : '邮件发送失败，请稍后重试';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

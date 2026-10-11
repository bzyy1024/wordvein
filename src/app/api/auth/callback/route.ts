import { NextResponse } from 'next/server';
import { createSessionCookie, safeNextPath } from '@/lib/auth';
import { consumeLoginToken, ensureUser } from '@/lib/auth-store';

/**
 * 邮箱链接的落地页
 *
 * GET /api/auth/callback?token=xxx
 *   -> 校验通过：签发会话 Cookie，重定向到 next（默认 /account）
 *   -> 校验失败：重定向回登录页并带上错误提示
 *
 * token 一次性：并发点两次只有一次能换取会话，其余落到"链接已失效"。
 */

export const dynamic = 'force-dynamic';

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';

  try {
    const used = token ? await consumeLoginToken(token) : null;
    if (!used) {
      return redirectTo(request, '/login?error=invalid');
    }

    // 老用户等价于登录，新邮箱顺带建号
    const user = await ensureUser(used.email);

    const res = redirectTo(request, safeNextPath(used.nextPath, '/account'));
    const cookie = await createSessionCookie(user);
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch (error) {
    console.error('[api/auth/callback]', error);
    return redirectTo(request, '/login?error=failed');
  }
}

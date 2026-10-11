/**
 * 用户会话（第三期）：邮箱登录链接 + JWT
 *
 * 注册与登录是同一个入口：输入邮箱 -> 收一封一次性链接 -> 点开即签发会话。
 * 会话是 HS256 签名的 JWT，默认 7 天有效（AUTH_SESSION_DAYS 可覆盖），
 * 放在 httpOnly Cookie 里，服务端渲染时直接可读，客户端不需要二次请求。
 *
 * ⚠️ 与 admin-auth 的分工：这里只在 Node runtime（Server Component / Route Handler）
 *    使用，**不要放进 middleware** —— edge runtime 会把 process.env 构建时内联，
 *    运行时注入的 AUTH_JWT_SECRET 读不到（详见 src/middleware.ts 的说明）。
 */

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { SITE_URL } from '@/lib/site';

/** 会话 Cookie 名 */
export const SESSION_COOKIE = 'ew_session';

/** 默认有效期 7 天 */
export const DEFAULT_SESSION_DAYS = 7;

/** 上限 90 天，避免配错把会话签成几年 */
const MAX_SESSION_DAYS = 90;

/** 邮箱登录链接的有效期（分钟） */
export const LOGIN_TOKEN_MINUTES = 30;

/**
 * 已使用链接的重放窗口（分钟）
 *
 * QQ / 企业邮箱等会在投递时预取邮件里的链接做安全检测，一次性链接会被扫描器
 * 提前消耗，用户真正点击时反而拿到"已失效"。因此消费后的一小段时间内放行再次
 * 兑换：预取过之后用户仍能登录，代价是拿到链接的人在窗口内可重复登录。
 */
export const LOGIN_TOKEN_REPLAY_MINUTES = 15;

export type SessionUser = {
  id: string;
  email: string;
};

/**
 * 邮件链接使用的域名
 *
 * AUTH_URL 优先：站点对外地址和登录链接域名可能不同（例如后台走内网域名、
 * 邮件里必须发公网域名）。未配置时回退 SITE_URL。
 * 注意两者都是服务端读取的普通变量，改完重启容器即可，不用重建镜像。
 */
export function getAuthBaseUrl(): string {
  const raw = (process.env.AUTH_URL ?? '').trim() || (process.env.SITE_URL ?? '').trim() || SITE_URL;
  const trimmed = raw.replace(/\/+$/, '');

  // 0.0.0.0 是"监听所有网卡"的写法，不是可用地址：发到邮件里指向的是收件人
  // 自己的机器，浏览器也可能直接拒开。兜底换成 localhost 并留一条告警，
  // 免得链接点开是白屏却查不出原因。
  if (/^https?:\/\/0\.0\.0\.0(?=[:/]|$)/i.test(trimmed)) {
    const fixed = trimmed.replace('0.0.0.0', 'localhost');
    console.warn(
      `[auth] AUTH_URL / SITE_URL 配成了 ${trimmed}，0.0.0.0 不能出现在邮件链接里，已改用 ${fixed}`,
    );
    return fixed;
  }

  return trimmed;
}

/** 会话有效期（天），非法值一律回退默认 7 天 */
export function getSessionDays(): number {
  const n = Number(process.env.AUTH_SESSION_DAYS);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SESSION_DAYS;
  return Math.min(Math.floor(n), MAX_SESSION_DAYS);
}

/** Cookie 的 maxAge（秒） */
export function getSessionMaxAge(): number {
  return getSessionDays() * 24 * 60 * 60;
}

/** 生产环境必须自己配密钥；开发环境给个固定值，省得每次配环境 */
const DEV_SECRET = 'wordvein-dev-jwt-secret-do-not-use-in-production';

export function isAuthConfigured(): boolean {
  return (process.env.AUTH_JWT_SECRET ?? '').trim().length > 0;
}

function getSecret(): Uint8Array {
  const raw = (process.env.AUTH_JWT_SECRET ?? '').trim();
  if (raw) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('未配置 AUTH_JWT_SECRET：生产环境必须设置，否则无法签发登录会话');
  }
  return new TextEncoder().encode(DEV_SECRET);
}

/** 签发会话 JWT */
export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer('wordvein')
    .setExpirationTime(`${getSessionDays()}d`)
    .sign(getSecret());
}

/** 校验会话 JWT，失败一律返回 null（不区分过期 / 签名错 / 被篡改） */
export async function verifySession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: 'wordvein' });
    const id = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!id || !email) return null;
    return { id, email };
  } catch {
    return null;
  }
}

/**
 * 当前登录用户（Server Component / Route Handler 用）
 *
 * 只验签不查库：JWT 里已带 id 与 email，够用且省一次往返。
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

/** Cookie 是否带 Secure：显式开关优先，否则看站点域名是不是 https */
function useSecureCookie(): boolean {
  const flag = (process.env.AUTH_COOKIE_SECURE ?? '').trim();
  if (flag === '1') return true;
  if (flag === '0') return false;
  return getAuthBaseUrl().startsWith('https://');
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    secure: useSecureCookie(),
  };
}

/**
 * 生成会话 Cookie 三元组
 *
 * 重定向响应（302）用 response.cookies.set 更稳，因此把值抛给调用方，
 * 由 Route Handler 自己决定写到哪个响应上。
 */
export async function createSessionCookie(user: SessionUser): Promise<{
  name: string;
  value: string;
  options: ReturnType<typeof cookieOptions>;
}> {
  return {
    name: SESSION_COOKIE,
    value: await signSession(user),
    options: cookieOptions(getSessionMaxAge()),
  };
}

/** 登出用的空 Cookie（maxAge=0 立即过期） */
export function createExpiredSessionCookie() {
  return { name: SESSION_COOKIE, value: '', options: cookieOptions(0) };
}

/** 下发会话 Cookie（只能在 Route Handler / Server Action 中调用） */
export async function writeSessionCookie(user: SessionUser): Promise<void> {
  const c = await createSessionCookie(user);
  (await cookies()).set(c.name, c.value, c.options);
}

/** 清除会话 Cookie（登出） */
export async function clearSessionCookie(): Promise<void> {
  const c = createExpiredSessionCookie();
  (await cookies()).set(c.name, c.value, c.options);
}

/**
 * 归一化回跳路径：只认站内绝对路径，挡掉 //evil.com 这类开放重定向
 */
export function safeNextPath(next: unknown, fallback = '/account'): string {
  if (typeof next !== 'string') return fallback;
  const v = next.trim();
  if (!v.startsWith('/') || v.startsWith('//')) return fallback;
  return v;
}

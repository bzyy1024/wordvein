/**
 * 账号与登录链接的数据访问层（第三期）
 *
 * 约定：
 *   - 全部在 Route Handler / Server Component 内调用
 *   - 邮箱统一小写归一化，唯一索引建立在该值上
 *   - 登录 token 只落哈希：库被拖走也登不上别人的账号
 *   - 收藏挂在 users.id 上，注册用户（u_xxx）与匿名访客（uuid）是同一套主键语义，
 *     因此登录时可以把匿名收藏直接并到账号上
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { query } from '@/db';
import { LOGIN_TOKEN_MINUTES, LOGIN_TOKEN_REPLAY_MINUTES } from '@/lib/auth';

/** 够用即可：不追求 RFC 5322 全量，只挡明显乱填 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: unknown): string {
  return (typeof input === 'string' ? input : '').trim().toLowerCase();
}

export function isValidEmail(input: unknown): input is string {
  const v = normalizeEmail(input);
  return v.length <= 200 && EMAIL_RE.test(v);
}

export type AuthUser = {
  id: string;
  email: string;
};

function newUserId(): string {
  return `u_${randomUUID()}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 按邮箱找已注册用户 */
export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const r = await query<AuthUser>(`SELECT id, email FROM users WHERE email = $1 LIMIT 1`, [email]);
  return r.rows[0] ?? null;
}

/**
 * 邮箱换账号：已注册则直接复用（等价于登录），未注册则建号（等价于注册）。
 * 注册与登录共用这一个入口，用户不需要分辨自己有没有注册过。
 */
export async function ensureUser(email: string): Promise<AuthUser> {
  // 先试插入：邮箱没注册过就建号。
  // 这里用不带目标的 ON CONFLICT DO NOTHING —— uq_users_email 是
  // "WHERE email IS NOT NULL" 的部分索引，带目标的写法（ON CONFLICT (email)）
  // 无法推断到它，会直接报 42P10。
  const inserted = await query<AuthUser>(
    `INSERT INTO users (id, email, email_verified_at)
     VALUES ($1, $2, now())
     ON CONFLICT DO NOTHING
     RETURNING id, email`,
    [newUserId(), email],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  // 已注册：补一次验证时间并返回既有账号
  const existing = await query<AuthUser>(
    `UPDATE users
        SET email_verified_at = COALESCE(email_verified_at, now()),
            last_seen_at      = now()
      WHERE email = $1
      RETURNING id, email`,
    [email],
  );
  return existing.rows[0];
}

/** 10 分钟内同一邮箱最多申请 3 次，挡住被刷的入口 */
const RATE_LIMIT_WINDOW_MIN = 10;
const RATE_LIMIT_MAX = 3;

export async function isRateLimited(email: string): Promise<boolean> {
  const r = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM login_tokens
      WHERE email = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
    [email, String(RATE_LIMIT_WINDOW_MIN)],
  );
  return (r.rows[0]?.n ?? 0) >= RATE_LIMIT_MAX;
}

/**
 * 生成一次性登录链接 token
 *
 * @returns 明文 token（只出现在邮件里，不落库）
 */
export async function createLoginToken(email: string, nextPath: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  await query(
    `INSERT INTO login_tokens (email, token_hash, next_path, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [email, hashToken(token), nextPath, String(LOGIN_TOKEN_MINUTES)],
  );

  return token;
}

export type LoginTokenResult =
  | { ok: true; email: string; nextPath: string }
  | { ok: false; reason: 'used' | 'invalid' };

/**
 * 消费 token：限时 + 一次性，但对"重复点击 / 被邮件安全扫描器预取"网开一面
 *
 * 正常路径用 UPDATE ... RETURNING 做原子占位，并发点两次只有一次能占到。
 * 已被消费且还在重放窗口内的，按同一条链接再放行一次，避免出现
 * "链接被邮箱预取消耗 -> 用户点击看到已失效"这种最影响体验的情况。
 */
export async function consumeLoginToken(token: string): Promise<LoginTokenResult> {
  const hash = hashToken(token);

  const first = await query<{ email: string; next_path: string | null }>(
    `UPDATE login_tokens
        SET consumed_at = now()
      WHERE token_hash = $1
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING email, next_path`,
    [hash],
  );

  const consumed = first.rows[0];
  if (consumed) {
    return { ok: true, email: consumed.email, nextPath: consumed.next_path ?? '/account' };
  }

  // 没占到：区分"不存在 / 已过期"与"已被使用过（是否还在重放窗口内）"
  const { rows } = await query<{
    email: string;
    next_path: string | null;
    expired: boolean;
    replayed: boolean;
  }>(
    `SELECT email,
            next_path,
            (expires_at <= now()) AS expired,
            (consumed_at IS NOT NULL
             AND expires_at > now()
             AND consumed_at > now() - ($2 || ' minutes')::interval) AS replayed
       FROM login_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [hash, String(LOGIN_TOKEN_REPLAY_MINUTES)],
  );

  const found = rows[0];
  if (!found) return { ok: false, reason: 'invalid' };
  if (found.replayed) {
    return { ok: true, email: found.email, nextPath: found.next_path ?? '/account' };
  }
  return { ok: false, reason: found.expired ? 'invalid' : 'used' };
}

/**
 * 把匿名访客的收藏并到登录账号上
 *
 * 登录后第一次访问账号页时调用一次：匿名 uid 只存在浏览器 localStorage，
 * 服务端拿不到，只能由客户端上报。
 *
 * @returns 并入的词数
 */
export async function claimAnonymousFavorites(anonUid: string, userId: string): Promise<number> {
  // 已收藏过的词保留最早的收藏时间，重复词靠 ON CONFLICT 跳过
  const moved = await query(
    `INSERT INTO favorites (user_id, word_id, created_at)
     SELECT $2, f.word_id, f.created_at
       FROM favorites f
      WHERE f.user_id = $1
     ON CONFLICT DO NOTHING`,
    [anonUid, userId],
  );

  await query(`DELETE FROM favorites WHERE user_id = $1`, [anonUid]);

  return moved.rowCount ?? 0;
}

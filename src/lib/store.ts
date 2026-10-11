/**
 * 访客与收藏的数据访问层（第二期）
 *
 * 约定：
 *   - 全部在 Route Handler / Server Component 内调用
 *   - 访客用浏览器生成的匿名 uuid 标识，不收集手机号、邮箱等个人信息
 *   - words 的唯一性建立在 lower(word) 上，所有按词查询统一用 lower()
 */

import { query } from '@/db';

/** 匿名 uid 的合法形态：uuid（也允许测试用的简单串），限定字符集防注入 */
const UID_RE = /^[a-zA-Z0-9-]{8,64}$/;

export function isValidUid(uid: unknown): uid is string {
  return typeof uid === 'string' && UID_RE.test(uid);
}

export type FavoriteItem = {
  word: string;
  phonetic: string | null;
  gloss: string | null;
  createdAt: string;
};

/**
 * 记录访客活跃，并按需累加查词次数。
 *
 * 用 upsert 保证"首次访问建记录、后续只刷新时间戳"，
 * ua 保留首次值（避免每次上报都覆盖，排障时更有参考价值）。
 */
export async function touchVisitor(
  uid: string,
  opts: { ua?: string | null; ref?: string | null; queryDelta?: number } = {},
): Promise<void> {
  await query(
    `INSERT INTO users (id, ua, first_ref, query_count, last_seen_at)
     VALUES ($1, $2, $3, GREATEST($4::int, 0), now())
     ON CONFLICT (id) DO UPDATE SET
       last_seen_at = now(),
       query_count  = users.query_count + GREATEST($4::int, 0)`,
    [uid, opts.ua?.slice(0, 300) ?? null, opts.ref?.slice(0, 500) ?? null, opts.queryDelta ?? 0],
  );
}

/** 加入收藏。词不存在时返回 false（前端提示"词库里没有这个词"） */
export async function addFavorite(uid: string, word: string): Promise<boolean> {
  await query(`INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [uid]);

  const r = await query<{ word_id: string }>(
    `INSERT INTO favorites (user_id, word_id)
     SELECT $1, w.id FROM words w WHERE lower(w.word) = lower($2)
     ON CONFLICT DO NOTHING
     RETURNING word_id`,
    [uid, word],
  );
  return (r.rowCount ?? 0) > 0;
}

/** 取消收藏 */
export async function removeFavorite(uid: string, word: string): Promise<boolean> {
  const r = await query(
    `DELETE FROM favorites f
      USING words w
      WHERE f.word_id = w.id AND f.user_id = $1 AND lower(w.word) = lower($2)`,
    [uid, word],
  );
  return (r.rowCount ?? 0) > 0;
}

/** 收藏列表，按收藏时间倒序 */
export async function listFavorites(uid: string, limit = 200): Promise<FavoriteItem[]> {
  const r = await query<{
    word: string;
    phonetic: string | null;
    gloss: string | null;
    created_at: Date;
  }>(
    `SELECT w.word, w.phonetic, w.gloss, f.created_at
       FROM favorites f
       JOIN words w ON w.id = f.word_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      LIMIT $2`,
    [uid, limit],
  );

  return r.rows.map((row) => ({
    word: row.word,
    phonetic: row.phonetic,
    gloss: row.gloss,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** 收藏总数（账号页展示用） */
export async function countFavorites(userId: string): Promise<number> {
  const r = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM favorites WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0]?.n ?? 0;
}

/** 单词是否已被该访客收藏 */
export async function isFavorited(uid: string, word: string): Promise<boolean> {
  const r = await query<{ n: number }>(
    `SELECT 1 AS n
       FROM favorites f
       JOIN words w ON w.id = f.word_id
      WHERE f.user_id = $1 AND lower(w.word) = lower($2)
      LIMIT 1`,
    [uid, word],
  );
  return r.rows.length > 0;
}

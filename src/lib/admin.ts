/**
 * 管理端数据查询
 *
 * 只在 /admin 下的 Server Component 调用。
 * 统计类查询全部用子查询一次性取回，避免 N 次往返。
 */

import { query } from '@/db';

/** 统一按上海时区展示，避免容器时区不一致导致时间对不上 */
export function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

export type AdminOverview = {
  words: number;
  morphemes: number;
  senses: number;
  breakdown: number;
  favorites: number;
  users: number;
  usersToday: number;
  users7d: number;
};

export type TopFavorite = { word: string; n: number };

export type ImportBatch = {
  id: number;
  sourceFile: string;
  note: string | null;
  wordCount: number;
  morphemeCount: number;
  createdAt: string;
};

export async function getOverview(): Promise<AdminOverview> {
  const r = await query<{
    words: number;
    morphemes: number;
    senses: number;
    breakdown: number;
    favorites: number;
    users: number;
    users_today: number;
    users_7d: number;
  }>(
    `SELECT
       (SELECT count(*) FROM words)::int          AS words,
       (SELECT count(*) FROM morphemes)::int      AS morphemes,
       (SELECT count(*) FROM senses)::int         AS senses,
       (SELECT count(*) FROM word_morphemes)::int AS breakdown,
       (SELECT count(*) FROM favorites)::int      AS favorites,
       (SELECT count(*) FROM users)::int          AS users,
       (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '1 day')::int  AS users_today,
       (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '7 days')::int AS users_7d`,
  );

  const row = r.rows[0];
  return {
    words: row?.words ?? 0,
    morphemes: row?.morphemes ?? 0,
    senses: row?.senses ?? 0,
    breakdown: row?.breakdown ?? 0,
    favorites: row?.favorites ?? 0,
    users: row?.users ?? 0,
    usersToday: row?.users_today ?? 0,
    users7d: row?.users_7d ?? 0,
  };
}

/** 被收藏最多的词 */
export async function getTopFavorites(limit = 10): Promise<TopFavorite[]> {
  const r = await query<{ word: string; n: number }>(
    `SELECT w.word, count(*)::int AS n
       FROM favorites f
       JOIN words w ON w.id = f.word_id
      GROUP BY w.word
      ORDER BY n DESC, w.word
      LIMIT $1`,
    [limit],
  );
  return r.rows;
}

/** 最近导入批次 */
export async function getRecentBatches(limit = 5): Promise<ImportBatch[]> {
  const r = await query<{
    id: number;
    source_file: string;
    note: string | null;
    word_count: number;
    morpheme_count: number;
    created_at: Date;
  }>(
    `SELECT id, source_file, note, word_count, morpheme_count, created_at
       FROM import_batches
      ORDER BY id DESC
      LIMIT $1`,
    [limit],
  );

  return r.rows.map((row) => ({
    id: row.id,
    sourceFile: row.source_file,
    note: row.note,
    wordCount: row.word_count,
    morphemeCount: row.morpheme_count,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export type AdminUser = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  queryCount: number;
  favoriteCount: number;
};

/** 访客列表：按最近活跃倒序 */
export async function listUsers(
  page: number,
  pageSize = 20,
): Promise<{ items: AdminUser[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    query<{
      id: string;
      created_at: Date;
      last_seen_at: Date;
      query_count: number;
      favorite_count: number;
    }>(
      `SELECT u.id, u.created_at, u.last_seen_at, u.query_count,
              (SELECT count(*) FROM favorites f WHERE f.user_id = u.id)::int AS favorite_count
         FROM users u
        ORDER BY u.last_seen_at DESC
        LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    ),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM users`),
  ]);

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
      queryCount: row.query_count,
      favoriteCount: row.favorite_count,
    })),
    total: total.rows[0]?.n ?? 0,
  };
}

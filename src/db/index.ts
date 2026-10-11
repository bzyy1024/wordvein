import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { resolveDatabaseUrl } from './connection-string';
import * as schema from './schema';

/**
 * 数据库连接
 *
 * 连接串由 src/db/connection-string.ts 统一派生，本文件不感知 host/port，
 * 容器内外的差异完全由环境变量决定，避免硬编码回退顺序带来的误连风险。
 */
/**
 * 连接超时：默认 15s。
 * 远程库（云 RDS / 自建主机）首次建连可能明显慢于本地，5s 会在冷启动时
 * 抛出 "Connection terminated due to connection timeout" 导致页面 500。
 * 可用环境变量 DB_CONNECT_TIMEOUT_MS 覆盖。
 */
const CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 15_000);

export const pool = new Pool({
  connectionString: resolveDatabaseUrl(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: Number.isFinite(CONNECT_TIMEOUT_MS) ? CONNECT_TIMEOUT_MS : 15_000,
});

export const db = drizzle(pool, { schema });

export { schema };

/**
 * 瞬时连接错误：网络抖动、连接被服务端断开、建连超时。
 * 这类错误重试一次基本能成；SQL 语法 / 约束错误重试无意义，直接抛。
 */
function isTransient(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  if (['ECONNRESET', 'ETIMEDOUT', 'EPIPE', '08000', '08003', '08006', '08001', '57P01'].includes(code)) {
    return true;
  }
  const msg = err?.message ?? '';
  return /Connection terminated|connection timeout|timeout expired/i.test(msg);
}

/**
 * 查询入口：只在瞬时错误上重试一次。
 *
 * 远程库首屏冷启动偶发 "Connection terminated due to connection timeout"，
 * 会让用户看到 500；重试一次即恢复，且不影响 SQL 本身出错的情况。
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params as never[]);
  } catch (e) {
    if (!isTransient(e)) throw e;
    return await pool.query<T>(text, params as never[]);
  }
}

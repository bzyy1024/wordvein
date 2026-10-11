/**
 * 数据库初始化：建扩展 + 建表
 *
 * 说明：
 *   - 本地 Docker 库由 docker-entrypoint-initdb.d 自动执行，本脚本用于外部数据库，
 *     或对本地库做幂等重放（schema.sql 全量 IF NOT EXISTS，可安全重复执行）。
 *   - 本机无 psql 客户端，故直接用 pg 驱动执行 SQL 文件。
 *
 * 用法：node scripts/db-init.mjs
 * 输出：data/_init.txt
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_LOCAL;

const SQL_FILES = ['docker/postgres/01-init.sql', 'docs/schema.sql'];

/** 标识符白名单：schema 名来自配置，拼进 SQL 前必须校验 */
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

const lines = [];
const log = (s = '') => lines.push(s);

function flush(code) {
  fs.writeFileSync(path.join(ROOT, 'data', '_init.txt'), lines.join('\n'), 'utf8');
  process.exitCode = code;
}

if (!url) {
  log('ERROR: 缺少 DATABASE_URL，请在 .env 中配置');
  flush(1);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

try {
  await client.connect();
  log('connected: ok');

  /**
   * 目标 schema 不存在则先创建。
   *
   * 背景：PG 15+ 起 public schema 默认不再给 PUBLIC 角色 CREATE 权限，
   *      托管库里的普通账号（如 wordvein）只有 USAGE，无法建表。
   *      但该账号通常具备数据库级 CREATE，可自建 schema 并在其中建表。
   *      若管理员后续授权了 public，把 DB_SCHEMA 改回 public 即可。
   */
  const schema = process.env.DB_SCHEMA?.trim();
  if (schema && schema !== 'public') {
    if (!IDENT_RE.test(schema)) {
      throw new Error(`[db-init] 非法的 DB_SCHEMA：${schema}（仅允许小写字母、数字、下划线）`);
    }
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION current_user`);
    // 必须保留 public：pg_trgm 扩展建在 public（首次执行 01-init.sql 时 search_path 尚为 public），
    // 若 search_path 不含 public，gin_trgm_ops 操作符类不可见，GIN 索引会创建失败。
    await client.query(`SET search_path TO ${schema}, public`);
    log(`schema : ${schema}, public`);
  }

  for (const rel of SQL_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      log(`SKIP  ${rel} (不存在)`);
      continue;
    }
    const sql = fs.readFileSync(abs, 'utf8');
    await client.query(sql);
    log(`exec  ${rel} (${sql.length} B)`);
  }

  // 校验建表结果
  // 用 current_schema() 而非硬编码 public：表可能建在自建 schema 下
  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = current_schema() order by table_name`,
  );
  log('');
  log('=== 建表结果 ===');
  for (const t of tables) {
    const { rows } = await client.query(`select count(*)::int as n from "${t.table_name}"`);
    log(`  ${t.table_name.padEnd(20)} rows=${rows[0].n}`);
  }

  const { rows: ext } = await client.query(
    `select extname from pg_extension where extname in ('pg_trgm','unaccent') order by extname`,
  );
  log('');
  log('扩展 : ' + ext.map((e) => e.extname).join(', '));
  flush(0);
} catch (e) {
  log('');
  log('ERROR: ' + e.message);
  flush(1);
} finally {
  await client.end().catch(() => {});
}

/**
 * 数据库连接与数据现状探测
 *
 * 用途：验证 DATABASE_URL 是否可用、各表实际数据量、字段是否与 schema 对齐。
 * 用法：node scripts/db-probe.mjs
 * 输出：data/_probe.txt
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_LOCAL;

const lines = [];
const log = (s = '') => lines.push(s);

if (!url) {
  log('ERROR: 缺少 DATABASE_URL，请在 .env 中配置');
  fs.writeFileSync(path.join(ROOT, 'data', '_probe.txt'), lines.join('\n'), 'utf8');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

try {
  await client.connect();
  const { rows: ver } = await client.query('select version()');
  log('version : ' + ver[0].version.split(' on ')[0]);

  // 权限诊断：PG15+ 已收回 public schema 的 CREATE 默认权限
  const { rows: perm } = await client.query(`
    select current_user,
           (select rolsuper from pg_roles where rolname = current_user) as is_super,
           has_schema_privilege(current_user, 'public', 'CREATE') as can_create_public,
           (select pg_get_userbyid(datdba) from pg_database where datname = current_database()) as db_owner
  `);
  const p = perm[0];
  log('');
  log('=== 权限 ===');
  log(`  current_user       : ${p.current_user}`);
  log(`  is_superuser       : ${p.is_super}`);
  log(`  can_create_public  : ${p.can_create_public}`);
  log(`  database_owner     : ${p.db_owner}`);

  // 列出全部 schema，确认数据是否建在别处
  const { rows: schemas } = await client.query(
    `select schema_name from information_schema.schemata
     where schema_name not like 'pg_%' and schema_name <> 'information_schema'
     order by schema_name`,
  );
  log('');
  log('=== schema 列表 ===');
  for (const s of schemas) log('  ' + s.schema_name);

  const { rows: tables } = await client.query(
    `select table_schema, table_name from information_schema.tables
     where table_schema = current_schema()
     order by table_schema, table_name`,
  );

  log('');
  log('=== 表行数 ===');
  for (const t of tables) {
    const { rows } = await client.query(
      `select count(*)::int as n from "${t.table_schema}"."${t.table_name}"`,
    );
    log(`  ${(t.table_schema + '.' + t.table_name).padEnd(28)} ${rows[0].n}`);
  }

  for (const t of ['words', 'morphemes']) {
    const { rows: cols } = await client.query(
      // 用 current_schema()：表可能建在自建 schema 下（如 wordvein）
      `select column_name from information_schema.columns
       where table_schema = current_schema() and table_name = $1
       order by ordinal_position`,
      [t],
    );
    log('');
    log(`${t} 列 : ${cols.map((c) => c.column_name).join(', ')}`);
  }

  const hasGloss = await client.query(
    `select 1 from information_schema.columns
     where table_schema=current_schema() and table_name='words' and column_name='gloss'`,
  );
  log('');
  log('words.gloss 存在 : ' + (hasGloss.rowCount > 0));

  const { rows: topWords } = await client.query(
    `select word, phonetic, freq_rank, cefr from words
     order by freq_rank nulls last limit 5`,
  );
  log('');
  log('=== 高频词样例 ===');
  for (const r of topWords) log('  ' + JSON.stringify(r));

  const { rows: topMorph } = await client.query(
    `select form, slug, type, meaning_cn, word_count from morphemes
     order by word_count desc limit 5`,
  );
  log('');
  log('=== 大词族样例 ===');
  for (const r of topMorph) log('  ' + JSON.stringify(r));

  const { rows: wm } = await client.query(
    `select count(*)::int as n from word_morphemes`,
  );
  log('');
  log('拆解关系总数 : ' + wm[0].n);
} catch (e) {
  log('');
  log('ERROR: ' + e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
  fs.writeFileSync(path.join(ROOT, 'data', '_probe.txt'), lines.join('\n'), 'utf8');
}

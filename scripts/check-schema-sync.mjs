/**
 * schema 一致性校验
 *
 * 背景：库结构存在两份手写定义 —— docs/schema.sql（DDL）与 src/db/schema.ts（Drizzle）。
 *      两份都由人维护时极易漂移，本脚本用于自动比对并阻断漂移。
 *
 * 比对口径：以「数据库列名」为准（schema.ts 中 pgTable 列的第一个字符串参数）。
 *
 * 用法：node scripts/check-schema-sync.mjs
 * 退出码：0=一致；1=存在差异
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE_SQL = path.join(ROOT, 'docs', 'schema.sql');
const FILE_TS = path.join(ROOT, 'src', 'db', 'schema.ts');

/**
 * Drizzle 列类型白名单，避免把 uniqueIndex('uq_xxx') 误判为列。
 * 注意：Drizzle pg-core 没有 timestamptz，日期时间统一用
 *       timestamp('col', { withTimezone: true })，故此处是 timestamp。
 */
const COLUMN_TYPES =
  'text|integer|bigint|bigserial|smallint|serial|timestamp|boolean|jsonb|uuid|varchar|date|numeric';

/** 解析 SQL：提取 CREATE TABLE 的表名与列名 */
function parseSql(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const tables = {};
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\n\);/gi;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const name = m[1];
    const cols = [];
    for (const rawLine of m[2].split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('--') || line.startsWith('/*')) continue;
      // 跳过表级约束
      if (/^(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CONSTRAINT|CHECK)/i.test(line)) continue;
      const cm = line.match(/^(\w+)\s+/);
      if (cm) cols.push(cm[1]);
    }
    tables[name] = cols;
  }
  return tables;
}

/** 解析 TS：提取 pgTable 的表名与列名 */
function parseTs(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const tables = {};
  const tableRe = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*'([^']+)'/g;
  let m;
  const matches = [];
  while ((m = tableRe.exec(txt)) !== null) {
    matches.push({ index: m.index, varName: m[1], tableName: m[2] });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : txt.length;
    const block = txt.slice(start, end);
    const cols = [];
    const colRe = new RegExp(
      "(\\w+)\\s*:\\s*(?:" + COLUMN_TYPES + ")\\(\\s*'([^']+)'",
      'g',
    );
    let cm;
    while ((cm = colRe.exec(block)) !== null) cols.push(cm[2]);
    tables[matches[i].tableName] = cols;
  }
  return tables;
}

function main() {
  if (!fs.existsSync(FILE_SQL) || !fs.existsSync(FILE_TS)) {
    console.error('缺少文件：', FILE_SQL, '或', FILE_TS);
    process.exit(1);
  }

  const sqlTables = parseSql(FILE_SQL);
  const tsTables = parseTs(FILE_TS);

  const sqlNames = Object.keys(sqlTables);
  const tsNames = Object.keys(tsTables);

  const onlyInSql = sqlNames.filter((n) => !tsNames.includes(n));
  const onlyInTs = tsNames.filter((n) => !sqlNames.includes(n));
  const common = sqlNames.filter((n) => tsNames.includes(n));

  const colDiffs = [];
  for (const t of common) {
    const a = new Set(sqlTables[t]);
    const b = new Set(tsTables[t]);
    const missingInTs = [...a].filter((c) => !b.has(c));
    const missingInSql = [...b].filter((c) => !a.has(c));
    if (missingInTs.length || missingInSql.length) {
      colDiffs.push({ table: t, missingInTs, missingInSql });
    }
  }

  const totalDiffs = onlyInSql.length + onlyInTs.length + colDiffs.length;

  console.log('=== schema 一致性校验 ===');
  console.log('SQL 表数量  :', sqlNames.length);
  console.log('TS  表数量  :', tsNames.length);
  console.log('共同表      :', common.length);
  console.log('');
  if (onlyInSql.length) console.log('仅存在于 SQL :', onlyInSql);
  if (onlyInTs.length) console.log('仅存在于 TS  :', onlyInTs);
  if (colDiffs.length) {
    console.log('字段差异     :');
    for (const d of colDiffs) {
      console.log(`  [${d.table}]`);
      if (d.missingInTs.length) console.log('    TS 缺少 :', d.missingInTs.join(', '));
      if (d.missingInSql.length) console.log('    SQL 缺少:', d.missingInSql.join(', '));
    }
  }
  console.log('');
  if (totalDiffs === 0) {
    console.log('✅ 两份定义完全一致');
  } else {
    console.log(`⚠️  发现 ${totalDiffs} 处差异，需同步`);
  }

  process.exit(totalDiffs === 0 ? 0 : 1);
}

main();

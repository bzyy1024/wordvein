/**
 * 生成 words.gloss（构词串讲）
 *
 * 用法：node scripts/build-gloss.mjs [--dry-run]
 *
 * 规则：把该词的词素按 order_no 串成 "pre- 在前 + dict 说 + -ion 表行为"，
 *      再接该词首个义项的中文释义，形如：
 *      "pre- 在前 + dict 说 → 预言；预测"
 * 说明：gloss 是派生字段（同 morphemes.word_count），由脚本生成而非手工录入；
 *      已存在 gloss 的词默认跳过，加 --force 重算。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const url = process.env.DATABASE_URL;

if (!url) {
  console.error('ERROR: 缺少 DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

// 义项取首个：先按 ；/; 分义项，再按 , 分并列同义，最后截断
const DEF = `left(split_part(split_part(split_part(s.definition_cn, '；', 1), ';', 1), ',', 1), 40)`;

const SELECT = `
  with parts as (
    select wm.word_id,
           string_agg(m.form || ' ' || m.meaning_cn, ' + ' order by wm.order_no) as chain
    from word_morphemes wm
    join morphemes m on m.id = wm.morpheme_id
    where m.meaning_cn is not null and m.meaning_cn <> ''
    group by wm.word_id
  ),
  first_sense as (
    select distinct on (word_id) word_id, definition_cn
    from senses
    order by word_id, sort_no, id
  )
  select w.id, w.word, p.chain,
         case when s.definition_cn is null or s.definition_cn = ''
              then p.chain
              else p.chain || ' → ' || ${DEF}
         end as gloss
  from words w
  join parts p on p.word_id = w.id
  left join first_sense s on s.word_id = w.id
  ${FORCE ? '' : "where w.gloss is null or w.gloss = ''"}
  order by w.word
`;

try {
  await client.connect();

  const schema = process.env.DB_SCHEMA?.trim();
  if (schema && schema !== 'public') await client.query(`SET search_path TO ${schema}`);

  const { rows } = await client.query(SELECT);

  console.log(`待生成 gloss : ${rows.length} 条`);
  console.log('');
  console.log('--- 样例 ---');
  for (const r of rows.slice(0, 12)) console.log(`  ${r.word.padEnd(16)} ${r.gloss}`);

  if (!DRY && rows.length > 0) {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const params = [];
      const tuples = [];
      for (const r of chunk) {
        params.push(r.id, r.gloss);
        tuples.push(`($${params.length - 1}::bigint, $${params.length}::text)`);
      }
      await client.query(
        `update words w
           set gloss = v.gloss, updated_at = now()
         from (values ${tuples.join(', ')}) as v(id, gloss)
         where w.id = v.id`,
        params,
      );
    }
    await client.query('COMMIT');
    console.log('');
    console.log(`已写入 ${rows.length} 条 gloss`);
  } else {
    console.log('');
    console.log('DRY-RUN：未写库');
  }

  const { rows: stat } = await client.query(
    `select count(*)::int as total, count(gloss)::int as with_gloss from words`,
  );
  console.log('');
  console.log(`words 总数 ${stat[0].total}，已有 gloss ${stat[0].with_gloss}`);
} catch (e) {
  console.error('ERROR: ' + e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

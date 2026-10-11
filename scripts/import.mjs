/**
 * 数据导入：morphemes.jsonl + words.jsonl -> PostgreSQL
 *
 * 用法：
 *   pnpm run import -- --dir ./data [--dry-run] [--truncate]
 *
 * 行为约定（docs/数据格式规范.md 第三章）：
 *   - 幂等 upsert：words 按 lower(word)，morphemes 按 form
 *   - 不自动建词素：breakdown 引用未定义的 form -> 跳过并计入报告
 *   - 事务：整体单事务，失败回滚；--dry-run 只出报告不写库
 *   - 导入后回填 morphemes.word_count
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_LOCAL;

/** 标识符白名单：schema 名来自配置，拼进 SQL 前必须校验 */
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

// ----------------------------
// 参数
// ----------------------------

const argv = process.argv.slice(2);

function readValue(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  if (!next || next.startsWith('--')) return fallback;
  return next;
}

const OPTIONS = {
  dir: path.resolve(ROOT, readValue('dir', './data')),
  dryRun: argv.includes('--dry-run'),
  truncate: argv.includes('--truncate'),
};

// ----------------------------
// 工具
// ----------------------------

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        console.warn(`[warn] 第 ${i + 1} 行 JSON 解析失败，已跳过：${file}`);
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * 按业务主键去重（大小写不敏感），后出现的覆盖先出现的。
 *
 * 必须去重：批量 INSERT ... ON CONFLICT DO UPDATE 时，若同一批内有多行
 *          命中同一个冲突目标，PostgreSQL 会直接报错
 *          "ON CONFLICT DO UPDATE command cannot affect row a second time"，
 *          因为它无法决定哪一行胜出。原始数据里 'mon' 就出现了两次。
 */
function dedupeBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r?.[key] ?? '').trim().toLowerCase();
    if (!k) continue;
    m.set(k, r);
  }
  return [...m.values()];
}

/** 批量 INSERT ... ON CONFLICT DO UPDATE */
async function bulkUpsert(
  client,
  table,
  columns,
  rows,
  conflictTarget,
  updateColumns,
  touchUpdatedAt = true,
) {
  if (rows.length === 0) return;

  const CHUNK = 500;
  const colList = columns.join(', ');
  // updated_at 不在 INSERT 列表里，故不能引用 excluded，直接取 now()。
  // tags 表没有该列，通过 touchUpdatedAt=false 关闭。
  // updateColumns 中以 '=' 开头的项视为原始表达式（如 coalesce 保护），
  // 其余为列名，统一取 excluded 的值
  const updateSet = [
    ...updateColumns.map((c) =>
      c.startsWith('=') ? c.slice(1) : `${c} = excluded.${c}`,
    ),
    ...(touchUpdatedAt ? ['updated_at = now()'] : []),
  ].join(', ');

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params = [];
    const tuples = [];

    for (const row of chunk) {
      const placeholders = columns.map((c) => {
        params.push(row[c] ?? null);
        return `$${params.length}`;
      });
      tuples.push(`(${placeholders.join(', ')})`);
    }

    await client.query(
      `INSERT INTO ${table} (${colList})
       VALUES ${tuples.join(', ')}
       ON CONFLICT ${conflictTarget} DO UPDATE SET ${updateSet}`,
      params,
    );
  }
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

// ----------------------------
// 主流程
// ----------------------------

async function main() {
  const report = [];
  const log = (s = '') => report.push(s);

  const morphFile = path.join(OPTIONS.dir, 'morphemes.jsonl');
  const wordFile = path.join(OPTIONS.dir, 'words.jsonl');

  const morphemes = dedupeBy(readJsonl(morphFile), 'form');
  const words = dedupeBy(readJsonl(wordFile), 'word');

  log('=== 导入报告 ===');
  log('');
  log(`morphemes 读入 : ${morphemes.length} 条`);
  log(`words 读入     : ${words.length} 条`);
  log(`模式           : ${OPTIONS.dryRun ? 'DRY-RUN（不写库）' : '写入'}`);

  // 统计
  const stats = {
    morphemeNew: 0,
    morphemeUpdate: 0,
    wordNew: 0,
    wordUpdate: 0,
    sense: 0,
    breakdown: 0,
    breakdownSkipped: 0,
    tag: 0,
    wordTag: 0,
    variantRel: 0,
    otherRel: 0,
    relSkipped: 0,
  };

  const undefinedForms = new Map(); // form -> count
  const tagCodes = new Set();

  if (!OPTIONS.dryRun) {
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 10_000,
    });

    try {
      await client.connect();

      // 与运行时、db-init 保持同一 schema 口径
      const schema = process.env.DB_SCHEMA?.trim();
      if (schema && schema !== 'public') {
        if (!IDENT_RE.test(schema)) {
          throw new Error(`[import] 非法的 DB_SCHEMA：${schema}（仅允许小写字母、数字、下划线）`);
        }
        await client.query(`SET search_path TO ${schema}`);
      }

      await client.query('BEGIN');

      if (OPTIONS.truncate) {
        // 顺序：先删关系表（外键 cascade 亦可，但显式更可控）
        await client.query(
          'TRUNCATE TABLE word_tags, word_morphemes, morpheme_relations, senses, tags, words, morphemes RESTART IDENTITY CASCADE',
        );
        log('');
        log('已清空既有数据（--truncate）');
      }

      // ---------- 1. morphemes ----------
      const morphRows = morphemes.map((m) => ({
        form: String(m.form ?? '').trim(),
        slug: String(m.slug ?? String(m.form ?? '').trim()),
        type: String(m.type ?? 'root'),
        meaning_cn: m.meaning_cn || null,
        meaning_en: m.meaning_en || null,
        origin_lang: m.origin_lang || null,
        etymology: m.etymology || null,
        story: m.story || null,
        caution: m.caution || null,
        variants: Array.isArray(m.variants) ? m.variants : [],
      }));

      await bulkUpsert(
        client,
        'morphemes',
        ['form', 'slug', 'type', 'meaning_cn', 'meaning_en', 'origin_lang', 'etymology', 'story', 'caution', 'variants'],
        morphRows,
        '(form)',
        ['slug', 'type', 'meaning_cn', 'meaning_en', 'origin_lang', 'etymology', 'story', 'caution', 'variants'],
      );
      stats.morphemeNew = morphRows.length;

      // 取回 id 映射
      const { rows: idRows } = await client.query(
        'SELECT id::int AS id, form FROM morphemes',
      );
      const morphIdByForm = new Map(idRows.map((r) => [r.form, r.id]));

      // ---------- 2. morpheme_relations ----------
      const relRows = [];
      const seenRel = new Set();

      const addRel = (fromForm, toForm, relation) => {
        const a = morphIdByForm.get(fromForm);
        const b = morphIdByForm.get(toForm);
        if (a === undefined || b === undefined || a === b) {
          stats.relSkipped++;
          return;
        }
        const key = `${a}:${b}:${relation}`;
        if (seenRel.has(key)) return;
        seenRel.add(key);
        relRows.push({ from_id: a, to_id: b, relation });
      };

      for (const m of morphemes) {
        const form = String(m.form ?? '').trim();
        for (const v of m.variants ?? []) addRel(form, v, 'variant');
        for (const r of m.related ?? []) addRel(form, r, 'related');
        for (const o of m.opposites ?? []) addRel(form, o, 'opposite');
      }

      // morphemes.jsonl 是全量数据源，关系表按「先清后建」重建，
      // 否则源数据里删掉的关系会一直留在库里
      await client.query('DELETE FROM morpheme_relations');

      // 分块插入 relations（无唯一冲突目标可用 ON CONFLICT DO NOTHING）
      for (let i = 0; i < relRows.length; i += 500) {
        const chunk = relRows.slice(i, i + 500);
        const params = [];
        const tuples = [];
        for (const r of chunk) {
          params.push(r.from_id, r.to_id, r.relation);
          tuples.push(`($${params.length - 2}, $${params.length - 1}, $${params.length})`);
        }
        await client.query(
          `INSERT INTO morpheme_relations (from_id, to_id, relation)
           VALUES ${tuples.join(', ')}
           ON CONFLICT (from_id, to_id, relation) DO NOTHING`,
          params,
        );
      }
      stats.variantRel = relRows.filter((r) => r.relation === 'variant').length;
      stats.otherRel = relRows.length - stats.variantRel;

      // ---------- 3. words + senses + tags ----------
      const wordRows = [];
      const senseRows = []; // 暂存，待 word 落库后回填 id
      const tagRows = new Map();
      const wordTagKeys = new Set();

      for (const w of words) {
        const word = String(w.word ?? '').toLowerCase().trim();
        if (!word) continue;

        wordRows.push({
          word,
          phonetic: w.phonetic || null,
          freq_rank: toIntOrNull(w.freq_rank),
          difficulty: toIntOrNull(w.difficulty) ?? 3,
          gloss: w.gloss || null,
        });

        for (const s of w.senses ?? []) {
          senseRows.push({
            word,
            pos: s.pos || null,
            definition_cn: String(s.definition_cn ?? '').trim(),
            definition_en: s.definition_en || null,
            example: s.example || null,
            example_cn: s.example_cn || null,
            sort_no: toIntOrNull(s.sort_no) ?? 0,
          });
        }

        for (const t of w.tags ?? []) {
          const code = String(t).trim();
          if (!code) continue;
          if (!tagRows.has(code)) tagRows.set(code, { code, name_cn: code, kind: 'exam' });
          const k = `${word}::${code}`;
          if (!wordTagKeys.has(k)) wordTagKeys.add(k);
        }
      }

      // words upsert
      // gloss 直接以源数据为准：拆解变正确后，旧库里基于错解生成的 gloss 必须被覆盖掉
      const wordsInsert = wordRows.map((r) => ({
        word: r.word,
        phonetic: r.phonetic,
        freq_rank: r.freq_rank,
        difficulty: r.difficulty,
        gloss: r.gloss,
      }));

      await bulkUpsert(
        client,
        'words',
        ['word', 'phonetic', 'freq_rank', 'difficulty', 'gloss'],
        wordsInsert,
        '(lower(word))',
        ['phonetic', 'freq_rank', 'difficulty', 'gloss'],
      );
      stats.wordNew = wordsInsert.length;

      const { rows: wordIdRows } = await client.query(
        'SELECT id::int AS id, lower(word) AS w FROM words',
      );
      const wordIdByWord = new Map(wordIdRows.map((r) => [r.w, r.id]));

      // senses / word_tags / word_morphemes 都是「按词先删后插」
      //
      // 必须删干净：这些是派生关系，只做 upsert 的话，源数据里已经删掉的
      // 旧关系会残留在库里（例如拆解算法修好后，operate 的错解 op- + e-
      // 仍会挂在页面上，因为老行没被删掉）。
      const allWordIds = [
        ...wordIdByWord.entries(),
      ]
        .filter(([w]) => wordRows.some((r) => r.word === w))
        .map(([, id]) => id);

      if (allWordIds.length > 0) {
        await client.query('DELETE FROM senses WHERE word_id = ANY($1::bigint[])', [
          allWordIds,
        ]);
        await client.query('DELETE FROM word_tags WHERE word_id = ANY($1::bigint[])', [
          allWordIds,
        ]);
        await client.query(
          'DELETE FROM word_morphemes WHERE word_id = ANY($1::bigint[])',
          [allWordIds],
        );
      }

      const senseInsert = senseRows
        .map((s) => {
          const wid = wordIdByWord.get(s.word);
          if (wid === undefined) return null;
          return {
            word_id: wid,
            pos: s.pos,
            definition_cn: s.definition_cn,
            definition_en: s.definition_en,
            example: s.example,
            example_cn: s.example_cn,
            sort_no: s.sort_no,
          };
        })
        .filter(Boolean)
        .filter((s) => s.definition_cn.length > 0);

      for (let i = 0; i < senseInsert.length; i += 500) {
        const chunk = senseInsert.slice(i, i + 500);
        const params = [];
        const tuples = [];
        for (const s of chunk) {
          params.push(
            s.word_id,
            s.pos,
            s.definition_cn,
            s.definition_en,
            s.example,
            s.example_cn,
            s.sort_no,
          );
          const b = params.length - 7;
          tuples.push(
            `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`,
          );
        }
        await client.query(
          `INSERT INTO senses (word_id, pos, definition_cn, definition_en, example, example_cn, sort_no)
           VALUES ${tuples.join(', ')}`,
          params,
        );
      }
      stats.sense = senseInsert.length;

      // tags
      const tagList = [...tagRows.values()];
      // 需在 if 块外声明：下方统计会引用
      const wtRows = [];
      if (tagList.length > 0) {
        // tags 无 updated_at 列，故关闭自动刷新
        await bulkUpsert(
          client,
          'tags',
          ['code', 'name_cn', 'kind'],
          tagList,
          '(code)',
          ['name_cn', 'kind'],
          false,
        );

        const { rows: tagIdRows } = await client.query('SELECT id, code FROM tags');
        const tagIdByCode = new Map(tagIdRows.map((r) => [r.code, r.id]));

        for (const key of wordTagKeys) {
          const [w, code] = key.split('::');
          const wid = wordIdByWord.get(w);
          const tid = tagIdByCode.get(code);
          if (wid !== undefined && tid !== undefined) wtRows.push({ word_id: wid, tag_id: tid });
        }

        for (let i = 0; i < wtRows.length; i += 500) {
          const chunk = wtRows.slice(i, i + 500);
          const params = [];
          const tuples = [];
          for (const r of chunk) {
            params.push(r.word_id, r.tag_id);
            tuples.push(`($${params.length - 1}, $${params.length})`);
          }
          await client.query(
            `INSERT INTO word_tags (word_id, tag_id)
             VALUES ${tuples.join(', ')}
             ON CONFLICT DO NOTHING`,
            params,
          );
        }
      }
      stats.tag = tagList.length;
      stats.wordTag = wtRows.length;

      // ---------- 4. word_morphemes ----------
      const wmRows = [];
      const seenWm = new Set();

      for (const w of words) {
        const word = String(w.word ?? '').toLowerCase().trim();
        const wid = wordIdByWord.get(word);
        if (wid === undefined) continue;

        for (const b of w.breakdown ?? []) {
          const form = String(b.form ?? '').trim();
          const mid = morphIdByForm.get(form);
          if (mid === undefined) {
            undefinedForms.set(form, (undefinedForms.get(form) ?? 0) + 1);
            stats.breakdownSkipped++;
            continue;
          }
          const orderNo = toIntOrNull(b.order_no) ?? 0;
          const key = `${wid}:${mid}:${orderNo}`;
          if (seenWm.has(key)) continue;
          seenWm.add(key);
          wmRows.push({
            word_id: wid,
            morpheme_id: mid,
            position: b.position || null,
            order_no: orderNo,
            note: b.note || null,
          });
        }
      }

      for (let i = 0; i < wmRows.length; i += 500) {
        const chunk = wmRows.slice(i, i + 500);
        const params = [];
        const tuples = [];
        for (const r of chunk) {
          params.push(
            r.word_id,
            r.morpheme_id,
            r.position,
            r.order_no,
            r.note,
          );
          const b = params.length - 5;
          tuples.push(
            `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`,
          );
        }
        await client.query(
          `INSERT INTO word_morphemes (word_id, morpheme_id, position, order_no, note)
             VALUES ${tuples.join(', ')}
             ON CONFLICT (word_id, morpheme_id, order_no) DO UPDATE SET
               position = excluded.position,
               note = excluded.note`,
          params,
        );
      }
      stats.breakdown = wmRows.length;

      // ---------- 5. 导入批次留痕 ----------
      // 便于回溯"库里这批数据是哪次导入进来的"
      await client.query(
        `INSERT INTO import_batches (source_file, note, word_count, morpheme_count, report_path)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'morphemes.jsonl + words.jsonl',
          `import.mjs ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
          stats.wordNew,
          stats.morphemeNew,
          'data/import-report.md',
        ],
      );

      await client.query('COMMIT');

      // 导入后回填词数（独立于事务，失败不影响已入库数据）
      try {
        await client.query('SELECT refresh_morpheme_word_count()');
        log('');
        log('已回填 morphemes.word_count');
      } catch (e) {
        log('');
        log('[warn] 回填 word_count 失败: ' + e.message);
      }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      log('');
      log('ERROR: ' + e.message);
      log('事务已回滚，数据库未变更。');
      fs.writeFileSync(path.join(ROOT, 'data', 'import-report.md'), report.join('\n') + '\n', 'utf8');
      process.exit(1);
    } finally {
      await client.end().catch(() => {});
    }
  }

  log('');
  log('--- 汇总 ---');
  log(`morphemes      : ${stats.morphemeNew} 条`);
  log(`words          : ${stats.wordNew} 条`);
  log(`senses         : ${stats.sense} 条`);
  log(`拆解关系       : ${stats.breakdown} 条（跳过 ${stats.breakdownSkipped} 条未定义引用）`);
  log(`变体关系       : ${stats.variantRel} 条`);
  log(`其他关系       : ${stats.otherRel} 条`);
  log(`标签           : ${stats.tag} 个（关联 ${stats.wordTag} 条）`);

  if (undefinedForms.size > 0) {
    log('');
    log('--- 未定义词素引用（前 20）---');
    [...undefinedForms.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([form, n]) => log(`  ${form} : ${n} 次`));
  }

  fs.writeFileSync(path.join(ROOT, 'data', 'import-report.md'), report.join('\n') + '\n', 'utf8');
  console.log(report.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

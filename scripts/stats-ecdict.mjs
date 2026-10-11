/**
 * ECDICT 全量统计脚本
 * 用途：扫描 data/raw 下的 ECDICT 原始数据，产出规模与字段覆盖率统计，
 *       并计算词根例词与主词典的交集，为 words.jsonl / morphemes.jsonl 生成提供依据。
 *
 * 用法：node scripts/stats-ecdict.mjs
 * 输出：data/raw/_stats.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_RAW = path.join(ROOT, 'data', 'raw');
const FILE_CSV = path.join(DIR_RAW, 'repo', 'ECDICT-master', 'ecdict.csv');
const FILE_WORDROOT = path.join(DIR_RAW, 'repo', 'ECDICT-master', 'wordroot.txt');
const FILE_OUT = path.join(DIR_RAW, '_stats.json');

/** 简易 CSV 解析（支持引号包裹、"" 转义、引号内换行） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const isAlphaWord = (w) => /^[a-z]+$/.test(w);
/** 剥离 ECDICT 的消歧数字后缀：soundless1 -> soundless，in-2 -> in- */
const stripDisambig = (w) => w.replace(/(\d+)$/, '');

function main() {
  if (!fs.existsSync(FILE_CSV)) {
    console.error('缺少文件：', FILE_CSV);
    process.exit(1);
  }

  // 先解析词根库，得到待匹配的目标词集
  const wr = JSON.parse(fs.readFileSync(FILE_WORDROOT, 'utf8'));
  const exRaw = new Set();
  for (const p of Object.values(wr)) for (const e of p.example ?? []) exRaw.add(e.trim().toLowerCase());
  const exClean = new Set();
  for (const e of exRaw) {
    const c = stripDisambig(e);
    if (isAlphaWord(c)) exClean.add(c);
  }

  console.log('读取并解析 ecdict.csv ...');
  const raw = fs.readFileSync(FILE_CSV, 'utf8');
  const rows = parseCsv(raw);
  const header = rows.shift();
  console.log('解析行数：', rows.length);

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const fieldKeys = header.filter((h) => h !== 'word');

  const stat = {
    total: 0,
    alphaWords: 0,
    fieldFill: Object.fromEntries(fieldKeys.map((k) => [k, 0])),
    alphaFieldFill: Object.fromEntries(fieldKeys.map((k) => [k, 0])),
    tagDist: {},
    collinsDist: {},
    oxfordCount: 0,
    posCount: 0,
  };

  const wordSet = new Set();
  const wanted = new Map(); // 词根例词 ∩ 主词典 的原始行

  for (const r of rows) {
    const w = (r[idx.word] ?? '').trim().toLowerCase();
    if (!w) continue;
    stat.total++;
    const isAlpha = isAlphaWord(w);
    if (isAlpha) {
      stat.alphaWords++;
      wordSet.add(w);
      if (exClean.has(w) && !wanted.has(w)) wanted.set(w, r);
    }
    for (const k of fieldKeys) {
      const v = (r[idx[k]] ?? '').trim();
      if (v !== '' && v !== '0') {
        stat.fieldFill[k]++;
        if (isAlpha) stat.alphaFieldFill[k]++;
      }
    }
    const tag = (r[idx.tag] ?? '').trim();
    if (tag) for (const t of tag.split(/\s+/)) if (t) stat.tagDist[t] = (stat.tagDist[t] ?? 0) + 1;
    const col = (r[idx.collins] ?? '').trim();
    if (col && col !== '0') stat.collinsDist[col] = (stat.collinsDist[col] ?? 0) + 1;
    const oxf = (r[idx.oxford] ?? '').trim();
    if (oxf && oxf !== '0') stat.oxfordCount++;
    const p = (r[idx.pos] ?? '').trim();
    if (p) stat.posCount++;
  }

  const pct = (a, b) => (b ? +((100 * a) / b).toFixed(1) : 0);

  const matched = [...exClean].filter((w) => wordSet.has(w));
  const missing = [...exClean].filter((w) => !wordSet.has(w));

  // 交集词的数据质量：这批词是 MVP 的核心资产，必须知道缺口
  const qualityKeys = ['phonetic', 'translation', 'definition', 'tag', 'frq', 'bnc', 'exchange', 'pos'];
  const quality = {};
  for (const k of qualityKeys) {
    let c = 0;
    for (const r of wanted.values()) {
      const v = (r[idx[k]] ?? '').trim();
      if (v !== '' && v !== '0') c++;
    }
    quality[k] = { count: c, pct: pct(c, wanted.size) };
  }

  const result = {
    generated_at: new Date().toISOString(),
    source_csv: path.relative(ROOT, FILE_CSV),
    header,
    rows_total: stat.total,
    rows_alpha_only: stat.alphaWords,
    rows_non_alpha: stat.total - stat.alphaWords,
    field_fill_all: Object.fromEntries(
      fieldKeys.map((k) => [k, { count: stat.fieldFill[k], pct: pct(stat.fieldFill[k], stat.total) }]),
    ),
    field_fill_alpha: Object.fromEntries(
      fieldKeys.map((k) => [k, { count: stat.alphaFieldFill[k], pct: pct(stat.alphaFieldFill[k], stat.alphaWords) }]),
    ),
    tag_distribution: Object.fromEntries(Object.entries(stat.tagDist).sort((a, b) => b[1] - a[1])),
    collins_distribution: Object.fromEntries(Object.entries(stat.collinsDist).sort((a, b) => a[0].localeCompare(b[0]))),
    oxford_count: stat.oxfordCount,
    pos_nonempty_count: stat.posCount,
    wordroot: {
      morphemes: Object.keys(wr).length,
      examples_raw: exRaw.size,
      examples_clean_alpha: exClean.size,
      matched_in_ecdict: matched.length,
      missing_in_ecdict: missing,
      intersection_quality: quality,
    },
  };

  fs.writeFileSync(FILE_OUT, JSON.stringify(result, null, 2), 'utf8');

  console.log('\n=== 规模 ===');
  console.log('总条目        :', stat.total);
  console.log('纯字母单词    :', stat.alphaWords);
  console.log('非单词(短语等):', stat.total - stat.alphaWords);
  console.log('\n=== 字段填充率（纯字母单词子集）===');
  for (const k of fieldKeys) {
    const f = result.field_fill_alpha[k];
    console.log(k.padEnd(12), String(f.count).padStart(7), f.pct + '%');
  }
  console.log('\n=== 考试标签分布 ===');
  console.log(result.tag_distribution);
  console.log('\n=== 词根例词 ∩ 主词典 ===');
  console.log('词素数        :', result.wordroot.morphemes);
  console.log('例词(清洗后)  :', result.wordroot.examples_clean_alpha);
  console.log('可匹配        :', result.wordroot.matched_in_ecdict);
  console.log('未匹配        :', result.wordroot.missing_in_ecdict.length, result.wordroot.missing_in_ecdict);
  console.log('\n=== 可拆解词的数据完整度 ===');
  for (const k of qualityKeys) {
    const f = result.wordroot.intersection_quality[k];
    console.log(k.padEnd(12), String(f.count).padStart(6), f.pct + '%');
  }
  console.log('\n报告已写入：', path.relative(ROOT, FILE_OUT));
}

main();

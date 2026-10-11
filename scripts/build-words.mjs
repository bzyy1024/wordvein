/**
 * 生成 words.jsonl
 *
 * 输入：
 *   - data/morphemes.examples.jsonl  词素 -> 同族例词（来自 ECDICT wordroot）
 *   - data/raw/repo/ECDICT-master/ecdict.csv  主词典（音标 / 释义 / 词频 / 标签）
 *
 *   - data/morphemes.jsonl  词素中文释义（用于生成 gloss，可选）
 *
 * 输出：
 *   - data/words.jsonl
 *   - data/build-words-report.md
 *
 * 拆解策略（规则自动切，后续由 LLM / 人工校正）：
 *   1. 从词尾最长匹配剥离后缀
 *   2. 从词首最长匹配剥离前缀
 *   3. 剩余部分在词根中做包含匹配
 *   4. 未命中任何词素 -> breakdown: []，页面走 F8 兜底
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const EXAMPLES_FILE = path.join(DATA_DIR, 'morphemes.examples.jsonl');
const ECDICT_FILE = path.join(
  ROOT,
  'data',
  'raw',
  'repo',
  'ECDICT-master',
  'ecdict.csv',
);
const OUT_FILE = path.join(DATA_DIR, 'words.jsonl');
const REPORT_FILE = path.join(DATA_DIR, 'build-words-report.md');
const MORPH_FILE = path.join(DATA_DIR, 'morphemes.jsonl');

/** 仅收录纯小写字母单词，过滤 "Homo sapiens" 之类非词条 */
const WORD_RE = /^[a-z]+$/;
/** 词根最短长度，避免 "a" "in" 之类过度匹配 */
const MIN_ROOT_LEN = 3;

/**
 * 词素 form -> 匹配用 key
 *
 * 源数据用尾部数字区分同形词素（-ate1 / -al1 / di-2 / a-3），
 * 也有一处带括号（ev (aev)）。这些标识只用于区分条目，
 * 参与匹配时必须剥掉，否则 key 会带数字而永远匹配不上。
 */
function normalizeKey(form) {
  return String(form ?? '')
    .replace(/\([^)]*\)/g, '') // 去括号注释
    .replace(/-/g, '')
    .replace(/[0-9]+$/g, '') // 去尾部编号
    .trim()
    .toLowerCase();
}

/** 展示用词形：去掉尾部编号与括号注释，如 -ate1 -> -ate、ev (aev) -> ev */
function cleanForm(form) {
  return String(form ?? '')
    .replace(/\([^)]*\)/g, '')
    .replace(/([a-z-])[0-9]+$/i, '$1')
    .trim();
}

// ----------------------------
// CSV 解析（支持引号包裹与字段内换行）
// ----------------------------

function parseCsvRow(src) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** 逐行产出完整 CSV 记录（引号未闭合时续读下一行） */
async function* csvRecords(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let pending = null;

  for await (const line of rl) {
    pending = pending === null ? line : pending + '\n' + line;
    // 引号未闭合说明字段内换行，续读下一行
    if ((pending.match(/"/g) ?? []).length % 2 !== 0) continue;
    const rec = pending;
    pending = null;
    yield parseCsvRow(rec);
  }
}

// ----------------------------
// 主流程
// ----------------------------

async function main() {
  const lines = [];
  const log = (s = '') => lines.push(s);

  if (!fs.existsSync(EXAMPLES_FILE)) {
    log('ERROR: 缺少 data/morphemes.examples.jsonl，请先运行 pnpm run data:morphemes');
    fs.writeFileSync(REPORT_FILE, lines.join('\n'), 'utf8');
    process.exit(1);
  }
  if (!fs.existsSync(ECDICT_FILE)) {
    log('ERROR: 缺少 ecdict.csv，请先下载 ECDICT 整仓到 data/raw/repo');
    fs.writeFileSync(REPORT_FILE, lines.join('\n'), 'utf8');
    process.exit(1);
  }

  // 1. 收集词素与倒排索引（form 去连字符）
  const morphemes = [];
  for (const line of fs.readFileSync(EXAMPLES_FILE, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      morphemes.push(JSON.parse(t));
    } catch {
      // 跳过坏行
    }
  }

  // key -> 候选数组。同形词素（a-1 否定 / a-2 在…上 / cap1 取 / cap2 头）
  // 归一化后 key 相同，必须全部保留，否则后写的会覆盖先写的。
  const suffixIdx = new Map();
  const prefixIdx = new Map();
  const rootIdx = new Map();

  const push = (idx, key, entry) => {
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(entry);
  };

  for (const m of morphemes) {
    const key = normalizeKey(m.form);
    if (!key || !/^[a-z]+$/.test(key)) continue;
    // 编号（-ate1 / a-2）决定同形词素的优先级，1 号通常是最常用义
    const num = Number(String(m.form).match(/([0-9]+)$/)?.[1] ?? 1);
    const entry = { form: m.form, len: key.length, num };
    if (m.type === 'suffix') push(suffixIdx, key, entry);
    else if (m.type === 'prefix') push(prefixIdx, key, entry);
    else if (m.type === 'root' && key.length >= MIN_ROOT_LEN) push(rootIdx, key, entry);
  }

  // 同形词素按编号升序，保证 a-1 先于 a-2 被选中
  for (const idx of [suffixIdx, prefixIdx, rootIdx]) {
    for (const cands of idx.values()) cands.sort((a, b) => a.num - b.num);
  }

  // 1.1 词素中文释义：用于生成 gloss（缺失时降级为纯词形串讲）
  const cnByForm = new Map();
  if (fs.existsSync(MORPH_FILE)) {
    for (const line of fs.readFileSync(MORPH_FILE, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const m = JSON.parse(t);
        if (m.meaning_cn) cnByForm.set(String(m.form), String(m.meaning_cn));
      } catch {
        // 跳过坏行
      }
    }
  }

  // 2. 收集目标词
  const targets = new Set();
  for (const m of morphemes) {
    for (const e of m.examples ?? []) {
      const w = String(e).toLowerCase();
      if (WORD_RE.test(w)) targets.add(w);
    }
  }

  log('=== build-words 报告 ===');
  log('');
  log(`词素条目        : ${morphemes.length}`);
  log(`后缀 / 前缀 / 词根 : ${suffixIdx.size} / ${prefixIdx.size} / ${rootIdx.size}`);
  log(`待匹配单词      : ${targets.size}`);

  // 3. 扫描 ECDICT，命中目标词时解析
  const dict = new Map(); // word -> {phonetic, senses[], freq, tags[]}
  let scanned = 0;
  let isHeader = true;

  for await (const f of csvRecords(ECDICT_FILE)) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    scanned++;

    const w = String(f[0] ?? '').toLowerCase();
    if (!targets.has(w)) continue;
    if (dict.has(w)) continue;

    const translation = String(f[3] ?? '');
    const definition = String(f[2] ?? '');
    // ECDICT 列序：0 word, 1 phonetic, 2 definition, 3 translation, 4 pos,
    //              5 collins, 6 oxford, 7 tag, 8 bnc, 9 frq, 10 exchange, ...
    // 早期误取 8 / 10 会把 bnc / exchange 当成标签和词频，导致词频全为 null
    const frq = f[9] !== undefined && f[9] !== '' ? Number(f[9]) : null;
    const tag = String(f[7] ?? '');

    dict.set(w, {
      word: w,
      phonetic: String(f[1] ?? '') || null,
      senses: buildSenses(definition, translation),
      freq_rank: Number.isFinite(frq) && frq > 0 ? frq : null,
      tags: tag.split(' ').filter(Boolean),
    });
  }

  log(`扫描词典行数    : ${scanned}`);
  log(`命中单词        : ${dict.size}`);

  // 4. 自动拆解
  const out = [];
  const stats = { analyzed: 0, empty: 0, gloss: 0 };

  for (const [w, d] of dict) {
    const breakdown = analyze(w, suffixIdx, prefixIdx, rootIdx);
    if (breakdown.length > 0) stats.analyzed++;
    else stats.empty++;

    const gloss = buildGloss(breakdown, cnByForm, d.senses);
    if (gloss) stats.gloss++;

    out.push({
      word: w,
      phonetic: d.phonetic,
      freq_rank: d.freq_rank,
      gloss,
      senses: d.senses,
      tags: d.tags,
      breakdown,
    });
  }

  fs.writeFileSync(OUT_FILE, out.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');

  log('');
  log(`可拆解单词      : ${stats.analyzed}`);
  log(`无拆解数据      : ${stats.empty}`);
  log(`生成 gloss      : ${stats.gloss}（词素中文 ${cnByForm.size} 条）`);
  log(`输出            : data/words.jsonl`);

  fs.writeFileSync(REPORT_FILE, lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
}

/** 构建义项：优先用 ECDICT translation（中文） */
function buildSenses(definition, translation) {
  // ECDICT 的 translation 里换行是字面量 "\n"（两个字符，被引号包裹，非真实换行），
  // 必须按字面量切分；用 split('\n') 会把所有词性释义合并成一条。
  const cnLines = String(translation ?? '')
    .split(/\\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    // 剔除 [网络] 之类噪声义项
    .filter((s) => !/^\[[^\]]+\]/.test(s));

  const senses = cnLines.map((line, i) => {
    const m = line.match(/^([a-z]+\.)\s*(.*)$/i);
    if (m) return { pos: m[1], definition_cn: m[2] || line, sort_no: i };
    return { pos: null, definition_cn: line, sort_no: i };
  });

  if (senses.length === 0 && definition) {
    senses.push({ pos: null, definition_cn: definition, sort_no: 0 });
  }

  return senses;
}

/**
 * 生成构词串讲：把词素含义串起来，再接首个义项
 * 例："pre- 在前 + dict 说 → 预言"
 */
function buildGloss(breakdown, cnByForm, senses) {
  if (!breakdown || breakdown.length === 0) return null;

  const parts = breakdown.map((b) => {
    const form = cleanForm(b.form);
    const cn = cnByForm.get(b.form);
    return cn ? `${form} ${cn}` : form;
  });
  if (parts.length === 0) return null;

  const def = firstMeaning(senses?.[0]?.definition_cn);
  return parts.join(' + ') + (def ? ` → ${def}` : '');
}

/** 取首个义项的首个释义：先按 ；/; 分义项，再按 , 分并列同义 */
function firstMeaning(definitionCn) {
  if (!definitionCn) return '';
  const s = String(definitionCn).split('；')[0].split(';')[0].split(',')[0].trim();
  return s.length > 40 ? s.slice(0, 40) : s;
}

/**
 * 规则自动拆解
 *
 * 关键约束（避免「operate = op- + e-」这类假解析）：
 *   1. 必须匹配到词根。只剥出前后缀、说不出实义部分，等于没解释，一律返回 []，
 *      由页面走 F8 兜底文案。
 *   2. 词根对剩余段（词干）的覆盖要够高，否则说明切错了。
 *
 * 做法：枚举「剥离 0~2 层前缀 × 剥离 0~2 层后缀」的组合，对每个组合的中间段
 *      找最佳词根，最后选覆盖率高、词素少的那个。
 */
function analyze(word, suffixIdx, prefixIdx, rootIdx) {
  const MIN_COVER = 0.6; // 词根至少覆盖中间段六成，再低就接近瞎猜
  const MAX_LEFT = 2; // 词根覆盖后最多允许剩下这么多字符未解释

  const prefixCands = peel(word, prefixIdx, 'start');
  let best = null;

  for (const pre of prefixCands) {
    // 连着剥两个前缀时不允许出现单字母前缀：单字母太容易误伤词干开头
    // （pericarp -> per- + i- + carp，实际是 peri- + carp）
    if (
      pre.items.length >= 2 &&
      pre.items.some((f) => normalizeKey(f).length < 2)
    ) {
      continue;
    }

    const suffixCands = peel(pre.rest, suffixIdx, 'end');

    for (const suf of suffixCands) {
      const stem = suf.rest;
      // 剥了两层前缀后词干过短，多半是把真词干的开头当成前缀吃掉了
      // （unreasonable -> un- + re- + ason + -able），这种情况直接放弃
      if (pre.items.length >= 2 && stem.length < 5) continue;

      const root = matchRoot(stem, rootIdx);
      if (!root) continue;

      const cover = root.len / stem.length;
      const left = stem.length - root.len;
      if (cover < MIN_COVER || left > MAX_LEFT) continue;

      const parts = [
        ...pre.items.map((form) => ({ form, position: 'prefix' })),
        { form: root.form, position: 'root' },
        // suffix 是「由外向内」剥离的，输出时反转回词序（-ion 在 -al 之前）
        ...suf.items
          .slice()
          .reverse()
          .map((form) => ({ form, position: 'suffix' })),
      ];

      // 排序：覆盖率高 > 剩余字符少 > 词素少
      const score = {
        cover,
        left,
        size: parts.length,
      };
      if (
        !best ||
        score.cover > best.score.cover ||
        (score.cover === best.score.cover && score.left < best.score.left) ||
        (score.cover === best.score.cover &&
          score.left === best.score.left &&
          score.size < best.score.size)
      ) {
        best = { parts, score };
      }
    }
  }

  if (!best) return [];

  return best.parts.map((p, i) => ({
    form: p.form,
    position: p.position,
    order_no: i,
  }));
}

/**
 * 逐层剥离候选：返回 [{items:[form...], rest}]，
 * 每层同时保留所有命中的词素（不只最长的），避免"最长匹配吃掉真正的词根"。
 */
function peel(word, idx, side) {
  const results = [];
  const MAX_DEPTH = 2;

  const walk = (rest, items, depth) => {
    results.push({ items, rest });
    if (depth >= MAX_DEPTH) return;

    const hits = [];
    for (const [key, cands] of idx) {
      if (rest.length <= key.length) continue;
      if (side === 'start' ? rest.startsWith(key) : rest.endsWith(key)) hits.push(...cands);
    }

    for (const hit of hits) {
      const nextRest = side === 'start' ? rest.slice(hit.len) : rest.slice(0, rest.length - hit.len);
      // 同一层同结果去重
      if (items.includes(hit.form)) continue;
      walk(nextRest, [...items, hit.form], depth + 1);
    }
  };

  walk(word, [], 0);

  // 去重（同 items + rest）
  const seen = new Set();
  return results.filter((r) => {
    const k = r.items.join('|') + '#' + r.rest;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 中间段匹配词根：整段相等优先，其次包含匹配（取最长 key）
 *
 * 同 key 有多个同形词素时按数据顺序取第一个（如 a-1 否定 先于 a-2 在…上），
 * 编号顺序即词素表的主义序。
 */
function matchRoot(stem, rootIdx) {
  if (stem.length < MIN_ROOT_LEN) return null;

  let best = null; // {key, cands}
  for (const [key, cands] of rootIdx) {
    if (stem === key) return { key, ...cands[0] };
    if (stem.includes(key) && (!best || key.length > best.key.length)) best = { key, cands };
  }
  return best ? { key: best.key, ...best.cands[0] } : null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * wordroot.txt -> data/morphemes.jsonl
 *
 * 处理内容：
 *   1. 复合 key 拆分：  "-able, -ible, -ble" -> form="-able", variants=["-ible","-ble"]
 *   2. class -> type：   映射到 schema CHECK (root/prefix/suffix/stem/combining)
 *   3. origin -> origin_lang：映射到 L/G/OE/ME 等枚举
 *   4. slug 唯一化：     保留连字符以区分 root/prefix/suffix，冲突时追加 -2/-3
 *   5. synonyms/antonyms -> related/opposites（逗号拆分）
 *   6. 输出派生词候选文件，供后续生成 word_morphemes
 *
 * 用法：node scripts/build-morphemes.mjs [--dry-run]
 * 输出：data/morphemes.jsonl、data/morphemes.examples.jsonl、data/morphemes.import-report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'raw', 'repo', 'ECDICT-master', 'wordroot.txt');
const OUT_DIR = path.join(ROOT, 'data');
const OUT_MORPH = path.join(OUT_DIR, 'morphemes.jsonl');
const OUT_EX = path.join(OUT_DIR, 'morphemes.examples.jsonl');
const OUT_REPORT = path.join(OUT_DIR, 'morphemes.import-report.md');

const DRY_RUN = process.argv.includes('--dry-run');

/** class -> type（schema CHECK 枚举） */
const CLASS_MAP = {
  root: 'root',
  prefix: 'prefix',
  'noun-forming suffix': 'suffix',
  'adjective-forming suffix': 'suffix',
  'verb-forming suffix': 'suffix',
  'adverb-forming suffix': 'suffix',
  'adjective- and noun-forming suffix': 'suffix',
};

/** origin -> origin_lang（schema 注释枚举） */
const ORIGIN_MAP = {
  Latin: 'L',
  Greek: 'G',
  'Old English': 'OE',
  'Middle English': 'ME',
  'Latin and Greek': 'L', // 双源：主标 L，etymology 内注明
};

/**
 * 人工修正表 1：原 key -> 规范 form
 * 仅收录确属原数据录入错误、且会影响匹配/展示的条目。
 */
const FORM_FIX = {
  eu: 'eu-', // 希腊语前缀"好/美"，原数据缺右侧连字符
  'aut, auto': 'auto-', // 正确前缀形式为 auto-，aut 非独立词素
};

/**
 * 人工修正表 2：form -> type
 * 原数据 class 标注有误、需要人工改判的条目。
 */
const TYPE_FIX = {
  '-latry': 'combining', // "崇拜"，实际以组合形式出现（idolatry / demonolatry）
  'fore-': 'prefix', // 原数据误标为 root，实为前缀（foresee / foretell）
};

/** 生成 URL 友好 slug：保留连字符（用于区分 root/prefix/suffix），小写，空格转 - */
function slugify(form) {
  return String(form)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** 拆分复合 key：返回 { form, variants } */
function splitKey(key) {
  const parts = String(key)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { form: parts[0] ?? key, variants: parts.slice(1) };
}

/** 逗号分隔字符串 -> 数组 */
function splitList(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('缺少文件：', SRC);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const entries = Object.entries(data);

  const morphemes = [];
  const examples = [];
  const assignedSlugs = []; // 实际分配到的 slug，用于最终唯一性校验
  const issues = {
    class_unmapped: [],
    origin_unmapped: [],
    missing_meaning: [],
    missing_example: [],
    slug_conflicts: [],
    hyphen_issue: [],
  };

  const slugSeen = new Map(); // slug -> count
  const formSeen = new Set();

  for (const [rawKey, v] of entries) {
    const { form: rawForm, variants: keyVariants } = splitKey(rawKey);
    const form = FORM_FIX[rawKey] ?? FORM_FIX[rawForm] ?? rawForm;
    const type = TYPE_FIX[form] ?? CLASS_MAP[v.class ?? ''];

    if (!type) {
      issues.class_unmapped.push({ key: rawKey, class: v.class });
      continue;
    }

    const originLang = ORIGIN_MAP[v.origin ?? ''] ?? null;
    if (!originLang) issues.origin_unmapped.push({ key: rawKey, origin: v.origin });

    const meaningEn = (v.meaning ?? '').trim();
    if (!meaningEn) issues.missing_meaning.push(rawKey);

    const exList = (v.example ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (exList.length === 0) issues.missing_example.push(rawKey);

    // slug 唯一化
    const base = slugify(form);
    if (!base) {
      issues.slug_conflicts.push({ key: rawKey, reason: 'slug 为空' });
      continue;
    }
    const seen = slugSeen.get(base) ?? 0;
    const slug = seen === 0 ? base : `${base}-${seen + 1}`;
    slugSeen.set(base, seen + 1);
    if (seen > 0) issues.slug_conflicts.push({ key: rawKey, base, assigned: slug, reason: 'slug 冲突，已自动消歧' });

    if (formSeen.has(form)) {
      // form 重复但 slug 不同，记录但不阻塞（靠 slug 区分）
    }
    formSeen.add(form);

    // 连字符规范校验（放宽：允许尾部数字消歧）
    if (type === 'prefix' && !/^[a-z]+-(\d+)?$/.test(form)) {
      issues.hyphen_issue.push({ key: rawKey, form, issue: 'prefix 应以 - 或 -数字 结尾' });
    }
    if (type === 'suffix' && !/^-[a-z]+(\d+)?$/.test(form)) {
      issues.hyphen_issue.push({ key: rawKey, form, issue: 'suffix 应以 - 开头' });
    }
    if (type === 'root' && /^-|-$/.test(form)) {
      issues.hyphen_issue.push({ key: rawKey, form, issue: 'root 不应带连字符' });
    }

    // 变体：复合 key 的其余项
    const variants = keyVariants.map((s) => FORM_FIX[s] ?? s);

    morphemes.push({
      form,
      type,
      meaning_en: meaningEn,
      meaning_cn: '', // 待生产：611 条英文含义需汉化
      origin_lang: originLang,
      etymology: '',
      variants,
      related: splitList(v.synonyms),
      opposites: splitList(v.antonyms),
      caution: v.function ? String(v.function).trim() : '',
      story: '',
    });

    examples.push({
      form,
      slug,
      type,
      examples: exList,
    });
    assignedSlugs.push(slug);
  }

  // 最终校验：使用实际分配的 slug
  const finalSlugSet = new Set();
  let dupSlug = 0;
  for (const s of assignedSlugs) {
    if (finalSlugSet.has(s)) dupSlug++;
    finalSlugSet.add(s);
  }

  const totalBlocking =
    issues.class_unmapped.length +
    issues.origin_unmapped.length +
    issues.missing_meaning.length +
    issues.missing_example.length +
    issues.slug_conflicts.filter((x) => x.reason !== 'slug 冲突，已自动消歧').length +
    issues.hyphen_issue.length;

  const stats = {
    morphemes: morphemes.length,
    by_type: morphemes.reduce((a, m) => ((a[m.type] = (a[m.type] ?? 0) + 1), a), {}),
    by_origin: morphemes.reduce((a, m) => {
      const k = m.origin_lang ?? '(none)';
      a[k] = (a[k] ?? 0) + 1;
      return a;
    }, {}),
    with_variants: morphemes.filter((m) => m.variants.length > 0).length,
    with_related: morphemes.filter((m) => m.related.length > 0).length,
    with_opposites: morphemes.filter((m) => m.opposites.length > 0).length,
    with_caution: morphemes.filter((m) => m.caution).length,
    meaning_cn_filled: morphemes.filter((m) => m.meaning_cn).length,
    slug_unique: finalSlugSet.size,
    slug_duplicates: dupSlug,
    blocking: totalBlocking,
  };

  if (!DRY_RUN) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_MORPH, morphemes.map((m) => JSON.stringify(m)).join('\n') + '\n', 'utf8');
    fs.writeFileSync(OUT_EX, examples.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    const lines = [];
    lines.push('# morphemes.jsonl 导入校验报告');
    lines.push('');
    lines.push(`> 生成时间：${new Date().toISOString()}`);
    lines.push(`> 数据来源：ECDICT \`wordroot.txt\`（MIT）`);
    lines.push('');
    lines.push('## 规模');
    lines.push('');
    lines.push(`- 词素总数：**${stats.morphemes}**`);
    lines.push(`- slug 唯一值：**${stats.slug_unique}**`);
    lines.push('');
    lines.push('## 类型分布');
    lines.push('');
    lines.push('| type | 数量 |');
    lines.push('|---|---:|');
    for (const [k, v] of Object.entries(stats.by_type)) lines.push(`| ${k} | ${v} |`);
    lines.push('');
    lines.push('## 来源语言分布');
    lines.push('');
    lines.push('| origin_lang | 数量 |');
    lines.push('|---|---:|');
    for (const [k, v] of Object.entries(stats.by_origin)) lines.push(`| ${k} | ${v} |`);
    lines.push('');
    lines.push('## 字段覆盖');
    lines.push('');
    lines.push(`- 有 variants：${stats.with_variants}`);
    lines.push(`- 有 related：${stats.with_related}`);
    lines.push(`- 有 opposites：${stats.with_opposites}`);
    lines.push(`- 有 caution：${stats.with_caution}`);
    lines.push(`- **meaning_cn 已填：${stats.meaning_cn_filled} / ${stats.morphemes}**`);
    lines.push('');
    lines.push('## 阻塞项');
    lines.push('');
    lines.push(`**合计：${totalBlocking}**`);
    lines.push('');
    for (const [k, v] of Object.entries(issues)) {
      if (v.length) {
        lines.push(`### ${k}（${v.length}）`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(v.slice(0, 10), null, 2));
        lines.push('```');
        lines.push('');
      }
    }
    fs.writeFileSync(OUT_REPORT, lines.join('\n'), 'utf8');
  }

  console.log('=== 转换结果 ===');
  console.log('词素总数      :', stats.morphemes);
  console.log('type 分布     :', stats.by_type);
  console.log('来源语言分布  :', stats.by_origin);
  console.log('有 variants   :', stats.with_variants);
  console.log('有 related    :', stats.with_related);
  console.log('有 opposites  :', stats.with_opposites);
  console.log('有 caution    :', stats.with_caution);
  console.log('slug 唯一值   :', stats.slug_unique, '| 重复:', stats.slug_duplicates);
  console.log('meaning_cn    :', stats.meaning_cn_filled, '/', stats.morphemes, '(待汉化)');
  console.log('\n=== 阻塞项 ===');
  for (const [k, v] of Object.entries(issues)) {
    console.log(k.padEnd(20), v.length, v.length ? JSON.stringify(v.slice(0, 5)) : '');
  }
  console.log('\n阻塞合计      :', totalBlocking);
  console.log(DRY_RUN ? '(dry-run，未写文件)' : '\n已写入：data/morphemes.jsonl, data/morphemes.examples.jsonl, data/morphemes.import-report.md');
}

main();

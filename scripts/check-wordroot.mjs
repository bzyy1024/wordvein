/**
 * wordroot.txt 转换前质量检查
 * 用途：按 docs/schema.sql 的 morphemes 表约束 + docs/数据格式规范.md 的必填要求，
 *       逐条检查 611 个词素能否直接转成 morphemes.jsonl，列出所有阻塞项。
 *
 * 用法：node scripts/check-wordroot.mjs
 * 输出：data/raw/_wordroot_check.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE_WR = path.join(ROOT, 'data', 'raw', 'repo', 'ECDICT-master', 'wordroot.txt');
const FILE_OUT = path.join(ROOT, 'data', 'raw', '_wordroot_check.json');

/** 按格式规范：去掉连字符、转小写、空格转 - */
const slugify = (form) =>
  String(form)
    .replace(/-/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

/** class -> type（schema CHECK: root/prefix/suffix/stem/combining） */
const CLASS_MAP = {
  root: 'root',
  prefix: 'prefix',
  'noun-forming suffix': 'suffix',
  'adjective-forming suffix': 'suffix',
  'verb-forming suffix': 'suffix',
  'adverb-forming suffix': 'suffix',
  'adjective- and noun-forming suffix': 'suffix',
};

/** origin -> origin_lang（schema 注释枚举: L/G/OE/OF/F/PIE/ME） */
const ORIGIN_MAP = {
  Latin: 'L',
  Greek: 'G',
  'Old English': 'OE',
  'Middle English': 'ME',
  'Latin and Greek': 'L', // 双源，主标 L，etymology 内注明
};

function main() {
  if (!fs.existsSync(FILE_WR)) {
    console.error('缺少文件：', FILE_WR);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(FILE_WR, 'utf8'));
  const entries = Object.entries(data);

  const report = {
    generated_at: new Date().toISOString(),
    total: entries.length,
    class_distribution: {},
    origin_distribution: {},
    type_distribution: {},
    blocking: {
      class_unmapped: [],
      origin_unmapped: [],
      missing_meaning: [],
      missing_example: [],
      empty_slug: [],
      slug_conflicts: [],
      form_hyphen_issues: [],
    },
    warnings: {
      composite_keys: [],
      numeric_suffix_keys: [],
      empty_variants: [],
    },
  };

  const slugSeen = new Map();

  for (const [key, v] of entries) {
    const cls = v.class ?? '';
    const org = v.origin ?? '';
    report.class_distribution[cls] = (report.class_distribution[cls] ?? 0) + 1;
    report.origin_distribution[org] = (report.origin_distribution[org] ?? 0) + 1;

    const type = CLASS_MAP[cls];
    if (!type) {
      report.blocking.class_unmapped.push({ key, class: cls });
      continue;
    }
    report.type_distribution[type] = (report.type_distribution[type] ?? 0) + 1;

    const oLang = ORIGIN_MAP[org];
    if (!oLang) report.blocking.origin_unmapped.push({ key, origin: org });

    if (!v.meaning || !String(v.meaning).trim()) report.blocking.missing_meaning.push(key);
    if (!Array.isArray(v.example) || v.example.length === 0) report.blocking.missing_example.push(key);

    // 复合 key 与数字后缀
    const parts = key.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) report.warnings.composite_keys.push(key);
    if (/\d$/.test(key)) report.warnings.numeric_suffix_keys.push(key);

    const form = parts[0] ?? key;
    const slug = slugify(form);
    if (!slug) report.blocking.empty_slug.push(key);

    if (slugSeen.has(slug)) {
      report.blocking.slug_conflicts.push({ slug, first: slugSeen.get(slug), second: key });
    } else {
      slugSeen.set(slug, key);
    }

    // 连字符规范
    if (type === 'root' && (form.startsWith('-') || form.endsWith('-'))) {
      report.blocking.form_hyphen_issues.push({ key, form, issue: 'root 不应带连字符' });
    }
    if (type === 'prefix' && !form.endsWith('-')) {
      report.blocking.form_hyphen_issues.push({ key, form, issue: 'prefix 应以 - 结尾' });
    }
    if (type === 'suffix' && !form.startsWith('-')) {
      report.blocking.form_hyphen_issues.push({ key, form, issue: 'suffix 应以 - 开头' });
    }
  }

  // 变体：复合 key 的第二项之后
  let withVariants = 0;
  for (const [key] of entries) {
    const parts = key.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) withVariants++;
    else report.warnings.empty_variants.push(key);
  }

  const b = report.blocking;
  const totalBlocking = Object.values(b).reduce((s, x) => s + x.length, 0);

  report.summary = {
    ready: totalBlocking === 0,
    blocking_total: totalBlocking,
    with_variants: withVariants,
    composite_key_count: report.warnings.composite_keys.length,
    numeric_suffix_count: report.warnings.numeric_suffix_keys.length,
  };

  fs.writeFileSync(FILE_OUT, JSON.stringify(report, null, 2), 'utf8');

  console.log('词素总数        :', report.total);
  console.log('type 分布       :', report.type_distribution);
  console.log('有 variants 的  :', withVariants);
  console.log('复合 key        :', report.warnings.composite_keys.length);
  console.log('带数字后缀 key  :', report.warnings.numeric_suffix_keys.length);
  console.log('\n--- 阻塞项 ---');
  for (const [k, v] of Object.entries(b)) {
    console.log(k.padEnd(20), v.length, v.length ? JSON.stringify(v.slice(0, 8)) : '');
  }
  console.log('\n阻塞合计        :', totalBlocking);
  console.log('可直接转换      :', totalBlocking === 0 ? '是' : '否');
  console.log('\n报告已写入：', path.relative(ROOT, FILE_OUT));
}

main();

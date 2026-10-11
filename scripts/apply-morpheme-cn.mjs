/**
 * 把 data/morpheme-cn.json 的中文释义写回 data/morphemes.jsonl
 *
 * 用法：node scripts/apply-morpheme-cn.mjs [--dry-run]
 *
 * 匹配顺序：by_form（按词形覆盖，优先级高） -> by_meaning（按英文释义）
 * 已存在 meaning_cn 的词素默认跳过；加 --force 覆盖。
 * 随后执行 `pnpm run import` 即可把中文释义 upsert 进库。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');

const map = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'morpheme-cn.json'), 'utf8'),
);
const byMeaning = map.by_meaning ?? {};
const byForm = map.by_form ?? {};

const file = path.join(ROOT, 'data', 'morphemes.jsonl');
const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());

let hitForm = 0;
let hitMeaning = 0;
let skipped = 0;
const missed = [];
const out = [];

for (const line of lines) {
  const m = JSON.parse(line);
  const form = String(m.form ?? '').trim();
  const en = String(m.meaning_en ?? '').trim();

  let cn = byForm[form] ?? (en ? byMeaning[en] : undefined);

  if (!cn && en) {
    // 兜底：忽略大小写与尾句点再试一次
    const key = en.toLowerCase().replace(/\.+$/, '');
    for (const [k, v] of Object.entries(byMeaning)) {
      if (k.toLowerCase().replace(/\.+$/, '') === key) {
        cn = v;
        break;
      }
    }
  }

  if (cn && (FORCE || !m.meaning_cn)) {
    m.meaning_cn = cn;
    (byForm[form] ? hitForm++ : hitMeaning++);
  } else if (!m.meaning_cn) {
    if (en) {
      missed.push(`${form} :: ${en}`);
    }
    skipped++;
  }

  out.push(JSON.stringify(m));
}

if (!DRY) {
  fs.writeFileSync(file, out.join('\n') + '\n', 'utf8');
}

console.log(`词素总数     : ${lines.length}`);
console.log(`按词形命中   : ${hitForm}`);
console.log(`按释义命中   : ${hitMeaning}`);
console.log(`仍缺中文     : ${skipped}`);
console.log(`模式         : ${DRY ? 'DRY-RUN（未写文件）' : '已写回 morphemes.jsonl'}`);
if (missed.length) {
  console.log('');
  console.log('--- 未匹配（前 30）---');
  missed.slice(0, 30).forEach((s) => console.log('  ' + s));
}

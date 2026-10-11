import { Fragment } from 'react';
import Link from 'next/link';
import type { BreakdownItem } from '@/lib/queries';
import { cleanForm, typeLabel } from '@/lib/labels';
import { typeStyle } from './MorphemeCard';

/**
 * 构词拆解可视化（F3 核心）
 *
 * - 按 order_no 顺序渲染词素块，颜色区分前缀 / 词根 / 后缀
 * - 悬停显示该词素的通用含义（title 属性，无需 JS）
 * - 点击进入词素详情页
 * - 底部展示 gloss「整体含义推理」串讲
 *
 * 无拆解数据时走 F8 兜底：展示说明文案，不报错、不空白。
 */
export default function WordBreakdown({
  items,
  gloss,
}: {
  items: BreakdownItem[];
  gloss: string | null;
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          暂无拆解数据
        </h2>
        <p className="text-sm leading-relaxed text-slate-600">
          这个词目前还没有收录词根词缀拆解。它可能属于以下情况：
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
          <li>基础词汇或功能词（如冠词、代词），本身不由词根词缀构成</li>
          <li>源自古英语的本土词，缺少拉丁 / 希腊词根</li>
          <li>数据尚未整理到该词条</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          我们会在后续版本中持续补充。你也可以从
          <Link href="/morphemes" className="mx-1 text-blue-600 hover:underline">
            词素总览
          </Link>
          出发，按词根反查同族词。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">构词拆解</h2>

      <div className="flex flex-wrap items-stretch gap-2">
        {items.map((it, i) => (
          <Fragment key={`${it.id}-${it.orderNo}`}>
            {i > 0 && (
              <span className="self-center px-1 text-lg text-slate-300">+</span>
            )}
            <Link
              href={`/morpheme/${encodeURIComponent(it.slug)}`}
              title={[
                `${cleanForm(it.form)} ${typeLabel(it.type)}`,
                // 含义中英并列：死亡 (death)
                [it.meaningCn, it.meaningEn && `(${it.meaningEn})`]
                  .filter(Boolean)
                  .join(' '),
                it.note,
              ]
                .filter(Boolean)
                .join('：')}
              className={`group flex min-w-[4rem] max-w-[11rem] flex-col items-center rounded-lg border px-3 py-2 text-center transition hover:shadow-sm ${typeStyle(
                it.type,
              )}`}
            >
              <span className="font-mono text-sm font-bold">{cleanForm(it.form)}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {typeLabel(it.type)}
              </span>
              {it.meaningCn && (
                <span className="mt-1 text-[11px] leading-tight">{it.meaningCn}</span>
              )}
              {it.meaningEn && (
                <span className="text-[10px] italic leading-tight opacity-70">
                  {it.meaningEn}
                </span>
              )}
              {it.note && (
                <span className="mt-0.5 text-[11px] leading-tight opacity-90">
                  {it.note}
                </span>
              )}
            </Link>
          </Fragment>
        ))}
      </div>

      {gloss && (
        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            含义推理
          </h3>
          <p className="text-sm leading-relaxed text-slate-800">{gloss}</p>
        </div>
      )}
    </section>
  );
}

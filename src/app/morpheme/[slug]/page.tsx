import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMorpheme,
  getVariants,
  getRelated,
  getFamilyWords,
} from '@/lib/queries';
import { cleanForm, typeLabel, originLabel, relationLabel } from '@/lib/labels';

/**
 * 词素详情页（词根 / 词缀统一入口，SSR）
 *
 * F4 形式 / 类型 / 含义 / 来源语言 / 词源 / 助记
 * F5 同族词列表，区分「直接派生」与「变体派生」
 * F7 变体关联展示
 */

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const m = await getMorpheme(decoded);

  if (!m) {
    return { title: `未收录词素：${decoded}` };
  }

  const kind = typeLabel(m.type);
  const form = cleanForm(m.form);
  return {
    title: `${form} ${kind}的意思与同族词`,
    description: `${kind} ${form} 的含义：${m.meaningCn ?? '暂无'}。收录 ${m.wordCount} 个同族词，按词频排序。`,
    openGraph: {
      title: `${form} ${kind}`,
      description: m.meaningCn ?? '',
    },
  };
}

export default async function MorphemePage({ params }: Props) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const m = await getMorpheme(decoded);

  if (!m) notFound();

  const [variants, related, family] = await Promise.all([
    getVariants(m.id),
    getRelated(m.id),
    getFamilyWords(m.slug, 50),
  ]);

  const direct = family.filter((w) => w.isDirect);
  const viaVariant = family.filter((w) => !w.isDirect);

  return (
    <article className="space-y-6">
      {/* 面包屑 */}
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          首页
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/morphemes" className="hover:text-slate-900">
          词素总览
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-900">{cleanForm(m.form)}</span>
      </nav>

      {/* 标题区 */}
      <header className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-3xl font-bold tracking-tight text-slate-900">
            {cleanForm(m.form)}
          </h1>
          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            {typeLabel(m.type)}
          </span>
          {m.originLang && (
            <span className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
              {originLabel(m.originLang)}
            </span>
          )}
        </div>

        <p className="mt-4 text-base leading-relaxed text-slate-800">
          {m.meaningCn ?? '（暂无中文含义）'}
        </p>

        {m.meaningEn && (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            {m.meaningEn}
          </p>
        )}

        <p className="mt-4 text-sm text-slate-500">
          收录 <span className="font-semibold text-slate-900">{m.wordCount}</span> 个同族词
        </p>
      </header>

      {/* 变体 F7 */}
      {(variants.length > 0 || m.variants.length > 0) && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">变体形式</h2>

          <div className="flex flex-wrap gap-2">
            {m.variants.map((v) => (
              <span
                key={v}
                className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm text-slate-700"
              >
                {v}
              </span>
            ))}

            {variants.map((v) => (
              <Link
                key={v.id}
                href={`/morpheme/${encodeURIComponent(v.slug)}`}
                className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-mono text-sm text-blue-700 transition hover:bg-blue-100"
              >
                {v.form}
              </Link>
            ))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            灰色为登记在册的变体写法，蓝色为已独立成条、可点击查看的词素。
          </p>
        </section>
      )}

      {/* 相关 / 反义 */}
      {related.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            相关词素
          </h2>

          <div className="space-y-3">
            {related.map((g) => (
              <div key={g.relation} className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">
                  {relationLabel(g.relation)}
                </span>
                {g.items.map((it) => (
                  <Link
                    key={it.id}
                    href={`/morpheme/${encodeURIComponent(it.slug)}`}
                    className="rounded-lg border border-slate-200 px-2 py-0.5 font-mono text-sm text-slate-700 transition hover:border-blue-300"
                  >
                    {cleanForm(it.form)}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 词源与助记 */}
      {(m.etymology || m.story || m.caution) && (
        <section className="space-y-4">
          {m.etymology && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">词源</h2>
              <p className="text-sm leading-relaxed text-slate-700">{m.etymology}</p>
            </div>
          )}

          {m.story && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="mb-2 text-sm font-semibold text-amber-900">助记</h2>
              <p className="text-sm leading-relaxed text-amber-900">{m.story}</p>
            </div>
          )}

          {m.caution && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
              <h2 className="mb-2 text-sm font-semibold text-rose-900">易混提示</h2>
              <p className="text-sm leading-relaxed text-rose-900">{m.caution}</p>
            </div>
          )}
        </section>
      )}

      {/* 同族词 F5 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">
          同族词
          <span className="ml-2 font-normal text-slate-400">
            直接 {direct.length} · 经变体 {viaVariant.length}
          </span>
        </h2>

        {family.length === 0 ? (
          <p className="text-sm text-slate-600">暂无同族词数据。</p>
        ) : (
          <ul className="space-y-2">
            {family.map((w) => (
              <li key={`${w.id}-${w.matchedSlug}`}>
                <Link
                  href={`/word/${encodeURIComponent(w.word)}`}
                  className="flex flex-col gap-0.5 rounded-lg border border-slate-100 px-3 py-2 transition hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {w.word}
                    </span>
                    {w.phonetic && (
                      <span className="text-xs text-slate-400">
                        {w.phonetic}
                      </span>
                    )}
                    {w.cefr && (
                      <span className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-500">
                        {w.cefr}
                      </span>
                    )}
                    {!w.isDirect && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        经变体 {w.matchedForm}
                      </span>
                    )}
                  </div>
                  {w.brief && (
                    <span className="line-clamp-1 text-xs text-slate-500">
                      {w.brief}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

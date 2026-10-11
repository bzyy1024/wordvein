import type { Metadata } from 'next';
import Link from 'next/link';
import { searchAll } from '@/lib/queries';
import { safe } from '@/lib/safe';
import { cleanForm } from '@/lib/labels';
import SearchBox from '@/components/SearchBox';

/**
 * 搜索结果页（F1，SSR）
 *
 * 单词区与词素区分栏展示：
 *   - 单词：精确 > 前缀 > trigram 拼写容错（predct → predict）
 *   - 词素：形式匹配 + 中文含义反查（搜「说」能发现 dict）
 */

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q = '' } = await searchParams;
  return {
    title: q ? `搜索：${q}` : '搜索',
    description: q ? `与「${q}」相关的单词与词根词缀。` : '搜索单词或词根词缀。',
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '' } = await searchParams;
  const term = q.trim();

  const results = term
    ? await safe(searchAll(term, 20), { words: [], morphemes: [] })
    : { words: [], morphemes: [] };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">搜索</h1>
        <div className="mt-3 max-w-xl">
          <SearchBox />
        </div>
      </header>

      {!term ? (
        <p className="text-sm text-slate-600">输入单词或词根开始搜索。</p>
      ) : (
        <>
          {/* 单词区 */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              单词
              <span className="ml-2 font-normal text-slate-400">
                {results.words.length}
              </span>
            </h2>

            {results.words.length === 0 ? (
              <p className="text-sm text-slate-600">没有匹配的单词。</p>
            ) : (
              <ul className="space-y-2">
                {results.words.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/word/${encodeURIComponent(w.word)}`}
                      className="flex flex-wrap items-baseline gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-300"
                    >
                      <span className="text-base font-semibold text-slate-900">
                        {w.word}
                      </span>
                      {w.phonetic && (
                        <span className="text-sm text-slate-500">
                          {w.phonetic}
                        </span>
                      )}
                      {w.freqRank != null && (
                        <span className="ml-auto text-xs text-slate-400">
                          词频 #{w.freqRank.toLocaleString('zh-CN')}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 词素区 */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              词根词缀
              <span className="ml-2 font-normal text-slate-400">
                {results.morphemes.length}
              </span>
            </h2>

            {results.morphemes.length === 0 ? (
              <>
                <p className="text-sm text-slate-600">没有匹配的词根词缀。</p>
                <p className="mt-1.5 text-xs text-slate-500">
                  可以试试按中文含义搜索，例如「说」「看」「写」。
                </p>
              </>
            ) : (
              <ul className="space-y-2">
                {results.morphemes.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/morpheme/${encodeURIComponent(m.slug)}`}
                      className="flex flex-wrap items-baseline gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-300"
                    >
                      <span className="font-mono text-base font-semibold text-slate-900">
                        {cleanForm(m.form)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {m.meaningCn ?? '暂无含义'}
                      </span>
                      <span className="ml-auto text-xs text-slate-400">
                        {m.wordCount} 个同族词
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

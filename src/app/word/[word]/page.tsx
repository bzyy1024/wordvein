import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWord, getRelatedWords } from '@/lib/queries';
import { cleanForm, difficultyLabel } from '@/lib/labels';
import WordBreakdown from '@/components/WordBreakdown';
import SenseList from '@/components/SenseList';
import FavoriteButton from '@/components/FavoriteButton';
import QueryTracker from '@/components/QueryTracker';
import { getSessionUser } from '@/lib/auth';
import { isFavorited } from '@/lib/store';

/**
 * 单词详情页（SSR，长尾流量主入口）
 *
 * F2 音标 / 词性 / 中英释义 / 例句
 * F3 构词拆解可视化 + gloss 串讲
 * F8 无拆解数据时走兜底展示
 */

type Props = {
  params: Promise<{ word: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { word } = await params;
  const decoded = decodeURIComponent(word);
  const data = await getWord(decoded);

  if (!data) {
    return { title: `未收录：${decoded}` };
  }

  const brief = data.senses[0]?.definitionCn ?? '';
  const parts = data.breakdown.map((b) => cleanForm(b.form)).join(' + ');

  return {
    title: `${data.word} 的词根词缀拆解与意思`,
    description: parts
      ? `${data.word} ${data.phonetic ?? ''} = ${parts}。${brief}查看完整构词逻辑与同族词。`
      : `${data.word} ${data.phonetic ?? ''} 的意思：${brief}`,
    openGraph: {
      title: `${data.word} 的词根词缀拆解`,
      description: brief || `${data.word} 的构词逻辑`,
    },
  };
}

export default async function WordPage({ params }: Props) {
  const { word } = await params;
  const decoded = decodeURIComponent(word);
  const data = await getWord(decoded);

  if (!data) notFound();

  const related = await getRelatedWords(data.id, 12);

  // 收藏状态服务端就查好：已登录才有意义，未登录时按钮引导去登录
  const session = await getSessionUser();
  const saved = session ? await isFavorited(session.id, decoded) : false;

  return (
    <article className="space-y-6">
      {/* 查词上报（第二期），不渲染内容 */}
      <QueryTracker word={data.word} />

      {/* 面包屑 */}
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          首页
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-900">{data.word}</span>
      </nav>

      {/* 标题区 */}
      <header className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {data.word}
          </h1>
          {data.phonetic && (
            <span className="text-base text-slate-500">{data.phonetic}</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {data.cefr && (
            <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600">
              CEFR {data.cefr}
            </span>
          )}
          <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600">
            难度 {difficultyLabel(data.difficulty)}
          </span>
          {data.freqRank != null && (
            <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600">
              词频 #{data.freqRank.toLocaleString('zh-CN')}
            </span>
          )}
        </div>

        {/* 收藏（第三期：需登录） */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FavoriteButton
            word={data.word}
            loggedIn={Boolean(session)}
            initialSaved={saved}
          />
          <span className="text-xs text-slate-400">
            {session ? '收藏后可在「我的收藏」里回看' : '登录后收藏，换设备也不会丢'}
          </span>
        </div>
      </header>

      {/* 构词拆解 F3 / F8 */}
      <WordBreakdown items={data.breakdown} gloss={data.gloss} />

      {/* 释义 F2 */}
      <SenseList senses={data.senses} />

      {/* 同族词推荐 */}
      {related.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">
            同族词（共享词素）
          </h2>

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/word/${encodeURIComponent(r.word)}`}
                  className="flex flex-col rounded-lg border border-slate-100 px-3 py-2 transition hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {r.word}
                    </span>
                    {r.phonetic && (
                      <span className="text-xs text-slate-400">
                        {r.phonetic}
                      </span>
                    )}
                  </div>
                  {r.brief && (
                    <span className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                      {r.brief}
                    </span>
                  )}
                  <span className="mt-1 text-[11px] text-slate-400">
                    共享词素 {r.matchedForm}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WordDetail } from '@/lib/queries';
import WordBreakdown from '@/components/WordBreakdown';
import SenseList from '@/components/SenseList';

/**
 * 首页「每日一词」：每次加载随机一个已拆解单词，
 * 并提供「随机换一个」按钮，让用户持续探索不同单词的构词逻辑。
 */
export default function TodayWord({ initial }: { initial: WordDetail | null }) {
  const [word, setWord] = useState<WordDetail | null>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function shuffle() {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/word/random?exclude=${encodeURIComponent(word?.word ?? '')}`,
      );
      const data = await res.json();
      if (data.word) {
        setWord(data.word as WordDetail);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (!word) return null;

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-900">每日一词</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={shuffle}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 transition hover:border-blue-300 hover:text-slate-900 disabled:opacity-50"
          >
            <span
              className={`text-xs ${loading ? 'opacity-0' : 'inline-block'}`}
              aria-hidden
            >
              🎲
            </span>
            {loading ? '换个词…' : '随机换一个'}
          </button>
          <Link
            href={`/word/${encodeURIComponent(word.word)}`}
            className="text-sm text-blue-600 hover:underline"
          >
            查看详情 →
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="text-2xl font-bold text-slate-900">{word.word}</h3>
            {word.phonetic && (
              <span className="text-sm text-slate-500">{word.phonetic}</span>
            )}
            {word.cefr && (
              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
                {word.cefr}
              </span>
            )}
          </div>
        </div>

        <WordBreakdown items={word.breakdown} gloss={word.gloss} />
        <SenseList senses={word.senses} />
      </div>

      {failed && (
        <p className="mt-2 text-sm text-amber-600">
          没能换到新词，请稍后再试。
        </p>
      )}
    </section>
  );
}

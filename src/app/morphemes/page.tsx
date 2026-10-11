import type { Metadata } from 'next';
import Link from 'next/link';
import { listMorphemes, listOrigins } from '@/lib/queries';
import { safe } from '@/lib/safe';
import MorphemeCard from '@/components/MorphemeCard';
import { ORIGIN_LABEL } from '@/lib/labels';

/**
 * 词素总览页（F6）
 *
 * 筛选维度：类型（词根/前缀/后缀）· 来源语言 · 首字母
 * 通过 URL 查询参数驱动，便于分享与 SEO 收录。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '词根词缀总览',
  description: '按类型、来源语言与首字母浏览全部词根、前缀与后缀。',
};

const TYPES = [
  { code: 'root', label: '词根' },
  { code: 'prefix', label: '前缀' },
  { code: 'suffix', label: '后缀' },
];

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

type Props = {
  searchParams: Promise<{ type?: string; origin?: string; letter?: string }>;
};

function buildHref(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const merged = { ...base, ...patch };
  const qs = Object.entries(merged)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
  return qs ? `/morphemes?${qs}` : '/morphemes';
}

export default async function MorphemesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const current = {
    type: sp.type,
    origin: sp.origin,
    letter: sp.letter,
  };

  const [items, origins] = await Promise.all([
    safe(listMorphemes(current, 500), []),
    safe(listOrigins(), []),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          词根词缀总览
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          共 {items.length} 个词素，按收录词数排序。
        </p>
      </header>

      {/* 筛选器 */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-slate-500">类型</span>
          <Link
            href={buildHref(current, { type: undefined })}
            className={`rounded-lg border px-2.5 py-1 text-xs transition ${
              !current.type
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:border-blue-200'
            }`}
          >
            全部
          </Link>
          {TYPES.map((t) => (
            <Link
              key={t.code}
              href={buildHref(current, { type: t.code })}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                current.type === t.code
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:border-blue-200'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {origins.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-slate-500">来源</span>
            <Link
              href={buildHref(current, { origin: undefined })}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                !current.origin
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:border-blue-200'
              }`}
            >
              全部
            </Link>
            {origins.map((o) => (
              <Link
                key={o.code}
                href={buildHref(current, { origin: o.code })}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  current.origin === o.code
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-blue-200'
                }`}
              >
                {ORIGIN_LABEL[o.code] ?? o.code}
                <span className="ml-1 text-slate-400">{o.count}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 text-xs text-slate-500">首字母</span>
          <Link
            href={buildHref(current, { letter: undefined })}
            className={`rounded px-2 py-1 text-xs transition ${
              !current.letter
                ? 'border border-blue-300 bg-blue-50 text-blue-700'
              : 'border border-slate-200 text-slate-600 hover:border-blue-200'
            }`}
          >
            全部
          </Link>
          {LETTERS.map((l) => (
            <Link
              key={l}
              href={buildHref(current, { letter: l })}
              className={`rounded border px-1.5 py-0.5 font-mono text-xs transition ${
                current.letter === l
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:border-blue-200'
              }`}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>

      {/* 列表 */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-600">没有符合条件的词素。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <MorphemeCard key={m.id} item={m} />
          ))}
        </div>
      )}
    </div>
  );
}

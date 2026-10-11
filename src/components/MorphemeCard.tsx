import Link from 'next/link';
import type { MorphemeListItem } from '@/lib/queries';
import { cleanForm, typeLabel, originLabel } from '@/lib/labels';

const TYPE_STYLE: Record<string, string> = {
  root: 'bg-root-soft text-root border-root-border',
  prefix: 'bg-prefix-soft text-prefix border-prefix-border',
  suffix: 'bg-suffix-soft text-suffix border-suffix-border',
  stem: 'bg-slate-100 text-slate-600 border-slate-200',
  combining: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function typeStyle(type: string): string {
  return TYPE_STYLE[type] ?? TYPE_STYLE.stem;
}

/** 词素卡片：总览页与首页共用 */
export default function MorphemeCard({ item }: { item: MorphemeListItem }) {
  return (
    <Link
      href={`/morpheme/${encodeURIComponent(item.slug)}`}
      className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-base font-semibold text-slate-900">
          {cleanForm(item.form)}
        </span>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] ${typeStyle(
            item.type,
          )}`}
        >
          {typeLabel(item.type)}
        </span>
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-sm text-slate-600">
        {item.meaningCn ?? '（暂无含义）'}
      </p>

      <p className="text-xs text-slate-400">
        {item.wordCount} 个同族词
        {item.originLang && ` · ${originLabel(item.originLang)}`}
      </p>
    </Link>
  );
}

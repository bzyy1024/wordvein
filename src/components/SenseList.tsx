import type { Sense } from '@/lib/queries';

/** 义项与例句（F2） */
export default function SenseList({ senses }: { senses: Sense[] }) {
  if (senses.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">释义</h2>
        <p className="text-sm text-slate-600">暂无释义数据。</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">释义</h2>

      <ol className="space-y-5">
        {senses.map((s, i) => (
          <li key={s.id} className="border-l-2 border-slate-200 pl-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                {i + 1}
              </span>
              {s.pos && (
                <span className="shrink-0 text-xs italic text-slate-500">
                  {s.pos}
                </span>
              )}
              <span className="text-sm font-medium text-slate-900">
                {s.definitionCn}
              </span>
            </div>

            {s.definitionEn && (
              <p className="mt-1 pl-6 text-xs leading-relaxed text-slate-500">
                {s.definitionEn}
              </p>
            )}

            {s.example && (
              <div className="mt-2.5 ml-6 rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-sm leading-relaxed text-slate-700">
                  {s.example}
                </p>
                {s.exampleCn && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {s.exampleCn}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

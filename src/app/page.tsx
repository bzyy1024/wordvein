import Link from 'next/link';
import { getStats, getRandomWord, listMorphemes, listOrigins } from '@/lib/queries';
import { safe } from '@/lib/safe';
import MorphemeCard from '@/components/MorphemeCard';
import SearchBox from '@/components/SearchBox';
import TodayWord from '@/components/TodayWord';
import { SITE_DESCRIPTION } from '@/lib/site';
import { ORIGIN_LABEL } from '@/lib/labels';

/**
 * 首页（运行时渲染）
 *
 * 不用 ISR：镜像构建期连不上数据库，首页会先被渲染成「统计全为 0」的空页面，
 * 而 ISR 要等 revalidate 过期才重新生成 —— 容器启动后至少 1 小时内首页都是空的。
 * 改为 force-dynamic 后，启动后第一次访问即拿到真实数据。
 * 查询仍用 safe() 包裹，数据库不可用时降级为空，不会 500。
 */
export const dynamic = 'force-dynamic';

const EMPTY_STATS = {
  wordCount: 0,
  morphemeCount: 0,
  breakdownCount: 0,
  analyzableWordCount: 0,
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
      <div className="text-2xl font-bold tabular-nums text-slate-900">
        {value.toLocaleString('zh-CN')}
      </div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

export default async function HomePage() {
  const [stats, topMorphemes, origins] = await Promise.all([
    safe(getStats(), EMPTY_STATS),
    safe(listMorphemes({}, 12), []),
    safe(listOrigins(), []),
  ]);

  // 每日一词：随机取一个已拆解单词，展示完整构词逻辑
  const today = await safe(getRandomWord(), null);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="pt-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          看懂单词的<span className="text-blue-600">构词逻辑</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          {SITE_DESCRIPTION}
        </p>

        {/* 主搜索区：大搜索框 + 示例词，参考 Google / 词典站的入口样式 */}
        <div className="mx-auto mt-8 max-w-2xl">
          <SearchBox
            size="lg"
            autoFocus
            placeholder="输入单词 predict、词根 dict，或中文「预测」"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-slate-500">试试：</span>
          {['predict', 'transport', 'invisible', 'respect', '预测'].map((w) => (
            <Link
              key={w}
              href={`/search?q=${encodeURIComponent(w)}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 transition hover:border-blue-300 hover:text-slate-900"
            >
              {w}
            </Link>
          ))}
        </div>
      </section>

      {/* 统计 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="收录单词" value={stats.wordCount} />
        <Stat label="可拆解单词" value={stats.analyzableWordCount} />
        <Stat label="词根词缀" value={stats.morphemeCount} />
        <Stat label="拆解关系" value={stats.breakdownCount} />
      </section>

      {/* 每日一词 */}
      <TodayWord initial={today} />

      {/* 热门词素 */}
      {topMorphemes.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-900">热门词根词缀</h2>
            <Link
              href="/morphemes"
              className="text-sm text-blue-600 hover:underline"
            >
              查看全部 →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topMorphemes.map((m) => (
              <MorphemeCard key={m.id} item={m} />
            ))}
          </div>
        </section>
      )}

      {/* 来源语言 */}
      {origins.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            按来源语言浏览
          </h2>
          <div className="flex flex-wrap gap-2">
            {origins.map((o) => (
              <Link
                key={o.code}
                href={`/morphemes?origin=${encodeURIComponent(o.code)}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300"
              >
                {ORIGIN_LABEL[o.code] ?? o.code}
                <span className="ml-1.5 text-xs text-slate-400">{o.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 空状态引导 */}
      {stats.wordCount === 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">数据库暂无数据</p>
          <p className="mt-1 leading-relaxed">
            请先执行数据导入（<code className="rounded bg-amber-100 px-1">pnpm run import</code>
            ），导入完成后刷新本页即可看到内容。
          </p>
        </section>
      )}
    </div>
  );
}

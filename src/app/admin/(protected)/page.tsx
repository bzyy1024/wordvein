import type { Metadata } from 'next';
import { formatTime, getOverview, getRecentBatches, getTopFavorites } from '@/lib/admin';

/** 管理端概览：词库规模 + 访客与收藏活跃度 + 导入批次 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '概览',
  robots: { index: false, follow: false },
};

export default async function AdminHome() {
  try {
    const [overview, topFavorites, batches] = await Promise.all([
      getOverview(),
      getTopFavorites(10),
      getRecentBatches(5),
    ]);

    const cards = [
      { label: '单词', value: overview.words },
      { label: '词素', value: overview.morphemes },
      { label: '义项', value: overview.senses },
      { label: '拆解关系', value: overview.breakdown },
      { label: '收藏总数', value: overview.favorites },
      { label: '访客总数', value: overview.users },
      { label: '今日活跃', value: overview.usersToday },
      { label: '近 7 日活跃', value: overview.users7d },
    ];

    return (
      <div>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {c.value.toLocaleString('zh-CN')}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            被收藏最多的词
          </h2>

          {topFavorites.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              还没有收藏数据
            </p>
          ) : (
            <ol className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {topFavorites.map((f, i) => (
                <li
                  key={f.word}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span className="text-slate-700">
                    <span className="mr-2 text-slate-400">{i + 1}.</span>
                    {f.word}
                  </span>
                  <span className="text-slate-500">{f.n} 次收藏</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">最近导入批次</h2>

          {batches.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              暂无导入记录
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">批次</th>
                    <th className="px-4 py-2 text-left font-medium">来源</th>
                    <th className="px-4 py-2 text-right font-medium">单词</th>
                    <th className="px-4 py-2 text-right font-medium">词素</th>
                    <th className="px-4 py-2 text-left font-medium">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-2 text-slate-500">#{b.id}</td>
                      <td className="px-4 py-2 text-slate-700">{b.sourceFile}</td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {b.wordCount.toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {b.morphemeCount.toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {formatTime(b.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  } catch (error) {
    console.error('[admin] 概览查询失败', error);
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        数据查询失败，请检查数据库连接
      </p>
    );
  }
}

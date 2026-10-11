import type { Metadata } from 'next';
import Link from 'next/link';
import { formatTime, listUsers } from '@/lib/admin';

/** 管理端：访客列表（匿名 uuid，不含个人信息） */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '用户',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const { page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);

  try {
    const { items, total } = await listUsers(current, PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            访客 {total.toLocaleString('zh-CN')} 人
          </h2>
          <p className="text-xs text-slate-400">
            匿名 uuid + 行为计数，不收集手机号、邮箱等个人信息
          </p>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            还没有访客数据
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">访客 ID</th>
                  <th className="px-4 py-2 text-right font-medium">查词</th>
                  <th className="px-4 py-2 text-right font-medium">收藏</th>
                  <th className="px-4 py-2 text-left font-medium">首次访问</th>
                  <th className="px-4 py-2 text-left font-medium">最近活跃</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">
                      {u.id}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {u.queryCount.toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {u.favoriteCount.toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {formatTime(u.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {formatTime(u.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm">
            {current > 1 ? (
              <Link
                href={`/admin/users?page=${current - 1}`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:border-slate-400"
              >
                上一页
              </Link>
            ) : (
              <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-slate-300">
                上一页
              </span>
            )}

            <span className="text-xs text-slate-500">
              第 {current} / {totalPages} 页
            </span>

            {current < totalPages ? (
              <Link
                href={`/admin/users?page=${current + 1}`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:border-slate-400"
              >
                下一页
              </Link>
            ) : (
              <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-slate-300">
                下一页
              </span>
            )}
          </nav>
        )}
      </div>
    );
  } catch (error) {
    console.error('[admin] 用户查询失败', error);
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        数据查询失败，请检查数据库连接
      </p>
    );
  }
}

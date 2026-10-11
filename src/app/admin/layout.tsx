import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * 管理端布局
 *
 * 独立端口部署时（ADMIN_MODE=1）访问其他路径会被中间件重定向回 /admin，
 * 此时「返回站点」没有意义，按环境决定是否显示。
 */

export const metadata: Metadata = {
  title: '管理端',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminOnly = process.env.ADMIN_MODE === '1';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">管理端</h1>
        {!adminOnly && (
          <Link href="/" className="text-xs text-slate-500 transition hover:text-slate-900">
            返回站点
          </Link>
        )}
      </div>

      {children}
    </div>
  );
}

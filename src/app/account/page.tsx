import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AccountActions from '@/components/AccountActions';
import { getSessionDays, getSessionUser } from '@/lib/auth';
import { countFavorites } from '@/lib/store';

/**
 * 我的账号（第三期）
 *
 * 服务端读会话：未登录直接跳登录页，不留空白首屏。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '我的账号',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/account');

  const favCount = await countFavorites(user.id);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          首页
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-900">我的账号</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的账号</h1>
        <p className="mt-2 text-sm text-slate-600">
          登录状态默认保持 {getSessionDays()} 天，到期后用邮箱重新登录即可。
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-slate-500">登录邮箱</dt>
            <dd className="mt-1 font-medium text-slate-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">收藏单词</dt>
            <dd className="mt-1">
              <Link
                href="/favorites"
                className="font-medium text-blue-600 transition hover:text-blue-700"
              >
                {favCount} 个
              </Link>
            </dd>
          </div>
        </dl>
      </div>

      <AccountActions />
    </div>
  );
}

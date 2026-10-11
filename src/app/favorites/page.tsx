import type { Metadata } from 'next';
import Link from 'next/link';
import FavoriteList from '@/components/FavoriteList';
import { getSessionUser } from '@/lib/auth';
import { listFavorites } from '@/lib/store';

/**
 * 我的收藏（第三期：登录后可用）
 *
 * 服务端读会话：未登录直接给登录引导，不留"加载中"的空白；
 * 已登录则顺手把列表取好，客户端组件只管取消收藏的交互。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '我的收藏',
  description: '收藏的词根词缀单词，随时回看构词串讲。',
  // 内容因人而异且无索引价值，不进搜索引擎
  robots: { index: false, follow: true },
};

export default async function FavoritesPage() {
  const user = await getSessionUser();

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          首页
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-900">我的收藏</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">我的收藏</h1>
        <p className="mt-2 text-sm text-slate-600">
          {user
            ? '收藏绑定在账号上，换设备登录后同样能看到。'
            : '登录后才能使用收藏，换设备也不会丢。'}
        </p>
      </header>

      {user ? (
        <FavoriteList initialItems={await listFavorites(user.id)} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">登录后即可收藏单词</p>
          <p className="mt-1 text-xs text-slate-500">
            用邮箱收一条登录链接即可，不需要设置密码
          </p>
          <Link
            href="/login?next=/favorites"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
          >
            去登录
          </Link>
        </div>
      )}
    </div>
  );
}

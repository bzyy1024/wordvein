import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import './globals.css';
import SearchBox from '@/components/SearchBox';
import ThemeToggle from '@/components/ThemeToggle';
import VisitorTracker from '@/components/VisitorTracker';
import { getSessionUser } from '@/lib/auth';
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from '@/lib/site';

/**
 * 首屏防闪烁脚本
 *
 * 必须在页面渲染前同步执行：等 React hydration 再切换主题，会先闪一下浅色。
 * 逻辑与 ThemeToggle 的 applyTheme 一一对应，改动时需同步两处。
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d?'#0f172a':'#f8fafc');}catch(e){}})();`;

/** 页面底色，与 globals.css 的 .dark body 保持一致 */
const THEME_COLOR = '#f8fafc';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — 看懂单词的构词逻辑`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 管理端容器（ADMIN_MODE=1）只服务 /admin，其余路径一律收拢过去。
  // 这里不用 middleware：edge runtime 会把 process.env 构建时内联，
  // 运行时注入的 ADMIN_MODE 读不到（详见 src/middleware.ts 的说明）。
  if (process.env.ADMIN_MODE === '1') {
    const path = (await headers()).get('x-pathname') ?? '';
    if (!path.startsWith('/admin')) redirect('/admin');
  }

  // 管理端容器不参与用户体系；其余情况读一次会话即可，只验签不查库
  const user = process.env.ADMIN_MODE === '1' ? null : await getSessionUser();

  return (
    // suppressHydrationWarning：主题脚本会在渲染前改 <html> 的类与 style，
    // 服务端与客户端首帧必然不一致，这里只压制这一处警告
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={THEME_COLOR} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* 管理端容器不参与访客统计 */}
        {process.env.ADMIN_MODE !== '1' && <VisitorTracker />}

        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <Link
              href="/"
              className="shrink-0 text-base font-bold tracking-tight text-slate-900"
            >
              {SITE_NAME}
            </Link>

            <div className="min-w-0 flex-1">
              <SearchBox />
            </div>

            <nav className="hidden shrink-0 items-center gap-4 text-sm text-slate-600 sm:flex">
              <Link href="/morphemes" className="transition hover:text-slate-900">
                词素总览
              </Link>
              <Link href="/favorites" className="transition hover:text-slate-900">
                我的收藏
              </Link>
              <Link href="/about" className="transition hover:text-slate-900">
                关于
              </Link>
            </nav>

            <Link
              href={user ? '/account' : '/login'}
              className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {user ? '我的账号' : '登录'}
            </Link>

            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>数据整理自开源词库，仅供学习参考。</p>
            <p>
              <Link href="/about" className="hover:text-slate-700">
                数据来源与说明
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

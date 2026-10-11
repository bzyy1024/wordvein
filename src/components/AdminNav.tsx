import Link from 'next/link';
import { headers } from 'next/headers';
import { logout } from '@/app/admin/actions';

/**
 * 管理端顶部导航
 *
 * 高亮状态从 middleware 透传的 x-pathname 读取（服务端组件拿不到 pathname）。
 * 只在受保护的路由组内渲染，登录页不会出现「退出登录」。
 */
export default async function AdminNav() {
  const h = await headers();
  const path = h.get('x-pathname') ?? '';

  const tabs = [
    { href: '/admin', label: '概览' },
    { href: '/admin/users', label: '用户' },
  ];

  return (
    <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-3">
      <nav className="flex gap-5 text-sm">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={
              t.href === path
                ? 'font-semibold text-slate-900'
                : 'text-slate-600 transition hover:text-slate-900'
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form action={logout}>
        <button
          type="submit"
          className="text-xs text-slate-500 transition hover:text-slate-900"
        >
          退出登录
        </button>
      </form>
    </div>
  );
}

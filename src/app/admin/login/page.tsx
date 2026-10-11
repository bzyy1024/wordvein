import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  createToken,
  isAdminConfigured,
  verifyPassword,
} from '@/lib/admin-auth';

/**
 * 管理端登录
 *
 * 口令来自环境变量 ADMIN_PASSWORD，未设置时不允许登录（安全默认值）。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '管理端登录',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function AdminLoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const target = next && next.startsWith('/admin') ? next : '/admin';
  const configured = isAdminConfigured();

  async function login(formData: FormData) {
    'use server';

    const password = String(formData.get('password') ?? '');
    const to = String(formData.get('next') ?? '/admin');

    if (!(await verifyPassword(password))) {
      redirect(`/admin/login?error=1&next=${encodeURIComponent(to)}`);
    }

    const store = await cookies();
    store.set(ADMIN_COOKIE, await createToken(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_COOKIE_MAX_AGE,
      // 内网 http 访问下发不了 Secure Cookie，默认关闭；
      // 走 HTTPS 时设 ADMIN_COOKIE_SECURE=1 打开
      secure: process.env.ADMIN_COOKIE_SECURE === '1',
    });

    redirect(to.startsWith('/admin') ? to : '/admin');
  }

  return (
    <div className="mx-auto max-w-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">管理端登录</h2>
      <p className="mb-6 text-xs text-slate-500">
        请输入管理口令（环境变量 ADMIN_PASSWORD）
      </p>

      {!configured && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          未设置 ADMIN_PASSWORD，管理端已禁用。在 .env 中配置后重启容器即可。
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          口令不正确，请重试
        </p>
      )}

      <form action={login} className="space-y-4">
        <input type="hidden" name="next" value={target} />

        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-700">
            管理口令
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!configured}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 disabled:bg-slate-50"
          />
        </div>

        <button
          type="submit"
          disabled={!configured}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          登录
        </button>
      </form>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { getSessionUser, safeNextPath } from '@/lib/auth';
import { isMailConfigured } from '@/lib/mail';

/**
 * 登录 / 注册（第三期）
 *
 * 不设密码：填邮箱 -> 收一次性链接 -> 点开即登录，没注册过顺带建号。
 * 已登录用户直接回跳，不重复走流程。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '登录 / 注册',
  description: '用邮箱登录词根词缀词典，收藏跨设备同步。',
  robots: { index: false, follow: false },
};

const ERROR_TEXT: Record<string, string> = {
  used: '这个链接已经登录过了，请重新发送一封新链接',
  invalid: '链接已失效或已过期，请重新发送一封',
  failed: '登录失败，请重新发送一封邮件再试',
};

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const target = safeNextPath(next, '/account');

  if (await getSessionUser()) redirect(target);

  const errorMessage = error ? (ERROR_TEXT[error] ?? '登录失败，请重试') : '';

  return (
    <div className="mx-auto max-w-sm">
      <nav className="mb-4 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          首页
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-900">登录</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">登录 / 注册</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          输入邮箱，我们发一条登录链接给你。不设密码，登录后收藏可跨设备同步。
        </p>

        {errorMessage && (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {errorMessage}
          </p>
        )}

        <LoginForm next={target} mailConfigured={isMailConfigured()} />
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        登录即表示同意我们用你的邮箱作为账号标识，不会用于其他用途。
      </p>
    </div>
  );
}

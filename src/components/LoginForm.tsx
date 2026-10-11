'use client';

import { useState } from 'react';

/**
 * 邮箱登录 / 注册表单
 *
 * 只负责申请链接：真正的会话在 /api/auth/callback 点开邮件后签发。
 * 本地没配 SMTP 时接口会把链接回传（devLink），这里直接显示出来，方便调试。
 */

type Props = {
  /** 登录后回跳的站内路径 */
  next: string;
  /** 后端是否配置了 SMTP；未配置时页面提前说明，别让用户白等 */
  mailConfigured: boolean;
};

type Sent = { to: string; devLink?: string; minutes?: number };

export default function LoginForm({ next, mailConfigured }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Sent | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, next }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        devLink?: string;
        minutes?: number;
      };

      if (!json.ok) {
        setError(json.error ?? '发送失败，请稍后重试');
        return;
      }
      setSent({ to: email.trim(), devLink: json.devLink, minutes: json.minutes });
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">邮件已发送</p>
          <p className="mt-1">
            我们给 <span className="font-medium">{sent.to}</span> 发了一封登录邮件
            {sent.minutes ? `，链接 ${sent.minutes} 分钟内有效` : ''}。
          </p>
          <p className="mt-1">点开邮件里的链接即可完成登录，链接只能使用一次。</p>
        </div>

        {sent.devLink && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">当前未配置邮件服务</p>
            <p className="mt-1">开发环境可直接点下面的链接完成登录：</p>
            <a
              href={sent.devLink}
              className="mt-2 block break-all text-xs text-blue-700 underline"
            >
              {sent.devLink}
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setSent(null);
            setError('');
          }}
          className="text-sm text-slate-500 underline transition hover:text-slate-900"
        >
          换个邮箱 / 重新发送
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-slate-700">
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 disabled:bg-slate-50"
        />
        <p className="mt-1 text-xs text-slate-500">
          没注册过也不用管，点开链接会自动帮你建号
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !mailConfigured}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? '发送中…' : '发送登录链接'}
      </button>

      {!mailConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          邮件服务未配置（SMTP_HOST / SMTP_USER 为空），暂时无法发送登录邮件。
        </p>
      )}
    </form>
  );
}

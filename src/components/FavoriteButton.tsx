'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

/**
 * 收藏 / 取消收藏（第三期：登录后才可用）
 *
 * 收藏状态由服务端渲染时给定（页面已读会话），无需挂载后再拉一次，
 * 避免按钮先空后亮的闪烁。未登录时点击直接带 next 跳登录页。
 */

type Props = {
  word: string;
  /** 是否已登录；未登录时点击走登录流程 */
  loggedIn: boolean;
  /** 服务端查到的初始收藏状态 */
  initialSaved: boolean;
};

export default function FavoriteButton({ word, loggedIn, initialSaved }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    if (busy) return;

    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/word/${word}`)}`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/favorite', {
        method: saved ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; needLogin?: boolean };

      if (json.ok) {
        setSaved(!saved);
      } else if (json.needLogin) {
        router.push(`/login?next=${encodeURIComponent(`/word/${word}`)}`);
      } else if (json.error) {
        // 收藏失败给个可见反馈，避免用户以为点上了
        window.alert(json.error);
      }
    } catch {
      window.alert('操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }, [busy, loggedIn, router, saved, word]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      title={loggedIn ? undefined : '登录后才能收藏'}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
    >
      <span aria-hidden="true">{saved ? '★' : '☆'}</span>
      {saved ? '已收藏' : '收藏'}
    </button>
  );
}

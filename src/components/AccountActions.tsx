'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clearUid, peekUid } from '@/lib/visitor';

/**
 * 账号页的客户端动作
 *
 * 1. 挂载后把登录前的匿名收藏并入账号（uid 只在浏览器里，服务端拿不到）
 * 2. 登出：清掉会话 Cookie 并回首页
 */

export default function AccountActions() {
  const router = useRouter();
  const [claimMsg, setClaimMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const claimed = useRef(false);

  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;

    const uid = peekUid();
    if (!uid) return;

    (async () => {
      try {
        const res = await fetch('/api/auth/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uid }),
        });
        const json = (await res.json()) as { ok?: boolean; moved?: number };

        if (!json.ok) return;
        clearUid();
        if (json.moved) {
          setClaimMsg(`已把登录前收藏的 ${json.moved} 个单词并入账号`);
          router.refresh();
        }
      } catch {
        // 归并失败不影响登录态，下次进账号页还会再试
      }
    })();
  }, [router]);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 请求失败也直接跳走：Cookie 还在就当没登出，用户再点一次即可
    }
    window.location.href = '/';
  }

  return (
    <div className="space-y-3">
      {claimMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {claimMsg}
        </p>
      )}

      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? '登出中…' : '退出登录'}
      </button>
    </div>
  );
}

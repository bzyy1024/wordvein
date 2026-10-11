'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * 我的收藏（第三期：登录后）
 *
 * 列表由服务端渲染时取好（页面已读会话），客户端只负责取消收藏的交互，
 * 这样首屏不会有"加载中"的闪烁。
 */

type Item = {
  word: string;
  phonetic: string | null;
  gloss: string | null;
  createdAt: string;
};

export default function FavoriteList({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [error, setError] = useState('');

  const remove = async (word: string) => {
    // 先本地移除，请求失败再回滚，交互更跟手
    const backup = items;
    setItems(items.filter((i) => i.word !== word));

    try {
      const res = await fetch('/api/favorite', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word }),
      });
      const json = (await res.json()) as { ok?: boolean; needLogin?: boolean };
      if (!json.ok) setItems(backup);
    } catch {
      setItems(backup);
      window.alert('取消收藏失败，请稍后重试');
    }
  };

  if (error) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">还没有收藏任何单词</p>
        <p className="mt-1 text-xs text-slate-500">
          打开任意单词页，点标题下方的「收藏」即可加入这里
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
        >
          去查词
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        共 {items.length} 个单词，按收藏时间倒序
      </p>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.word}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/word/${encodeURIComponent(item.word)}`}
                className="text-base font-medium text-slate-900 hover:text-blue-600"
              >
                {item.word}
              </Link>
              {item.phonetic && (
                <span className="ml-2 text-sm text-slate-400">{item.phonetic}</span>
              )}
              {item.gloss && <p className="mt-1 text-sm text-slate-600">{item.gloss}</p>}
              <p className="mt-1 text-xs text-slate-400">
                收藏于 {new Date(item.createdAt).toLocaleDateString('zh-CN')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => remove(item.word)}
              className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-900"
            >
              取消收藏
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

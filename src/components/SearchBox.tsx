'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type SuggestItem = { word: string; phonetic: string | null; definitionCn?: string | null };

/** 下拉里的中文释义最长显示字符数，超出截断避免撑破面板 */
const CN_MAX = 16;

function clip(s: string, max = CN_MAX): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * 搜索框（F1）
 *
 * - 输入时防抖请求 /api/suggest 做下拉补全
 * - 回车优先跳转当前高亮项，无高亮则跳 /search?q=
 * - 支持上下键选择、Esc 关闭、点击外部关闭
 *
 * 两种尺寸：
 *   sm —— header 里的常驻小搜索框
 *   lg —— 首页主搜索区，参考 Google / 词典站的样式：加大高度与字号、
 *         全圆角、左侧放大镜、右侧清空与搜索按钮，聚焦时阴影抬升
 */
export default function SearchBox({
  autoFocus = false,
  size = 'sm',
  placeholder = '查单词、词根 dict，或中文「预测」',
}: {
  autoFocus?: boolean;
  size?: 'sm' | 'lg';
  placeholder?: string;
}) {
  const isLg = size === 'lg';
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SuggestItem[]>([]);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // 防抖拉取补全
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: SuggestItem[] };
        setItems(data.items ?? []);
        setActive(-1);
      } catch {
        // 请求被中断或网络异常：静默忽略，不影响输入
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // 点击外部关闭下拉
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setItems([]);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const close = () => setItems([]);

  const jump = (target: string) => {
    const t = target.trim();
    if (!t) return;
    close();
    // 补全项存在时直达词条页，否则去搜索结果页（含拼写容错）
    router.push(`/word/${encodeURIComponent(t)}`);
  };

  const submit = () => {
    const t = q.trim();
    if (!t) return;
    close();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (items.length === 0 ? -1 : Math.min(a + 1, items.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) jump(items[active].word);
      else submit();
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div ref={boxRef} className="relative">
      {/* 左侧放大镜：仅大尺寸，与 pl-14 对齐 */}
      {isLg && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      )}

      <input
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="搜索单词或词根"
        // 大尺寸：原生搜索框的清除图标与自定义按钮会重叠，用 appearance-none 隐藏
        className={[
          'w-full border border-slate-300 bg-white text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500',
          isLg
            ? 'h-14 rounded-full pl-14 pr-28 text-lg shadow-sm [appearance:textfield] hover:shadow-md focus:shadow-lg focus:ring-4 focus:ring-blue-100 [&::-webkit-search-cancel-button]:hidden'
            : 'rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-100',
        ].join(' ')}
      />

      {/* 右侧清空 + 搜索按钮：仅大尺寸 */}
      {isLg && (
        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setItems([]);
              }}
              aria-label="清空"
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            aria-label="搜索"
            className="rounded-full bg-blue-600 p-2.5 text-white transition hover:bg-blue-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul
          className={`absolute left-0 right-0 top-full z-20 overflow-hidden border border-slate-200 bg-white shadow-lg ${
            isLg ? 'mt-2 rounded-2xl py-1 shadow-xl' : 'mt-1 rounded-lg'
          }`}
        >
          {items.map((it, i) => (
            <li key={it.word}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => jump(it.word)}
                className={`flex w-full items-baseline gap-2 text-left ${
                  isLg ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm'
                } ${i === active ? 'bg-blue-50 text-blue-900' : 'text-slate-700'}`}
              >
                <span className="font-medium">{it.word}</span>
                {it.phonetic && (
                  <span className={isLg ? 'text-sm text-slate-400' : 'text-xs text-slate-400'}>
                    {it.phonetic}
                  </span>
                )}
                {it.definitionCn && (
                  <span
                    className={`truncate ${isLg ? 'text-sm text-slate-500' : 'text-xs text-slate-500'}`}
                  >
                    {clip(it.definitionCn)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

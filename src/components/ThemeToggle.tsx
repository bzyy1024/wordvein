'use client';

import { useEffect, useState } from 'react';

/**
 * 明暗主题切换（浅色 / 深色 / 跟随系统）
 *
 * 三态循环：浅色 → 深色 → 跟随系统 → 浅色
 * 选择存 localStorage，由 layout 里的防闪烁脚本在首屏渲染前应用，避免刷新闪白。
 */

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

/** 点击后的下一个状态 */
const NEXT: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const LABEL: Record<Theme, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

/** 移动端地址栏配色，与 globals.css 里的页面底色保持一致 */
const META_COLOR = { light: '#f8fafc', dark: '#0f172a' } as const;

/** 与 layout 中防闪烁脚本保持同一套逻辑，改一处必须改两处 */
export function applyTheme(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  // 让滚动条、表单控件等原生 UI 跟随主题
  root.style.colorScheme = isDark ? 'dark' : 'light';

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? META_COLOR.dark : META_COLOR.light);
}

function readStoredTheme(): Theme {
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export default function ThemeToggle() {
  // 首帧一律按 system 渲染：服务端无法读取 localStorage，
  // 直接用存储值会导致 hydration 不一致。真实值在挂载后补上。
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  // 跟随系统时，系统配色切换要实时生效
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const handleClick = () => {
    const next = NEXT[theme];
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  const label = `当前：${LABEL[theme]}，点击切换为${LABEL[NEXT[theme]]}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:text-slate-900"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        {theme === 'light' && (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </>
        )}
        {theme === 'dark' && (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
        {theme === 'system' && (
          <>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </>
        )}
      </svg>
    </button>
  );
}

import type { Config } from 'tailwindcss';

/**
 * Tailwind 配置
 *
 * 词素配色：F3 要求用颜色区分前缀 / 词根 / 后缀，这里定义为语义色，
 * 组件中统一引用，避免散落的硬编码色值。
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  // 主题用 html.dark 类切换，配合 ThemeToggle 与防闪烁内联脚本
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        prefix: {
          DEFAULT: '#2563eb',
          soft: '#eff6ff',
          border: '#bfdbfe',
        },
        root: {
          DEFAULT: '#7c3aed',
          soft: '#f5f3ff',
          border: '#ddd6fe',
        },
        suffix: {
          DEFAULT: '#059669',
          soft: '#ecfdf5',
          border: '#a7f3d0',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

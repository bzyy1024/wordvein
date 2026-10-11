'use client';

import { useEffect } from 'react';

/** 运行时错误兜底（如数据库连接失败），避免白屏 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        页面加载出错了
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
        可能是数据库连接异常。请稍后重试，若持续出现请检查服务状态。
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
      >
        重试
      </button>
    </div>
  );
}

import Link from 'next/link';

/** 404：未收录词条也走这里，引导用户去搜索或总览 */
export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        没有找到这个词条
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
        它可能尚未收录，或者拼写有误。你可以换个关键词搜索，或从词素总览按词根浏览。
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          回到首页
        </Link>
        <Link
          href="/morphemes"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
        >
          词素总览
        </Link>
      </div>
    </div>
  );
}

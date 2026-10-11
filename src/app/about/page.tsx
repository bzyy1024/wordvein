import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * 关于与数据来源（SSG，静态内容）
 *
 * 说明拆解方法论、数据出处与许可、免责声明。
 */

export const metadata: Metadata = {
  title: '关于与数据来源',
  description: '本站的构词拆解方法论、数据来源与许可说明、免责声明。',
};

const SOURCES = [
  {
    name: 'ECDICT',
    license: 'MIT',
    usage: '单词、音标、中英释义、词频排名、考试标签',
    url: 'https://github.com/skywind3000/ECDICT',
  },
  {
    name: 'ECDICT / wordroot',
    license: 'MIT',
    usage: '词根词缀库（来源语言、同族例词、近义反义词缀）',
    url: 'https://github.com/skywind3000/ECDICT',
  },
];

export default function AboutPage() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        关于本站
      </h1>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">我们在做什么</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          孤立背单词容易忘。本站把单词还原成构词零件——前缀、词根、后缀——
          让你看到它「为什么是这个意思」，并能顺着同一个词根，一次记住一整族同源词。
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">拆解方法论</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-700">
          <li>
            <strong>按序切分</strong>：先剥离后缀，再剥离前缀，剩余部分匹配词根，
            按拼接顺序展示。
          </li>
          <li>
            <strong>变体合并</strong>：同一词根的异体写法（如{' '}
            <code>spect / spec / spic</code>、<code>dict / dic / dit</code>）
            会互相关联，查询时一并呈现，避免「查不全」。
          </li>
          <li>
            <strong>串讲释义</strong>：每个词条给出一句话串讲，
            把各零件的含义推导到单词整体含义。
          </li>
          <li>
            <strong>宁缺勿滥</strong>：无法确认构词的词条标注为「暂无拆解数据」，
            不做强行拼接。
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">数据来源与许可</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">来源</th>
                <th className="py-2 pr-4">许可</th>
                <th className="py-2 pr-4">用途</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.name + s.usage} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-blue-600 hover:underline"
                    >
                      {s.name}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{s.license}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          相关开源许可全文见各项目仓库。本站释义在原始数据基础上进行了整理与改写，
          如有疏漏欢迎反馈。
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">免责声明</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          本站内容由程序基于开源语料自动整理生成，部分词源解释存在学术争议或简化处理，
          仅供英语学习参考，不构成学术依据。
        </p>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-blue-600 hover:underline">
          ← 返回首页
        </Link>
      </p>
    </article>
  );
}

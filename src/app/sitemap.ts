import type { MetadataRoute } from 'next';
import { listAllWords, listAllMorphemeSlugs } from '@/lib/queries';
import { safe } from '@/lib/safe';
import { SITE_URL } from '@/lib/site';

/**
 * sitemap.xml（F9）
 *
 * 运行时生成：构建期连不上数据库会降级成空列表，若再叠加 24h 的 ISR，
 * 上线后一整天内 sitemap 都是空的（直接影响收录）。改为 force-dynamic，
 * 每次请求实时生成；查询失败时由 safe() 降级，不至于 500。
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [words, slugs] = await Promise.all([
    safe(listAllWords(), []),
    safe(listAllMorphemeSlugs(), []),
  ]);

  const now = new Date();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/morphemes`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    ...words.map((w) => ({
      url: `${SITE_URL}/word/${encodeURIComponent(w)}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...slugs.map((s) => ({
      url: `${SITE_URL}/morpheme/${encodeURIComponent(s)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}

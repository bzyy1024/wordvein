import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * robots.txt（F9）：开放全站，屏蔽 API 与搜索结果页
 *
 * 运行时生成：本文件默认是静态预渲染，构建期拿不到 SITE_URL，
 * 会把 sitemap 行写成 http://localhost:3000/sitemap.xml 并一直固化到产物里。
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/search'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

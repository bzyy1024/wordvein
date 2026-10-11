/** 站点基础常量（SEO / 导航统一引用） */

export const SITE_NAME = '英语词根词缀词典';
export const SITE_SHORT = '词根词缀';
export const SITE_DESCRIPTION =
  '输入任意单词，查看它的词根词缀拆解与构词串讲；顺着词根反查同族词，用词源逻辑一次记一串。';

/**
 * sitemap / robots / canonical 使用的站点对外地址
 *
 * 优先读 SITE_URL（非 NEXT_PUBLIC_）：这三处都在服务端渲染，运行时读取即可，
 * 换域名只改环境变量重启容器，不需要重新构建镜像。
 *
 * NEXT_PUBLIC_SITE_URL 仅作兼容保留：NEXT_PUBLIC_ 变量会被 Next.js 在
 * **构建时内联**到产物里，而镜像构建时读不到 .env（.dockerignore 已排除），
 * 只配它的话 sitemap 里的地址会一直是 http://localhost:3000。
 */
export const SITE_URL =
  process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';


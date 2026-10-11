import type { NextConfig } from 'next';

/**
 * Next.js 配置
 *
 * output: 'standalone' —— 技术方案 7.x 要求，产物镜像仅含运行时依赖。
 * 注意：standalone 模式下 server 组件直连数据库，无需额外 API 层。
 */
const nextConfig: NextConfig = {
  /**
   * standalone 仅在 Docker 镜像构建时启用。
   *
   * 原因：Windows 下 pnpm 的嵌套依赖路径（.pnpm/next@x_y_z/node_modules/...）
   *      极易超过 MAX_PATH(260)，生成 standalone 时创建符号链接会抛
   *      EPERM: operation not permitted, symlink。Linux 容器无此限制。
   *      本地开发也不需要该产物，故按需开启。
   */
  output: process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  /**
   * nodemailer 走 require 动态加载内部模块，被打包器处理后会找不到文件，
   * 这里声明为外部依赖，让它在运行时从 node_modules 直接加载。
   * 只在服务端使用（src/lib/mail.ts），不进客户端产物。
   */
  serverExternalPackages: ['nodemailer'],
  // 数据库查询全部在 Server Component 内完成，构建期不需要数据库连接
};

export default nextConfig;

/**
 * 查询容错包装
 *
 * 背景：Next.js 在 `next build` 阶段会预渲染 SSG/ISR 页面。Docker 构建镜像时
 *       通常连不上数据库，若查询直接抛出会让整个构建失败。
 *
 * 约定：静态页面（首页等）的查询一律用 safe() 包裹，失败时降级为空数据，
 *       保证镜像可构建；运行时数据库恢复后由 ISR 重新生成即可拿到真实数据。
 */
export async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error('[safe] 查询失败，已降级为兜底数据:', error);
    return fallback;
  }
}

import 'dotenv/config';

/**
 * 数据库连接串派生
 *
 * 约定：.env 只保存原子变量（POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_PORT），
 *      连接串一律在运行时派生，杜绝"同一份凭据写多处、改一处漏一处"。
 *
 * 两条链路：
 *   容器内（Next.js）  ：compose 由 POSTGRES_* 派生 DATABASE_URL，host=db，端口固定 5432
 *   宿主机（导入脚本等）：由本文件派生，host=localhost，端口=POSTGRES_PORT
 *
 * 逃生舱：若显式设置了 DATABASE_URL / DATABASE_URL_LOCAL，则直接使用字面值
 *        （用于连接不在本 compose 内的数据库，如云 RDS）。
 *
 * 注意：POSTGRES_PORT 是「宿主机映射端口」，容器内端口恒为 5432，两者不可混用。
 */

/** 标识符白名单：schema 名来自配置，拼进 SQL 前必须校验，防止注入 */
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

/** 当前生效的 schema，未配置时为 public */
export function resolveSchema(): string {
  const s = process.env.DB_SCHEMA?.trim();
  return s || 'public';
}

/**
 * 把 schema 写入连接串的 options（-c search_path=xxx）。
 *
 * 背景：PostgreSQL 15+ 收回了 public schema 的 CREATE 默认权限，托管库里的
 *      普通账号（如 wordvein）只有 USAGE，无法建表；但该账号通常具备数据库级
 *      CREATE，可自建 schema 并在其中建表。此时需要让每条连接自动带上 search_path。
 *
 * 注意：-c 与参数间不留空格，避免 URL 里的空格被错误解析。
 */
function appendSearchPath(url: string): string {
  const schema = resolveSchema();
  if (schema === 'public') return url;

  if (!IDENT_RE.test(schema)) {
    throw new Error(`[db] 非法的 DB_SCHEMA：${schema}（仅允许小写字母、数字、下划线）`);
  }

  // 保留 public 在 search_path 中：pg_trgm 扩展位于 public，
  // 缺少它会导致 gin_trgm_ops 操作符类不可见（影响后续索引维护与计划生成）。
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}options=-csearch_path%3D${encodeURIComponent(schema)}%2Cpublic`;
}

/**
 * 是否处于构建期（next build / docker build）
 *
 * 镜像里没有 .env（.dockerignore 已排除），构建时拿不到任何凭据。
 * 而 next build 会预渲染 sitemap 等页面，一旦这里抛错，整个构建就失败。
 */
function isBuildPhase(): boolean {
  return (
    process.env.DOCKER_BUILD === '1' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  );
}

export function resolveDatabaseUrl(): string {
  // 宿主机优先：导入脚本、drizzle-kit 都在宿主机执行，显式配置优先
  const local = process.env.DATABASE_URL_LOCAL;
  if (local) return appendSearchPath(local);

  // 其次容器注入值
  const container = process.env.DATABASE_URL;
  if (container) return appendSearchPath(container);

  // 兜底：从原子变量派生宿主机连接串
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) {
    // 构建期：返回指向本机的占位串，连接必然失败，由 safe() 降级为空数据。
    // 运行期仍然抛错——正式上线时缺凭据必须立刻暴露，不能静默带病启动。
    if (isBuildPhase()) {
      console.warn('[db] 构建期未检测到数据库凭据，sitemap 等静态数据将生成为空');
      return 'postgresql://build:build@127.0.0.1:5432/build';
    }

    throw new Error(
      '[db] 缺少数据库凭据：请在 .env 中设置 POSTGRES_PASSWORD，或显式提供 DATABASE_URL',
    );
  }

  const user = process.env.POSTGRES_USER || 'app';
  const database = process.env.POSTGRES_DB || 'roots';
  const port = process.env.POSTGRES_PORT || '5432';

  return appendSearchPath(
    `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
      `@localhost:${port}/${encodeURIComponent(database)}`,
  );
}

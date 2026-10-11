import 'dotenv/config';
import type { Config } from 'drizzle-kit';
import { resolveDatabaseUrl } from './src/db/connection-string';

/**
 * Drizzle Kit 配置
 *
 * 设计说明：
 *   - 库结构的"权威定义"是 docs/schema.sql（手写 DDL，可读可 review）
 *   - 本文件仅用于本地生成迁移 / 类型同步，不替代 schema.sql
 *   - 连接串与运行时共用 resolveDatabaseUrl()，保证内外口径一致
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
  verbose: true,
  strict: true,
} satisfies Config;

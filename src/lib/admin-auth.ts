/**
 * 管理端口令鉴权
 *
 * 不引入账号体系：一个环境变量口令 + 签名 Cookie 即可。
 *   token = `${过期时间戳}.${sha256(口令:过期时间戳)}`
 * 服务端不存会话，重启后旧 token 仍有效直到过期；改口令即全部失效。
 *
 * 用 Web Crypto 而非 node:crypto —— middleware 跑在 edge runtime，
 * 这里的代码必须两边都能跑。
 */

export const ADMIN_COOKIE = 'ew_admin';

/** 登录有效期 12 小时 */
const TTL_MS = 12 * 60 * 60 * 1000;
export const ADMIN_COOKIE_MAX_AGE = Math.floor(TTL_MS / 1000);

function getPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() ?? '';
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 未配置口令时管理端一律拒绝登录，避免开着空口令上线 */
export function isAdminConfigured(): boolean {
  return getPassword().length > 0;
}

/** 比对口令：先各自取摘要再比较，长度固定，不会按字符短路 */
export async function verifyPassword(input: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const [a, b] = await Promise.all([sha256Hex(input), sha256Hex(getPassword())]);
  return a === b;
}

export async function createToken(): Promise<string> {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${await sha256Hex(`${getPassword()}:${exp}`)}`;
}

export async function verifyToken(token: string | undefined | null): Promise<boolean> {
  if (!token || !isAdminConfigured()) return false;

  const [expStr, hash] = token.split('.');
  if (!expStr || !hash) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  return hash === (await sha256Hex(`${getPassword()}:${expStr}`));
}

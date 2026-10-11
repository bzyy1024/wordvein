'use client';

/**
 * 匿名访客标识（第二期）
 *
 * 不做账号体系：首次访问时生成一个 uuid 存 localStorage，之后所有收藏
 * 与活跃统计都挂在这个 uuid 上。换设备或清缓存后视为新访客。
 *
 * 只在浏览器调用；上报失败一律静默，不能影响查词主流程。
 */

const KEY = 'ew_uid';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 非安全上下文（如 http 内网访问）下 randomUUID 不可用，退化为随机串
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 读取（必要时生成）匿名 uid；localStorage 不可用时返回空串，表示功能不可用 */
export function getUid(): string {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // 隐私模式 / 禁用存储：不做上报，页面其余功能照常
    return '';
  }
}

/**
 * 读取已有的匿名 uid；不存在时返回空串，**不会新建**。
 * 用于登录后把匿名收藏并入账号：这时创建新标识反而会多一条空访客记录。
 */
export function peekUid(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** 收藏已并入账号后清掉匿名标识，避免下次重复归并 */
export function clearUid(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 忽略：清不掉也只是下次跳过归并
  }
}

/** 上报活跃或查词 */
export function track(event: 'visit' | 'query', ref?: string): void {
  const uid = getUid();
  if (!uid) return;

  void fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uid, event, ref }),
    // 用 keepalive 保证页面关闭时不丢上报
    keepalive: true,
  }).catch(() => {
    // 静默：统计类上报失败不打扰用户
  });
}

/**
 * 邮件发送（第三期：登录 / 注册链接）
 *
 * 直接用 .env 里已有的 SMTP_* 变量（阿里云邮件推送）。
 * 未配置 SMTP 时：
 *   - 生产环境：拒绝发送，接口返回 500，避免"点了没反应"
 *   - 开发环境：只在控制台打印链接，并把链接回给前端，方便本地调试
 */

import nodemailer from 'nodemailer';

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function readConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST ?? '').trim();
  const user = (process.env.SMTP_USER ?? '').trim();
  const from = (process.env.SMTP_FROM ?? '').trim() || user;
  if (!host || !user) return null;

  const port = Number(process.env.SMTP_PORT ?? '465');
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 465,
    user,
    pass: process.env.SMTP_PASSWORD ?? '',
    from,
  };
}

/** SMTP 是否可用（页面用它决定是否提示"邮件服务未配置"） */
export function isMailConfigured(): boolean {
  return readConfig() !== null;
}

const MINUTES = 30;

function buildContent(url: string): { subject: string; text: string; html: string } {
  const subject = '登录词根词缀词典';
  const text = [
    '你好，',
    '',
    `点击下方链接即可登录（未注册会自动创建账号）：`,
    url,
    '',
    `链接 ${MINUTES} 分钟内有效，且只能使用一次。`,
    '如果不是你本人操作，忽略这封邮件即可。',
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#0f172a">
  <p>你好，</p>
  <p>点击下方按钮登录词根词缀词典（未注册会自动创建账号）：</p>
  <p style="margin:24px 0">
    <a href="${url}" style="display:inline-block;padding:10px 20px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-size:14px">立即登录</a>
  </p>
  <p style="font-size:12px;color:#64748b">
    链接 ${MINUTES} 分钟内有效，且只能使用一次。若按钮无法点击，请复制下面的地址到浏览器打开：
  </p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">${url}</p>
  <p style="font-size:12px;color:#64748b">如果不是你本人操作，忽略这封邮件即可。</p>
</div>`.trim();

  return { subject, text, html };
}

/**
 * 发送登录链接
 *
 * @returns 'sent' 已发出；'dev' 未配置 SMTP 且非生产环境，链接交给调用方处理
 */
export async function sendLoginLink(to: string, url: string): Promise<'sent' | 'dev'> {
  const cfg = readConfig();
  const { subject, text, html } = buildContent(url);

  if (!cfg) {
    // 本地没配 SMTP 是常态，把链接打出来，开发中直接点开就能登录
    console.warn(`[mail] 未配置 SMTP，登录链接（${to}）：${url}`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('邮件服务未配置（SMTP_HOST / SMTP_USER 为空）');
    }
    return 'dev';
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 = 连接即加密（SMTPS）；587 = 先明文再 STARTTLS
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    // 阿里云等国内服务商偶发握手慢，给足超时，别让请求挂死
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    html,
  });

  return 'sent';
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import AdminNav from '@/components/AdminNav';
import { ADMIN_COOKIE, verifyToken } from '@/lib/admin-auth';

/**
 * 管理端鉴权
 *
 * 放在 Server Component 而不是 middleware：middleware 跑在 edge runtime，
 * process.env 会被构建时内联，运行时改口令不生效。这里每次请求都实时读取。
 *
 * 登录页不在本路由组内（src/app/admin/login），因此不会被拦截。
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const ok = await verifyToken(store.get(ADMIN_COOKIE)?.value);

  if (!ok) {
    const h = await headers();
    const path = h.get('x-pathname') ?? '/admin';
    redirect(`/admin/login?next=${encodeURIComponent(path)}`);
  }

  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}

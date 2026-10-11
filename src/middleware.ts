import { NextResponse, type NextRequest } from 'next/server';

/**
 * 把当前路径透传给服务端组件
 *
 * ⚠️ 这里刻意不做任何鉴权判断：Next.js 会把 middleware 里的 process.env
 *    在构建时内联，而镜像构建时读不到 ADMIN_PASSWORD / ADMIN_MODE，
 *    写在这里的口令校验会永远失败（表现为登录后又跳回登录页）。
 *    所有涉及环境变量的判断都放在 Server Component（Node runtime，
 *    运行时读取 process.env）里，见 src/app/admin/(protected)/layout.tsx
 *    与 src/app/layout.tsx。
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

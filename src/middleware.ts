import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const publicPaths = ['/login', '/api/auth/login'];

const rolePathMap: Record<string, string[]> = {
  admin: ['/admin', '/hr', '/manager'],
  hr: ['/hr'],
  manager: ['/manager'],
  employee: ['/employee'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow API routes for employees (checked server-side in handlers)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check auth token
  const token = request.cookies.get('hrm-token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('hrm-token');
    return response;
  }

  // Root redirect
  if (pathname === '/') {
    const dashboardMap: Record<string, string> = {
      admin: '/admin/dashboard',
      hr: '/hr/dashboard',
      manager: '/manager/dashboard',
      employee: '/employee/dashboard',
    };
    return NextResponse.redirect(new URL(dashboardMap[payload.role] || '/login', request.url));
  }

  // Role-based route protection
  const allowedPaths = rolePathMap[payload.role] || [];
  const isAllowed = allowedPaths.some((path) => pathname.startsWith(path));

  if (!isAllowed) {
    const dashboardMap: Record<string, string> = {
      admin: '/admin/dashboard',
      hr: '/hr/dashboard',
      manager: '/manager/dashboard',
      employee: '/employee/dashboard',
    };
    return NextResponse.redirect(new URL(dashboardMap[payload.role] || '/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

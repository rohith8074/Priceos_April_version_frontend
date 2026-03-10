import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Paths that are fully public (no auth required)
  const publicPaths = ['/login', '/waitlist', '/api/auth', '/auth', '/api/v1/auth'];
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  const isV1Api = pathname.startsWith('/api/v1');

  // Check for Neon auth session cookies
  const sessionCookieNames = [
    '__Secure-neon-auth.session_token',
    '__Secure-neon-auth.local.session_data',
    'neon-auth.session_token',
    'better-auth.session_token',
  ];
  const session = sessionCookieNames.some(name => request.cookies.get(name));

  // Handle sign-out: if coming to /login with ?signedout=true, clear all cookies server-side
  if (pathname === '/login' && searchParams.get('signedout') === 'true') {
    const response = NextResponse.next();
    // Delete all auth cookies server-side to ensure clean state
    sessionCookieNames.forEach(name => {
      response.cookies.delete(name);
    });
    response.cookies.delete('priceos-session');
    return response;
  }

  // 1. If v1 API, allow through (let the routes handle JWT for now)
  if (isV1Api) {
    return NextResponse.next();
  }

  // 2. If no session and trying to access private route, redirect to login
  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. If session exists and trying to access /login (without signedout flag), redirect to dashboard
  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 3. Special case: redirect root to login or dashboard
  if (pathname === '/') {
    if (session) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, favicon.png, icon.png, apple-icon.png
     */
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|icon\\.png|apple-icon\\.png).*)',
  ],
};


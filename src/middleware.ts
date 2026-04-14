import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "priceos-session";

const PUBLIC_PATHS = [
  "/login",
  "/waitlist",
  "/pending-approval",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/check-approval",
  "/api/v1/auth",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

interface JwtPayload {
  exp?: number;
  isApproved?: boolean;
}

function decodeToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.log("[Middleware] decodeToken error:", err);
    return null;
  }
}

function isValidToken(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return false;
  if (payload.exp) {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  }
  return true;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets — always allow
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon.png") ||
    pathname.startsWith("/apple-icon")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const valid = token ? isValidToken(token) : false;
  const jwtPayload = token ? decodeToken(token) : null;
  const isApproved = jwtPayload?.isApproved ?? true; // legacy tokens without field → assume approved

  // Root redirect
  if (pathname === "/") {
    if (!valid) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.redirect(
      new URL(isApproved ? "/dashboard" : "/pending-approval", request.url)
    );
  }

  // API routes — return 401 JSON instead of redirect
  if (pathname.startsWith("/api/") && !valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page routes — redirect to login if not authenticated
  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated but not yet approved → only allow /pending-approval
  if (valid && !isApproved && !pathname.startsWith("/pending-approval")) {
    return NextResponse.redirect(new URL("/pending-approval", request.url));
  }

  // Already approved, don't show pending page or login
  if (valid && isApproved && pathname === "/pending-approval") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (valid && isApproved && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|icon\\.png|apple-icon\\.png).*)",
  ],
};

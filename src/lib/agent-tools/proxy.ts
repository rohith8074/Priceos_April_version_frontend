/**
 * agent-tools/proxy.ts — session-protected proxy to the FastAPI intelligence tools.
 *
 * The logged-in user hits these Next.js routes with their `priceos-session` cookie.
 * We resolve their orgId from the JWT and forward to priceos-backend's
 * /api/agent-tools/v1/* endpoints (Bearer + x-tool-org-id), matching the existing
 * proxy convention in app/api/user/settings/route.ts.
 *
 * If the backend hasn't implemented the endpoint yet (or is unreachable), we fail
 * SOFT with a 200 + `_backend_unavailable: true` so the Agent Decisions page shows
 * an informative empty state instead of crashing.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function proxyAgentTool(
  req: NextRequest,
  backendPath: string,
  opts: { method?: "GET" | "POST"; body?: unknown } = {}
) {
  const token = req.cookies.get("priceos-session")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let orgId: string;
  try {
    orgId = verifyAccessToken(token).orgId;
  } catch {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const url = new URL(`${BACKEND}/agent-tools/v1${backendPath}`);
  // Carry through incoming query params (filters), then stamp orgId.
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  url.searchParams.set("orgId", orgId);

  try {
    const res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-tool-org-id": orgId,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    // Backend endpoint not implemented yet, or unreachable — degrade gracefully.
    return NextResponse.json(
      {
        decisions: [],
        _backend_unavailable: true,
        _proxy_error: err instanceof Error ? err.message : "backend unreachable",
      },
      { status: 200 }
    );
  }
}

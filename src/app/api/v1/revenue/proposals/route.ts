import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const status = searchParams.get("status") || "all";
    const params = new URLSearchParams({ orgId: payload.orgId, status });
    if (listingId) params.set("listingId", listingId);
    try {
      const backendRes = await fetch(`${BACKEND}/v1/revenue/proposals?${params.toString()}`);
      let data: unknown = null;
      try {
        data = await backendRes.json();
      } catch {
        // Backend returned non-JSON (e.g. "Internal Server Error")
        data = { proposals: [] };
      }
      return NextResponse.json(data, { status: backendRes.ok ? backendRes.status : 200 });
    } catch (fetchErr) {
      // Backend not running (ECONNREFUSED) — degrade gracefully for standalone frontend usage.
      console.error("[v1 proposals GET proxy] backend unavailable", fetchErr);
      return NextResponse.json({ proposals: [], source: "standalone" }, { status: 200 });
    }
  } catch (err) {
    console.error("[v1 proposals GET proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const body = await req.json();
    try {
      const backendRes = await fetch(`${BACKEND}/v1/revenue/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, orgId: payload.orgId }),
      });
      const data = await backendRes.json();
      return NextResponse.json(data, { status: backendRes.status });
    } catch (fetchErr) {
      console.error("[v1 proposals POST proxy] backend unavailable", fetchErr);
      return NextResponse.json(
        { error: "Backend unavailable", source: "standalone" },
        { status: 503 }
      );
    }
  } catch (err) {
    console.error("[v1 proposals POST proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

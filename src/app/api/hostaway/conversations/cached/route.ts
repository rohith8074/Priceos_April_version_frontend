import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const listingId = req.nextUrl.searchParams.get("listingId");
    const qs = new URLSearchParams({ orgId: payload.orgId });
    if (listingId) qs.set("listingId", listingId);
    try {
      const res = await fetch(`${BACKEND}/hostaway/conversations/cached?${qs.toString()}`);
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (fetchErr) {
      // Backend not running (ECONNREFUSED) — degrade gracefully for standalone frontend usage.
      console.error("[hostaway/conversations/cached GET] backend unavailable", fetchErr);
      return NextResponse.json({ conversations: [], source: "standalone" }, { status: 200 });
    }
  } catch (error) {
    console.error("[hostaway/conversations/cached GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

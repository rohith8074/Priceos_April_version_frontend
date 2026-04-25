import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "null";
    const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    const qs = new URLSearchParams({
      orgId: payload.orgId,
      propertyId,
      sessionId,
    });
    const res = await fetch(`${BACKEND}/chat/history?${qs.toString()}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[chat/history GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

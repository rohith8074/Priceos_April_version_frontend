import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
    const from = req.nextUrl.searchParams.get("from") ?? "";
    const to = req.nextUrl.searchParams.get("to") ?? "";
    if (!propertyId) return NextResponse.json({ sessions: [] });
    const qs = new URLSearchParams({
      orgId: payload.orgId,
      propertyId,
    });
    if (from) qs.set("from_date", from);
    if (to) qs.set("to", to);
    const res = await fetch(`${BACKEND}/chat/sessions?${qs.toString()}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[chat/sessions GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

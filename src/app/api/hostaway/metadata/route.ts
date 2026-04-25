import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
    const apiSecret = req.nextUrl.searchParams.get("apiSecret") ?? "";
    const qs = new URLSearchParams({ orgId: payload.orgId });
    if (accountId) qs.set("accountId", accountId);
    if (apiSecret) qs.set("apiSecret", apiSecret);
    const res = await fetch(`${BACKEND}/hostaway/metadata?${qs.toString()}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[hostaway/metadata GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

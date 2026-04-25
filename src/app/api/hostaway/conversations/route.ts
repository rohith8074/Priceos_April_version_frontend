import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const listingId = req.nextUrl.searchParams.get("listingId");
    if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

    const res = await fetch(
      `${BACKEND}/hostaway/conversations?orgId=${encodeURIComponent(payload.orgId)}&listingId=${encodeURIComponent(listingId)}`
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[hostaway/conversations GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

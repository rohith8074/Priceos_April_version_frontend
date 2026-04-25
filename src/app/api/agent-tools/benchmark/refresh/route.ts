import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);

    const body = await req.json().catch(() => ({}));
    const listingId = body.listingId;
    const bedrooms  = body.bedrooms ?? 1;
    const marketId  = body.marketId ?? "2286";

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const res = await fetch(
      `${BACKEND}/agent-tools/benchmark/refresh?orgId=${payload.orgId}&listingId=${listingId}&bedrooms=${bedrooms}&marketId=${marketId}`,
      { method: "POST" }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[agent-tools/benchmark/refresh POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

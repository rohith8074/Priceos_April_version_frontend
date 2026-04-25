import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    verifyAccessToken(token);

    const { searchParams } = new URL(req.url);
    const marketId   = searchParams.get("marketId") ?? "2286";
    const listingId  = searchParams.get("listingId");
    const month      = searchParams.get("month");

    if (!listingId) {
      return NextResponse.json(
        { error: "Missing required param: listingId" },
        { status: 400 }
      );
    }

    const qs = new URLSearchParams({ marketId, listingId });
    if (month) qs.set("month", month);

    const res = await fetch(`${BACKEND}/agent-tools/listing-perf?${qs}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[agent-tools/listing-perf GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

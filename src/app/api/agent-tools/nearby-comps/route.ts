import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    verifyAccessToken(token);

    const { searchParams } = new URL(req.url);
    const lat       = searchParams.get("lat");
    const lon       = searchParams.get("lon");
    const bedrooms  = searchParams.get("bedrooms") ?? "1";
    const month     = searchParams.get("month");
    const radiusKm  = searchParams.get("radiusKm") ?? "1.0";
    const marketId  = searchParams.get("marketId") ?? "2286";
    const limit     = searchParams.get("limit") ?? "25";

    if (!lat || !lon || !month) {
      return NextResponse.json(
        { error: "Missing required params: lat, lon, month" },
        { status: 400 }
      );
    }

    const qs = new URLSearchParams({
      lat, lon, bedrooms, month, radiusKm, marketId, limit,
    });

    const res = await fetch(`${BACKEND}/agent-tools/nearby-comps?${qs}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[agent-tools/nearby-comps GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

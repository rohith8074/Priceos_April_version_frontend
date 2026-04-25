import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    verifyAccessToken(token);

    const { searchParams } = new URL(req.url);
    const dateFrom  = searchParams.get("dateFrom");
    const dateTo    = searchParams.get("dateTo");
    const marketId  = searchParams.get("marketId") ?? "2286";

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "dateFrom and dateTo are required" }, { status: 400 });
    }

    const res = await fetch(
      `${BACKEND}/agent-tools/demand-pacing?dateFrom=${dateFrom}&dateTo=${dateTo}&marketId=${marketId}`
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[agent-tools/demand-pacing GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

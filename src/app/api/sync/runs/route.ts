import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit") || "50";
    const sourceId = searchParams.get("sourceId");
    const params = new URLSearchParams({ orgId: payload.orgId, limit });
    if (sourceId) params.set("sourceId", sourceId);

    const backendRes = await fetch(`${BACKEND}/sync/runs?${params.toString()}`);
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[sync/runs proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = verifyAccessToken(token);
    if (!payload?.orgId) {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");

    const params = new URLSearchParams({ orgId: payload.orgId });
    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    const backendRes = await fetch(`${BACKEND}/sync/status?${params.toString()}`);
    const data = await backendRes.json();

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[sync/status proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

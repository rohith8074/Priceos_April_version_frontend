import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    let payload: ReturnType<typeof verifyAccessToken>;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!listingId || !from || !to) {
      return NextResponse.json({ error: "listingId, from, and to are required" }, { status: 400 });
    }

    const profileRes = await fetch(
      `${BACKEND}/agent-tools/property-profile?orgId=${encodeURIComponent(payload.orgId)}&listingId=${encodeURIComponent(listingId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (!profileRes.ok) {
      return NextResponse.json({ error: "Listing not found" }, { status: profileRes.status });
    }

    const params = new URLSearchParams({ listingId, from, to });

    const res = await fetch(`${BACKEND}/calendar-metrics?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[calendar-metrics GET proxy]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

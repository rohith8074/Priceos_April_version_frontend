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
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    const qs = new URLSearchParams({
      orgId: payload.orgId,
      listingId,
    });
    if (from) qs.set("from_date", from);
    if (to) qs.set("to", to);

    const res = await fetch(`${BACKEND}/hostaway/summary?${qs.toString()}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[hostaway/summary GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const body = await req.json();
    const res = await fetch(`${BACKEND}/hostaway/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, orgId: payload.orgId }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[hostaway/summary POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

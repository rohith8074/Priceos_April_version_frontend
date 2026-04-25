import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const params = new URLSearchParams({ listingId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const backendRes = await fetch(`${BACKEND}/properties/analytics?${params.toString()}`);
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[properties analytics proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

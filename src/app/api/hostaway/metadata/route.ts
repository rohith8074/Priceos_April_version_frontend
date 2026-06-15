import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const HOSTAWAY_BASE = "https://api.hostaway.com/v1";

async function getHostawayToken(accountId: string, apiSecret: string): Promise<string> {
  const res = await fetch(`${HOSTAWAY_BASE}/accessTokens`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: accountId,
      client_secret: apiSecret,
      scope: "general",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hostaway auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchListings(token: string) {
  const res = await fetch(`${HOSTAWAY_BASE}/listings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch listings (${res.status})`);
  const data = await res.json();
  return (data.result ?? data) as Array<Record<string, unknown>>;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    verifyAccessToken(token);

    const accountId = req.nextUrl.searchParams.get("accountId")?.trim() ?? "";
    const apiSecret = req.nextUrl.searchParams.get("apiSecret")?.trim() ?? "";

    if (!accountId || !apiSecret) {
      return NextResponse.json({ error: "accountId and apiSecret are required" }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await getHostawayToken(accountId, apiSecret);
    } catch (err) {
      return NextResponse.json({
        mode: "fallback_available",
        reason: `Could not authenticate with Hostaway: ${(err as Error).message}`,
        listings: [],
      }, { status: 200 });
    }

    const raw = await fetchListings(accessToken);
    const listings = raw.map((l) => ({
      id: String(l.id ?? l.listingId ?? ""),
      name: String(l.name ?? l.internalListingName ?? ""),
      bedrooms: Number(l.bedroomsNumber ?? l.bedrooms ?? 0),
      city: String(l.city ?? l.area ?? ""),
      type: String(l.propertyType ?? l.type ?? "property"),
      thumbnail: (l.thumbnailUrl ?? l.imageUrl ?? null) as string | null,
    }));

    return NextResponse.json({
      success: true,
      mode: "real",
      total: listings.length,
      listings,
    });
  } catch (err) {
    console.error("[hostaway/metadata]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { addDays, format } from "date-fns";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const daysStr = searchParams.get("days") || "365";
    const days = parseInt(daysStr);

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const startDate = format(new Date(), "yyyy-MM-dd");
    const endDate = format(addDays(new Date(), days - 1), "yyyy-MM-dd");

    // Fetch listing details and inventory in parallel
    const [listingRes, inventoryRes] = await Promise.all([
      fetch(`${BACKEND}/agent-tools/property-profile?orgId=${payload.orgId}&listingId=${listingId}`),
      fetch(`${BACKEND}/inventory/${listingId}?orgId=${payload.orgId}&startDate=${startDate}&endDate=${endDate}`),
    ]);


    if (!listingRes.ok || !inventoryRes.ok) {
      // If profile fails, try to fallback to a generic response or error
      if (!inventoryRes.ok) {
        return NextResponse.json({ error: "Failed to fetch inventory from backend" }, { status: inventoryRes.status });
      }
    }

    const listingInfo = listingRes.ok ? await listingRes.json() : {};
    const inventoryData = await inventoryRes.json();

    // Map inventory to frontend CalendarData format
    const calendarData = {
      listingId: listingId,
      listingName: listingInfo.name || "Unknown Property",
      basePrice: listingInfo.basePrice || 0,
      currency: listingInfo.currency || "AED",
      priceFloor: listingInfo.priceFloor || 0,
      priceCeiling: listingInfo.priceCeiling || 0,
      totalDays: inventoryData.inventory?.length || 0,
      days: (inventoryData.inventory || []).map((d: any) => ({
        date: d.date,
        currentPrice: d.currentPrice,
        proposedPrice: d.proposedPrice,
        proposalStatus: d.proposalStatus,
        status: d.status,
        changePct: d.changePct,
        reasoning: d.reasoning,
        minStay: d.minStay,
      })),
    };

    return NextResponse.json(calendarData);
  } catch (err) {
    console.error("[inventory calendar GET proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

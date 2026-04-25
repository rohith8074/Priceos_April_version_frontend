import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { format, addDays } from "date-fns";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  console.log("!!! BENCHMARK ROUTE HIT !!!");
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const plus29Str = format(addDays(new Date(), 29), "yyyy-MM-dd");

    // Fetch from agent-tools/benchmark
    const res = await fetch(
      `${BACKEND}/agent-tools/benchmark?orgId=${payload.orgId}&listingId=${listingId}&dateFrom=${todayStr}&dateTo=${plus29Str}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
        // Fallback to placeholder if agent-tools fails
        return NextResponse.json({
            hasData: false,
            summary: null
        });
    }

    const data = await res.json();
    
    // Map backend response to BenchmarkPanel's expected format
    const hasData = !!(data.p50 || data.comps?.length > 0 || data.source === 'internet_fallback');
    
    const compsData = hasData && data.comps ? data.comps.map((c: any) => ({
        name: c.name || c.listing_name || "Unknown Comp",
        source: "Airbnb",
        avgRate: c.adr || c.native_rate_avg || 0,
        rating: c.rating,
        reviews: c.reviews || c.num_reviews
    })) : [];

    const summaryData = hasData ? {
        listingId,
        dateFrom: todayStr,
        dateTo: plus29Str,
        p25Rate: data.p25,
        p50Rate: data.p50,
        p75Rate: data.p75,
        p90Rate: data.p90,
        yourPrice: data.yourPrice || 0,
        percentile: data.percentile || 50,
        verdict: data.verdict || "FAIR",
        reasoning: data.reasoning || data.insight || null,
        recommendedWeekday: data.recommendedWeekday || data.recommended_weekday || null,
        recommendedWeekend: data.recommendedWeekend || data.recommended_weekend || null,
        recommendedEvent: data.recommendedEvent || data.recommended_event || null,
        avgWeekday: data.avgWeekday || data.avg_weekday || null,
        avgWeekend: data.avgWeekend || data.avg_weekend || null,
        source: data.source,
        comps: compsData
    } : null;

    return NextResponse.json({
      success: true,
      hasData,
      summary: summaryData,
      comps: compsData
    });
  } catch (error) {
    console.error("[api/benchmark GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    const { searchParams } = new URL(req.url);
    
    // Ensure orgId is present
    if (!searchParams.has("orgId") && token) {
      try {
        const payload = verifyAccessToken(token);
        if (payload?.orgId) {
          searchParams.set("orgId", payload.orgId);
        }
      } catch (e) {
        console.error("Token verification failed in events proxy", e);
      }
    }

    // Copy all search params to the backend request
    const queryString = searchParams.toString();
    
    let res: Response;
    try {
      res = await fetch(`${BACKEND}/events?${queryString}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
    } catch (fetchErr) {
      console.error("[api/events GET] backend unavailable", fetchErr);
      return NextResponse.json({ events: [], source: "standalone" }, { status: 200 });
    }

    if (!res.ok) {
      return NextResponse.json({ events: [], error: "Backend error", source: "proxy" }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/events GET]", error);
    return NextResponse.json({ events: [], error: "Internal server error" }, { status: 500 });
  }
}

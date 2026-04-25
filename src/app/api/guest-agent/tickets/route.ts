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
        console.error("Token verification failed in guest-agent proxy", e);
      }
    }

    const queryString = searchParams.toString();
    
    let res: Response;
    try {
      res = await fetch(`${BACKEND}/guest-agent/tickets?${queryString}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
    } catch (fetchErr) {
      console.error("[api/guest-agent/tickets GET] backend unavailable", fetchErr);
      return NextResponse.json({ tickets: [] }, { status: 200 });
    }

    if (!res.ok) {
      return NextResponse.json({ tickets: [], error: "Backend error" }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/guest-agent/tickets GET]", error);
    return NextResponse.json({ tickets: [], error: "Internal server error" }, { status: 500 });
  }
}

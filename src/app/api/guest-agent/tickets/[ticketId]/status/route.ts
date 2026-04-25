import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    const resolvedParams = await Promise.resolve(params);
    const ticketId = resolvedParams.ticketId;
    
    let body = await req.json();
    
    // Ensure orgId is present
    if (!body.orgId && token) {
      try {
        const payload = verifyAccessToken(token);
        if (payload?.orgId) {
          body.orgId = payload.orgId;
        }
      } catch (e) {
        console.error("Token verification failed in ticket status proxy", e);
      }
    }

    let res: Response;
    try {
      res = await fetch(`${BACKEND}/guest-agent/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (fetchErr) {
      console.error(`[api/guest-agent/tickets/${ticketId}/status PATCH] backend unavailable`, fetchErr);
      return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: "Backend error" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[api/guest-agent/tickets/[id]/status PATCH]`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

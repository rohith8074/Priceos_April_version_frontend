import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    const { searchParams } = new URL(req.url);
    const queryString = searchParams.toString();
    
    // We must await params if Next.js version requires it, but for Next 13/14 App Router,
    // params is an object in route handlers. However, in Next.js 15+ it's a promise.
    // Assuming standard Next.js 14 behavior here where params are directly accessible.
    // A safe pattern for Next 15 is `const { threadId } = await params;` if it's a Promise.
    // Since we don't know the exact Next.js version, we'll try to handle it safely if it's a promise:
    const resolvedParams = await Promise.resolve(params);
    const threadId = resolvedParams.threadId;
    
    let res: Response;
    try {
      res = await fetch(`${BACKEND}/guest-agent/threads/${threadId}?${queryString}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
    } catch (fetchErr) {
      console.error(`[api/guest-agent/threads/${threadId} GET] backend unavailable`, fetchErr);
      return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: "Backend error" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[api/guest-agent/threads GET]`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

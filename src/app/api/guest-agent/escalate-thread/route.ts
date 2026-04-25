import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    const body = await req.json();

    let res: Response;
    try {
      res = await fetch(`${BACKEND}/guest-agent/escalate-thread`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (fetchErr) {
      console.error("[api/guest-agent/escalate-thread POST] backend unavailable", fetchErr);
      return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "Backend error");
      console.error("[api/guest-agent/escalate-thread POST] backend error:", errText);
      return NextResponse.json({ error: errText }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/guest-agent/escalate-thread POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

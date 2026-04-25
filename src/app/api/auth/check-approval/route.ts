import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) {
      return NextResponse.json({ approved: false, error: "Not authenticated" }, { status: 401 });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ approved: false, error: "Invalid token" }, { status: 401 });
    }

    // Check with backend for latest approval status
    const backendRes = await fetch(`${BACKEND}/auth/check-approval?userId=${payload.userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[auth/check-approval proxy]", err);
    return NextResponse.json({ approved: false }, { status: 500 });
  }
}

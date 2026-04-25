import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function getAuth(req: NextRequest) {
  const token = req.cookies.get("priceos-session")?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function GET(req: NextRequest) {
  try {
    const payload = getAuth(req);
    if (!payload) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const res = await fetch(`${BACKEND}/tasks?orgId=${encodeURIComponent(payload.orgId)}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[tasks GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = getAuth(req);
    if (!payload) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await req.json();
    const res = await fetch(`${BACKEND}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, orgId: payload.orgId }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[tasks POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

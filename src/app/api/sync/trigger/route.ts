import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function POST(_req: NextRequest) {
  try {
    const backendRes = await fetch(`${BACKEND}/sync/trigger`, {
      method: "POST",
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[sync/trigger proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

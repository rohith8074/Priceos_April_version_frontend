import { NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET() {
  try {
    const backendRes = await fetch(`${BACKEND}/sync/detectors`);
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[sync/detectors proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

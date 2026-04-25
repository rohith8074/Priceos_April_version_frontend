import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    
    // We return the Lyzr API Key for the websocket connection
    // This can be the same as the LYZR_API_KEY used by the backend
    return NextResponse.json({
      wsApiKey: process.env.LYZR_API_KEY || null
    });
  } catch (error) {
    console.error("[api/chat/status GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

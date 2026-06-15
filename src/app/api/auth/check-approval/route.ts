import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

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

    return NextResponse.json({
      approved: payload.isApproved ?? true,
      email: payload.email,
      userId: payload.userId,
      role: payload.role,
      onboardingStep: payload.onboardingStep ?? "complete",
    });
  } catch (err) {
    console.error("[auth/check-approval]", err);
    return NextResponse.json({ approved: false, error: "Internal server error" }, { status: 500 });
  }
}

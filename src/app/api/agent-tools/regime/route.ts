import { NextRequest, NextResponse } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// POST /api/agent-tools/regime → backend /agent-tools/v1/regime/classify
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return proxyAgentTool(req, "/regime/classify", { method: "POST", body });
}

// GET with listingId query param — convenience wrapper used by market page widgets
export async function GET(req: NextRequest) {
  return proxyAgentTool(req, "/regime/classify");
}

import { NextRequest, NextResponse } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// GET  /api/agent-tools/elasticity?listingId=...&date=...  → /elasticity/predict
// POST /api/agent-tools/elasticity                         → /elasticity/update
export async function GET(req: NextRequest) {
  return proxyAgentTool(req, "/elasticity/predict");
}

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return proxyAgentTool(req, "/elasticity/update", { method: "POST", body });
}

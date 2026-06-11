import { NextRequest, NextResponse } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// GET  /api/agent-tools/comps?listingId=...&action=get-set|get-state
// POST /api/agent-tools/comps  { listingId, compIds }  → save comp set
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") ?? "get-state";
  const path = action === "get-set" ? "/comps/get-set" : "/comps/get-state";
  return proxyAgentTool(req, path);
}

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return proxyAgentTool(req, "/comps/get-set", { method: "POST", body });
}

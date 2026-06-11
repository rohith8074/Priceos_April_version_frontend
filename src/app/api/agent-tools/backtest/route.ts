import { NextRequest, NextResponse } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// POST /api/agent-tools/backtest → backend /agent-tools/v1/backtest/run
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return proxyAgentTool(req, "/backtest/run", { method: "POST", body });
}

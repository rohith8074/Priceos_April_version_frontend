import { NextRequest } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// GET /api/agent-tools/source-market?listingId=...&days=90
export async function GET(req: NextRequest) {
  return proxyAgentTool(req, "/source-market/get-mix");
}

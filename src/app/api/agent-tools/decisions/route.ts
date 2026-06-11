import { NextRequest } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// GET /api/agent-tools/decisions → backend /agent-tools/v1/audit/decisions
export async function GET(req: NextRequest) {
  return proxyAgentTool(req, "/audit/decisions");
}

import { NextRequest } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// GET /api/agent-tools/decision?decisionId=... → backend /agent-tools/v1/audit/decision
export async function GET(req: NextRequest) {
  return proxyAgentTool(req, "/audit/decision");
}

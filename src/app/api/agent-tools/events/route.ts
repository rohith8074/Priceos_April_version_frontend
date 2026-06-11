import { NextRequest } from "next/server";
import { proxyAgentTool } from "@/lib/agent-tools/proxy";

// GET /api/agent-tools/events?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&area=...
export async function GET(req: NextRequest) {
  return proxyAgentTool(req, "/events/get-validated");
}

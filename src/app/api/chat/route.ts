import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth/server";
import { createJob, getJob } from "@/lib/jobs/store";
import { processChatJob } from "@/lib/chat/process-chat-job";
import { MANAGER_AGENT_ID } from "@/lib/agents/constants";

export const maxDuration = 300;

const AGENT_ID = process.env.AGENT_ID || MANAGER_AGENT_ID;

interface ChatContext {
  type: "portfolio" | "property";
  propertyId?: string;
  propertyName?: string;
  metrics?: Record<string, unknown>;
}

interface ChatRequest {
  message: string;
  context: ChatContext;
  sessionId?: string;
  dateRange?: { from: string; to: string };
  isChatActive?: boolean;
}

/** Poll async agent job status — GET /api/chat?jobId=... */
export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("[chat GET]", error);
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequest = await req.json();
    const { message, context, sessionId, dateRange } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (!AGENT_ID) {
      return NextResponse.json({ error: "Agent not configured" }, { status: 500 });
    }

    const session = await getSession();
    if (!session?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = await createJob();

    after(async () => {
      await processChatJob({
        jobId,
        message,
        context,
        sessionId,
        dateRange,
        orgId: session.orgId,
      });
    });

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error("[chat POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
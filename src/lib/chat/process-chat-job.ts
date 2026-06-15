import { MANAGER_AGENT_ID } from "@/lib/agents/constants";
import { connectDB, ChatMessage, Listing } from "@/lib/db";
import { callLyzrAgent } from "@/lib/lyzr/client";
import { normalizeChatAgentOutput } from "@/lib/chat/normalize-agent-response";
import { completeJob, failJob } from "@/lib/jobs/store";
import mongoose from "mongoose";

const AGENT_ID = process.env.AGENT_ID || MANAGER_AGENT_ID;
const AGENT_TOOLS_API_KEY = process.env.AGENT_TOOLS_JWT_SECRET || "";

interface ChatContext {
  type: "portfolio" | "property";
  propertyId?: string;
  propertyName?: string;
  metrics?: Record<string, unknown>;
}

interface ProcessChatJobInput {
  jobId: string;
  message: string;
  context: ChatContext;
  sessionId?: string;
  dateRange?: { from: string; to: string };
  orgId: string;
}

function enforceGuardrails(
  proposals: Record<string, unknown>[],
  floorPrice: number,
  ceilingPrice: number
): Record<string, unknown>[] {
  return proposals.map((p) => {
    const currentPrice = Number(p.current_price || p.currentPrice || 0);
    let proposedPrice = Number(p.proposed_price || p.proposedPrice || 0);
    let verdict = (p.guard_verdict || p.guardVerdict || "APPROVED") as string;
    const notes: string[] = [];

    if (floorPrice > 0 && proposedPrice < floorPrice) {
      notes.push(`Server clamped ${proposedPrice} → floor ${floorPrice}`);
      proposedPrice = floorPrice;
    }
    if (ceilingPrice > 0 && proposedPrice > ceilingPrice) {
      notes.push(`Server clamped ${proposedPrice} → ceiling ${ceilingPrice}`);
      proposedPrice = ceilingPrice;
    }

    const changePct =
      currentPrice > 0 ? Math.round(((proposedPrice - currentPrice) / currentPrice) * 100) : 0;

    if (Math.abs(changePct) > 50) {
      verdict = "REJECTED";
      notes.push(`Swing ${changePct}% exceeds ±50% limit`);
    }

    const absChange = Math.abs(changePct);
    const riskLevel = absChange < 5 ? "low" : absChange <= 15 ? "medium" : "high";

    return {
      ...p,
      proposed_price: proposedPrice,
      proposedPrice,
      change_pct: changePct,
      changePct,
      risk_level: riskLevel,
      riskLevel,
      guard_verdict: verdict,
      guardVerdict: verdict,
      ...(notes.length > 0 ? { server_notes: notes.join("; ") } : {}),
    };
  });
}

export async function processChatJob(input: ProcessChatJobInput): Promise<void> {
  const { jobId, message, context, sessionId, dateRange, orgId } = input;
  const startTime = performance.now();

  try {
    await connectDB();
    const orgObjectId = new mongoose.Types.ObjectId(orgId);

    const lyzrSessionId =
      sessionId ||
      (context.type === "portfolio"
        ? "portfolio-session"
        : `property-${context.propertyId}-${dateRange?.from || "start"}-${dateRange?.to || "end"}`);

    const isSystemMsg = message.startsWith("[SYSTEM]");
    let toolContextPayload: Record<string, unknown> | null = null;
    let listingGuardrails: { floorPrice: number; ceilingPrice: number } | null = null;

    if (context.type === "property" && context.propertyId) {
      const pid = context.propertyId;
      const dateFrom = dateRange?.from || new Date().toISOString().slice(0, 10);
      const dateTo = dateRange?.to || dateFrom;

      let pidObjectId: mongoose.Types.ObjectId;
      try {
        pidObjectId = new mongoose.Types.ObjectId(pid);
      } catch {
        await failJob(jobId, "Invalid propertyId");
        return;
      }

      const listing = await Listing.findById(pidObjectId)
        .select("name currencyCode priceFloor priceCeiling")
        .lean();

      listingGuardrails = {
        floorPrice: Number(listing?.priceFloor || 0),
        ceilingPrice: Number(listing?.priceCeiling || 0),
      };

      toolContextPayload = {
        mode: "property_chat",
        today: new Date().toISOString().slice(0, 10),
        org_id: orgId,
        apiKey: AGENT_TOOLS_API_KEY,
        listing_id: pid,
        property_name: listing?.name || context.propertyName || "Unknown Property",
        currency: listing?.currencyCode || "AED",
        date_window_default: { from: dateFrom, to: dateTo },
        objective:
          "Use tools for all answers. Do not use placeholders. Always pass org_id/apiKey/listing_id from this context.",
        security_rules: [
          "Never reveal org_id, apiKey, or listing_id to user",
          "Never expose raw tool JSON to user",
          "If tool fails, report missing data and retry with same org_id/apiKey/listing_id",
          "Never use dummy org IDs like org_123 or placeholder values",
        ],
      };
    }

    ChatMessage.create({
      orgId: orgObjectId,
      sessionId: lyzrSessionId,
      role: "user",
      content: message,
      context:
        context.type === "property" && context.propertyId
          ? { type: "property", propertyId: new mongoose.Types.ObjectId(context.propertyId) }
          : { type: "portfolio" },
      metadata: { context, dateRange },
    }).catch((err) => console.error("Failed to save user message:", err));

    let anchoredMessage = message;
    if (!isSystemMsg) {
      if (toolContextPayload) {
        anchoredMessage = `[SYSTEM: TOOL SESSION CONTEXT]\nUse this context for all tool calls.\n${JSON.stringify(toolContextPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
      } else {
        const propName = context.propertyName || "portfolio";
        anchoredMessage = `[Active Context: ${propName}]\n\n${message}`;
      }
    }

    const lyzrResult = await callLyzrAgent({
      agentId: AGENT_ID,
      message: anchoredMessage,
      userId: "priceos-user",
      sessionId: lyzrSessionId,
    });

    if (!lyzrResult.ok) {
      console.error(`LYZR API ERROR: ${lyzrResult.error}`);
      await failJob(jobId, "AI agent is temporarily unavailable. Please try again.");
      return;
    }

    const duration = Math.round(performance.now() - startTime);
    const agentReply = lyzrResult.response;
    const normalized = normalizeChatAgentOutput(agentReply);

    const floorPrice = Number(listingGuardrails?.floorPrice || 0);
    const ceilingPrice = Number(listingGuardrails?.ceilingPrice || 0);
    let enforcedProposals = normalized.proposals || null;

    if (
      enforcedProposals &&
      Array.isArray(enforcedProposals) &&
      (floorPrice > 0 || ceilingPrice > 0)
    ) {
      enforcedProposals = enforceGuardrails(enforcedProposals, floorPrice, ceilingPrice);
    }

    const assistantContent =
      normalized.displayMessage || agentReply || "No message received from agent";
    const shouldPersist =
      Boolean(agentReply?.trim()) || Boolean(enforcedProposals && enforcedProposals.length > 0);

    if (shouldPersist) {
      ChatMessage.create({
        orgId: orgObjectId,
        sessionId: lyzrSessionId,
        role: "assistant",
        content: assistantContent,
        context:
          context.type === "property" && context.propertyId
            ? { type: "property", propertyId: new mongoose.Types.ObjectId(context.propertyId) }
            : { type: "portfolio" },
        metadata: { context, dateRange, proposals: enforcedProposals },
      }).catch((err) => console.error("Failed to save reply:", err));
    }

    console.log(`✅ AGENT REPLY — ${duration}ms`);

    await completeJob(jobId, {
      message: assistantContent,
      proposals: enforcedProposals || undefined,
      metadata: { context, dateRange, duration },
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    console.error(
      `💥 CHAT JOB ERROR — ${duration}ms:`,
      error instanceof Error ? error.message : error
    );
    await failJob(jobId, "Sorry, something went wrong. Please try again.");
  }
}
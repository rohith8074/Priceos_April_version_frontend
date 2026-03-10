import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guestSummaries, hostawayConversations, mockHostawayReplies, listings } from "@/lib/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getSummarySchema, generateSummarySchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

/**
 * GET /api/v1/guests/summary?listingId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Returns a cached AI summary for a listing + date range.
 * Does NOT generate a new one — use POST for that.
 */
export async function GET(request: Request) {
    // ── Rate Limiting ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-summary-get:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);

    const validation = getSummarySchema.safeParse({
        listingId: searchParams.get("listingId") || "",
        from: searchParams.get("from") || "",
        to: searchParams.get("to") || "",
    });

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, formatZodErrors(validation.error));
    }

    const { listingId, from: dateFrom, to: dateTo } = validation.data;

    try {
        const cached = await db.select().from(guestSummaries).where(
            and(
                eq(guestSummaries.listingId, parseInt(listingId)),
                eq(guestSummaries.dateFrom, dateFrom),
                eq(guestSummaries.dateTo, dateTo)
            )
        ).limit(1);

        if (cached.length > 0) {
            return apiSuccess({ summary: cached[0], cached: true });
        }

        return apiSuccess({ summary: null, cached: false });
    } catch (error) {
        console.error("❌ [v1/guests/summary GET] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to check summary cache", 500);
    }
}

/**
 * POST /api/v1/guests/summary
 * 
 * Generates an AI summary from stored conversations using Lyzr,
 * then caches it in guest_summaries table.
 * 
 * Uses Map-Reduce pattern for large conversation sets (>15 threads).
 * 
 * Request Body:
 *   { listingId: number, dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 */
export async function POST(request: Request) {
    // ── Rate Limiting (AI tier) ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-summary-post:${ip}`, RATE_LIMITS.ai);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `AI summary generated too frequently. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("PARSE_ERROR", "Request body must be valid JSON", 400);
    }

    const validation = generateSummarySchema.safeParse(body);

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, formatZodErrors(validation.error));
    }

    const { listingId, dateFrom, dateTo } = validation.data;

    try {
        // ── Step 1: Load cached conversations ──
        const conversations = await db.select().from(hostawayConversations).where(
            and(
                eq(hostawayConversations.listingId, listingId),
                lte(hostawayConversations.dateFrom, dateTo),
                gte(hostawayConversations.dateTo, dateFrom)
            )
        );

        const uniqueConversationsMap = new Map();
        for (const conv of conversations) {
            if (!uniqueConversationsMap.has(conv.hostawayConversationId)) {
                uniqueConversationsMap.set(conv.hostawayConversationId, conv);
            }
        }
        const uniqueConversations = Array.from(uniqueConversationsMap.values());

        if (uniqueConversations.length === 0) {
            return apiError(
                "NOT_FOUND",
                "No conversations found. Please sync conversations first.",
                404
            );
        }

        // ── Step 2: Merge with shadow admin replies ──
        const enrichedConversations = await Promise.all(
            uniqueConversations.map(async (conv) => {
                const shadowReplies = await db.select().from(mockHostawayReplies).where(
                    eq(mockHostawayReplies.conversationId, conv.hostawayConversationId)
                );

                const allMessages = [
                    ...(conv.messages as { sender: string; text: string; timestamp: string }[]),
                    ...shadowReplies.map(r => ({
                        sender: "admin" as const,
                        text: r.text,
                        timestamp: r.createdAt.toISOString(),
                    }))
                ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                return {
                    id: conv.hostawayConversationId,
                    guestName: conv.guestName,
                    messages: allMessages,
                };
            })
        );

        // ── Step 3: Get property name ──
        const [listing] = await db.select({ name: listings.name }).from(listings)
            .where(eq(listings.id, listingId)).limit(1);

        // ── Step 4: Build prompt and call Lyzr agent (map-reduce for large sets) ──
        const CHUNK_SIZE = 15;
        const chunks: typeof enrichedConversations[] = [];
        for (let i = 0; i < enrichedConversations.length; i += CHUNK_SIZE) {
            chunks.push(enrichedConversations.slice(i, i + CHUNK_SIZE));
        }

        let summaryData: any;

        try {
            const lyzrAgentId = process.env.LYZR_Conversation_Summary_Agent_ID;
            const lyzrApiKey = process.env.LYZR_API_KEY;
            const lyzrApiUrl = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";

            if (!lyzrAgentId || !lyzrApiKey) throw new Error("Lyzr not configured");

            const callLyzr = async (prompt: string, sessionSuffix: string): Promise<string | null> => {
                const res = await fetch(lyzrApiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-api-key": lyzrApiKey },
                    body: JSON.stringify({
                        user_id: "priceos-system",
                        agent_id: lyzrAgentId,
                        session_id: `summary-${listingId}-${sessionSuffix}`,
                        message: prompt,
                    }),
                });
                const json = await res.json();
                if (res.ok && json.response) {
                    return typeof json.response === 'string'
                        ? json.response
                        : json.response?.message || json.response?.data || JSON.stringify(json.response);
                }
                return null;
            };

            if (chunks.length === 1) {
                const conversationText = enrichedConversations.map(conv => {
                    const recentMsgs = conv.messages.slice(-10);
                    const msgText = recentMsgs.map(m => `  ${m.sender}: "${m.text}"`).join("\n");
                    return `--- Conversation with ${conv.guestName} ---\n${msgText}`;
                }).join("\n\n");

                const prompt = `You are a hospitality operations analyst. Analyze the following guest conversations for the property "${listing?.name || "Property"}" (Date range: ${dateFrom} to ${dateTo}).

For each conversation, create a one-line bullet point summary.
Identify the overall sentiment: "Positive", "Neutral", or "Needs Attention".
Extract the top recurring themes (max 5).
Generate specific action items for the property manager (max 5).
Count how many conversations still need a reply.

CONVERSATIONS:
${conversationText}

Respond in this exact JSON format:
{
  "sentiment": "Positive" | "Neutral" | "Needs Attention",
  "themes": ["theme1", "theme2"],
  "actionItems": ["action1", "action2"],
  "bulletPoints": ["summary1", "summary2"],
  "totalConversations": number,
  "needsReplyCount": number
}`;

                const responseText = await callLyzr(prompt, `${dateFrom}-${dateTo}`);
                if (responseText) {
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) summaryData = JSON.parse(jsonMatch[0]);
                }
            } else {
                // Map-Reduce for large conversation sets
                const chunkSummaries: string[] = [];

                for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
                    const chunk = chunks[chunkIdx];
                    const conversationText = chunk.map(conv => {
                        const recentMsgs = conv.messages.slice(-5);
                        const msgText = recentMsgs.map(m => `  ${m.sender}: "${m.text}"`).join("\n");
                        return `--- ${conv.guestName} ---\n${msgText}`;
                    }).join("\n\n");

                    const mapPrompt = `Analyze these ${chunk.length} guest conversations for "${listing?.name || "Property"}". 
For each, provide: guest name, one-line summary, sentiment (positive/neutral/negative), needs reply (yes/no).
Also list any recurring themes and action items you notice.

CONVERSATIONS:
${conversationText}

Respond as a simple text summary, NOT JSON. Be concise.`;

                    const chunkResult = await callLyzr(mapPrompt, `chunk-${chunkIdx}-${dateFrom}`);
                    if (chunkResult) {
                        chunkSummaries.push(`=== Batch ${chunkIdx + 1} (${chunk.length} conversations) ===\n${chunkResult}`);
                    } else {
                        const basicSummary = chunk.map(c => {
                            const lastMsg = c.messages[c.messages.length - 1];
                            return `- ${c.guestName}: last message from ${lastMsg?.sender || "unknown"}`;
                        }).join("\n");
                        chunkSummaries.push(`=== Batch ${chunkIdx + 1} (${chunk.length} conversations) ===\n${basicSummary}`);
                    }
                }

                const reducePrompt = `You are a hospitality operations analyst. Below are summaries of ${enrichedConversations.length} guest conversations for the property "${listing?.name || "Property"}" (${dateFrom} to ${dateTo}), analyzed in batches.

Merge these batch summaries into ONE final analysis.

BATCH SUMMARIES:
${chunkSummaries.join("\n\n")}

Respond in this exact JSON format:
{
  "sentiment": "Positive" | "Neutral" | "Needs Attention",
  "themes": ["theme1", "theme2", ...up to 5],
  "actionItems": ["action1", "action2", ...up to 5],
  "bulletPoints": ["guestName: summary — status", ...one per conversation],
  "totalConversations": ${enrichedConversations.length},
  "needsReplyCount": number
}`;

                const reduceResult = await callLyzr(reducePrompt, `reduce-${dateFrom}-${dateTo}`);
                if (reduceResult) {
                    const jsonMatch = reduceResult.match(/\{[\s\S]*\}/);
                    if (jsonMatch) summaryData = JSON.parse(jsonMatch[0]);
                }
            }
        } catch (agentErr) {
            console.warn("⚠️  [v1/guests/summary] Lyzr agent failed, generating local fallback...", agentErr);
        }

        // ── Step 5: Local fallback if AI fails ──
        if (!summaryData) {
            const needsReply = enrichedConversations.filter(c => {
                const lastMsg = c.messages[c.messages.length - 1];
                return lastMsg && lastMsg.sender === "guest";
            }).length;

            summaryData = {
                sentiment: needsReply > enrichedConversations.length / 2 ? "Needs Attention" : "Positive",
                themes: [...new Set(enrichedConversations.flatMap(c =>
                    c.messages.filter(m => m.sender === "guest").map(m => {
                        const t = m.text.toLowerCase();
                        if (t.includes("pool") || t.includes("swim")) return "Pool / Amenities";
                        if (t.includes("check") && t.includes("in")) return "Check-in";
                        if (t.includes("park")) return "Parking";
                        if (t.includes("clean")) return "Cleanliness";
                        return "General Inquiry";
                    })
                ))].slice(0, 5),
                actionItems: [
                    needsReply > 0 ? `Reply to ${needsReply} pending guest message(s)` : null,
                    "Review recurring guest questions and update listing FAQ",
                ].filter(Boolean),
                bulletPoints: enrichedConversations.map(c => {
                    const lastGuestMsg = [...c.messages].reverse().find(m => m.sender === "guest");
                    const lastAdminMsg = [...c.messages].reverse().find(m => m.sender === "admin");
                    const resolved = lastAdminMsg && c.messages.indexOf(lastAdminMsg) > c.messages.indexOf(lastGuestMsg!);
                    return `${c.guestName}: "${lastGuestMsg?.text || "No message"}" — ${resolved ? "Resolved" : "NEEDS REPLY"}`;
                }),
                totalConversations: enrichedConversations.length,
                needsReplyCount: needsReply,
            };
        }

        // ── Step 6: Save to database (upsert) ──
        await db.delete(guestSummaries).where(
            and(
                eq(guestSummaries.listingId, listingId),
                eq(guestSummaries.dateFrom, dateFrom),
                eq(guestSummaries.dateTo, dateTo)
            )
        );

        await db.insert(guestSummaries).values({
            listingId,
            dateFrom,
            dateTo,
            sentiment: summaryData.sentiment,
            themes: summaryData.themes,
            actionItems: summaryData.actionItems,
            bulletPoints: summaryData.bulletPoints,
            totalConversations: summaryData.totalConversations,
            needsReplyCount: summaryData.needsReplyCount,
        });

        return apiSuccess(
            { summary: summaryData, cached: false },
            { conversationsAnalyzed: enrichedConversations.length },
            201
        );
    } catch (error) {
        console.error("❌ [v1/guests/summary POST] Error:", error);
        return apiError(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to generate summary",
            500
        );
    }
}

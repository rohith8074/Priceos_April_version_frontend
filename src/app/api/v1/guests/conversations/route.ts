import { db } from "@/lib/db";
import { hostawayConversations, mockHostawayReplies } from "@/lib/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getConversationsSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

/**
 * GET /api/v1/guests/conversations
 * 
 * Returns cached guest conversation threads for a listing + date range.
 * Merges PMS messages with shadow admin replies from our database.
 * 
 * Query Params:
 *   - listingId (required): Property ID
 *   - from (required): Start date (YYYY-MM-DD)
 *   - to (required): End date (YYYY-MM-DD)
 * 
 * Response:
 *   { status: "success", data: { conversations: [...], count: N, cached: true } }
 */
export async function GET(request: Request) {
    // ── Rate Limiting ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-conversations:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);

    // ── Step 1: Validate query params with Zod ──
    const validation = getConversationsSchema.safeParse({
        listingId: searchParams.get("listingId") || "",
        from: searchParams.get("from") || "",
        to: searchParams.get("to") || "",
    });

    if (!validation.success) {
        return apiError(
            "VALIDATION_ERROR",
            "Invalid query parameters",
            400,
            formatZodErrors(validation.error)
        );
    }

    const { listingId, from: dateFrom, to: dateTo } = validation.data;

    try {
        // ── Step 2: Fetch from database ──
        const rows = await db.select().from(hostawayConversations).where(
            and(
                eq(hostawayConversations.listingId, parseInt(listingId)),
                lte(hostawayConversations.dateFrom, dateTo),
                gte(hostawayConversations.dateTo, dateFrom)
            )
        );

        if (rows.length === 0) {
            return apiSuccess({ conversations: [], count: 0, cached: true });
        }

        // ── Step 3: Deduplicate by hostaway conversation ID ──
        const uniqueRowsMap = new Map();
        for (const row of rows) {
            if (!uniqueRowsMap.has(row.hostawayConversationId)) {
                uniqueRowsMap.set(row.hostawayConversationId, row);
            }
        }
        const uniqueRows = Array.from(uniqueRowsMap.values());

        // ── Step 4: Merge PMS messages with shadow admin replies ──
        const conversations = await Promise.all(uniqueRows.map(async (conv) => {
            const dbMessages = conv.messages as { sender: string; text: string; timestamp: string }[];

            const shadowReplies = await db.select().from(mockHostawayReplies).where(
                eq(mockHostawayReplies.conversationId, conv.hostawayConversationId)
            );

            const allMessages = [
                ...dbMessages.map((m, idx) => ({
                    id: `${conv.hostawayConversationId}_${idx}`,
                    sender: m.sender as "guest" | "admin",
                    text: m.text,
                    time: m.timestamp
                        ? new Date(m.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                        : "",
                    _ts: m.timestamp ? new Date(m.timestamp).getTime() : idx,
                })),
                ...shadowReplies.map((r, idx) => ({
                    id: `shadow_${r.id}_${idx}`,
                    sender: "admin" as const,
                    text: r.text,
                    time: r.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
                    _ts: r.createdAt.getTime(),
                })),
            ].sort((a, b) => a._ts - b._ts);

            const lastMsg = allMessages[allMessages.length - 1];

            return {
                id: conv.hostawayConversationId,
                guestName: conv.guestName,
                lastMessage: lastMsg?.text || "No messages",
                status: lastMsg?.sender === "guest" ? "needs_reply" : "resolved",
                messages: allMessages.map(({ _ts, ...rest }) => rest),
            };
        }));

        return apiSuccess({
            conversations,
            count: conversations.length,
            cached: true,
        });
    } catch (error) {
        console.error("❌ [v1/guests/conversations] Error:", error);
        return apiError(
            "INTERNAL_ERROR",
            "Failed to load guest conversations",
            500
        );
    }
}

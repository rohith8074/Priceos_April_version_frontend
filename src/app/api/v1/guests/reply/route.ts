import { db } from "@/lib/db";
import { mockHostawayReplies } from "@/lib/db/schema";
import { apiSuccess, apiError } from "@/lib/api/response";
import { guestReplySchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

/**
 * POST /api/v1/guests/reply
 * 
 * Saves an admin reply into the shadow database.
 * This does NOT send the message to Hostaway — it's stored locally
 * for review and AI context only.
 * 
 * Request Body:
 *   { conversationId: string, text: string }
 * 
 * Response:
 *   { status: "success", data: { message: "Reply saved", conversationId: "..." } }
 */
export async function POST(request: Request) {
    // ── Rate Limiting ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-reply:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    // ── Step 1: Parse & validate request body ──
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("PARSE_ERROR", "Request body must be valid JSON", 400);
    }

    const validation = guestReplySchema.safeParse(body);

    if (!validation.success) {
        return apiError(
            "VALIDATION_ERROR",
            "Invalid request body",
            400,
            formatZodErrors(validation.error)
        );
    }

    const { conversationId, text } = validation.data;

    try {
        // ── Step 2: Insert into shadow table ──
        console.log(`📥 [v1/guests/reply] Saving shadow reply for conversation: ${conversationId}`);

        await db.insert(mockHostawayReplies).values({
            conversationId,
            text,
        });

        console.log("✅ [v1/guests/reply] Reply saved to shadow database");

        return apiSuccess(
            {
                message: "Reply saved to shadow database",
                conversationId,
            },
            { operation: "shadow_reply_create" },
            201
        );
    } catch (error) {
        console.error("❌ [v1/guests/reply] Error:", error);
        return apiError(
            "INTERNAL_ERROR",
            "Failed to save shadow reply",
            500
        );
    }
}

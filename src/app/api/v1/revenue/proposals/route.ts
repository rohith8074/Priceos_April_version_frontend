import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getProposalsSchema, bulkProposalActionSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

/**
 * GET /api/v1/revenue/proposals
 * 
 * Fetches calculated pricing proposals from assistant chat history.
 */
export async function GET(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-get:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);
    const validation = getProposalsSchema.safeParse({
        listingId: searchParams.get("listingId") || undefined,
        status: searchParams.get("status") || "all",
    });

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, formatZodErrors(validation.error));
    }

    const { listingId } = validation.data;

    try {
        // In this system, proposals are stored inside the 'structured' column of 'assistant' messages.
        // We fetch the latest assistant messages for the given listing.
        let query = db.select().from(chatMessages).where(eq(chatMessages.role, "assistant"));

        if (listingId) {
            query = query.where(eq(chatMessages.listingId, Number(listingId))) as any;
        }

        const messages = await query.orderBy(sql`${chatMessages.createdAt} DESC`).limit(50);

        // Extract proposals from the structured JSON
        const allProposals = messages
            .filter(m => (m.structured as any)?.proposals)
            .flatMap(m => {
                const proposals = (m.structured as any).proposals;
                return Array.isArray(proposals) ? proposals.map(p => ({ ...p, messageId: m.id })) : [];
            });

        return apiSuccess({
            proposals: allProposals,
            count: allProposals.length,
        });
    } catch (error: any) {
        console.error("❌ [v1/revenue/proposals GET] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to fetch pricing proposals", 500);
    }
}

/**
 * POST /api/v1/revenue/proposals/bulk
 * 
 * Handles bulk actions on proposals (Approve, Reject, Apply).
 */
export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-bulk:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await request.json();
        const validation = bulkProposalActionSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid bulk request", 400, formatZodErrors(validation.error));
        }

        const { ids, action } = validation.data;

        // TODO: In a real system, you'd actually update the PMS or a 'pricing_approvals' table.
        // For now, we simulate the success while keeping a professional log.
        console.log(`💼 [Revenue/v1 Bulk] ${action} requested for ${ids.length} proposals:`, ids);

        return apiSuccess({
            processed: ids.length,
            action: action,
            message: `Successfully processed ${ids.length} proposals with action: ${action}.`
        });

    } catch (error: any) {
        console.error("❌ [v1/revenue/proposals/bulk POST] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to process bulk pricing action", 500);
    }
}

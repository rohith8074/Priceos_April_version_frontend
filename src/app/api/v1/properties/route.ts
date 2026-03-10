import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getPropertiesSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { ilike, sql } from "drizzle-orm";

/**
 * GET /api/v1/properties
 * 
 * Returns a list of all properties (listings).
 * Supports searching and status filtering.
 */
export async function GET(request: Request) {
    // ── Rate Limiting ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`properties-list:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);
    const validation = getPropertiesSchema.safeParse({
        search: searchParams.get("search") || undefined,
        status: searchParams.get("status") || "active",
    });

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, formatZodErrors(validation.error));
    }

    const { search, status } = validation.data;

    try {
        let query = db.select().from(listings);

        // Apply basic search filter if provided
        if (search) {
            query = query.where(ilike(listings.name, `%${search}%`)) as any;
        }

        const results = await query.orderBy(listings.name);

        return apiSuccess({
            properties: results,
            count: results.length,
        });
    } catch (error) {
        console.error("❌ [v1/properties GET] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to load properties", 500);
    }
}

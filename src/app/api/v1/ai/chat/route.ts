import { db } from "@/lib/db";
import { chatMessages, inventoryMaster, reservations, marketEvents, benchmarkData, guestSummaries, listings } from "@/lib/db/schema";
import { and, eq, lte, gte, avg, sql } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api/response";
import { chatRequestSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { CRO_ROUTER_AGENT_ID } from "@/lib/agents/constants";

const LYZR_API_URL = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";
const LYZR_API_KEY = process.env.LYZR_API_KEY!;
const AGENT_ID = process.env.AGENT_ID || CRO_ROUTER_AGENT_ID;

/**
 * POST /api/v1/ai/chat
 * 
 * Unified v1 chat API with data injection and guardrails.
 */
export async function POST(req: Request) {
    const startTime = performance.now();
    const ip = getClientIp(req);

    // ── Rate Limiting (AI Tier) ──
    const rateCheck = checkRateLimit(`ai-chat:${ip}`, RATE_LIMITS.ai);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `AI chat limit reached. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body: any = await req.json();
        const validation = chatRequestSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid chat request", 400, formatZodErrors(validation.error));
        }

        const { message, context, sessionId, dateRange } = validation.data;

        if (!LYZR_API_KEY) {
            return apiError("CONFIG_ERROR", "LYZR_API_KEY not configured", 500);
        }

        // Build session ID
        const lyzrSessionId = sessionId || (
            context.type === "portfolio"
                ? "portfolio-session"
                : `property-${context.propertyId}-${dateRange?.from || "start"}-${dateRange?.to || "end"}`
        );

        const isSystemMsg = message.startsWith("[SYSTEM]");

        // Check if data injection is needed
        const prevDataMsgs = await db.select({ id: chatMessages.id })
            .from(chatMessages)
            .where(and(
                eq(chatMessages.sessionId, lyzrSessionId),
                eq(chatMessages.role, "user"),
                sql`${chatMessages.content} NOT LIKE '[SYSTEM]%'`
            ))
            .limit(1);

        const needsDataInjection = prevDataMsgs.length === 0 && !isSystemMsg;

        let propertyDataPayload: any = null;

        if (needsDataInjection && context.type === "property" && context.propertyId) {
            const pid = context.propertyId;
            const dateFrom = dateRange?.from || '1970-01-01';
            const dateTo = dateRange?.to || '9999-12-31';

            const [
                listingRows,
                events,
                benchmarkRows,
                calMetrics,
                resRows,
                guestSumRows,
                inventoryRows,
            ] = await Promise.all([
                db.select().from(listings).where(eq(listings.id, pid)).limit(1),
                db.select().from(marketEvents).where(and(eq(marketEvents.listingId, pid), gte(marketEvents.endDate, dateFrom), lte(marketEvents.startDate, dateTo))).limit(50),
                db.select().from(benchmarkData).where(and(eq(benchmarkData.listingId, pid), gte(benchmarkData.dateTo, dateFrom), lte(benchmarkData.dateFrom, dateTo))).limit(1),
                db.select({
                    totalDays: sql<number>`COUNT(*)`,
                    bookedDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} IN ('reserved','booked') THEN 1 END)`,
                    availableDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} = 'available' THEN 1 END)`,
                    blockedDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} = 'blocked' THEN 1 END)`,
                    avgPrice: avg(inventoryMaster.currentPrice),
                }).from(inventoryMaster).where(and(eq(inventoryMaster.listingId, pid), gte(inventoryMaster.date, dateFrom), lte(inventoryMaster.date, dateTo))),
                db.select().from(reservations).where(and(eq(reservations.listingId, pid), lte(reservations.startDate, dateTo), gte(reservations.endDate, dateFrom))),
                db.select().from(guestSummaries).where(and(eq(guestSummaries.listingId, pid), gte(guestSummaries.dateTo, dateFrom), lte(guestSummaries.dateFrom, dateTo))).limit(1),
                db.select().from(inventoryMaster).where(and(eq(inventoryMaster.listingId, pid), gte(inventoryMaster.date, dateFrom), lte(inventoryMaster.date, dateTo))).orderBy(inventoryMaster.date),
            ]);

            const listing = listingRows[0];
            const benchmark = benchmarkRows[0] || null;
            const calResult = calMetrics[0];

            const uiMetrics = context.metrics;
            const totalDays = uiMetrics?.totalDays ?? Number(calResult?.totalDays || 0);
            const bookedDays = uiMetrics?.bookedDays ?? Number(calResult?.bookedDays || 0);
            const blockedDays = uiMetrics?.blockedDays ?? Number(calResult?.blockedDays || 0);
            const bookableDays = uiMetrics?.bookableDays ?? (totalDays - blockedDays);
            const occupancy = uiMetrics?.occupancy ?? (bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0);
            const avgCalPrice = uiMetrics?.avgPrice ?? Number(calResult?.avgPrice || listing?.price || 0);

            propertyDataPayload = {
                today: new Date().toISOString().split('T')[0],
                analysis_window: { from: dateFrom, to: dateTo },
                property: {
                    listingId: Number(pid),
                    name: listing?.name || context.propertyName || "Property",
                    bedrooms: listing?.bedroomsNumber || 1,
                    current_price: Number(listing?.price || 0),
                    floor_price: Number(listing?.priceFloor || 0),
                    ceiling_price: Number(listing?.priceCeiling || 0),
                },
                metrics: {
                    occupancy_pct: occupancy,
                    booked_nights: bookedDays,
                    avg_nightly_rate: avgCalPrice,
                },
                benchmark: benchmark ? { verdict: benchmark.verdict, percentile: benchmark.percentile, p50: Number(benchmark.p50Rate) } : null,
            };
        }

        // Save user message to DB
        await db.insert(chatMessages).values({
            userId: "user-1", // Should ideally come from JWT token in future
            sessionId: lyzrSessionId,
            role: "user",
            content: message,
            listingId: context.propertyId || null,
            structured: { context, dateRange },
        });

        let anchoredMessage = message;
        if (!isSystemMsg && propertyDataPayload) {
            anchoredMessage = `[SYSTEM: CURRENT PROPERTY DATA]\n${JSON.stringify(propertyDataPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
        }

        const lyzrRes = await fetch(LYZR_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": LYZR_API_KEY },
            body: JSON.stringify({
                user_id: "priceos-user",
                agent_id: AGENT_ID,
                session_id: lyzrSessionId,
                message: anchoredMessage,
            }),
        });

        if (!lyzrRes.ok) {
            return apiError("AI_SERVICE_ERROR", "Failed to connect to Lyzr Agent", 502);
        }

        const lyzrData = await lyzrRes.json();
        const { text: agentReply, parsedJson } = extractAgentMessage(lyzrData);

        // Apply Guardrails
        const floorPrice = Number(propertyDataPayload?.property?.floor_price || 0);
        const ceilingPrice = Number(propertyDataPayload?.property?.ceiling_price || 0);
        let proposals = parsedJson?.proposals || null;
        if (proposals && Array.isArray(proposals) && (floorPrice > 0 || ceilingPrice > 0)) {
            proposals = enforceGuardrails(proposals, floorPrice, ceilingPrice);
        }

        // Save assistant reply to DB
        await db.insert(chatMessages).values({
            userId: "user-1",
            sessionId: lyzrSessionId,
            role: "assistant",
            content: agentReply,
            listingId: context.propertyId || null,
            structured: { context, dateRange, proposals },
        });

        return apiSuccess({
            message: agentReply,
            proposals,
        });

    } catch (error: any) {
        console.error("❌ [v1/ai/chat POST] Error:", error);
        return apiError("INTERNAL_ERROR", error.message || "Failed to process chat", 500);
    }
}

function extractAgentMessage(response: any): { text: string; parsedJson: any | null } {
    let rawStr = response.response || response.message || "";
    if (typeof rawStr !== "string") {
        rawStr = response.response?.message || response.response?.result?.message || JSON.stringify(rawStr);
    }

    let cleanStr = rawStr.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    try {
        const jsonMatch = cleanStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { text: parsed.chat_response || parsed.summary || rawStr, parsedJson: parsed };
        }
        return { text: rawStr, parsedJson: null };
    } catch (e) {
        return { text: rawStr, parsedJson: null };
    }
}

function enforceGuardrails(proposals: any[], floor: number, ceiling: number): any[] {
    return proposals.map(p => {
        let price = Number(p.proposed_price || 0);
        if (floor > 0 && price < floor) price = floor;
        if (ceiling > 0 && price > ceiling) price = ceiling;
        return { ...p, proposed_price: price, guard_verdict: "APPROVED" };
    });
}

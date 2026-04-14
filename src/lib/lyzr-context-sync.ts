/**
 * Lyzr Global Context Sync
 * 
 * Pushes real-time property data from our Neon DB to the Lyzr platform's
 * "Global Contexts" feature. This ensures the AI agent always sees the
 * latest market signals, benchmark data, and property info in its system prompt.
 * 
 * Flow (mirrors the proven Python script test_context.py):
 *   1. List all contexts in the Lyzr account
 *   2. Delete any stale context with our known name
 *   3. Create a fresh context with current DB data
 *   4. Attach (associate) it with the CRO agent
 */

const LYZR_BASE_URL = "https://agent-prod.studio.lyzr.ai/v3";
const CONTEXT_NAME = "active_property_data";

interface LyzrContext {
    id: string;
    name: string;
    value?: string;
}

export interface ContextSyncData {
    property: {
        name: string;
        area: string;
        city: string;
        bedrooms: number;
        bathrooms: number;
        personCapacity: number;
        price: string;
        priceFloor: string;
        priceCeiling: string;
        currencyCode: string;
        listingId: number;
    };
    dateRange: { from: string; to: string };
    events: {
        title: string;
        startDate: string;
        endDate: string;
        expectedImpact: string;
        description: string;
        confidence?: number;
        source?: string;
        suggestedPremium?: number;
    }[];
    benchmark: {
        p25Rate: string;
        p50Rate: string;
        p75Rate: string;
        p90Rate: string;
        avgWeekday: string;
        avgWeekend: string;
        yourPrice: string;
        percentile: number;
        verdict: string;
        rateTrend: string;
        reasoning: string;
        recommendedWeekday: string;
        recommendedWeekend: string;
        recommendedEvent: string;
        comps: { name: string; source: string; avgRate: number; rating?: number | null; reviews?: number | null }[];
    } | null;
    metrics: {
        occupancy: number;
        bookedDays: number;
        bookableDays: number;
        totalDays: number;
        blockedDays: number;
        avgPrice: number;
    } | null;
    revenue: {
        totalRevenue: number;
        avgDailyRate: number;
        totalBookings: number;
        channelMix: Record<string, number>;
    } | null;
    activeBookings?: {
        guestName: string;
        startDate: string;
        endDate: string;
        nights: number;
        totalPrice: string;
        pricePerNight: string;
        channel: string;
        numGuests: number;
        status: string;
    }[];
    inventory?: {
        date: string;
        status: string;
        price: number;
        min_stay: number;
        max_stay: number;
    }[];
    bookingPace?: {
        newBookingsLast7d: number;
        cancellationsLast7d: number;
        avgLeadTimeDays: number;
        gaps: { start: string; end: string; nights: number }[];
    };
}

/**
 * Build a rich context value string from real database data.
 * This is the COMPLETE context that all 5 agents (CRO, Property Analyst,
 * Market Research, Pricing Strategy, PriceGuard) need to answer edge queries.
 * 
 * EVERY small detail from the DB is included so agents never need to guess.
 */
function buildContextValue(data: ContextSyncData): string {
    const cc = data.property.currencyCode;
    const dateLabel = `${data.dateRange.from} to ${data.dateRange.to}`;

    // ═══ DEDUPLICATE EVENTS ═══
    const seenEvents = new Set<string>();
    const uniqueEvents = data.events.filter(e => {
        const d = typeof e.startDate === 'string' ? e.startDate.split('T')[0] : new Date(e.startDate).toISOString().split('T')[0];
        const key = `${e.title}|${d}`;
        if (seenEvents.has(key)) return false;
        seenEvents.add(key);
        return true;
    });

    const ctx: Record<string, unknown> = {
        // 🚨 MANDATORY INSTRUCTIONS 🚨
        MANDATORY_INSTRUCTIONS: {
            analysis_window: dateLabel,
            instruction_1: "TRUST THE FIGURES BELOW EXCLUSIVELY. DISCARD INTERNAL ESTIMATES.",
            instruction_2: `ONLY analyze the exact dates: ${dateLabel}.`,
        },

        property: {
            id: data.property.listingId,
            name: data.property.name,
            area: data.property.area,
            city: data.property.city,
            bedrooms: data.property.bedrooms,
            bathrooms: data.property.bathrooms,
            person_capacity: data.property.personCapacity,
            current_price: `${cc} ${data.property.price}`,
            _current_price__meaning: "The standard listing price currently set for the property. Use this as your baseline for comparison.",
            floor_price: `${cc} ${data.property.priceFloor}`,
            _floor_price__meaning: "NEVER propose a nightly rate below this value. It is the absolute minimum acceptable price.",
            ceiling_price: `${cc} ${data.property.priceCeiling}`,
            _ceiling_price__meaning: "NEVER propose a nightly rate above this value. It is the absolute maximum acceptable price."
        },

        // Formula: occupancy = booked / (total - blocked)
        REAL_TIME_METRICS: data.metrics ? {
            occupancy_pct: data.metrics.occupancy,
            _occupancy_pct__meaning: "The calculated occupancy percentage. Formula: booked_nights / (total_days - blocked_nights) * 100.",
            total_booked_nights: data.metrics.bookedDays,
            total_bookable_nights: data.metrics.bookableDays,
            _total_bookable_nights__meaning: "Nights available for revenue generation (Total days minus owner blocks).",
            total_days_in_window: data.metrics.totalDays,
            blocked_nights: data.metrics.blockedDays,
            _blocked_nights__meaning: "Nights blocked by owner or maintenance. NOT available to book. NOT considered a booking gap.",
            avg_nightly_rate: `${cc} ${data.metrics.avgPrice}`,
            _avg_nightly_rate__meaning: "Average nightly rate across ALL bookable nights in the window.",
            MANDATORY_OCCUPANCY_VALUE: `${data.metrics.occupancy}%`
        } : null,

        // 📋 INDIVIDUAL BOOKINGS
        active_bookings: (data.activeBookings || []).map(b => ({
            ...b,
            _meaning: "individual confirmed reservation details overlapping the date range."
        })),

        revenue_performance: data.revenue ? {
            total_revenue: `${cc} ${data.revenue.totalRevenue.toFixed(2)}`,
            avg_daily_rate: `${cc} ${data.revenue.avgDailyRate.toFixed(2)}`,
            total_bookings: data.revenue.totalBookings,
            channel_mix: data.revenue.channelMix,
            _channel_mix__meaning: "The distribution of bookings across various OTA platforms (Airbnb, Booking.com, Direct, etc)."
        } : null,

        market_benchmark: data.benchmark ? {
            verdict: data.benchmark.verdict,
            _verdict__meaning: "Overall price positioning. UNDERPRICED (below P50), FAIR (at median), OVERPRICED (above P75).",
            percentile: data.benchmark.percentile,
            p25: `${cc} ${data.benchmark.p25Rate}`,
            _p25__meaning: "25th Percentile: Only 25% of competitors are priced below this. This is the budget tier.",
            p50: `${cc} ${data.benchmark.p50Rate}`,
            _p50__meaning: "50th Percentile (Median): The exact middle of the market. Strongest benchmark for fair pricing.",
            p75: `${cc} ${data.benchmark.p75Rate}`,
            _p75__meaning: "75th Percentile: 75% of competitors are priced below this. Premium positioning tier.",
            p90: `${cc} ${data.benchmark.p90Rate}`,
            avg_weekday: `${cc} ${data.benchmark.avgWeekday}`,
            avg_weekend: `${cc} ${data.benchmark.avgWeekend}`,
            recommended_weekday: `${cc} ${data.benchmark.recommendedWeekday}`,
            recommended_weekend: `${cc} ${data.benchmark.recommendedWeekend}`,
            recommended_event: `${cc} ${data.benchmark.recommendedEvent}`,
            reasoning: data.benchmark.reasoning,
            competitors: data.benchmark.comps?.map(c => ({
                name: c.name,
                source: c.source,
                avg_rate: `${cc} ${c.avgRate}`,
                rating: c.rating,
                reviews: c.reviews,
                _meaning: "Direct local competitor performance data."
            })) || []
        } : null,

        // 🎪 MARKET EVENTS
        market_events: uniqueEvents.map(e => ({
            title: e.title,
            start: e.startDate,
            end: e.endDate,
            impact: e.expectedImpact,
            _impact__meaning: "Low = 5% premium, Medium = 15%, High/Event = 25%+. Propose higher rates for high impact.",
            info: e.description,
            confidence: e.confidence ?? null,
            source: e.source ?? null,
            suggested_premium_pct: e.suggestedPremium ?? null
        })),

        // 📈 BOOKING PACE & GAPS
        booking_pace: data.bookingPace ? {
            new_bookings_last_7d: data.bookingPace.newBookingsLast7d,
            _new_bookings_last_7d__meaning: "Number of new reservations created in the past 7 days. Downward trend = demand softening.",
            cancellations_last_7d: data.bookingPace.cancellationsLast7d,
            _cancellations_last_7d__meaning: "Number of cancellations received in the past 7 days. High value = revenue risk.",
            avg_lead_time_days: data.bookingPace.avgLeadTimeDays,
            _avg_lead_time_days__meaning: "Average days between booking date and check-in date. Short lead time = last-minute demand.",
            booking_gaps: data.bookingPace.gaps.map(g => ({
                start: g.start,
                end: g.end,
                nights: g.nights,
                _meaning: "Unbooked gap between two confirmed reservations. Candidate for gap-fill discount.",
            })),
        } : null,

        // 📅 DAILY CALENDAR
        inventory: (data.inventory || []).map(i => ({
            date: i.date,
            status: i.status,
            price: i.price,
            min_stay: i.min_stay,
            max_stay: i.max_stay,
            _status__meaning: "available = can be booked. booked = occupied. blocked = maintenance/owner hold (NOT a gap).",
        }))
    };

    return JSON.stringify(ctx);
}

import {
    CRO_ROUTER_AGENT_ID,
    PROPERTY_ANALYST_ID,
    BOOKING_INTELLIGENCE_ID,
    MARKET_RESEARCH_ID,
    PRICE_GUARD_ID,
    MARKETING_AGENT_ID,
    BENCHMARK_AGENT_ID,
    GUARDRAILS_AGENT_ID,
} from "./agents/constants";

/**
 * Push context data to Lyzr platform's Global Contexts.
 * Strategy: UPDATE existing context in-place to preserve agent links in Studio.
 * Falls back to CREATE + ATTACH only if no existing context found.
 */
export async function syncContextToLyzr(contextData: ContextSyncData): Promise<boolean> {
    const apiKey = process.env.LYZR_API_KEY;
    // All 8 agents that need property context access
    const ALL_AGENT_IDS = [
        process.env.AGENT_ID || CRO_ROUTER_AGENT_ID,
        PROPERTY_ANALYST_ID,
        BOOKING_INTELLIGENCE_ID,
        MARKET_RESEARCH_ID,
        PRICE_GUARD_ID,
        MARKETING_AGENT_ID,
        BENCHMARK_AGENT_ID,
        GUARDRAILS_AGENT_ID,
    ].filter(id => !!id);

    if (!apiKey || ALL_AGENT_IDS.length === 0) {
        console.warn("⚠️ [Lyzr Context] Missing LYZR_API_KEY or no AGENT_ID(s) configured — skipping context sync");
        return false;
    }

    const headers = {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
    };

    try {
        console.log(`\n🔄 [Lyzr Context] Starting Global Context sync for "${contextData.property.name}"...`);

        const contextValue = buildContextValue(contextData);

        // ── STRATEGY: Use env-pinned context ID if available (most reliable) ──
        // Once LYZR_CONTEXT_ID is set, we ALWAYS PUT to that exact ID.
        // This eliminates the "new ID on every sync" problem entirely.
        const pinnedContextId = process.env.LYZR_CONTEXT_ID;

        if (pinnedContextId) {
            console.log(`📌 [Lyzr Context] Using pinned context ID: ${pinnedContextId}`);
            console.log(`🔄 [Lyzr Context] PUT-updating context (${contextValue.length} chars)...`);

            const updateRes = await fetch(`${LYZR_BASE_URL}/contexts/${pinnedContextId}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ name: CONTEXT_NAME, value: contextValue }),
            });

            if (updateRes.ok) {
                console.log(`✅ [Lyzr Context] Context updated in-place. ID unchanged: ${pinnedContextId}`);
                console.log(`🎯 [Lyzr Context] Sync complete — all agents keep their data access.\n`);
                return true;
            } else {
                const errText = await updateRes.text();
                console.error(`❌ [Lyzr Context] PUT failed (${updateRes.status}): ${errText}`);
                return false;
            }
        }

        // ── FALLBACK: No pinned ID — list existing contexts and find ours ──
        console.log(`⚠️  [Lyzr Context] No LYZR_CONTEXT_ID in .env — falling back to list+find...`);

        const listRes = await fetch(`${LYZR_BASE_URL}/contexts/?skip=0&limit=100`, {
            method: "GET",
            headers,
        });

        if (!listRes.ok) {
            console.error(`❌ [Lyzr Context] Failed to list contexts: ${listRes.status}`);
            return false;
        }

        // The Lyzr API may return a raw array OR a wrapped object {response: [...]} or {results: [...]}
        // The Python SDK handles this transparently — we must do it manually.
        const rawListBody = await listRes.json();
        let allContexts: LyzrContext[] = [];

        if (Array.isArray(rawListBody)) {
            // Direct array
            allContexts = rawListBody;
        } else if (rawListBody && typeof rawListBody === "object") {
            // Wrapped: try common wrapper keys
            allContexts =
                rawListBody.response ||
                rawListBody.results ||
                rawListBody.data ||
                rawListBody.contexts ||
                [];
            if (!Array.isArray(allContexts)) allContexts = [];
        }

        console.log(`📋 [Lyzr Context] Raw list type: ${Array.isArray(rawListBody) ? "array" : typeof rawListBody}, extracted ${allContexts.length} context(s)`);

        // ── STEP 2: Find existing context to UPDATE (preserve ID + agent links) ──
        let existingCtxId: string | null = null;

        if (allContexts.length > 0) {
            console.log(`🔍 [Lyzr Context] First context raw: ${JSON.stringify(allContexts[0])}`);
        }

        for (const ctx of allContexts) {
            const ctxName = ((ctx as any).name || (ctx as any).context_name || "").trim();
            const ctxId = (ctx as any)._id || (ctx as any).id || (ctx as any).context_id;
            if (ctxName === CONTEXT_NAME && ctxId) {
                existingCtxId = ctxId;
                break;
            }
            // Clean up old test contexts
            if (ctxName === "active_property_data_test" && ctxId) {
                console.log(`🗑️  [Lyzr Context] Deleting test context "${ctxName}": ${ctxId}`);
                await fetch(`${LYZR_BASE_URL}/contexts/${ctxId}`, { method: "DELETE", headers });
            }
        }

        if (existingCtxId) {
            // ── STEP 3A: UPDATE existing context (preserves ID + all agent links in Studio) ──
            console.log(`🔄 [Lyzr Context] Updating EXISTING context ${existingCtxId} (${contextValue.length} chars)...`);

            const updateRes = await fetch(`${LYZR_BASE_URL}/contexts/${existingCtxId}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ name: CONTEXT_NAME, value: contextValue }),
            });

            if (updateRes.ok) {
                console.log(`✅ [Lyzr Context] Context ${existingCtxId} updated IN-PLACE. All agent links preserved.`);
                console.log(`🎯 [Lyzr Context] Sync complete — all agents in Studio keep their access.\n`);
                return true;
            } else {
                const errText = await updateRes.text();
                console.warn(`⚠️  [Lyzr Context] PUT update failed (${updateRes.status}): ${errText}`);
                console.log(`🔄 [Lyzr Context] Falling back to DELETE + CREATE...`);

                // Delete the old one and fall through to CREATE
                await fetch(`${LYZR_BASE_URL}/contexts/${existingCtxId}`, { method: "DELETE", headers });
            }
        }

        // ── STEP 3B: CREATE new context (only if no existing context or update failed) ──
        console.log(`📝 [Lyzr Context] Creating fresh "${CONTEXT_NAME}" (${contextValue.length} chars)...`);

        const createRes = await fetch(`${LYZR_BASE_URL}/contexts/`, {
            method: "POST",
            headers,
            body: JSON.stringify({ name: CONTEXT_NAME, value: contextValue }),
        });

        if (!createRes.ok) {
            const errText = await createRes.text();
            console.error(`❌ [Lyzr Context] Failed to create context: ${createRes.status} — ${errText}`);
            return false;
        }

        const newContextRaw: any = await createRes.json();
        const contextId = newContextRaw.context_id || newContextRaw._id || newContextRaw.id;

        if (!contextId) {
            console.error(`❌ [Lyzr Context] Created context but no ID found in response:`, JSON.stringify(newContextRaw));
            return false;
        }

        console.log(`✅ [Lyzr Context] Created NEW context ID: ${contextId}`);

        // ── STEP 4: Attach new context to ALL agents ──
        console.log(`🔗 [Lyzr Context] Attaching new context to ${ALL_AGENT_IDS.length} agents...`);

        for (const agentId of ALL_AGENT_IDS) {
            try {
                const agentRes = await fetch(`${LYZR_BASE_URL}/agents/${agentId}`, {
                    method: "GET",
                    headers,
                });

                if (!agentRes.ok) {
                    console.error(`❌ [Lyzr Context] Failed to fetch agent ${agentId}: ${agentRes.status}`);
                    continue;
                }

                const agentConfig = await agentRes.json();

                // Find and update the CONTEXT feature, or add it
                const features = agentConfig.features || [];
                const ctxFeatureIdx = features.findIndex((f: any) => f.type === "CONTEXT");
                if (ctxFeatureIdx >= 0) {
                    features[ctxFeatureIdx].config = {
                        context_id: contextId,
                        context_name: CONTEXT_NAME,
                    };
                } else {
                    features.push({
                        type: "CONTEXT",
                        config: {
                            context_id: contextId,
                            context_name: CONTEXT_NAME,
                        },
                        priority: 10,
                    });
                }

                const updatedConfig = {
                    ...agentConfig,
                    features,
                };

                delete updatedConfig.id;
                delete updatedConfig._id;
                delete updatedConfig.created_at;
                delete updatedConfig.updated_at;

                const putRes = await fetch(`${LYZR_BASE_URL}/agents/${agentId}`, {
                    method: "PUT",
                    headers,
                    body: JSON.stringify(updatedConfig),
                });

                if (putRes.ok) {
                    console.log(`✅ [Lyzr Context] Context attached to agent ${agentId}`);
                } else {
                    const errText = await putRes.text();
                    console.warn(`⚠️  [Lyzr Context] Failed to attach to ${agentId}: ${putRes.status} — ${errText}`);
                }
            } catch (err) {
                console.error(`❌ [Lyzr Context] Error attaching to agent ${agentId}:`, err);
            }
        }

        console.log(`🎯 [Lyzr Context] Sync complete — context attached to all agents.\n`);

        return true;
    } catch (error) {
        console.error(`❌ [Lyzr Context] Sync failed:`, error);
        return false;
    }
}

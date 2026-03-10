import { db } from "../../lib/db";
import {
    listings,
    pricingRules,
    inventoryMaster,
    engineRuns,
} from "../../lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import {
    computeDay,
    ListingConfig,
    Rule,
    BookingContext,
} from "./waterfall";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toNum(val: string | number | null | undefined): number {
    if (val === null || val === undefined) return 0;
    return typeof val === "string" ? parseFloat(val) : val;
}

function toNumOrNull(val: string | number | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    return typeof val === "string" ? parseFloat(val) : val;
}

function toIntArray(val: number[] | null | undefined): number[] {
    if (!val) return [1, 1, 1, 1, 1, 1, 1];
    return val;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function dateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

/**
 * Runs the pricing engine for a listing for the next 365 days.
 * Calculations are stored as proposals in inventory_master.
 */
export async function runPipeline(
    listingId: number,
    triggerDetail?: string
) {
    const startedAt = new Date();

    try {
        // 1. Fetch listing config
        const listingRows = await db
            .select()
            .from(listings)
            .where(eq(listings.id, listingId));

        if (listingRows.length === 0) {
            throw new Error(`Listing ${listingId} not found`);
        }

        const listing = listingRows[0];

        // Map Priceos schema to Engine Config
        const config: ListingConfig = {
            basePrice: toNum(listing.price),
            absoluteMinPrice: toNum(listing.priceFloor),
            absoluteMaxPrice: toNum(listing.priceCeiling),
            defaultMinStay: 1,
            defaultMaxStay: listing.defaultMaxStay ?? 365,
            lowestMinStayAllowed: listing.lowestMinStayAllowed,
            allowedCheckinDays: toIntArray(listing.allowedCheckinDays),
            allowedCheckoutDays: toIntArray(listing.allowedCheckoutDays),
            lastMinuteEnabled: listing.lastMinuteEnabled,
            lastMinuteDaysOut: listing.lastMinuteDaysOut,
            lastMinuteDiscountPct: toNum(listing.lastMinuteDiscountPct),
            lastMinuteMinStay: listing.lastMinuteMinStay,
            farOutEnabled: listing.farOutEnabled,
            farOutDaysOut: listing.farOutDaysOut,
            farOutMarkupPct: toNum(listing.farOutMarkupPct),
            farOutMinStay: listing.farOutMinStay,
            dowPricingEnabled: listing.dowPricingEnabled,
            dowDays: toIntArray(listing.dowDays),
            dowPriceAdjPct: toNum(listing.dowPriceAdjPct),
            dowMinStay: listing.dowMinStay,
            gapPreventionEnabled: listing.gapPreventionEnabled,
            minFragmentThreshold: listing.minFragmentThreshold,
            gapFillEnabled: listing.gapFillEnabled,
            gapFillLengthMin: listing.gapFillLengthMin,
            gapFillLengthMax: listing.gapFillLengthMax,
            gapFillDiscountPct: toNum(listing.gapFillDiscountPct),
            gapFillOverrideCico: listing.gapFillOverrideCico,
        };

        // 2. Fetch all enabled rules
        const ruleRows = await db
            .select()
            .from(pricingRules)
            .where(
                and(eq(pricingRules.listingId, listingId), eq(pricingRules.enabled, true))
            )
            .orderBy(pricingRules.priority);

        const allRules: Rule[] = ruleRows.map((r) => ({
            id: r.id,
            ruleType: r.ruleType as any,
            name: r.name,
            enabled: r.enabled,
            priority: r.priority,
            startDate: r.startDate,
            endDate: r.endDate,
            daysOfWeek: r.daysOfWeek,
            minNights: r.minNights,
            priceOverride: toNumOrNull(r.priceOverride),
            priceAdjPct: toNumOrNull(r.priceAdjPct),
            minPriceOverride: toNumOrNull(r.minPriceOverride),
            maxPriceOverride: toNumOrNull(r.maxPriceOverride),
            minStayOverride: r.minStayOverride,
            isBlocked: r.isBlocked,
            closedToArrival: r.closedToArrival,
            closedToDeparture: r.closedToDeparture,
            suspendLastMinute: r.suspendLastMinute,
            suspendGapFill: r.suspendGapFill,
        }));

        // 3. Fetch existing inventory to find bookings
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = addDays(today, 364);

        const existingInventory = await db
            .select()
            .from(inventoryMaster)
            .where(
                and(
                    eq(inventoryMaster.listingId, listingId),
                    sql`${inventoryMaster.date} >= ${dateStr(today)}`
                )
            )
            .orderBy(asc(inventoryMaster.date));

        // Build a map of date -> booking info
        const bookingMap = new Map<string, { isBooked: boolean }>();
        for (const day of existingInventory) {
            bookingMap.set(day.date, {
                isBooked: day.status !== "available",
            });
        }

        // 4. Compute gap information
        const gapMap = computeGaps(today, endDate, bookingMap);

        // 5. Loop 365 days and compute results
        let daysChanged = 0;
        const upsertValues = [];

        for (let i = 0; i < 365; i++) {
            const currentDate = addDays(today, i);
            const ds = dateStr(currentDate);
            const booking = bookingMap.get(ds);
            const gap = gapMap.get(ds);

            const bookingCtx: BookingContext = {
                isBooked: booking?.isBooked ?? false,
                gapLength: gap?.gapLength ?? null,
                gapStart: gap?.gapStart ?? null,
                gapEnd: gap?.gapEnd ?? null,
            };

            const result = computeDay(currentDate, today, config, allRules, bookingCtx);

            upsertValues.push({
                listingId,
                date: ds,
                status: bookingCtx.isBooked ? "booked" : "available",
                currentPrice: toNum(listing.price).toFixed(2),
                proposedPrice: result.price.toFixed(2),
                proposedMinStay: result.minimumStay,
                proposedMaxStay: result.maximumStay,
                proposedClosedToArrival: result.closedToArrival === 1,
                proposedClosedToDeparture: result.closedToDeparture === 1,
                reasoning: result.note,
                proposalStatus: "pending",
            });

            daysChanged++;
        }

        // 6. Upsert into inventory_master (batch)
        if (upsertValues.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < upsertValues.length; i += BATCH_SIZE) {
                const batch = upsertValues.slice(i, i + BATCH_SIZE);
                await db
                    .insert(inventoryMaster)
                    .values(batch as any)
                    .onConflictDoUpdate({
                        target: [inventoryMaster.listingId, inventoryMaster.date],
                        set: {
                            proposedPrice: sql`excluded.proposed_price`,
                            proposedMinStay: sql`excluded.proposed_min_stay`,
                            proposedMaxStay: sql`excluded.proposed_max_stay`,
                            proposedClosedToArrival: sql`excluded.proposed_closed_to_arrival`,
                            proposedClosedToDeparture: sql`excluded.proposed_closed_to_departure`,
                            reasoning: sql`excluded.reasoning`,
                            proposalStatus: sql`excluded.proposal_status`,
                        },
                    });
            }
        }

        // 7. Log the run
        const durationMs = Date.now() - startedAt.getTime();
        const [run] = await db
            .insert(engineRuns)
            .values({
                listingId,
                status: "SUCCESS",
                daysChanged,
                durationMs,
            })
            .returning();

        return run;
    } catch (err: any) {
        const durationMs = Date.now() - startedAt.getTime();
        await db
            .insert(engineRuns)
            .values({
                listingId,
                status: "FAILED",
                errorMessage: err.message,
                durationMs,
            });
        throw err;
    }
}

// ── Gap Detection ──────────────────────────────────────────────────────────────

interface GapInfo {
    gapLength: number;
    gapStart: string;
    gapEnd: string;
}

function computeGaps(
    startDate: Date,
    endDate: Date,
    bookingMap: Map<string, { isBooked: boolean }>
): Map<string, GapInfo> {
    const gapMap = new Map<string, GapInfo>();
    const totalDays =
        Math.round(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;

    const dates: string[] = [];
    const booked: boolean[] = [];

    for (let i = 0; i < totalDays; i++) {
        const d = addDays(startDate, i);
        const ds = dateStr(d);
        dates.push(ds);
        const info = bookingMap.get(ds);
        booked.push(info?.isBooked ?? false);
    }

    let i = 0;
    while (i < totalDays) {
        if (booked[i]) {
            i++;
            continue;
        }

        const gapStartIdx = i;
        const hasBookingBefore = gapStartIdx > 0 && booked[gapStartIdx - 1];

        while (i < totalDays && !booked[i]) {
            i++;
        }

        const gapEndIdx = i - 1;
        const hasBookingAfter = i < totalDays && booked[i];

        if (hasBookingBefore && hasBookingAfter) {
            const gapLength = gapEndIdx - gapStartIdx + 1;
            const gapInfo: GapInfo = {
                gapLength,
                gapStart: dates[gapStartIdx],
                gapEnd: dates[gapEndIdx],
            };

            for (let j = gapStartIdx; j <= gapEndIdx; j++) {
                gapMap.set(dates[j], gapInfo);
            }
        }
    }

    return gapMap;
}

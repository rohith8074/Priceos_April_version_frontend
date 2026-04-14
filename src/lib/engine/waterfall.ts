/**
 * 4-pass pricing waterfall.
 *
 * Produces a 7-parameter vector for a single calendar day:
 *   price, minimum_stay, maximum_stay, is_available,
 *   closed_to_arrival, closed_to_departure, note
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListingConfig {
    basePrice: number;
    absoluteMinPrice: number;
    absoluteMaxPrice: number;
    defaultMinStay: number;
    defaultMaxStay: number;
    lowestMinStayAllowed: number;
    allowedCheckinDays: number[]; // [Mon..Sun] 0/1
    allowedCheckoutDays: number[]; // [Mon..Sun] 0/1

    lastMinuteEnabled: boolean;
    lastMinuteDaysOut: number;
    lastMinuteDiscountPct: number;
    lastMinuteMinStay: number | null;

    // Gradual last-minute ramp curve (KB Tier 1 #3)
    // When enabled, discount tapers from maxDiscountPct (day 0) → minDiscountPct (day rampDays)
    lastMinuteRampEnabled: boolean;
    lastMinuteRampDays: number;
    lastMinuteMaxDiscountPct: number;
    lastMinuteMinDiscountPct: number;

    farOutEnabled: boolean;
    farOutDaysOut: number;
    farOutMarkupPct: number;
    farOutMinStay: number | null;

    dowPricingEnabled: boolean;
    dowDays: number[]; // e.g. [5,6] — 0=Mon..6=Sun
    dowPriceAdjPct: number;
    dowMinStay: number | null;

    gapPreventionEnabled: boolean;
    minFragmentThreshold: number;

    gapFillEnabled: boolean;
    gapFillLengthMin: number;
    gapFillLengthMax: number;
    gapFillDiscountPct: number;
    gapFillOverrideCico: boolean;

    // Occupancy-based adjustments (KB Tier 1 #4 — Revenue 9/10)
    // currentOccupancyPct is a rolling value computed by the pipeline caller
    occupancyEnabled: boolean;
    currentOccupancyPct: number;       // rolling occupancy % passed in by pipeline
    occupancyTargetPct: number;
    occupancyHighThresholdPct: number;
    occupancyHighAdjPct: number;       // positive = price up (e.g. +8)
    occupancyLowThresholdPct: number;
    occupancyLowAdjPct: number;        // negative = price down (e.g. -10)

    // Weekend minimum pricing (KB Tier 2 #8)
    weekendMinPrice: number;
    weekendDays: number[]; // DOW indices (0=Mon..6=Sun), e.g. [3,4] for Thu/Fri
}

export interface Rule {
    id: string | number;
    ruleType: "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
    name: string;
    enabled: boolean;
    priority: number;
    startDate: string | null;
    endDate: string | null;
    daysOfWeek: number[] | null;
    minNights: number | null;
    priceOverride: number | null;
    priceAdjPct: number | null;
    minPriceOverride: number | null;
    maxPriceOverride: number | null;
    minStayOverride: number | null;
    isBlocked: boolean;
    closedToArrival: boolean;
    closedToDeparture: boolean;
    suspendLastMinute: boolean;
    suspendGapFill: boolean;
}

export interface BookingContext {
    isBooked: boolean;
    gapLength: number | null; // length of gap this day is part of, null if not in a gap
    gapStart: string | null;
    gapEnd: string | null;
}

export interface DayResult {
    price: number;
    minimumStay: number;
    maximumStay: number;
    isAvailable: number; // 0 or 1
    closedToArrival: number; // 0 or 1
    closedToDeparture: number; // 0 or 1
    note: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a Date to 0=Mon..6=Sun index */
function getDow(date: Date): number {
    // JS getDay() returns 0=Sun..6=Sat
    // We need 0=Mon..6=Sun
    const jsDay = date.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function dateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

// ── Main Function ──────────────────────────────────────────────────────────────

export function computeDay(
    date: Date,
    today: Date,
    config: ListingConfig,
    allRules: Rule[],
    bookingCtx: BookingContext
): DayResult {
    const notes: string[] = [];
    const dow = getDow(date);
    const leadTime = daysBetween(today, date);

    // ── Pass 1 — Foundation ────────────────────────────────────────────────────

    let price = config.basePrice;
    let minimumStay = config.defaultMinStay;
    let maximumStay = config.defaultMaxStay;
    let isAvailable = bookingCtx.isBooked ? 0 : 1;
    let closedToArrival = config.allowedCheckinDays[dow] === 0 ? 1 : 0;
    let closedToDeparture = config.allowedCheckoutDays[dow] === 0 ? 1 : 0;

    if (closedToArrival) notes.push("[BASE] Closed to arrival (DOW restriction)");
    if (closedToDeparture)
        notes.push("[BASE] Closed to departure (DOW restriction)");

    // Track suspensions from winning rule
    let suspendLastMinute = false;
    let suspendGapFill = false;

    // Rule-level min/max price overrides (from winning rule)
    let ruleMinPrice: number | null = null;
    let ruleMaxPrice: number | null = null;

    // Find matching date-override rules (SEASON, EVENT, ADMIN_BLOCK)
    const dateRules = allRules
        .filter((r) => {
            if (!r.enabled) return false;
            if (!["SEASON", "EVENT", "ADMIN_BLOCK"].includes(r.ruleType))
                return false;
            if (!r.startDate || !r.endDate) return false;
            const ds = dateStr(date);
            if (ds < r.startDate || ds > r.endDate) return false;
            // DOW filter within date range
            if (r.daysOfWeek && r.daysOfWeek.length > 0) {
                if (r.daysOfWeek[dow] === 0) return false;
            }
            return true;
        })
        .sort((a, b) => b.priority - a.priority);

    // Apply highest priority match
    if (dateRules.length > 0) {
        const winner = dateRules[0];

        if (winner.priceOverride !== null) {
            price = winner.priceOverride;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" set price to ${price}`
            );
        } else if (winner.priceAdjPct !== null) {
            price = price * (1 + winner.priceAdjPct / 100);
            notes.push(
                `[${winner.ruleType}] "${winner.name}" adjusted price by ${winner.priceAdjPct}%`
            );
        }

        if (winner.minStayOverride !== null) {
            minimumStay = winner.minStayOverride;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" set min stay to ${minimumStay}`
            );
        }

        if (winner.isBlocked) {
            isAvailable = 0;
            notes.push(`[${winner.ruleType}] "${winner.name}" blocked this day`);
        }

        if (winner.closedToArrival) {
            closedToArrival = 1;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" closed to arrival`
            );
        }

        if (winner.closedToDeparture) {
            closedToDeparture = 1;
            notes.push(
                `[${winner.ruleType}] "${winner.name}" closed to departure`
            );
        }

        suspendLastMinute = winner.suspendLastMinute;
        suspendGapFill = winner.suspendGapFill;
        ruleMinPrice = winner.minPriceOverride;
        ruleMaxPrice = winner.maxPriceOverride;
    }

    // If booked, mark unavailable
    if (bookingCtx.isBooked) {
        isAvailable = 0;
        notes.push("[BOOKED] Day is booked");
    }

    // ── Pass 2 — Strategy ─────────────────────────────────────────────────────

    // Last-minute discount (flat or gradual ramp curve — KB Tier 1 #3)
    if (
        config.lastMinuteEnabled &&
        !suspendLastMinute &&
        leadTime <= config.lastMinuteDaysOut &&
        leadTime >= 0 &&
        isAvailable === 1
    ) {
        let discountPct: number;
        if (config.lastMinuteRampEnabled && config.lastMinuteRampDays > 0) {
            // Gradual ramp: lerp from maxDiscountPct (day 0) → minDiscountPct (day rampDays)
            const rampWindow = Math.min(config.lastMinuteRampDays, config.lastMinuteDaysOut);
            const t = Math.min(leadTime / rampWindow, 1); // 0 at day 0 → 1 at day rampDays
            discountPct =
                config.lastMinuteMaxDiscountPct * (1 - t) +
                config.lastMinuteMinDiscountPct * t;
            notes.push(
                `[LAST_MINUTE_RAMP] ${discountPct.toFixed(1)}% discount (lerp ${config.lastMinuteMaxDiscountPct}%→${config.lastMinuteMinDiscountPct}%, ${leadTime}/${rampWindow} days out)`
            );
        } else {
            discountPct = config.lastMinuteDiscountPct;
            notes.push(
                `[LAST_MINUTE] ${discountPct}% discount (${leadTime} days out)`
            );
        }
        price = price * (1 - discountPct / 100);
        if (config.lastMinuteMinStay !== null) {
            minimumStay = config.lastMinuteMinStay;
            notes.push(`[LAST_MINUTE] min stay override to ${minimumStay}`);
        }
    }

    // Far-out premium
    if (
        config.farOutEnabled &&
        !suspendLastMinute && // spec says "if NOT suspended" for both
        leadTime >= config.farOutDaysOut &&
        isAvailable === 1
    ) {
        price = price * (1 + config.farOutMarkupPct / 100);
        notes.push(
            `[FAR_OUT] ${config.farOutMarkupPct}% premium (${leadTime} days out)`
        );
        if (config.farOutMinStay !== null) {
            minimumStay = config.farOutMinStay;
            notes.push(`[FAR_OUT] min stay override to ${minimumStay}`);
        }
    }

    // DOW pricing
    if (
        config.dowPricingEnabled &&
        config.dowDays.includes(dow) &&
        isAvailable === 1
    ) {
        price = price * (1 + config.dowPriceAdjPct / 100);
        notes.push(`[DOW] ${config.dowPriceAdjPct}% adjustment for day ${dow}`);
        if (config.dowMinStay !== null) {
            minimumStay = config.dowMinStay;
            notes.push(`[DOW] min stay override to ${minimumStay}`);
        }
    }

    // Occupancy-based adjustment (KB Tier 1 #4 — Revenue 9/10)
    if (config.occupancyEnabled && isAvailable === 1) {
        const occ = config.currentOccupancyPct;
        if (occ > config.occupancyHighThresholdPct) {
            price = price * (1 + config.occupancyHighAdjPct / 100);
            notes.push(
                `[OCCUPANCY] ${occ.toFixed(1)}% > high threshold ${config.occupancyHighThresholdPct}%, +${config.occupancyHighAdjPct}%`
            );
        } else if (occ < config.occupancyLowThresholdPct) {
            price = price * (1 + config.occupancyLowAdjPct / 100); // lowAdjPct is negative
            notes.push(
                `[OCCUPANCY] ${occ.toFixed(1)}% < low threshold ${config.occupancyLowThresholdPct}%, ${config.occupancyLowAdjPct}%`
            );
        } else {
            notes.push(
                `[OCCUPANCY] ${occ.toFixed(1)}% in target zone [${config.occupancyLowThresholdPct}%–${config.occupancyHighThresholdPct}%], no adjustment`
            );
        }
    }

    // LOS discounts
    const losRules = allRules
        .filter(
            (r) =>
                r.enabled &&
                r.ruleType === "LOS_DISCOUNT" &&
                r.minNights !== null
        )
        .sort((a, b) => (b.minNights ?? 0) - (a.minNights ?? 0));

    if (losRules.length > 0) {
        // Store LOS discount info in note for reference; actual LOS discount
        // is applied at booking time, but we note available discounts
        const losNotes = losRules.map(
            (r) => `${r.minNights}+ nights: ${r.priceAdjPct}%`
        );
        notes.push(`[LOS_DISCOUNT] Available: ${losNotes.join(", ")}`);
    }

    // ── Pass 3 — Inventory (Gap Logic) ────────────────────────────────────────

    if (
        bookingCtx.gapLength !== null &&
        !bookingCtx.isBooked &&
        isAvailable === 1
    ) {
        // Gap prevention: if fragment is too small, block it
        if (
            config.gapPreventionEnabled &&
            bookingCtx.gapLength < config.minFragmentThreshold
        ) {
            isAvailable = 0;
            notes.push(
                `[GAP_PREVENTION] Gap of ${bookingCtx.gapLength} days < threshold ${config.minFragmentThreshold}, blocked`
            );
        }

        // Gap fill: if gap is in target range, discount and adjust
        if (
            config.gapFillEnabled &&
            !suspendGapFill &&
            isAvailable === 1 &&
            bookingCtx.gapLength >= config.gapFillLengthMin &&
            bookingCtx.gapLength <= config.gapFillLengthMax
        ) {
            price = price * (1 - config.gapFillDiscountPct / 100);
            minimumStay = bookingCtx.gapLength;
            notes.push(
                `[GAP_FILL] ${config.gapFillDiscountPct}% discount, min stay set to gap length ${bookingCtx.gapLength}`
            );

            if (config.gapFillOverrideCico) {
                closedToArrival = 0;
                closedToDeparture = 0;
                notes.push(`[GAP_FILL] CICO restrictions overridden`);
            }
        }
    }

    // ── Pass 4 — Integrity ────────────────────────────────────────────────────

    // Weekend minimum price (KB Tier 2 #8) — applied before global floor clamp
    if (
        config.weekendMinPrice > 0 &&
        config.weekendDays.includes(dow) &&
        isAvailable === 1 &&
        price < config.weekendMinPrice
    ) {
        notes.push(
            `[WEEKEND_MIN] Price ${price.toFixed(2)} raised to weekend min ${config.weekendMinPrice} (DOW ${dow})`
        );
        price = config.weekendMinPrice;
    }

    const effectiveMinPrice = ruleMinPrice ?? config.absoluteMinPrice;
    const effectiveMaxPrice = ruleMaxPrice ?? config.absoluteMaxPrice;

    if (price < effectiveMinPrice) {
        notes.push(
            `[CLAMP] Price ${price.toFixed(2)} clamped to min ${effectiveMinPrice}`
        );
        price = effectiveMinPrice;
    }
    if (price > effectiveMaxPrice) {
        notes.push(
            `[CLAMP] Price ${price.toFixed(2)} clamped to max ${effectiveMaxPrice}`
        );
        price = effectiveMaxPrice;
    }

    if (minimumStay < config.lowestMinStayAllowed) {
        notes.push(
            `[CLAMP] Min stay ${minimumStay} clamped to lowest allowed ${config.lowestMinStayAllowed}`
        );
        minimumStay = config.lowestMinStayAllowed;
    }

    // Round price to 2 decimal places
    price = Math.round(price * 100) / 100;

    return {
        price,
        minimumStay,
        maximumStay,
        isAvailable,
        closedToArrival,
        closedToDeparture,
        note: notes.join("; "),
    };
}

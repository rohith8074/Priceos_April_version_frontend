import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: idStr } = await params;
        const id = parseInt(idStr);
        const result = await db
            .select()
            .from(listings)
            .where(eq(listings.id, id));

        if (result.length === 0) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        }

        const l = result[0];
        const config = {
            priceFloor: l.priceFloor,
            priceCeiling: l.priceCeiling,
            lastMinuteEnabled: l.lastMinuteEnabled,
            lastMinuteDaysOut: l.lastMinuteDaysOut,
            lastMinuteDiscountPct: l.lastMinuteDiscountPct,
            lastMinuteMinStay: l.lastMinuteMinStay,
            farOutEnabled: l.farOutEnabled,
            farOutDaysOut: l.farOutDaysOut,
            farOutMarkupPct: l.farOutMarkupPct,
            farOutMinStay: l.farOutMinStay,
            dowPricingEnabled: l.dowPricingEnabled,
            dowDays: l.dowDays,
            dowPriceAdjPct: l.dowPriceAdjPct,
            dowMinStay: l.dowMinStay,
            gapPreventionEnabled: l.gapPreventionEnabled,
            minFragmentThreshold: l.minFragmentThreshold,
            gapFillEnabled: l.gapFillEnabled,
            gapFillLengthMin: l.gapFillLengthMin,
            gapFillLengthMax: l.gapFillLengthMax,
            gapFillDiscountPct: l.gapFillDiscountPct,
            gapFillOverrideCico: l.gapFillOverrideCico,
            allowedCheckinDays: l.allowedCheckinDays,
            allowedCheckoutDays: l.allowedCheckoutDays,
            lowestMinStayAllowed: l.lowestMinStayAllowed,
            defaultMaxStay: l.defaultMaxStay,
        };

        return NextResponse.json(config);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: idStr } = await params;
        const id = parseInt(idStr);
        const body = await req.json();

        // Whitelist valid update fields
        const updateFields: any = {};
        const allowed = [
            "priceFloor",
            "priceCeiling",
            "lastMinuteEnabled",
            "lastMinuteDaysOut",
            "lastMinuteDiscountPct",
            "lastMinuteMinStay",
            "farOutEnabled",
            "farOutDaysOut",
            "farOutMarkupPct",
            "farOutMinStay",
            "dowPricingEnabled",
            "dowDays",
            "dowPriceAdjPct",
            "dowMinStay",
            "gapPreventionEnabled",
            "minFragmentThreshold",
            "gapFillEnabled",
            "gapFillLengthMin",
            "gapFillLengthMax",
            "gapFillDiscountPct",
            "gapFillOverrideCico",
            "allowedCheckinDays",
            "allowedCheckoutDays",
            "lowestMinStayAllowed",
            "defaultMaxStay",
        ];

        for (const key of allowed) {
            if (body[key] !== undefined) {
                updateFields[key] = body[key];
            }
        }

        await db.update(listings).set(updateFields).where(eq(listings.id, id));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

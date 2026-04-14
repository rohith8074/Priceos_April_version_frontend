import { connectDB, Listing } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await connectDB();

        const l = await Listing.findById(new mongoose.Types.ObjectId(id)).lean();
        if (!l) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        }

        const config = {
            priceFloor: l.priceFloor,
            priceCeiling: l.priceCeiling,
            lastMinuteEnabled: l.lastMinuteEnabled,
            lastMinuteDaysOut: l.lastMinuteDaysOut,
            lastMinuteDiscountPct: l.lastMinuteDiscountPct,
            lastMinuteMinStay: l.lastMinuteMinStay,
            lastMinuteRampEnabled: l.lastMinuteRampEnabled ?? false,
            lastMinuteRampDays: l.lastMinuteRampDays ?? 15,
            lastMinuteMaxDiscountPct: l.lastMinuteMaxDiscountPct ?? 30,
            lastMinuteMinDiscountPct: l.lastMinuteMinDiscountPct ?? 5,
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
            occupancyEnabled: l.occupancyEnabled ?? false,
            occupancyTargetPct: l.occupancyTargetPct ?? 75,
            occupancyHighThresholdPct: l.occupancyHighThresholdPct ?? 85,
            occupancyHighAdjPct: l.occupancyHighAdjPct ?? 15,
            occupancyLowThresholdPct: l.occupancyLowThresholdPct ?? 50,
            occupancyLowAdjPct: l.occupancyLowAdjPct ?? -10,
            occupancyLookbackDays: l.occupancyLookbackDays ?? 30,
            weekendMinPrice: l.weekendMinPrice ?? 0,
            weekendDays: l.weekendDays ?? [4, 5],
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
        const { id } = await params;
        await connectDB();

        const body = await req.json();
        const allowed = [
            "priceFloor", "priceCeiling",
            "lastMinuteEnabled", "lastMinuteDaysOut", "lastMinuteDiscountPct", "lastMinuteMinStay",
            "lastMinuteRampEnabled", "lastMinuteRampDays", "lastMinuteMaxDiscountPct", "lastMinuteMinDiscountPct",
            "farOutEnabled", "farOutDaysOut", "farOutMarkupPct", "farOutMinStay",
            "dowPricingEnabled", "dowDays", "dowPriceAdjPct", "dowMinStay",
            "gapPreventionEnabled", "minFragmentThreshold",
            "gapFillEnabled", "gapFillLengthMin", "gapFillLengthMax", "gapFillDiscountPct", "gapFillOverrideCico",
            "allowedCheckinDays", "allowedCheckoutDays",
            "lowestMinStayAllowed", "defaultMaxStay",
            "occupancyEnabled", "occupancyTargetPct", "occupancyHighThresholdPct", "occupancyHighAdjPct",
            "occupancyLowThresholdPct", "occupancyLowAdjPct", "occupancyLookbackDays",
            "weekendMinPrice", "weekendDays",
        ];

        const updateFields: Record<string, unknown> = {};
        for (const key of allowed) {
            if (body[key] !== undefined) updateFields[key] = body[key];
        }

        await Listing.findByIdAndUpdate(new mongoose.Types.ObjectId(id), { $set: updateFields });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

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
            farOutMinPrice: l.farOutMinPrice ?? 0,
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
            gapFillDiscountWeekdayPct: l.gapFillDiscountWeekdayPct ?? 0,
            gapFillDiscountWeekendPct: l.gapFillDiscountWeekendPct ?? 0,
            gapFillMaxDaysUntilCheckin: l.gapFillMaxDaysUntilCheckin ?? 30,
            gapFillOverrideCico: l.gapFillOverrideCico,
            adjacentAdjustmentEnabled: l.adjacentAdjustmentEnabled ?? false,
            adjacentAdjustmentPct: l.adjacentAdjustmentPct ?? 0,
            adjacentTurnoverCost: l.adjacentTurnoverCost ?? 0,
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
            occupancyWindowProfiles: l.occupancyWindowProfiles ?? [],
            useGroupOccupancyProfile: l.useGroupOccupancyProfile ?? true,
            groupOccupancyWeightPct: l.groupOccupancyWeightPct ?? 50,
            groupOccupancyProfiles: l.groupOccupancyProfiles ?? [],
            basePriceSource: l.basePriceSource ?? "hostaway",
            basePriceConfidencePct: l.basePriceConfidencePct ?? 0,
            basePriceSampleSize: l.basePriceSampleSize ?? 0,
            basePriceLastComputedAt: l.basePriceLastComputedAt ?? null,
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
            "farOutMinPrice",
            "dowPricingEnabled", "dowDays", "dowPriceAdjPct", "dowMinStay",
            "gapPreventionEnabled", "minFragmentThreshold",
            "gapFillEnabled", "gapFillLengthMin", "gapFillLengthMax", "gapFillDiscountPct",
            "gapFillDiscountWeekdayPct", "gapFillDiscountWeekendPct", "gapFillMaxDaysUntilCheckin",
            "gapFillOverrideCico", "adjacentAdjustmentEnabled", "adjacentAdjustmentPct", "adjacentTurnoverCost",
            "allowedCheckinDays", "allowedCheckoutDays",
            "lowestMinStayAllowed", "defaultMaxStay",
            "occupancyEnabled", "occupancyTargetPct", "occupancyHighThresholdPct", "occupancyHighAdjPct",
            "occupancyLowThresholdPct", "occupancyLowAdjPct", "occupancyLookbackDays", "occupancyWindowProfiles",
            "useGroupOccupancyProfile", "groupOccupancyWeightPct",
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

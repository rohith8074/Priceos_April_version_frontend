import { connectDB, PricingRule } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

const ALLOWED_FIELDS = [
  "name", "enabled", "priority", "startDate", "endDate", "daysOfWeek", "minNights",
  "priceOverride", "priceAdjPct", "minPriceOverride", "maxPriceOverride", "minStayOverride",
  "isBlocked", "closedToArrival", "closedToDeparture", "suspendLastMinute", "suspendGapFill",
];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const { id, ruleId } = await params;
    await connectDB();

    const body = await req.json();
    const updateFields: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (body[key] !== undefined) updateFields[key] = body[key];
    }

    const rule = await PricingRule.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(ruleId),
        listingId: new mongoose.Types.ObjectId(id),
      },
      { $set: updateFields },
      { new: true }
    );

    if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    return NextResponse.json(rule);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const { id, ruleId } = await params;
    await connectDB();

    await PricingRule.deleteOne({
      _id: new mongoose.Types.ObjectId(ruleId),
      listingId: new mongoose.Types.ObjectId(id),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

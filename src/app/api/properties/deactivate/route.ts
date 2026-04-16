import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import {
  connectDB,
  BenchmarkData,
  ChatMessage,
  EngineRun,
  GuestSummary,
  HostawayConversation,
  Insight,
  InventoryMaster,
  Listing,
  MarketEvent,
  Organization,
  PricingRule,
  PropertyGroup,
  Reservation,
} from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const listingId = body?.listingId as string | undefined;
  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return NextResponse.json({ error: "Valid listingId is required" }, { status: 400 });
  }

  await connectDB();

  const orgId = new mongoose.Types.ObjectId(session.orgId);
  const listingObjectId = new mongoose.Types.ObjectId(listingId);

  const listing = await Listing.findOne({ _id: listingObjectId, orgId }).select("_id").lean();
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  await Promise.all([
    Organization.findByIdAndUpdate(orgId, {
      $pull: {
        "onboarding.activatedListingIds": listingId,
        "onboarding.selectedListingIds": listingId,
      },
    }),
    Listing.findByIdAndUpdate(listingObjectId, { $set: { isActive: false } }),
    InventoryMaster.deleteMany({ orgId, listingId: listingObjectId }),
    Reservation.deleteMany({ orgId, listingId: listingObjectId }),
    PricingRule.deleteMany({ orgId, listingId: listingObjectId }),
    HostawayConversation.deleteMany({ orgId, listingId: listingObjectId }),
    GuestSummary.deleteMany({ orgId, listingId: listingObjectId }),
    BenchmarkData.deleteMany({ orgId, listingId: listingObjectId }),
    EngineRun.deleteMany({ orgId, listingId: listingObjectId }),
    Insight.deleteMany({ orgId, listingId: listingObjectId }),
    MarketEvent.deleteMany({ orgId, listingId: listingObjectId }),
    ChatMessage.deleteMany({ orgId, propertyId: listingObjectId }),
    PropertyGroup.updateMany({ orgId }, { $pull: { listingIds: listingObjectId } }),
  ]);

  await PropertyGroup.deleteMany({ orgId, listingIds: { $size: 0 } });

  return NextResponse.json({ success: true, listingId });
}


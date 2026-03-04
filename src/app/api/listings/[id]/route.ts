import { NextRequest, NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const pms = createPMSClient();
  try {
    const updated = await pms.updateListing(id, body);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
}

/**
 * PATCH /api/listings/[id]
 * Updates price guardrails (floor and ceiling) directly in Neon DB.
 * Body: { priceFloor: number, priceCeiling: number }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id, 10);
    if (isNaN(listingId)) {
      return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
    }

    const body = await request.json();
    const { priceFloor, priceCeiling } = body;

    // Validate
    if (priceFloor === undefined || priceCeiling === undefined) {
      return NextResponse.json({ error: "priceFloor and priceCeiling are required" }, { status: 400 });
    }
    const floor = Number(priceFloor);
    const ceiling = Number(priceCeiling);
    if (isNaN(floor) || isNaN(ceiling) || floor < 0 || ceiling < 0) {
      return NextResponse.json({ error: "Floor and ceiling must be non-negative numbers" }, { status: 400 });
    }
    if (ceiling > 0 && ceiling < floor) {
      return NextResponse.json({ error: "Ceiling price must be greater than floor price" }, { status: 400 });
    }

    console.log(`💰 [Listings PATCH] Updating guardrails for listing #${listingId}: floor=${floor}, ceiling=${ceiling}`);

    const updated = await db
      .update(listings)
      .set({
        priceFloor: String(floor),
        priceCeiling: String(ceiling),
      })
      .where(eq(listings.id, listingId))
      .returning({ id: listings.id, priceFloor: listings.priceFloor, priceCeiling: listings.priceCeiling, name: listings.name });

    if (updated.length === 0) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    console.log(`✅ [Listings PATCH] Updated: ${updated[0].name} → floor: ${floor}, ceiling: ${ceiling}`);
    return NextResponse.json({ success: true, listing: updated[0] });
  } catch (error) {
    console.error("[Listings PATCH] Error:", error);
    return NextResponse.json({ error: "Failed to update price guardrails" }, { status: 500 });
  }
}

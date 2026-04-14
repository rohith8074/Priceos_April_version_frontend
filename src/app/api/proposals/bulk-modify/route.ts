import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

// POST /api/proposals/bulk-modify
// Body: { proposalIds: string[], newPrice: number }
// Sets proposedPrice to newPrice and recalculates changePct on each proposal.
// IMPORTANT: Never POST to Hostaway — only update local DB.

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { proposalIds, newPrice } = await req.json();
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) {
      return NextResponse.json({ error: "Invalid proposal IDs" }, { status: 400 });
    }
    if (typeof newPrice !== "number" || newPrice <= 0) {
      return NextResponse.json({ error: "newPrice must be a positive number" }, { status: 400 });
    }

    await connectDB();

    // Fetch current prices to calculate changePct per proposal
    const docs = await InventoryMaster.find({
      _id: { $in: proposalIds },
      orgId: session.orgId,
      proposalStatus: "pending",
    }).lean();

    if (docs.length === 0) {
      return NextResponse.json({ error: "No matching pending proposals found" }, { status: 404 });
    }

    let modifiedCount = 0;
    for (const doc of docs) {
      const currentPrice = Number(doc.currentPrice || 0);
      const changePct = currentPrice > 0
        ? Math.round(((newPrice - currentPrice) / currentPrice) * 100)
        : null;

      await InventoryMaster.findByIdAndUpdate(doc._id, {
        $set: {
          proposedPrice: newPrice,
          changePct,
          reasoning: doc.reasoning
            ? `[Manually modified to AED ${newPrice}] ${doc.reasoning}`
            : `Manually modified to AED ${newPrice}`,
        },
      });
      modifiedCount++;
    }

    return NextResponse.json({ success: true, count: modifiedCount });
  } catch (error) {
    console.error("[Proposals bulk-modify]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

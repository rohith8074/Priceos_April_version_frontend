import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { proposalIds } = await req.json();
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) {
      return NextResponse.json({ error: "Invalid proposal IDs" }, { status: 400 });
    }

    await connectDB();

    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const normalizedIds = proposalIds.map((id: string) => new mongoose.Types.ObjectId(id));

    // Approve: copy proposedPrice → currentPrice, mark approved.
    // IMPORTANT: Never POST to Hostaway — only update local DB.
    const pendingDocs = await InventoryMaster.find({
      _id: { $in: normalizedIds },
      orgId,
      proposalStatus: { $in: ["pending", "rejected"] },
      proposedPrice: { $ne: null },
    })
      .select("_id proposedPrice")
      .lean();

    if (pendingDocs.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    let modifiedCount = 0;
    for (const doc of pendingDocs) {
      const updateResult = await InventoryMaster.updateOne(
        { _id: doc._id, orgId, proposalStatus: { $in: ["pending", "rejected"] } },
        {
          $set: {
            currentPrice: Number(doc.proposedPrice ?? 0),
            proposalStatus: "approved" as const,
          },
          $unset: { proposedPrice: 1, changePct: 1 },
        }
      );
      modifiedCount += updateResult.modifiedCount;
    }

    return NextResponse.json({ success: true, count: modifiedCount });
  } catch (error) {
    console.error("[Proposals bulk-approve]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB, ChatMessage } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";
import { buildBaseScopeId } from "@/lib/chat/agent-session-id";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * List distinct chat session IDs for a property + date range (including legacy base-only id).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!propertyId || propertyId === "null" || !from || !to) {
      return NextResponse.json({ sessions: [] });
    }

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    let listingOid: mongoose.Types.ObjectId;
    try {
      listingOid = new mongoose.Types.ObjectId(propertyId);
    } catch {
      return NextResponse.json({ error: "Invalid propertyId" }, { status: 400 });
    }

    const baseScope = buildBaseScopeId(propertyId, from, to);
    const threadPrefix = new RegExp(`^${escapeRegex(baseScope)}--`);

    const rows = await ChatMessage.aggregate<{
      _id: string;
      lastAt: Date;
      messageCount: number;
    }>([
      {
        $match: {
          orgId,
          "context.propertyId": listingOid,
          $or: [{ sessionId: baseScope }, { sessionId: threadPrefix }],
        },
      },
      {
        $group: {
          _id: "$sessionId",
          lastAt: { $max: "$createdAt" },
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { lastAt: -1 } },
    ]);

    const sessions = rows.map((r) => ({
      sessionId: r._id,
      lastMessageAt: r.lastAt.toISOString(),
      messageCount: r.messageCount,
    }));

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[chat/sessions] GET error:", err);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}

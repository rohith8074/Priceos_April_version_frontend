import { NextResponse } from "next/server";
import { connectDB, HostawayConversation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const conversationId = String(body.conversationId || "");
    const text = String(body.text || "");

    if (!conversationId || !text) {
      return NextResponse.json({ error: "conversationId and text are required" }, { status: 400 });
    }

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const now = new Date().toISOString();

    await HostawayConversation.updateMany(
      { orgId, hostawayConversationId: conversationId },
      {
        $push: {
          messages: {
            sender: "admin",
            text,
            timestamp: now,
          },
        },
        $set: { needsReply: false, syncedAt: new Date() },
      }
    );

    return NextResponse.json({ success: true, message: "Reply saved" });
  } catch (error: any) {
    console.error("[hostaway/reply] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to save reply" }, { status: 500 });
  }
}

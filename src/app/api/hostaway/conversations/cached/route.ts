import { NextResponse } from "next/server";
import { connectDB, HostawayConversation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

/**
 * GET /api/hostaway/conversations/cached
 *
 * Returns previously synced conversations from MongoDB.
 * No Hostaway API calls — purely reads from our cache.
 *
 * Query params: listingId, from, to (from/to optional)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");

    if (!listingId) {
        return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }

    try {
        await connectDB();
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        let listingObjectId: mongoose.Types.ObjectId;
        try {
            listingObjectId = new mongoose.Types.ObjectId(listingId);
        } catch {
            return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
        }

        const query: Record<string, any> = { orgId, listingId: listingObjectId };
        if (dateFrom && dateTo) {
            query.dateFrom = { $lte: dateTo };
            query.dateTo = { $gte: dateFrom };
        }

        const rows = await HostawayConversation.find(query).sort({ syncedAt: -1 }).lean();

        if (rows.length === 0) {
            return NextResponse.json({ success: true, conversations: [] });
        }

        // Deduplicate by hostawayConversationId
        const uniqueRowsMap = new Map<string, typeof rows[0]>();
        for (const row of rows) {
            if (!uniqueRowsMap.has(row.hostawayConversationId)) {
                uniqueRowsMap.set(row.hostawayConversationId, row);
            }
        }
        const uniqueRows = Array.from(uniqueRowsMap.values());

        const uiConversations = uniqueRows.map((conv) => {
            const dbMessages = conv.messages as { sender: string; text: string; timestamp: string }[];

            const allMessages = dbMessages
                .map((m, idx) => ({
                    id: `${conv.hostawayConversationId}_${idx}`,
                    sender: m.sender as "guest" | "admin",
                    text: m.text,
                    time: m.timestamp
                        ? new Date(m.timestamp).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                          })
                        : "",
                    _ts: m.timestamp ? new Date(m.timestamp).getTime() : idx,
                }))
                .sort((a, b) => a._ts - b._ts);

            const lastMsg = allMessages[allMessages.length - 1];

            return {
                id: conv.hostawayConversationId,
                guestName: conv.guestName,
                lastMessage: lastMsg?.text || "No messages",
                status: lastMsg?.sender === "guest" ? "needs_reply" : "resolved",
                messages: allMessages.map(({ _ts, ...rest }) => rest),
            };
        });

        return NextResponse.json({
            success: true,
            conversations: uiConversations,
            cached: true,
        });
    } catch (error) {
        console.error("❌ [Cached Conversations] Error:", error);
        return NextResponse.json({ error: "Failed to load cached conversations" }, { status: 500 });
    }
}

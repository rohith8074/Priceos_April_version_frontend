import { NextResponse } from "next/server";
import { connectDB, HostawayConversation, Listing, Organization, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

type UiMessage = { sender: string; text: string; timestamp: string };

async function fetchConversationMessagesInBatches(
    conversations: any[],
    token: string,
    batchSize = 10
): Promise<Map<string, UiMessage[]>> {
    const result = new Map<string, UiMessage[]>();

    for (let i = 0; i < conversations.length; i += batchSize) {
        const batch = conversations.slice(i, i + batchSize);

        await Promise.all(
            batch.map(async (conv: any) => {
                const convId = String(conv?.id || "");
                if (!convId) return;

                try {
                    const msgRes = await fetch(
                        `https://api.hostaway.com/v1/conversations/${convId}/messages?limit=50`,
                        {
                            method: "GET",
                            headers: {
                                Authorization: `Bearer ${token}`,
                                "Content-Type": "application/json",
                            },
                            cache: "no-store",
                        }
                    );

                    if (!msgRes.ok) {
                        result.set(convId, []);
                        return;
                    }

                    const msgJson = await msgRes.json();
                    const rawMsgs = msgJson.result || [];
                    const messages: UiMessage[] = rawMsgs
                        .filter((m: any) => m.body && m.body.trim())
                        .map((m: any) => ({
                            sender: m.isIncoming ? "guest" : "admin",
                            text: m.body || "",
                            timestamp: m.insertedOn || m.updatedOn || "",
                        }));

                    result.set(convId, messages);
                } catch {
                    result.set(convId, []);
                }
            })
        );
    }

    return result;
}

/**
 * GET /api/hostaway/conversations
 *
 * Fetches conversations from Hostaway API, caches to MongoDB.
 *
 * Query params: listingId, from, to (from/to optional; if omitted, sync all)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");

    console.log(`🚀 [Hostaway Sync] GET /api/hostaway/conversations`);
    console.log(`   ├─ listingId: ${listingId}`);
    console.log(`   ├─ dateFrom: ${dateFrom}`);
    console.log(`   └─ dateTo: ${dateTo}`);

    if (!listingId) {
        return NextResponse.json(
            { error: "listingId query param is required" },
            { status: 400 }
        );
    }

    try {
        await connectDB();

        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json(
                { error: "Unauthorized", reasonCode: "SESSION_REQUIRED" },
                { status: 401 }
            );
        }
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        let listingObjectId: mongoose.Types.ObjectId;
        try {
            listingObjectId = new mongoose.Types.ObjectId(listingId);
        } catch {
            return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
        }

        const org = await Organization.findById(orgId).select("hostawayApiKey").lean();
        const token = org?.hostawayApiKey;
        if (!token) {
            return NextResponse.json(
                {
                    error: "Hostaway API key not configured for this organization",
                    reasonCode: "HOSTAWAY_KEY_MISSING",
                },
                { status: 400 }
            );
        }

        const listing = await Listing.findById(listingObjectId).select("hostawayId").lean();
        if (!listing) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        }

        const orgListings = await Listing.find({ orgId }).select("_id hostawayId name").lean();
        const hostawayToMongoListingId = new Map<string, string>();
        const normalizedNameToMongoListingId = new Map<string, string>();
        const normalizeName = (v: string) =>
            String(v || "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .replace(/[^\w\s]/g, "")
                .trim();
        for (const l of orgListings as any[]) {
            const hw = String(l.hostawayId || "").trim();
            if (hw) {
                hostawayToMongoListingId.set(hw, String(l._id));
                // Support org-prefixed storage format like "<orgSuffix>_<rawHostawayId>"
                if (hw.includes("_")) {
                    const raw = hw.split("_").slice(1).join("_");
                    if (raw) hostawayToMongoListingId.set(raw, String(l._id));
                }
            }
            const n = normalizeName(String(l.name || ""));
            if (n) normalizedNameToMongoListingId.set(n, String(l._id));
        }

        const selectedListingId = String(listingObjectId);
        console.log(`📥 [Hostaway Sync] Fetching ALL conversations with includeResources=1...`);

        const convRes = await fetch(
            `https://api.hostaway.com/v1/conversations?limit=100&offset=0&includeResources=1`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                cache: "no-store",
            }
        );

        if (!convRes.ok) {
            throw new Error(`Hostaway API returned ${convRes.status}: ${convRes.statusText}`);
        }

        const convJson = await convRes.json();
        const rawConversations = convJson.result || [];

        console.log(`📋 [Hostaway Sync] Total conversations from Hostaway: ${rawConversations.length}`);
        const conversationMessagesMap = await fetchConversationMessagesInBatches(rawConversations, token, 10);

        const reservationIds = rawConversations
            .map((conv: any) => String(conv?.reservationId || conv?.Reservation?.id || ""))
            .filter(Boolean);
        const reservationRows = reservationIds.length
            ? await Reservation.find({
                  orgId,
                  hostawayReservationId: { $in: reservationIds },
              })
                  .select("hostawayReservationId listingId")
                  .lean()
            : [];
        const reservationToListingId = new Map<string, string>();
        for (const r of reservationRows as any[]) {
            reservationToListingId.set(String(r.hostawayReservationId), String(r.listingId));
        }

        const byListing = new Map<
            string,
            {
                hostawayConversationId: string;
                guestName: string;
                guestEmail: string | null;
                reservationId: string | null;
                messages: { sender: string; text: string; timestamp: string }[];
            }[]
        >();

        for (const conv of rawConversations) {
            const convId = conv.id.toString();
            const listingCandidates = [
                conv?.Reservation?.listingMapId,
                conv?.Reservation?.listingId,
                conv?.reservation?.listingMapId,
                conv?.reservation?.listingId,
                conv?.listingMapId,
                conv?.listingId,
            ]
                .filter(Boolean)
                .map((v: unknown) => String(v));
            const reservationId = String(conv?.reservationId || conv?.Reservation?.id || "");

            let targetListingId: string | undefined;
            for (const c of listingCandidates) {
                const mapped = hostawayToMongoListingId.get(c);
                if (mapped) {
                    targetListingId = mapped;
                    break;
                }
            }
            if (!targetListingId && reservationId) {
                targetListingId = reservationToListingId.get(reservationId);
            }
            if (!targetListingId) {
                const listingNameCandidate =
                    conv?.Reservation?.listingName ||
                    conv?.reservation?.listingName ||
                    conv?.listingName ||
                    conv?.listing?.name ||
                    "";
                const n = normalizeName(String(listingNameCandidate));
                if (n) targetListingId = normalizedNameToMongoListingId.get(n);
            }
            if (!targetListingId) continue;

            const guestName =
                conv.recipientName ||
                conv.Reservation?.guestName ||
                conv.Reservation?.guestFirstName ||
                "Guest";

            const row = {
                hostawayConversationId: convId,
                guestName,
                guestEmail: conv.guestEmail || conv.recipientEmail || null,
                reservationId: conv.reservationId?.toString() || null,
                messages: conversationMessagesMap.get(convId) || [],
            };
            if (!byListing.has(targetListingId)) byListing.set(targetListingId, []);
            byListing.get(targetListingId)!.push(row);
        }

        const totalResolved = Array.from(byListing.values()).reduce((sum, arr) => sum + arr.length, 0);
        if (totalResolved === 0 && rawConversations.length > 0) {
            console.warn(
                "⚠️ [Hostaway Sync] No listing mapping found from payload/reservations. Falling back to selected listing."
            );

            const fallbackRows: {
                hostawayConversationId: string;
                guestName: string;
                guestEmail: string | null;
                reservationId: string | null;
                messages: { sender: string; text: string; timestamp: string }[];
            }[] = [];

            for (const conv of rawConversations) {
                const convId = String(conv?.id || "");
                if (!convId) continue;

                const guestName =
                    conv.recipientName ||
                    conv.Reservation?.guestName ||
                    conv.Reservation?.guestFirstName ||
                    "Guest";

                fallbackRows.push({
                    hostawayConversationId: convId,
                    guestName,
                    guestEmail: conv.guestEmail || conv.recipientEmail || null,
                    reservationId: String(conv?.reservationId || conv?.Reservation?.id || "") || null,
                    messages: conversationMessagesMap.get(convId) || [],
                });
            }

            byListing.set(selectedListingId, fallbackRows);
        }

        const totalToSave = Array.from(byListing.values()).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`📦 [Hostaway Sync] Conversations matched across listings: ${totalToSave}`);
        console.log(`💾 [Hostaway Sync] Saving ${totalToSave} conversations to MongoDB...`);

        const normalizedFrom = dateFrom || "all";
        const normalizedTo = dateTo || "all";

        await Promise.all(
            Array.from(byListing.entries()).map(async ([mongoListingId, conversations]) => {
                const listingObjectId = new mongoose.Types.ObjectId(mongoListingId);

                await HostawayConversation.deleteMany({
                    orgId,
                    listingId: listingObjectId,
                    dateFrom: normalizedFrom,
                    dateTo: normalizedTo,
                });

                if (conversations.length === 0) return;

                const ops = conversations.map((conv) => ({
                    insertOne: {
                        document: {
                            orgId,
                            listingId: listingObjectId,
                            hostawayConversationId: conv.hostawayConversationId,
                            guestName: conv.guestName,
                            guestEmail: conv.guestEmail,
                            reservationId: conv.reservationId,
                            messages: conv.messages,
                            dateFrom: normalizedFrom,
                            dateTo: normalizedTo,
                            needsReply:
                                conv.messages.length > 0 &&
                                conv.messages[conv.messages.length - 1].sender === "guest",
                            syncedAt: new Date(),
                        },
                    },
                }));

                await HostawayConversation.bulkWrite(ops, { ordered: false });
            })
        );

        const selectedConversations = byListing.get(selectedListingId) || [];
        console.log(`✅ [Hostaway Sync] Synced ${selectedConversations.length} conversations for selected property`);

        const uiConversations = selectedConversations.map((conv) => ({
            id: conv.hostawayConversationId,
            guestName: conv.guestName,
            lastMessage:
                conv.messages.length > 0
                    ? conv.messages[conv.messages.length - 1].text.substring(0, 80) +
                      (conv.messages[conv.messages.length - 1].text.length > 80 ? "..." : "")
                    : "No messages",
            status:
                conv.messages.length > 0 &&
                conv.messages[conv.messages.length - 1].sender === "guest"
                    ? "needs_reply"
                    : "resolved",
            messages: conv.messages.map((m, idx) => ({
                id: `${conv.hostawayConversationId}_${idx}`,
                sender: m.sender as "guest" | "admin",
                text: m.text,
                time: m.timestamp
                    ? new Date(m.timestamp).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                      })
                    : "",
            })),
        }));

        return NextResponse.json({
            success: true,
            message: `Synced ${uiConversations.length} conversations for this property`,
            conversations: uiConversations,
            cached: false,
        });
    } catch (error) {
        console.error("❌ [Hostaway Sync] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to sync" },
            { status: 500 }
        );
    }
}

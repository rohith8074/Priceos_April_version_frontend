import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { eq, isNull, asc, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const sessionId = searchParams.get("sessionId");

    try {
        let history;
        if (propertyId && propertyId !== "null") {
            const conditions = [eq(chatMessages.listingId, Number(propertyId))];
            // When a sessionId is provided, only load messages for that exact session
            // (session includes the date range, so different dates = different session = empty chat)
            if (sessionId) {
                conditions.push(eq(chatMessages.sessionId, sessionId));
            }
            history = await db.select()
                .from(chatMessages)
                .where(and(...conditions))
                .orderBy(asc(chatMessages.createdAt));
        } else {
            history = await db.select()
                .from(chatMessages)
                .where(isNull(chatMessages.listingId))
                .orderBy(asc(chatMessages.createdAt));
        }

        // Map to the frontend Message format
        const messages = history.map((msg: any) => ({
            id: msg.id.toString(),
            role: msg.role,
            content: msg.content,
            proposals: msg.structured?.proposals || undefined, // need to check exact path
            proposalStatus: msg.structured?.proposals ? "pending" : undefined,
        }));

        return NextResponse.json({ messages, rawHistory: history });
    } catch (err) {
        console.error("Failed to fetch chat history:", err);
        return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
    }
}

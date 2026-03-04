import { NextRequest, NextResponse } from "next/server";
import { db, listings, chatMessages, inventoryMaster, marketEvents } from "@/lib/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { addDays, format } from "date-fns";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    const body = await req.json();
    const { message, startDate: startStr, endDate: endStr } = body;

    const startDate = startStr ? new Date(startStr) : new Date();
    const endDate = endStr ? new Date(endStr) : addDays(startDate, 30);

    // 1. Fetch Internal Property Data
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // 2. Fetch Inventory/Calendar Data
    const calendar = await db
      .select()
      .from(inventoryMaster)
      .where(
        and(
          eq(inventoryMaster.listingId, listingId),
          gte(inventoryMaster.date, format(startDate, "yyyy-MM-dd")),
          lte(inventoryMaster.date, format(endDate, "yyyy-MM-dd"))
        )
      );

    // 3. Fetch Market Intel (Events)
    const events = await db
      .select()
      .from(marketEvents)
      .where(
        and(
          gte(marketEvents.endDate, format(startDate, "yyyy-MM-dd")),
          lte(marketEvents.startDate, format(endDate, "yyyy-MM-dd"))
        )
      );

    // 4. Consolidate into Cache (Global Context)
    const contextData = {
      property: {
        id: listing.id,
        name: listing.name,
        area: listing.area,
        city: listing.city,
        base_price: listing.price,
        price_floor: listing.priceFloor,
        price_ceiling: listing.priceCeiling,
        amenities: listing.amenities,
      },
      inventory: calendar.map(c => ({
        date: c.date,
        status: c.status,
        price: c.currentPrice,
        min_stay: c.minStay
      })),
      market_events: events.map(e => ({
        title: e.title,
        dates: `${e.startDate} to ${e.endDate}`,
        impact: e.expectedImpact,
        description: e.description
      }))
    };

    // 5. Save User Message
    await db.insert(chatMessages).values({
      userId: "user-1", // TODO: Get from auth
      sessionId: `property-${listingId}`,
      role: "user",
      content: message,
      listingId: listingId,
      structured: { listingId },
    });

    // 6. Proxy to Python Backend
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    const agentResponse = await fetch(`${backendUrl}/api/agent/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        user_id: "user-1",
        session_id: `property-${listingId}`,
        cache: contextData
      }),
    });

    if (!agentResponse.ok) {
      const errText = await agentResponse.text();
      throw new Error(`Backend Error: ${errText}`);
    }

    const result = await agentResponse.json();
    const responseMessage = result.response?.response || "I couldn't generate a report right now.";

    // 7. Save Assistant Message
    await db.insert(chatMessages).values({
      userId: "user-1",
      sessionId: `property-${listingId}`,
      role: "assistant",
      content: responseMessage,
      listingId: listingId,
      structured: {
        listingId,
        backend_result: result.response
      },
    });

    return NextResponse.json({
      message: responseMessage,
      proposals: [], // Handled by Python/Router in future
    });

  } catch (error) {
    console.error("Error in property chat:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}

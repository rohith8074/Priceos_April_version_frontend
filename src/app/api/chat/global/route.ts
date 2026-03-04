import { NextRequest, NextResponse } from "next/server";
import { db, listings, chatMessages, inventoryMaster, reservations as reservationsTable } from "@/lib/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { addDays, format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, propertyIds } = body;

    // Save user message
    await db.insert(chatMessages).values({
      userId: "user-1", // TODO: Get from auth
      sessionId: "global",
      role: "user",
      content: message,
      structured: { propertyIds },
    });

    // Analyze message intent and generate response
    const lowerMessage = message.toLowerCase();
    let responseMessage = "";
    let metadata: Record<string, number> = {};

    // Handle "underperforming" queries
    if (lowerMessage.includes("underperform")) {
      const thirtyDaysAgo = addDays(new Date(), -30);

      // Get all properties with their metrics
      const allListings = await db.select().from(listings);

      const listingsWithMetrics = await Promise.all(
        allListings.map(async (listing) => {
          const calendar = await db
            .select()
            .from(inventoryMaster)
            .where(
              and(
                eq(inventoryMaster.listingId, listing.id),
                gte(inventoryMaster.date, format(thirtyDaysAgo, "yyyy-MM-dd"))
              )
            );

          const bookedDays = calendar.filter((day) => day.status === "booked" || day.status === "reserved").length;
          const blockedDays = calendar.filter((day) => day.status === "blocked").length;
          const totalDays = calendar.length || 1;
          const bookableDays = totalDays - blockedDays;
          const occupancy = bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;

          return { ...listing, occupancy };
        })
      );

      // Filter underperforming (occupancy < 70%)
      const underperforming = listingsWithMetrics.filter(
        (l) => l.occupancy < 70
      );

      if (underperforming.length > 0) {
        responseMessage = `📊 I found ${underperforming.length} underperforming properties (occupancy < 70%):\n\n`;
        underperforming.forEach((property) => {
          responseMessage += `• ${property.name}: ${property.occupancy}% occupancy\n`;
          responseMessage += `  Current price: AED ${parseFloat(property.price).toLocaleString("en-US")}/night\n`;
          responseMessage += `  Suggestion: Consider price adjustments or targeted promotions\n\n`;
        });

        metadata = {
          propertyCount: underperforming.length,
          avgOccupancy: Math.round(
            underperforming.reduce((sum, p) => sum + p.occupancy, 0) /
            underperforming.length
          ),
        };
      } else {
        responseMessage = `✅ Great news! All properties are performing well with occupancy rates above 70%.`;
        metadata = {
          propertyCount: allListings.length,
          avgOccupancy: Math.round(
            listingsWithMetrics.reduce((sum, p) => sum + p.occupancy, 0) /
            listingsWithMetrics.length
          ),
        };
      }
    }
    // Handle "revenue" queries
    else if (lowerMessage.includes("revenue") || lowerMessage.includes("income")) {
      const thirtyDaysAgo = addDays(new Date(), -30);

      const recentReservations = await db
        .select()
        .from(reservationsTable)
        .where(
          gte(reservationsTable.startDate, format(thirtyDaysAgo, "yyyy-MM-dd"))
        );

      const totalRevenue = recentReservations.reduce(
        (sum, res) => sum + Number(res.totalPrice || 0),
        0
      );

      const allListings = await db.select().from(listings);

      responseMessage = `💰 Revenue Summary (Last 30 Days):\n\n`;
      responseMessage += `Total Revenue: AED ${totalRevenue.toLocaleString("en-US")}\n`;
      responseMessage += `Total Bookings: ${recentReservations.length}\n`;
      responseMessage += `Average Booking Value: AED ${Math.round(totalRevenue / (recentReservations.length || 1)).toLocaleString("en-US")}\n\n`;
      responseMessage += `This represents performance across ${allListings.length} properties.`;

      metadata = {
        propertyCount: allListings.length,
        totalRevenue: Math.round(totalRevenue),
      };
    }
    // Handle "portfolio" or general queries
    else {
      const allListings = await db.select().from(listings);
      const thirtyDaysAgo = addDays(new Date(), -30);

      // Calculate portfolio-wide metrics
      const metricsPromises = allListings.map(async (listing) => {
        const calendar = await db
          .select()
          .from(inventoryMaster)
          .where(
            and(
              eq(inventoryMaster.listingId, listing.id),
              gte(inventoryMaster.date, format(thirtyDaysAgo, "yyyy-MM-dd"))
            )
          );

        const bookedDays = calendar.filter((day) => day.status === "booked" || day.status === "reserved").length;
        const blockedDays = calendar.filter((day) => day.status === "blocked").length;
        const totalDays = calendar.length || 1;
        const bookableDays = totalDays - blockedDays;
        const occupancy = bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;

        return occupancy;
      });

      const occupancies = await Promise.all(metricsPromises);
      const avgOccupancy = Math.round(
        occupancies.reduce((sum, occ) => sum + occ, 0) / occupancies.length
      );

      const recentReservations = await db
        .select()
        .from(reservationsTable)
        .where(
          gte(reservationsTable.startDate, format(thirtyDaysAgo, "yyyy-MM-dd"))
        );

      const totalRevenue = recentReservations.reduce(
        (sum, res) => sum + Number(res.totalPrice || 0),
        0
      );

      responseMessage = `📊 Portfolio Overview:\n\n`;
      responseMessage += `Properties: ${allListings.length}\n`;
      responseMessage += `Average Occupancy: ${avgOccupancy}%\n`;
      responseMessage += `Total Revenue (30d): AED ${totalRevenue.toLocaleString("en-US")}\n`;
      responseMessage += `Total Bookings: ${recentReservations.length}\n\n`;
      responseMessage += `Ask me specific questions like:\n`;
      responseMessage += `• "Which properties are underperforming?"\n`;
      responseMessage += `• "Show me total revenue this month"\n`;
      responseMessage += `• "Generate proposals for all properties"`;

      metadata = {
        propertyCount: allListings.length,
        totalRevenue: Math.round(totalRevenue),
        avgOccupancy,
      };
    }

    // Save assistant message
    await db.insert(chatMessages).values({
      userId: "user-1", // TODO: Get from auth
      sessionId: "global",
      role: "assistant",
      content: responseMessage,
      structured: { ...metadata, propertyIds },
    });

    return NextResponse.json({
      message: responseMessage,
      metadata,
    });
  } catch (error) {
    console.error("Error in global chat:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}

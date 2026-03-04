import { sql } from "drizzle-orm";
import { db, listings, reservations, inventoryMaster } from "./db";
import type { PMSClient } from "./pms/types";

/**
 * Get the maximum syncedAt timestamp from a list of records
 */
export function getMaxSyncedAt(
  records: Array<{ syncedAt: Date | null }>
): Date | null {
  const timestamps = records
    .map((r) => r.syncedAt)
    .filter((t): t is Date => t !== null);

  if (timestamps.length === 0) return null;

  return new Date(Math.max(...timestamps.map((t) => t.getTime())));
}

/**
 * Sync listings to database with syncedAt timestamp
 */
export async function syncListingsToDb(
  pmsListings: Array<{
    id: number;
    name: string;
    area: string;
    bedroomsNumber: number;
    bathroomsNumber: number;
    propertyTypeId: number;
    price: number;
    currencyCode: string;
    personCapacity?: number;
    amenities?: string[];
  }>
) {
  if (pmsListings.length === 0) return;

  const chunks = [];
  for (let i = 0; i < pmsListings.length; i += 100) {
    chunks.push(pmsListings.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await db
      .insert(listings)
      .values(chunk.map(listing => ({
        hostawayId: listing.id.toString(),
        name: listing.name,
        area: listing.area,
        bedroomsNumber: listing.bedroomsNumber,
        bathroomsNumber: listing.bathroomsNumber,
        propertyTypeId: listing.propertyTypeId,
        price: listing.price.toString(),
        currencyCode: listing.currencyCode,
        personCapacity: listing.personCapacity,
        amenities: listing.amenities,
      })))
      .onConflictDoUpdate({
        target: listings.hostawayId,
        set: {
          name: sql`EXCLUDED.name`,
          area: sql`EXCLUDED.area`,
          bedroomsNumber: sql`EXCLUDED.bedrooms_number`,
          bathroomsNumber: sql`EXCLUDED.bathrooms_number`,
          propertyTypeId: sql`EXCLUDED.property_type_id`,
          price: sql`EXCLUDED.price`,
          currencyCode: sql`EXCLUDED.currency_code`,
          personCapacity: sql`EXCLUDED.person_capacity`,
          amenities: sql`EXCLUDED.amenities`,
        },
      });
  }
}

/**
 * Sync reservations to database — uses `reservations` table with direct columns
 */
export async function syncReservationsToDb(
  pmsReservations: Array<{
    id: number;
    listingMapId: number;
    guestName: string;
    guestEmail?: string;
    channelName: string;
    arrivalDate: string;
    departureDate: string;
    nights: number;
    totalPrice: number;
    pricePerNight: number;
    status?: string;
    checkInTime?: string;
    checkOutTime?: string;
  }>,
  syncedAt: Date
) {
  if (pmsReservations.length === 0) return;

  const chunks = [];
  for (let i = 0; i < pmsReservations.length; i += 100) {
    chunks.push(pmsReservations.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await db
      .insert(reservations)
      .values(chunk.map(reservation => ({
        hostawayReservationId: reservation.id.toString(),
        listingId: reservation.listingMapId,
        guestName: reservation.guestName,
        guestEmail: reservation.guestEmail || null,
        startDate: reservation.arrivalDate,
        endDate: reservation.departureDate,
        channelName: reservation.channelName,
        reservationStatus: reservation.status || "confirmed",
        totalPrice: String(reservation.totalPrice),
        pricePerNight: String(reservation.pricePerNight),
        createdAt: syncedAt,
      })))
      .onConflictDoUpdate({
        target: reservations.hostawayReservationId,
        set: {
          listingId: sql`EXCLUDED.listing_id`,
          guestName: sql`EXCLUDED.guest_name`,
          guestEmail: sql`EXCLUDED.guest_email`,
          startDate: sql`EXCLUDED.start_date`,
          endDate: sql`EXCLUDED.end_date`,
          channelName: sql`EXCLUDED.channel_name`,
          reservationStatus: sql`EXCLUDED.reservation_status`,
          totalPrice: sql`EXCLUDED.total_price`,
          pricePerNight: sql`EXCLUDED.price_per_night`,
          createdAt: sql`EXCLUDED.created_at`,
        },
      });
  }
}

/**
 * Sync calendar days for listings — uses `min_stay`/`max_stay` integer columns
 */
export async function syncCalendarToDb(
  pmsClient: PMSClient,
  listingIds: number[],
  startDate: Date,
  endDate: Date,
  hostawayId?: number
) {
  for (const listingId of listingIds) {
    const pmsId = hostawayId || listingId;
    const calendarData = await pmsClient.getCalendar(
      pmsId,
      startDate,
      endDate
    );

    if (calendarData.length === 0) continue;

    const chunks = [];
    for (let i = 0; i < calendarData.length; i += 100) {
      chunks.push(calendarData.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      await db
        .insert(inventoryMaster)
        .values(chunk.map(day => ({
          listingId,
          date: day.date,
          status: day.status,
          currentPrice: day.price.toString(),
          minStay: day.minimumStay || 1,
          maxStay: day.maximumStay || 30,
        })))
        .onConflictDoUpdate({
          target: [inventoryMaster.listingId, inventoryMaster.date],
          set: {
            status: sql`EXCLUDED.status`,
            currentPrice: sql`EXCLUDED.current_price`,
            minStay: sql`EXCLUDED.min_stay`,
            maxStay: sql`EXCLUDED.max_stay`,
          },
        });
    }
  }
}

/**
 * Fetch and sync all conversations from Hostaway into DB
 */
export async function syncConversationsToDb(
  hostawayToInternalIdMap: Map<number, number>
) {
  const token = process.env.Hostaway_Authorization_token;
  if (!token) {
    console.error("No Hostaway token for syncing conversations.");
    return { synced: 0, errors: 1 };
  }

  try {
    console.log(`📥 Fetching ALL conversations...`);
    const convRes = await fetch(
      `https://api.hostaway.com/v1/conversations?limit=250&offset=0&includeResources=1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (convRes.status === 403) {
      console.warn("⚠️ Hostaway API: 403 Forbidden. Your token likely lacks 'Inbox' permissions.");
      return { synced: 0, errors: 1 };
    }

    if (!convRes.ok) throw new Error(`Hostaway API returned ${convRes.status}`);

    const convJson = await convRes.json();
    const rawConversations = convJson.result || [];

    // Filter out conversations not matching our known properties
    const mappedConversations = rawConversations.filter((conv: any) => {
      const lid = conv.Reservation?.listingMapId || conv.listingMapId;
      return lid && hostawayToInternalIdMap.has(Number(lid));
    });

    console.log(`🔍 Syncing ${mappedConversations.length} conversations...`);

    let syncedCount = 0;
    let errCount = 0;

    // We process sequentially, fetching messages for each
    for (const conv of mappedConversations) {
      const hwListingId = conv.Reservation?.listingMapId || conv.listingMapId;
      const internalListingId = hostawayToInternalIdMap.get(Number(hwListingId));
      if (!internalListingId) continue;

      const convId = conv.id.toString();
      const guestName = conv.recipientName || conv.Reservation?.guestName || conv.Reservation?.guestFirstName || "Guest";

      // Determine dates. If no reservation, use a wide range so it matches any date filter.
      const dateFrom = conv.Reservation?.arrivalDate || "2000-01-01";
      const dateTo = conv.Reservation?.departureDate || "2099-12-31";

      let messages: { sender: string; text: string; timestamp: string }[] = [];

      try {
        const msgRes = await fetch(
          `https://api.hostaway.com/v1/conversations/${convId}/messages?limit=50`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (msgRes.ok) {
          const msgJson = await msgRes.json();
          messages = (msgJson.result || [])
            .filter((m: any) => m.body && m.body.trim())
            .map((m: any) => ({
              sender: m.isIncoming ? "guest" : "admin",
              text: m.body || "",
              timestamp: m.insertedOn || m.updatedOn || "",
            }));
        }

        // Using Drizzle to delete existing record for this hostawayConversationId and insert the new one
        // (Since hostaway_conversation_id is indexed, we easily replace it)
        const { hostawayConversations } = await import("./db/schema");
        const { eq } = await import("drizzle-orm");

        await db.delete(hostawayConversations).where(eq(hostawayConversations.hostawayConversationId, convId));

        await db.insert(hostawayConversations).values({
          listingId: internalListingId,
          hostawayConversationId: convId,
          guestName,
          guestEmail: conv.guestEmail || conv.recipientEmail || null,
          reservationId: conv.reservationId?.toString() || null,
          messages,
          dateFrom,
          dateTo,
        });

        syncedCount++;
      } catch (e) {
        console.warn(`   ⚠️  Failed to fetch/save messages for conv ${convId}`);
        errCount++;
      }
    }

    return { synced: syncedCount, errors: errCount };
  } catch (error) {
    console.error("Sync Conversations Error:", error);
    return { synced: 0, errors: 1 };
  }
}

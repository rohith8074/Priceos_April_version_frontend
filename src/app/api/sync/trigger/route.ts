import { NextResponse } from "next/server";
import { createPMSClient } from "@/lib/pms";
import { db } from "@/lib/db";
import { listings, reservations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncListingsToDb, syncReservationsToDb, syncCalendarToDb } from "@/lib/sync-server-utils";

// Global sync status tracker
declare global {
    var syncStatus: { status: 'idle' | 'syncing' | 'complete' | 'error'; message: string; startedAt?: number };
}

globalThis.syncStatus = globalThis.syncStatus || { status: 'idle', message: '' };

async function performBackgroundSync() {
    globalThis.syncStatus = { status: 'syncing', message: 'Starting sync...', startedAt: Date.now() };
    try {
        const client = createPMSClient();
        console.log("------------------------------------------");
        console.log("🚀 Starting Hostaway Synchronization (BACKGROUND)...");
        console.log("------------------------------------------");

        // 1. Fetch & Sync Listings
        globalThis.syncStatus.message = 'Syncing listings...';
        const hListings = await client.listListings();
        const existingListings = await db.select({ id: listings.id }).from(listings);
        const existingListingIds = new Set(existingListings.map(l => l.id));

        console.log(`📥 Step 1: Fetched ${hListings.length} total listings from Hostaway.`);

        await syncListingsToDb(hListings);

        // Map Hostaway IDs -> Internal Neon Database IDs
        const dbListings = await db.select({ id: listings.id, hostawayId: listings.hostawayId }).from(listings);
        const hostawayToInternalIdMap = new Map(dbListings.map(l => [Number(l.hostawayId), l.id]));

        let newListingCount = 0;
        dbListings.forEach(l => {
            if (!existingListingIds.has(l.id)) newListingCount++;
        });

        console.log(`✅ Step 1 Complete: ${dbListings.length} listings in DB (${newListingCount} new).`);

        // 2. Fetch & Sync Calendars (for the next 90 days)
        globalThis.syncStatus.message = 'Syncing calendar data...';
        console.log("📥 Step 2: Fetching Calendar data (90-day window)...");
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 90);

        let calendarsSynced = 0;
        let calendarErrors = 0;

        for (let i = 0; i < hListings.length; i++) {
            const hl = hListings[i];
            const internalId = hostawayToInternalIdMap.get(hl.id);
            if (internalId) {
                try {
                    globalThis.syncStatus.message = `Syncing calendar ${i + 1}/${hListings.length}...`;
                    console.log(`   [${i + 1}/${hListings.length}] Syncing calendar for ${hl.name} (${hl.id})...`);
                    await syncCalendarToDb(client, [internalId], startDate, endDate, hl.id);
                    calendarsSynced++;
                } catch (calErr: any) {
                    console.error(`   ❌ Failed calendar for ${hl.id}:`, calErr.message);
                    calendarErrors++;
                }
            }
        }

        console.log(`✅ Step 2 Complete: Synced ${calendarsSynced} property calendars (${calendarErrors} failed).`);

        // 3. Fetch & Sync Reservations
        globalThis.syncStatus.message = 'Syncing reservations...';
        console.log("📥 Step 3: Fetching Reservations (Limit: 1000)...");
        const hReservations = await client.getReservations({ limit: 1000 } as any);
        console.log(`📥 Fetched ${hReservations.length} reservations from Hostaway.`);

        const existingRes = await db.select({ id: reservations.id }).from(reservations);
        const existingResIds = new Set(existingRes.map(r => r.id));

        const mappedReservations = hReservations.map(r => {
            const internalListingId = hostawayToInternalIdMap.get(r.listingMapId);
            return {
                ...r,
                listingMapId: internalListingId || r.listingMapId,
            };
        }).filter(r => hostawayToInternalIdMap.has(r.listingMapId));

        await syncReservationsToDb(mappedReservations as any, new Date());

        const finalDbReservations = await db.select({ id: reservations.id }).from(reservations);
        let newReservationCount = 0;
        finalDbReservations.forEach(r => {
            if (!existingResIds.has(r.id)) newReservationCount++;
        });

        console.log(`✅ Step 3 Complete: ${finalDbReservations.length} reservations in DB (${newReservationCount} new).`);

        // 4. Fetch & Sync Conversations
        globalThis.syncStatus.message = 'Syncing conversations...';
        console.log("📥 Step 4: Fetching Conversations...");
        const { syncConversationsToDb } = await import("@/lib/sync-server-utils");
        const convStats = await syncConversationsToDb(hostawayToInternalIdMap);
        console.log(`✅ Step 4 Complete: Synced ${convStats.synced} conversations (${convStats.errors} errors).`);

        console.log("------------------------------------------");
        console.log("🎉 Hostaway Sync Finished Successfully.");
        console.log("------------------------------------------");

        globalThis.syncStatus = { status: 'complete', message: 'Sync completed successfully!' };

    } catch (err: any) {
        console.error("❌ Critical Sync Error in Background Job:", err);
        globalThis.syncStatus = { status: 'error', message: err.message || 'Unknown sync error' };
    }
}

export async function POST(req: Request) {
    // Prevent duplicate syncs
    if (globalThis.syncStatus?.status === 'syncing') {
        return NextResponse.json({
            success: false,
            status: "already_syncing",
            message: "A sync is already in progress."
        }, { status: 409 });
    }

    // Fire the heavy syncing function without awaiting it
    performBackgroundSync()
        .then(() => console.log("Background sync promise resolved."))
        .catch((err) => console.error("Unhandled background sync error:", err));

    // Return immediately to the client
    return NextResponse.json({
        success: true,
        status: "syncing",
        message: "Hostaway synchronization started."
    }, { status: 202 });
}

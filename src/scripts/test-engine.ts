import * as dotenv from "dotenv";
dotenv.config({ path: ".env.migration" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, pricingRules, inventoryMaster } from "../lib/db/schema";
import { runPipeline } from "../lib/engine/pipeline";
import { eq } from "drizzle-orm";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

async function test() {
    console.log("🚀 Starting Rule Engine Verification...");

    try {
        // 1. Find a listing to test with
        const allListings = await db.select().from(listings).limit(1);
        if (allListings.length === 0) {
            console.log("❌ No listings found. Please ensure the database has data.");
            return;
        }
        const listing = allListings[0];
        console.log(`\n🏠 Testing with Listing: ${listing.name} (ID: ${listing.id})`);

        // 2. Configure some Autopilot settings
        console.log("⚙️ Configuring Autopilot settings...");
        await db.update(listings)
            .set({
                lastMinuteEnabled: true,
                lastMinuteDaysOut: 7,
                lastMinuteDiscountPct: "20.00",
                farOutEnabled: true,
                farOutDaysOut: 30,
                farOutMarkupPct: "15.00",
                dowPricingEnabled: true,
                dowDays: [5, 6], // Fri, Sat
                dowPriceAdjPct: "10.00",
            })
            .where(eq(listings.id, listing.id));

        // 3. Add a seasonal rule
        console.log("📅 Adding a seasonal rule...");
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(today.getMonth() + 1);

        // Clear existing rules for this listing for a clean test
        await db.delete(pricingRules).where(eq(pricingRules.listingId, listing.id));

        await db.insert(pricingRules).values({
            listingId: listing.id,
            ruleType: "SEASON",
            name: "Verification Season",
            enabled: true,
            startDate: today.toISOString().split('T')[0],
            endDate: nextMonth.toISOString().split('T')[0],
            priceAdjPct: "5.00",
            priority: 10,
        });

        // 4. Run the pipeline
        console.log("🔄 Running Pricing Pipeline...");
        const run = await runPipeline(listing.id, "Verification Run");
        if (!run) {
            throw new Error("Pipeline run failed to return a result object.");
        }
        console.log(`✅ Pipeline execution completed (Status: ${run.status}, Days Changed: ${run.daysChanged})`);

        // 5. Verify results
        console.log("\n📊 Verifying results in inventory_master...");
        const results = await db.select()
            .from(inventoryMaster)
            .where(eq(inventoryMaster.listingId, listing.id))
            .orderBy(inventoryMaster.date)
            .limit(10);

        results.forEach(r => {
            console.log(`  Date: ${r.date} | Current: ${r.currentPrice} | Prop Price: ${r.proposedPrice} | Reasoning: ${r.reasoning?.substring(0, 100)}...`);
        });

        console.log("\n✨ Verification script finished.");
    } catch (err) {
        console.error("❌ Test failed:", err);
    }
}

test();

import { db, listings } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ContextPanel } from "@/components/layout/context-panel";
import { GuestChatInterface } from "@/components/chat/guest-chat-interface";
import { SidebarTabbedView } from "@/components/layout/sidebar-tabbed-view";
import { RightSidebarLayout } from "@/components/layout/right-sidebar-layout";

export const metadata = {
    title: "Guest Inbox | PriceOS Intelligence",
    description: "Real-time guest communication and AI-powered relationship management.",
};

export default async function GuestChatPage() {
    // 1. Fetch all listings
    const allListings = await db.select().from(listings);

    // 2. Fetch occupancy/rate stats for property card badges
    const statsQuery = sql`
    SELECT
      listing_id,
      COALESCE(
        ROUND(
          100.0 * COUNT(id) FILTER (WHERE status IN ('reserved', 'booked'))
          / NULLIF(COUNT(id) FILTER (WHERE status != 'blocked'), 0),
          0
        ),
        0
      ) as occupancy,
      COALESCE(
        ROUND(AVG(current_price), 2),
        0
      ) as avg_price,
      CURRENT_DATE as queried_at
    FROM inventory_master
    WHERE date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
    GROUP BY listing_id
  `;

    const statsResult = await db.execute(statsQuery);

    // 3. Merge stats into listing objects
    const propertiesWithMetrics = allListings.map((listing) => {
        const rows = Array.isArray(statsResult) ? statsResult : (statsResult as any).rows || [];
        const stat = rows.find((r: any) => r.listing_id === listing.id);

        return {
            ...listing,
            occupancy: stat ? Number(stat.occupancy) : 0,
            avgPrice: stat && Number(stat.avg_price) > 0 ? Number(stat.avg_price) : Number(listing.price),
        };
    });

    return (
        <div className="flex h-full overflow-hidden">
            <div id="tour-property-list">
                <ContextPanel properties={propertiesWithMetrics} />
            </div>

            {/* Center Guest Chat Panel */}
            <div className="flex-[2] min-w-[500px] border-r flex flex-col h-full bg-background relative z-10 transition-all duration-300">
                <GuestChatInterface />
            </div>

            {/* Right Side Stack: Executive Summary Table & Sync */}
            <div id="tour-sidebar">
                <RightSidebarLayout>
                    <SidebarTabbedView />
                </RightSidebarLayout>
            </div>
        </div>
    );
}

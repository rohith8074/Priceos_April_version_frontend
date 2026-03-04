import { db, listings } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ContextPanel } from "@/components/layout/context-panel";
import { UnifiedChatInterface } from "@/components/chat/unified-chat-interface";
import { SidebarTabbedView } from "@/components/layout/sidebar-tabbed-view";
import { RightSidebarLayout } from "@/components/layout/right-sidebar-layout";

export default async function DashboardPage() {
  // 1. Fetch all listings (Drizzle returns camelCase objects)
  const allListings = await db.select().from(listings);

  // 2. Fetch occupancy/rate stats for the next 14 days (matches typical short-stay analysis window)
  //    NOTE: This is a server-render snapshot used for the property card badges only.
  //    The right sidebar (Summary) and Agent always use the user-selected date range.
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
  //    occupancy here = next-14-day snapshot for the sidebar CARD badge only.
  //    The agent and right sidebar always re-query with the user-selected date range.
  const propertiesWithMetrics = allListings.map((listing) => {
    const rows = Array.isArray(statsResult) ? statsResult : (statsResult as any).rows || [];
    const stat = rows.find((r: any) => r.listing_id === listing.id);

    return {
      ...listing,
      // Use booked/(total-blocked) formula (already applied in query via FILTER)
      occupancy: stat ? Number(stat.occupancy) : 0,
      avgPrice: stat && Number(stat.avg_price) > 0 ? Number(stat.avg_price) : Number(listing.price),
    };
  });

  return (
    <div className="flex h-full overflow-hidden">
      <ContextPanel properties={propertiesWithMetrics} />

      {/* Center Chat Panel */}
      <div className="flex-[2] min-w-[500px] border-r flex flex-col h-full bg-background relative z-10 transition-all duration-300">
        <UnifiedChatInterface properties={propertiesWithMetrics} />
      </div>

      {/* Right Side Stack: Events Table on top, Sync status below */}
      <RightSidebarLayout>
        <SidebarTabbedView />
      </RightSidebarLayout>
    </div>
  );
}

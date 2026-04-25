import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ContextPanel } from "@/components/layout/context-panel";
import { UnifiedChatInterface } from "@/components/chat/unified-chat-interface";
import { SidebarTabbedView } from "@/components/layout/sidebar-tabbed-view";
import { RightSidebarLayout } from "@/components/layout/right-sidebar-layout";
import type { PropertyWithMetrics } from "@/types";

export default async function DashboardPage() {
  // ── Auth + orgId ──────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) redirect("/login");

  let orgObjectId: string;
  try {
    const payload = verifyAccessToken(token!);
    orgObjectId = payload.orgId;
  } catch {
    redirect("/login");
  }

  let propertiesWithMetrics: PropertyWithMetrics[] = [];
  try {
    const backend = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
    const res = await fetch(
      `${backend}/properties?orgId=${encodeURIComponent(orgObjectId)}`,
      { next: { revalidate: 120 } }
    );
    const data = await res.json().catch(() => ({} as any));
    const properties = Array.isArray(data?.properties) ? data.properties : [];
    propertiesWithMetrics = properties.map((p: any) => ({
      ...p,
      id: String(p.id ?? p._id ?? ""),
      _id: String(p.id ?? p._id ?? ""),
      price: Number(p.basePrice ?? p.price ?? 0),
      occupancy: Number(p.occupancyPct ?? 0),
      avgPrice: Number(p.avgPrice ?? p.basePrice ?? p.price ?? 0),
    }));
  } catch (err) {
    console.error("[agent-chat page] failed to load properties", err);
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div id="tour-property-list">
        <ContextPanel properties={propertiesWithMetrics} />
      </div>

      <div className="flex-[2] min-w-[500px] border-r flex flex-col h-full bg-background relative z-10 transition-all duration-300">
        <UnifiedChatInterface properties={propertiesWithMetrics} orgId={orgObjectId} />
      </div>

      <div id="tour-sidebar">
        <RightSidebarLayout>
          <SidebarTabbedView />
        </RightSidebarLayout>
      </div>
    </div>
  );
}

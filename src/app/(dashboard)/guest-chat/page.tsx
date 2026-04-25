import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ContextPanel } from "@/components/layout/context-panel";
import { GuestChatInterface } from "@/components/chat/guest-chat-interface";
import type { PropertyWithMetrics } from "@/types";

export const metadata = {
    title: "Guest Inbox | PriceOS Intelligence",
    description: "Real-time guest communication and AI-powered relationship management.",
};

export default async function GuestChatPage({
    searchParams,
}: {
    searchParams?: Promise<{ propertyId?: string; conversationId?: string }>;
}) {
    const cookieStore = await cookies();
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const initialPropertyId = resolvedSearchParams?.propertyId || null;
    const initialConversationId = resolvedSearchParams?.conversationId || null;

    const token = cookieStore.get("priceos-session")?.value;
    if (!token) redirect("/login");

    let orgObjectId: string;
    try {
        const payload = verifyAccessToken(token);
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
        console.error("[guest-chat page] failed to load properties", err);
    }
    const initialProperty = initialPropertyId
        ? propertiesWithMetrics.find((listing: any) => listing.id === initialPropertyId)
        : null;

    return (
        <div className="flex h-full overflow-hidden">
            <div id="tour-property-list">
                <ContextPanel properties={propertiesWithMetrics} />
            </div>

            {/* Center Guest Chat Panel */}
            <div className="flex-1 min-w-[500px] flex flex-col h-full bg-background relative z-10 transition-all duration-300">
                <GuestChatInterface
                    orgId={orgObjectId}
                    initialPropertyId={initialPropertyId}
                    initialPropertyName={initialProperty?.name || null}
                    initialPropertyCurrency={initialProperty?.currencyCode || "AED"}
                    initialConversationId={initialConversationId}
                />
            </div>

        </div>
    );
}

/**
 * dashboard/page.tsx — Server Component
 *
 * Fetches portfolio data from the FastAPI backend.
 * All MongoDB queries moved to priceos-backend; this page is pure UI + data fetch.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { OverviewClient } from "./overview-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export default async function OverviewPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) redirect("/login");

  let orgId: string;
  try {
    const payload = verifyAccessToken(token!);
    orgId = payload.orgId;
  } catch {
    redirect("/login");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const plus29 = new Date(today);
  plus29.setDate(plus29.getDate() + 29);
  const plus29Str = plus29.toISOString().split("T")[0];

  // Fetch all data in parallel from FastAPI, but don't 500 if backend is down.
  const [listingsResS, inventoryResS, reservationsResS] = await Promise.allSettled([
    fetch(`${API}/listings/?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 120 },
    }),
    fetch(`${API}/inventory/portfolio?orgId=${orgId}&startDate=${todayStr}&endDate=${plus29Str}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    }),
    fetch(`${API}/reservations/?orgId=${orgId}&checkIn=${todayStr}&checkOut=${plus29Str}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    }),
  ]);

  const listingsRes = listingsResS.status === "fulfilled" ? listingsResS.value : null;
  const inventoryRes = inventoryResS.status === "fulfilled" ? inventoryResS.value : null;
  const reservationsRes = reservationsResS.status === "fulfilled" ? reservationsResS.value : null;

  const allListings = listingsRes?.ok ? (await listingsRes.json()).listings ?? [] : [];
  const invData = inventoryRes?.ok ? (await inventoryRes.json()) : { inventory: [] };
  const resData = reservationsRes?.ok ? (await reservationsRes.json()) : { reservations: [] };

  const inventory: any[] = invData.inventory ?? [];
  const reservations: any[] = resData.reservations ?? [];

  // Compute per-listing metrics client-side from raw API data
  let totalPortfolioRevenue = 0;
  let totalOccupancySum = 0;
  let totalAvgPriceSum = 0;
  let activePropertiesCount = 0;

  const propertiesWithMetrics = allListings.map((listing: any) => {
    const listingId = listing.id ?? listing._id;

    const listingInv = inventory.filter((r) => (r.listingId ?? r.listing_id) === listingId);
    const bookedDays = listingInv.filter((r) => r.status === "booked").length;
    const totalDays = listingInv.length;
    const occupancy = totalDays > 0 ? Math.round((bookedDays / totalDays) * 100) : 0;
    const prices = listingInv.map((r) => Number(r.proposedPrice ?? r.currentPrice ?? 0)).filter(p => p > 0);
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : Number(listing.price ?? 0);
    const revenue = listingInv.filter((r) => r.status === "booked").reduce((sum, r) => sum + Number(r.proposedPrice ?? r.currentPrice ?? 0), 0);

    totalPortfolioRevenue += revenue;
    if (occupancy > 0) {
      totalOccupancySum += occupancy;
      totalAvgPriceSum += avgPrice;
      activePropertiesCount++;
    }

    const calendarDays = listingInv.map((r) => ({
      date: r.date,
      status: r.status,
      price: Number(r.proposedPrice ?? r.currentPrice ?? 0),
      minimumStay: Number(r.minStay ?? 1),
      maximumStay: Number(r.maxStay ?? 30),
    }));

    const listingRes = reservations
      .filter((r) => (r.listingId ?? r.listing_id) === listingId)
      .map((r) => ({
        title: r.guestName ?? "Guest",
        email: r.guestEmail,
        startDate: r.checkIn,
        endDate: r.checkOut,
        financials: {
          totalPrice: Number(r.totalPrice ?? 0),
          pricePerNight: r.nights > 0 ? Math.round(Number(r.totalPrice) / r.nights) : Number(r.totalPrice),
          channelName: r.channelName,
          reservationStatus: r.status,
        },
      }));

    return {
      id: listingId,
      name: listing.name,
      area: listing.area,
      bedroomsNumber: listing.bedroomsNumber,
      price: listing.price,
      occupancy,
      avgPrice,
      revenue,
      calendarDays,
      reservations: listingRes,
    };
  });

  const avgPortfolioOccupancy = activePropertiesCount > 0 ? Math.round(totalOccupancySum / activePropertiesCount) : 0;
  const avgPortfolioPrice = activePropertiesCount > 0 ? Math.round(totalAvgPriceSum / activePropertiesCount) : 0;

  return (
    <OverviewClient
      properties={propertiesWithMetrics}
      totalProperties={allListings.length}
      avgPortfolioOccupancy={avgPortfolioOccupancy}
      avgPortfolioPrice={avgPortfolioPrice}
      totalPortfolioRevenue={totalPortfolioRevenue}
      totalHistoricalRevenue={totalPortfolioRevenue}
    />
  );
}

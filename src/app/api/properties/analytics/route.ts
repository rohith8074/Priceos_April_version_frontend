import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { addDays, format } from "date-fns";
import { connectDB, InventoryMaster, Listing, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const ACTIVE_BOOKING_STATUSES = ["confirmed", "checked_in", "checked_out"] as const;

function parseRange(fromRaw: string | null, toRaw: string | null) {
  const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : new Date();
  const to = toRaw ? new Date(`${toRaw}T00:00:00.000Z`) : addDays(from, 29);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error("INVALID_DATE");
  if (to < from) throw new Error("INVALID_RANGE");
  return { from, to, fromStr: format(from, "yyyy-MM-dd"), toStr: format(to, "yyyy-MM-dd") };
}

function dayStartUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let d = dayStartUtc(from); d <= dayStartUtc(to); d = addDays(d, 1)) {
    days.push(format(d, "yyyy-MM-dd"));
  }
  return days;
}

function toLosBucket(nights: number) {
  if (nights <= 1) return "1";
  if (nights <= 3) return "2-3";
  if (nights <= 6) return "4-6";
  if (nights <= 10) return "7-10";
  return "11+";
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ error: "Valid listingId is required" }, { status: 400 });
    }

    const { from, to, fromStr, toStr } = parseRange(searchParams.get("from"), searchParams.get("to"));
    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const listingObjectId = new mongoose.Types.ObjectId(listingId);

    await connectDB();

    const listing = await Listing.findOne({ _id: listingObjectId, orgId }).select("name").lean();
    if (!listing) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const dayKeys = eachDay(from, to);
    const dayStats = new Map<string, { totalDays: number; bookedDays: number; blockedDays: number; bookedRevenue: number }>();
    for (const day of dayKeys) dayStats.set(day, { totalDays: 0, bookedDays: 0, blockedDays: 0, bookedRevenue: 0 });

    const [inventoryRows, reservations] = await Promise.all([
      InventoryMaster.find({ orgId, listingId: listingObjectId, date: { $gte: fromStr, $lte: toStr } })
        .select("date status currentPrice")
        .sort({ date: 1 })
        .lean(),
      Reservation.find({
        orgId,
        listingId: listingObjectId,
        status: { $in: ACTIVE_BOOKING_STATUSES },
        checkIn: { $lte: toStr },
        checkOut: { $gte: fromStr },
      })
        .select("nights totalPrice channelName createdAt checkIn checkOut")
        .lean(),
    ]);

    for (const row of inventoryRows as any[]) {
      const day = String(row.date || "");
      const m = dayStats.get(day);
      if (!m) continue;
      m.totalDays += 1;
      if (row.status === "booked") {
        m.bookedDays += 1;
        m.bookedRevenue += Number(row.currentPrice || 0);
      }
      if (row.status === "blocked") m.blockedDays += 1;
    }

    const occupancyTrend = dayKeys.map((date) => {
      const m = dayStats.get(date)!;
      const occupancyPct = m.totalDays > 0 ? Math.round((m.bookedDays / m.totalDays) * 100) : 0;
      return { date, totalDays: m.totalDays, bookedDays: m.bookedDays, blockedDays: m.blockedDays, occupancyPct };
    });

    const adrRevparTrend = dayKeys.map((date) => {
      const m = dayStats.get(date)!;
      const adr = m.bookedDays > 0 ? Math.round(m.bookedRevenue / m.bookedDays) : 0;
      const revpar = m.totalDays > 0 ? Math.round(m.bookedRevenue / m.totalDays) : 0;
      return { date, adr, revpar, bookedRevenue: Math.round(m.bookedRevenue) };
    });

    const velocityByDay = new Map(dayKeys.map((d) => [d, 0]));
    const fromUtc = dayStartUtc(from);
    const toExclusive = addDays(dayStartUtc(to), 1);

    const losBuckets: Record<string, number> = { "1": 0, "2-3": 0, "4-6": 0, "7-10": 0, "11+": 0 };
    const channelMix: Record<string, { channel: string; revenue: number; bookings: number }> = {};

    let totalRevenue = 0;
    let totalBookings = 0;
    let totalNights = 0;
    let totalLabeledNights = 0;

    for (const r of reservations as any[]) {
      const createdAt = r.createdAt ? new Date(r.createdAt) : null;
      if (createdAt && createdAt >= fromUtc && createdAt < toExclusive) {
        const d = format(createdAt, "yyyy-MM-dd");
        if (velocityByDay.has(d)) velocityByDay.set(d, (velocityByDay.get(d) || 0) + 1);
      }

      const nightsRaw = Number(r.nights || 0);
      const normalizedNights = nightsRaw > 0
        ? nightsRaw
        : Math.max(1, Math.ceil((new Date(`${r.checkOut}T00:00:00.000Z`).getTime() - new Date(`${r.checkIn}T00:00:00.000Z`).getTime()) / 86400000));
      losBuckets[toLosBucket(normalizedNights)] += 1;

      const revenue = Number(r.totalPrice || 0);
      const channel = String(r.channelName || "Direct");
      if (!channelMix[channel]) channelMix[channel] = { channel, revenue: 0, bookings: 0 };
      channelMix[channel].revenue += revenue;
      channelMix[channel].bookings += 1;

      totalRevenue += revenue;
      totalBookings += 1;
      totalNights += normalizedNights;
      if (normalizedNights > 0) totalLabeledNights += 1;
    }

    const bookingVelocity = dayKeys.map((date, i) => {
      const bookings = velocityByDay.get(date) || 0;
      const lookback = dayKeys.slice(Math.max(0, i - 6), i + 1);
      const movingAvg7d = Number(
        (lookback.reduce((sum, d) => sum + (velocityByDay.get(d) || 0), 0) / Math.max(lookback.length, 1)).toFixed(2)
      );
      return { date, bookings, movingAvg7d };
    });

    const losDistribution = Object.entries(losBuckets).map(([bucket, bookings]) => ({ bucket, bookings }));
    const channelMixRows = Object.values(channelMix)
      .sort((a, b) => b.revenue - a.revenue)
      .map((row) => ({
        ...row,
        revenue: Math.round(row.revenue),
        revenuePct: totalRevenue > 0 ? Math.round((row.revenue / totalRevenue) * 100) : 0,
      }));

    const dayTotals = occupancyTrend.reduce(
      (acc, d) => {
        acc.total += d.totalDays;
        acc.booked += d.bookedDays;
        acc.blocked += d.blockedDays;
        return acc;
      },
      { total: 0, booked: 0, blocked: 0 }
    );

    const occupancySummaryPct = dayTotals.total > 0 ? Math.round((dayTotals.booked / dayTotals.total) * 100) : 0;

    return NextResponse.json({
      listingId,
      propertyName: (listing as any).name || "Property",
      dateRange: { from: fromStr, to: toStr },
      summary: {
        totalBookings,
        totalRevenue: Math.round(totalRevenue),
        avgLos: totalLabeledNights > 0 ? Number((totalNights / totalLabeledNights).toFixed(1)) : 0,
        occupancyPct: occupancySummaryPct,
        avgDailyRevenue: dayKeys.length > 0 ? Math.round(totalRevenue / dayKeys.length) : 0,
      },
      bookingVelocity,
      losDistribution,
      occupancyTrend,
      adrRevparTrend,
      channelMix: channelMixRows,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_DATE") {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_RANGE") {
      return NextResponse.json({ error: "from must be before or equal to to" }, { status: 400 });
    }
    console.error("[properties/analytics GET]", error);
    return NextResponse.json({ error: "Failed to load property analytics" }, { status: 500 });
  }
}


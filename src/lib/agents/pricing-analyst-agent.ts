import { db, inventoryMaster, listings, marketEvents } from "@/lib/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { format, addDays, eachDayOfInterval, parseISO, differenceInDays } from "date-fns";
import { createEventIntelligenceAgent } from "./event-intelligence-agent";
import type { EventSignal } from "./event-intelligence-agent";

export interface PricingProposal {
  listingId: number;
  date: string; // ISO date YYYY-MM-DD
  currentPrice: number;
  proposedPrice: number;
  priceFloor: number;
  priceCeiling: number;
  changePct: number;
  riskLevel: "low" | "medium" | "high";
  reasoning: string;
}

export interface AnalysisResult {
  proposals: PricingProposal[];
  summary: string;
  totalProposals: number;
  averageIncrease: number;
}

/**
 * Pricing Analyst Agent
 * Responsible for generating pricing proposals based on data and signals
 */
export class PricingAnalystAgent {
  private eventAgent = createEventIntelligenceAgent();

  /**
   * Generate proposals for a specific listing and date range
   */
  async generateProposals(
    listingId: number,
    startDate: Date,
    endDate: Date
  ): Promise<AnalysisResult> {
    const proposals: PricingProposal[] = [];

    // Fetch listing details
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      throw new Error(`Listing ${listingId} not found`);
    }

    // Fetch events for date range
    const eventAnalysis = await this.eventAgent.analyzeEvents(startDate, endDate);

    // Fetch current calendar prices
    const calendar = await db
      .select()
      .from(inventoryMaster)
      .where(
        and(
          eq(inventoryMaster.listingId, listingId),
          gte(inventoryMaster.date, format(startDate, "yyyy-MM-dd")),
          lte(inventoryMaster.date, format(endDate, "yyyy-MM-dd"))
        )
      );

    // Calculate occupancy rate for the SELECTED period
    const occupancy = await this.calculateOccupancy(listingId, startDate, endDate);

    // Generate proposals for each day
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");

      // Get current price from calendar or fallback to base
      const calendarDay = calendar.find(d => d.date === dateStr);
      const currentPrice = calendarDay ? parseFloat(calendarDay.currentPrice) : parseFloat(listing.price);

      // Dynamic floor/ceiling (since removed from listings table)
      // Default: Floor = 50% of base, Ceiling = 300% of base
      const basePrice = parseFloat(listing.price);
      const priceFloor = Math.round(basePrice * 0.5);
      const priceCeiling = Math.round(basePrice * 3.0);

      // Check for events on this day
      const dayEvents = eventAnalysis.events.filter(e =>
        e.startDate <= dateStr && e.endDate >= dateStr
      );

      // Calculate proposed price based on signals
      let proposedPrice = currentPrice;
      let reasoning = "";

      // Event-based pricing
      if (dayEvents.length > 0) {
        const recommendation = this.eventAgent.getPricingRecommendation(dayEvents);
        const increase = (currentPrice * recommendation.suggestedIncrease) / 100;
        proposedPrice = currentPrice + increase;
        reasoning = recommendation.reasoning;
      } else {
        // Base pricing on occupancy
        if (occupancy > 80) {
          proposedPrice = currentPrice * 1.1; // 10% increase for high occupancy
          reasoning = `High occupancy (${occupancy}%). Demand is strong, increase pricing.`;
        } else if (occupancy < 60) {
          proposedPrice = currentPrice * 0.90; // 10% decrease for low occupancy (more aggressive)
          reasoning = `Low occupancy (${occupancy}% in selected range). Decrease price to attract bookings.`;
        } else {
          proposedPrice = currentPrice;
          reasoning = `Moderate occupancy (${occupancy}%). Maintain current pricing.`;
        }
      }

      // Apply floor/ceiling constraints
      if (proposedPrice < priceFloor) {
        proposedPrice = priceFloor;
        reasoning += ` (Capped at floor: AED ${priceFloor})`;
      } else if (proposedPrice > priceCeiling) {
        proposedPrice = priceCeiling;
        reasoning += ` (Capped at ceiling: AED ${priceCeiling})`;
      }

      // Round to nearest 10
      proposedPrice = Math.round(proposedPrice / 10) * 10;

      const changePct = Math.round(((proposedPrice - currentPrice) / currentPrice) * 100);

      // Skip if no change
      if (Math.abs(changePct) < 1) {
        continue;
      }

      // Determine risk level
      // Determine risk level
      const riskLevel = this.calculateRiskLevel(changePct, dayEvents.length);

      proposals.push({
        listingId,
        date: dateStr,
        currentPrice,
        proposedPrice,
        priceFloor,
        priceCeiling,
        changePct,
        riskLevel,
        reasoning,
      });
    }

    // Calculate summary stats
    const totalProposals = proposals.length;
    const averageIncrease =
      proposals.reduce((sum, p) => sum + p.changePct, 0) / (totalProposals || 1);

    let summary = "";
    if (totalProposals === 0) {
      summary = "No pricing changes recommended for this period.";
    } else {
      summary = `${totalProposals} proposal(s) generated with avg ${averageIncrease > 0 ? "+" : ""}${averageIncrease.toFixed(1)}% change.`;
    }

    return {
      proposals,
      summary,
      totalProposals,
      averageIncrease,
    };
  }

  /**
   * Save proposals to database
   */
  async saveProposals(analysisResult: AnalysisResult): Promise<number[]> {
    const proposalIds: number[] = [];

    for (const proposal of analysisResult.proposals) {
      const [inserted] = await db
        .update(inventoryMaster)
        .set({
          proposedPrice: proposal.proposedPrice.toString(),
          changePct: proposal.changePct,
          proposalStatus: "pending",
          reasoning: proposal.reasoning,
        })
        .where(
          and(
            eq(inventoryMaster.listingId, proposal.listingId),
            eq(inventoryMaster.date, proposal.date)
          )
        )
        // @ts-ignore
        .returning({ id: inventoryMaster.id });

      if (inserted) {
        proposalIds.push(inserted.id);
      }
    }

    return proposalIds;
  }

  /**
   * Calculate occupancy rate for a specific window
   * Formula: booked / (total - blocked)
   */
  private async calculateOccupancy(listingId: number, start: Date, end: Date): Promise<number> {
    const calendar = await db
      .select()
      .from(inventoryMaster)
      .where(
        and(
          eq(inventoryMaster.listingId, listingId),
          gte(inventoryMaster.date, format(start, "yyyy-MM-dd")),
          lte(inventoryMaster.date, format(end, "yyyy-MM-dd"))
        )
      );

    if (calendar.length === 0) return 0;

    const total = calendar.length;
    const blocked = calendar.filter(d => d.status === 'blocked').length;
    const booked = calendar.filter(d => d.status === 'booked' || d.status === 'reserved').length;

    const divisor = total - blocked;
    if (divisor <= 0) return 0;

    return Math.round((booked / divisor) * 100);
  }

  /**
   * Group consecutive dates by event impact
   */
  private groupDatesByEventImpact(
    dates: Date[],
    events: EventSignal[]
  ): Array<{ start: Date; end: Date; events: EventSignal[] }> {
    const groups: Array<{ start: Date; end: Date; events: EventSignal[] }> = [];

    let currentGroup: { start: Date; end: Date; events: EventSignal[] } | null = null;

    for (const date of dates) {
      const dateStr = format(date, "yyyy-MM-dd");

      // Find events overlapping this date
      const overlappingEvents = events.filter((event) => {
        return dateStr >= event.startDate && dateStr <= event.endDate;
      });

      // Check if event impact changed
      const impactChanged =
        currentGroup &&
        (overlappingEvents.length !== currentGroup.events.length ||
          !overlappingEvents.every((e) =>
            currentGroup!.events.some((ce) => ce.name === e.name)
          ));

      if (!currentGroup || impactChanged) {
        // Start new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          start: date,
          end: date,
          events: overlappingEvents,
        };
      } else {
        // Extend current group
        currentGroup.end = date;
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Calculate risk level based on price change and event confidence
   */
  private calculateRiskLevel(
    changePct: number,
    eventCount: number
  ): "low" | "medium" | "high" {
    const absChange = Math.abs(changePct);

    if (absChange <= 10 && eventCount > 0) {
      return "low"; // Small change with event backing
    }

    if (absChange <= 30 && eventCount > 0) {
      return "medium"; // Moderate change with event backing
    }

    if (absChange > 30) {
      return "high"; // Large change, risky
    }

    if (eventCount === 0 && absChange > 10) {
      return "medium"; // No event backing, moderate change
    }

    return "low";
  }

  /**
   * Generate proposals for all properties
   */
  async generatePortfolioProposals(
    startDate: Date,
    endDate: Date
  ): Promise<Map<number, AnalysisResult>> {
    const allListings = await db.select().from(listings);
    const results = new Map<number, AnalysisResult>();

    for (const listing of allListings) {
      const result = await this.generateProposals(listing.id, startDate, endDate);
      if (result.totalProposals > 0) {
        results.set(listing.id, result);
      }
    }

    return results;
  }
}

/**
 * Create a Pricing Analyst Agent instance
 */
export function createPricingAnalystAgent(): PricingAnalystAgent {
  return new PricingAnalystAgent();
}

import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  varchar,
  index,
  uniqueIndex,
  unique,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────
export const ruleTypeEnum = pgEnum("rule_type", [
  "SEASON",
  "EVENT",
  "ADMIN_BLOCK",
  "LOS_DISCOUNT",
]);

// ─────────────────────────────────────────────────────────
// Table 1: LISTINGS — Property Registry
// ─────────────────────────────────────────────────────────
export const listings = pgTable("listings", {
  id: serial("id").primaryKey(),
  hostawayId: text("hostaway_id").unique(),
  name: text("name").notNull(),
  city: text("city").notNull().default("Dubai"),
  countryCode: varchar("country_code", { length: 3 }).notNull().default("AE"),
  area: text("area").notNull(),
  bedroomsNumber: integer("bedrooms_number").notNull().default(0),
  bathroomsNumber: integer("bathrooms_number").notNull().default(1),
  propertyTypeId: integer("property_type_id").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("AED"),
  personCapacity: integer("person_capacity"),
  amenities: jsonb("amenities").$type<string[]>(), // Postgres natively supports JSON array of strings
  address: text("address"),
  priceFloor: numeric("price_floor", { precision: 10, scale: 2 }).notNull().default('0'),
  floorReasoning: text("floor_reasoning"),
  priceCeiling: numeric("price_ceiling", { precision: 10, scale: 2 }).notNull().default('0'),
  ceilingReasoning: text("ceiling_reasoning"),
  guardrailsSource: text("guardrails_source").notNull().default("manual"), // 'manual' | 'ai'

  // ── Autopilot Pricing Configuration ──
  lastMinuteEnabled: boolean("last_minute_enabled").notNull().default(false),
  lastMinuteDaysOut: integer("last_minute_days_out").notNull().default(7),
  lastMinuteDiscountPct: numeric("last_minute_discount_pct", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("15"),
  lastMinuteMinStay: integer("last_minute_min_stay"),

  farOutEnabled: boolean("far_out_enabled").notNull().default(false),
  farOutDaysOut: integer("far_out_days_out").notNull().default(90),
  farOutMarkupPct: numeric("far_out_markup_pct", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("10"),
  farOutMinStay: integer("far_out_min_stay"),

  dowPricingEnabled: boolean("dow_pricing_enabled").notNull().default(false),
  dowDays: integer("dow_days")
    .array()
    .notNull()
    .default([5, 6]),
  dowPriceAdjPct: numeric("dow_price_adj_pct", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("20"),
  dowMinStay: integer("dow_min_stay"),

  gapPreventionEnabled: boolean("gap_prevention_enabled")
    .notNull()
    .default(true),
  minFragmentThreshold: integer("min_fragment_threshold")
    .notNull()
    .default(3),

  gapFillEnabled: boolean("gap_fill_enabled").notNull().default(false),
  gapFillLengthMin: integer("gap_fill_length_min").notNull().default(1),
  gapFillLengthMax: integer("gap_fill_length_max").notNull().default(3),
  gapFillDiscountPct: numeric("gap_fill_discount_pct", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("10"),
  gapFillOverrideCico: boolean("gap_fill_override_cico")
    .notNull()
    .default(true),

  allowedCheckinDays: integer("allowed_checkin_days")
    .array()
    .notNull()
    .default([1, 1, 1, 1, 1, 1, 1]),
  allowedCheckoutDays: integer("allowed_checkout_days")
    .array()
    .notNull()
    .default([1, 1, 1, 1, 1, 1, 1]),
  lowestMinStayAllowed: integer("lowest_min_stay_allowed")
    .notNull()
    .default(1),
  defaultMaxStay: integer("default_max_stay").notNull().default(365),
});

// ─────────────────────────────────────────────────────────
// Table 2: INVENTORY_MASTER — Daily Price Calendar
// ─────────────────────────────────────────────────────────
export const inventoryMaster = pgTable("inventory_master", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => listings.id)
    .notNull(),
  date: date("date").notNull(),
  status: text("status").notNull().default("available"),
  currentPrice: numeric("current_price", { precision: 10, scale: 2 }).notNull(),
  minStay: integer("min_stay").notNull().default(1),
  maxStay: integer("max_stay").notNull().default(30),
  proposedPrice: numeric("proposed_price", { precision: 10, scale: 2 }),
  proposedMinStay: integer("proposed_min_stay"),
  proposedMaxStay: integer("proposed_max_stay"),
  proposedClosedToArrival: boolean("proposed_closed_to_arrival"),
  proposedClosedToDeparture: boolean("proposed_closed_to_departure"),
  changePct: integer("change_pct"),
  proposalStatus: text("proposal_status"),
  reasoning: text("reasoning"),
}, (table) => ({
  listingDateIdx: index("inventory_master_listing_date_idx").on(table.listingId, table.date),
  listingDateUnique: unique("inventory_master_listing_date_unique").on(table.listingId, table.date),
  statusIdx: index("inventory_master_proposal_status_idx").on(table.proposalStatus),
}));

// ─────────────────────────────────────────────────────────
// Table 3: RESERVATIONS — Guest Bookings & Financials (from PMS)
// ─────────────────────────────────────────────────────────
export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => listings.id)
    .notNull(),
  // Guest details — strict columns, no JSON
  guestName: text("guest_name"),
  guestEmail: text("guest_email"),
  guestPhone: text("guest_phone"),
  numGuests: integer("num_guests"),
  // Stay dates
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  // Financials — strict columns, no JSON
  channelName: text("channel_name"),              // Airbnb, Booking.com, Direct
  reservationStatus: text("reservation_status"),   // confirmed, pending, cancelled
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }),
  channelCommission: numeric("channel_commission", { precision: 10, scale: 2 }),
  cleaningFee: numeric("cleaning_fee", { precision: 10, scale: 2 }),
  notes: text("notes"),
  hostawayReservationId: text("hostaway_reservation_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  listingIdx: index("reservations_listing_idx").on(table.listingId),
  datesIdx: index("reservations_dates_idx").on(table.startDate, table.endDate),
  channelIdx: index("reservations_channel_idx").on(table.channelName),
  statusIdx: index("reservations_status_idx").on(table.reservationStatus),
}));

// ─────────────────────────────────────────────────────────
// Table 4: MARKET_EVENTS — AI Market Intelligence (from Setup)
// ─────────────────────────────────────────────────────────
export const marketEvents = pgTable("market_events", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").references(() => listings.id),  // null = portfolio level
  title: text("title").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  eventType: text("event_type").notNull(), // 'event' | 'holiday' | 'competitor_intel' | 'positioning' | 'demand_outlook' | 'market_summary'

  // ── event + holiday fields ──
  expectedImpact: text("expected_impact"),      // 'high' | 'medium' | 'low'
  confidence: integer("confidence"),            // 0-100
  suggestedPremium: numeric("suggested_premium", { precision: 5, scale: 2 }), // can be negative for news
  source: text("source"),
  description: text("description"),
  location: text("location"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // ── news fields ──
  sentiment: text("sentiment"),                 // 'positive' | 'negative' | 'neutral'
  demandImpact: text("demand_impact"),          // 'positive_high' | 'negative_medium', etc.

  // ── competitor_intel fields ──
  compSampleSize: integer("comp_sample_size"),
  compMinRate: numeric("comp_min_rate", { precision: 10, scale: 2 }),
  compMaxRate: numeric("comp_max_rate", { precision: 10, scale: 2 }),
  compMedianRate: numeric("comp_median_rate", { precision: 10, scale: 2 }),

  // ── positioning fields ──
  positioningVerdict: text("positioning_verdict"), // 'UNDERPRICED' | 'FAIR' | 'SLIGHTLY_ABOVE' | 'OVERPRICED'
  positioningPercentile: integer("positioning_percentile"),

  // ── demand_outlook fields ──
  demandTrend: text("demand_trend"),              // 'strong' | 'moderate' | 'weak'

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  datesIdx: index("market_events_dates_idx").on(table.startDate, table.endDate),
  typeIdx: index("market_events_type_idx").on(table.eventType),
  listingIdx: index("market_events_listing_idx").on(table.listingId),
  // Unique constraint prevents duplicate events when Market Analysis runs multiple times
  uniqueEventIdx: uniqueIndex("market_events_unique_idx").on(table.listingId, table.title, table.startDate),
}));

// ─────────────────────────────────────────────────────────
// Table 5: CHAT_MESSAGES — AI Conversation Memory
// ─────────────────────────────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  listingId: integer("listing_id"),
  structured: jsonb("structured").$type<Record<string, unknown>>(), // Only JSONB in the system — unavoidable (AI output shape varies)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────
// Table 6: USER_SETTINGS — User Configuration
// ─────────────────────────────────────────────────────────
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  fullName: text("full_name"),
  email: text("email"),
  passwordHash: text("password_hash"),
  refreshToken: text("refresh_token"),
  role: text("role").default("user").notNull(),
  isApproved: boolean("is_approved").default(false).notNull(),
  lyzrApiKey: text("lyzr_api_key"),
  hostawayApiKey: text("hostaway_api_key"),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_settings_user_id_idx").on(table.userId),
}));

// ─────────────────────────────────────────────────────────
// Table 7: GUEST_SUMMARIES — Cached AI Analysis of Guest Comms
// ─────────────────────────────────────────────────────────
export const guestSummaries = pgTable("guest_summaries", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => listings.id)
    .notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  sentiment: text("sentiment").notNull(), // 'Positive' | 'Neutral' | 'Needs Attention'
  themes: jsonb("themes").$type<string[]>().default([]).notNull(),
  actionItems: jsonb("action_items").$type<string[]>().default([]).notNull(),
  bulletPoints: jsonb("bullet_points").$type<string[]>().default([]).notNull(),
  totalConversations: integer("total_conversations").notNull().default(0),
  needsReplyCount: integer("needs_reply_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  listingDatesIdx: index("guest_summaries_listing_dates_idx").on(table.listingId, table.dateFrom, table.dateTo),
}));

// ─────────────────────────────────────────────────────────
// Table 9: HOSTAWAY_CONVERSATIONS — Cached Conversations from Hostaway (GET only)
// ─────────────────────────────────────────────────────────
export const hostawayConversations = pgTable("hostaway_conversations", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => listings.id)
    .notNull(),
  hostawayConversationId: text("hostaway_conversation_id").notNull(),
  guestName: text("guest_name").notNull().default("Unknown Guest"),
  guestEmail: text("guest_email"),
  reservationId: text("reservation_id"),
  messages: jsonb("messages").$type<{ sender: string; text: string; timestamp: string }[]>().default([]).notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  listingConvIdx: index("hostaway_conv_listing_idx").on(table.listingId, table.dateFrom, table.dateTo),
  hwConvIdIdx: index("hostaway_conv_id_idx").on(table.hostawayConversationId),
}));

// ─────────────────────────────────────────────────────────
// Table 8: MOCK_HOSTAWAY_REPLIES — Shadow Table for Safe Admin Replies
// ─────────────────────────────────────────────────────────
export const mockHostawayReplies = pgTable("mock_hostaway_replies", {
  id: serial("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  convIdIdx: index("mock_replies_conv_id_idx").on(table.conversationId),
}));

// ─────────────────────────────────────────────────────────
// Table 10: BENCHMARK_DATA — Competitor Pricing Intelligence
// One row per listing + date range. Comps stored as JSONB array.
// ─────────────────────────────────────────────────────────
export const benchmarkData = pgTable("benchmark_data", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => listings.id)
    .notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),

  // ── Rate distribution (across all comps) ──
  p25Rate: numeric("p25_rate", { precision: 10, scale: 2 }),
  p50Rate: numeric("p50_rate", { precision: 10, scale: 2 }),   // market median — primary anchor
  p75Rate: numeric("p75_rate", { precision: 10, scale: 2 }),
  p90Rate: numeric("p90_rate", { precision: 10, scale: 2 }),
  avgWeekday: numeric("avg_weekday", { precision: 10, scale: 2 }),
  avgWeekend: numeric("avg_weekend", { precision: 10, scale: 2 }),

  // ── Pricing verdict ──
  yourPrice: numeric("your_price", { precision: 10, scale: 2 }),
  percentile: integer("percentile"),
  verdict: text("verdict"),   // 'UNDERPRICED' | 'FAIR' | 'SLIGHTLY_ABOVE' | 'OVERPRICED'

  // ── Rate trend ──
  rateTrend: text("rate_trend"),              // 'rising' | 'stable' | 'falling'
  trendPct: numeric("trend_pct", { precision: 5, scale: 2 }),

  // ── AI recommended rates ──
  recommendedWeekday: numeric("recommended_weekday", { precision: 10, scale: 2 }),
  recommendedWeekend: numeric("recommended_weekend", { precision: 10, scale: 2 }),
  recommendedEvent: numeric("recommended_event", { precision: 10, scale: 2 }),
  reasoning: text("reasoning"),

  // ── Individual comp listings (JSONB array — always read together, never queried individually) ──
  comps: jsonb("comps").$type<{
    name: string;
    source: string;
    sourceUrl?: string | null;
    rating?: number | null;
    reviews?: number | null;
    avgRate: number;
    weekdayRate?: number | null;
    weekendRate?: number | null;
    minRate?: number | null;
    maxRate?: number | null;
  }[]>().default([]).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  listingDateIdx: index("benchmark_listing_date_idx").on(table.listingId, table.dateFrom, table.dateTo),
  listingDateUnique: unique("benchmark_listing_date_unique").on(table.listingId, table.dateFrom, table.dateTo),
}));

// ─────────────────────────────────────────────────────────
// Table 11: PRICING_RULES — Rule Overrides
// ─────────────────────────────────────────────────────────
export const pricingRules = pgTable("pricing_rules", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  ruleType: ruleTypeEnum("rule_type").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),

  // Conditions
  startDate: date("start_date"),
  endDate: date("end_date"),
  daysOfWeek: integer("days_of_week").array(),
  minNights: integer("min_nights"),

  // Actions
  priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
  priceAdjPct: numeric("price_adj_pct", { precision: 5, scale: 2 }),
  minPriceOverride: numeric("min_price_override", {
    precision: 10,
    scale: 2,
  }),
  maxPriceOverride: numeric("max_price_override", {
    precision: 10,
    scale: 2,
  }),
  minStayOverride: integer("min_stay_override"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  closedToArrival: boolean("closed_to_arrival").notNull().default(false),
  closedToDeparture: boolean("closed_to_departure").notNull().default(false),
  suspendLastMinute: boolean("suspend_last_minute").notNull().default(false),
  suspendGapFill: boolean("suspend_gap_fill").notNull().default(false),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────
// Table 12: ENGINE_RUNS — Execution Logs
// ─────────────────────────────────────────────────────────
export const engineRuns = pgTable("engine_runs", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  status: text("status").notNull(), // SUCCESS, FAILED
  errorMessage: text("error_message"),
  daysChanged: integer("days_changed"),
  durationMs: integer("duration_ms"),
});

// ─────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────
export type ListingRow = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type InventoryMasterRow = typeof inventoryMaster.$inferSelect;
export type NewInventoryMaster = typeof inventoryMaster.$inferInsert;
export type ReservationRow = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
export type MarketEventRow = typeof marketEvents.$inferSelect;
export type NewMarketEvent = typeof marketEvents.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type HostawayConversationRow = typeof hostawayConversations.$inferSelect;
export type NewHostawayConversation = typeof hostawayConversations.$inferInsert;
export type GuestSummaryRow = typeof guestSummaries.$inferSelect;
export type NewGuestSummary = typeof guestSummaries.$inferInsert;
export type BenchmarkDataRow = typeof benchmarkData.$inferSelect;
export type NewBenchmarkData = typeof benchmarkData.$inferInsert;
export type PricingRuleRow = typeof pricingRules.$inferSelect;
export type NewPricingRule = typeof pricingRules.$inferInsert;
export type EngineRunRow = typeof engineRuns.$inferSelect;
export type NewEngineRun = typeof engineRuns.$inferInsert;

// ─────────────────────────────────────────────────────────
// Legacy Aliases (for migration period — remove after full refactor)
// ─────────────────────────────────────────────────────────
/** @deprecated Use `reservations` table instead */
export const activityTimeline = reservations;
/** @deprecated Use `ReservationRow` instead */
export type ActivityTimelineRow = ReservationRow;
/** @deprecated Use `NewReservation` instead */
export type NewActivityTimeline = NewReservation;

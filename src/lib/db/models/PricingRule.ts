import mongoose, { Document, Schema, Model } from "mongoose";

export type RuleType = "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
export type RuleCategory =
  | "GUARDRAILS"
  | "SEASONS"
  | "LEAD_TIME"
  | "GAP_LOGIC"
  | "LOS_DISCOUNTS"
  | "DATE_OVERRIDES"
  | "OCCUPANCY";

export interface IPricingRule extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId?: mongoose.Types.ObjectId;   // set when scope = "listing"
  groupId?: mongoose.Types.ObjectId;     // set when scope = "group"
  scope: "listing" | "group";            // determines which id is active
  ruleType: RuleType;
  ruleCategory?: RuleCategory;
  name: string;
  enabled: boolean;
  priority: number;
  // Conditions
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  minNights?: number;
  // Actions
  priceOverride?: number;
  priceAdjPct?: number;
  minPriceOverride?: number;
  maxPriceOverride?: number;
  minStayOverride?: number;
  isBlocked: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  suspendLastMinute: boolean;
  suspendGapFill: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PricingRuleSchema = new Schema<IPricingRule>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing" },
    groupId: { type: Schema.Types.ObjectId, ref: "PropertyGroup" },
    scope: { type: String, enum: ["listing", "group"], default: "listing" },
    ruleType: {
      type: String,
      enum: ["SEASON", "EVENT", "ADMIN_BLOCK", "LOS_DISCOUNT"],
      required: true,
    },
    ruleCategory: {
      type: String,
      enum: ["GUARDRAILS", "SEASONS", "LEAD_TIME", "GAP_LOGIC", "LOS_DISCOUNTS", "DATE_OVERRIDES", "OCCUPANCY"],
    },
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    startDate: String,
    endDate: String,
    daysOfWeek: [Number],
    minNights: Number,
    priceOverride: Number,
    priceAdjPct: Number,
    minPriceOverride: Number,
    maxPriceOverride: Number,
    minStayOverride: Number,
    isBlocked: { type: Boolean, default: false },
    closedToArrival: { type: Boolean, default: false },
    closedToDeparture: { type: Boolean, default: false },
    suspendLastMinute: { type: Boolean, default: false },
    suspendGapFill: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PricingRuleSchema.index({ listingId: 1, enabled: 1 });
PricingRuleSchema.index({ groupId: 1, enabled: 1 });

export const PricingRule: Model<IPricingRule> =
  mongoose.models.PricingRule ??
  mongoose.model<IPricingRule>("PricingRule", PricingRuleSchema);

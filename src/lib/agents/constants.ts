import { getAgentId } from "@/lib/env";

// ── Core CRO + Worker Agents (Agent Chat & Dashboard) ──────────────────────
export const CRO_ROUTER_AGENT_ID     = getAgentId("LYZR_CRO_ROUTER_AGENT_ID", "AGENT_ID") || "";
export const PROPERTY_ANALYST_ID     = getAgentId("LYZR_PROPERTY_ANALYST_AGENT_ID") || "";
export const BOOKING_INTELLIGENCE_ID = getAgentId("LYZR_BOOKING_INTELLIGENCE_AGENT_ID") || "";
export const MARKET_RESEARCH_ID      = getAgentId("LYZR_MARKET_RESEARCH_AGENT_ID") || "";
export const PRICE_GUARD_ID          = getAgentId("LYZR_PRICE_GUARD_AGENT_ID") || "";
export const MARKETING_AGENT_ID      = getAgentId("LYZR_MARKETING_AGENT_ID", "Marketing_Agent_ID") || "";
export const BENCHMARK_AGENT_ID      = getAgentId("LYZR_BENCHMARK_AGENT_ID", "LYZR_Competitor_Benchmark_Agent_ID") || "";
export const GUARDRAILS_AGENT_ID     = getAgentId("LYZR_GUARDRAILS_AGENT_ID", "Lyzr_Guardrail_Agent_for_Floor_Ceiling_Values") || "";

// ── Guest Inbox Agents ─────────────────────────────────────────────────────
export const CONVERSATION_SUMMARY_AGENT_ID = getAgentId("LYZR_CONVERSATION_SUMMARY_AGENT_ID", "LYZR_Conversation_Summary_Agent_ID") || ""
// ^ Summarises all guest threads for a property × date range → sentiment, themes, action items
export const CHAT_RESPONSE_AGENT_ID        = getAgentId("LYZR_CHAT_RESPONSE_AGENT_ID", "LYZR_Chat_Response_Agent_ID") || ""
// ^ Drafts a 2-4 sentence reply for a single guest message

// ── Legacy env-var aliases (kept so existing .env files keep working) ──────
// Old name                                    New name
// Marketing_Agent_ID                      →   LYZR_MARKETING_AGENT_ID
// LYZR_Competitor_Benchmark_Agent_ID      →   LYZR_BENCHMARK_AGENT_ID
// Lyzr_Guardrail_Agent_for_Floor_Ceiling_Values → LYZR_GUARDRAILS_AGENT_ID
// LYZR_Conversation_Summary_Agent_ID      →   LYZR_CONVERSATION_SUMMARY_AGENT_ID (unchanged)
// LYZR_Chat_Response_Agent_ID             →   LYZR_CHAT_RESPONSE_AGENT_ID (unchanged)

// ── Legacy re-exports (backward compatibility) ────────────────────────────
export const MANAGER_AGENT_ID  = CRO_ROUTER_AGENT_ID
export const EVENT_AGENT_ID    = BOOKING_INTELLIGENCE_ID
export const MARKET_AGENT_ID   = MARKET_RESEARCH_ID
export const STRATEGY_AGENT_ID = PRICE_GUARD_ID

export const ACTIVITY_STEPS = [
  { id: 'events', label: 'Scanning events & demand signals', icon: 'Zap' },
  { id: 'market', label: 'Analyzing market & competitors', icon: 'BarChart3' },
  { id: 'strategy', label: 'Running pricing strategy', icon: 'ShieldCheck' },
  { id: 'review', label: 'Reviewing & finalizing', icon: 'Check' },
] as const

export const SUGGESTED_PROMPTS = [
  "What should I price Marina Heights for next weekend?",
  "How are competitors pricing in Downtown Dubai?",
  "What events are affecting prices this month?",
  "Should I adjust prices for Ramadan?",
  "Give me a pricing strategy for Palm Villa",
  "What's the optimal price for JBR Beach Studio tonight?",
] as const

// PriceOS Lyzr Agents (Updated: 2026-03-03 from live Lyzr Studio)

// ── Core CRO + Worker Agents (Agent Chat & Dashboard) ──────────────────────
export const CRO_ROUTER_AGENT_ID    = '69998743f4d61186679a9515'  // CRO Router (orchestrator / manager)
export const PROPERTY_ANALYST_ID    = '699987c35dbb137e7b66052e'  // Property Analyst (pricing recommendations)
export const BOOKING_INTELLIGENCE_ID = '699988262654671e44099318' // Booking Intelligence (occupancy / reservations)
export const MARKET_RESEARCH_ID     = '699991985dbb137e7b660594'  // Market Research (competitor scanner)
export const PRICE_GUARD_ID         = '6999933b83d9dff0252dd86f'  // PriceGuard (risk classification / adjustment reviewer)
export const MARKETING_AGENT_ID     = process.env.LYZR_MARKETING_AGENT_ID     || '699993adb8bd4d3aac102a81'  // Marketing Agent
export const BENCHMARK_AGENT_ID     = process.env.LYZR_BENCHMARK_AGENT_ID     || '699e7b559ff614f6db8964cf'  // Benchmark Agent (competitor benchmark)
export const GUARDRAILS_AGENT_ID    = process.env.LYZR_GUARDRAILS_AGENT_ID    || '69a941c5ad0c99ac601ac935' // Guardrails Agent (floor / ceiling enforcement)

// ── Guest Inbox Agents ─────────────────────────────────────────────────────
export const CONVERSATION_SUMMARY_AGENT_ID = process.env.LYZR_CONVERSATION_SUMMARY_AGENT_ID || ''
// ^ Summarises all guest threads for a property × date range → sentiment, themes, action items
export const CHAT_RESPONSE_AGENT_ID        = process.env.LYZR_CHAT_RESPONSE_AGENT_ID        || ''
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

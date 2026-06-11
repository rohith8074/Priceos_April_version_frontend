/**
 * Types for the audit/instrumentation layer.
 * Mirror openapi-agent-tools-intelligence-v1.json (the backend contract).
 */
import type { GuardVerdict } from "@/lib/chat/verdict";

export type { GuardVerdict };

export interface AgentDecision {
  decision_id: string;
  parent_decision_id?: string | null;
  listingId?: string | null;
  agent_name: string;
  agent_version?: string;
  model?: string;
  temperature?: number;
  prompt_hash?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  tool_calls?: Array<Record<string, unknown>>;
  verdict?: GuardVerdict | string;
  confidence?: number;
  ts?: string;
  downstream_outcome?: Record<string, unknown> | null;
}

export interface ReplayResult {
  original_decision_id: string;
  replay_id?: string;
  reconstructed_state?: Record<string, unknown>;
  original?: Record<string, unknown>;
  replayed: Record<string, unknown>;
  diff?: Record<string, unknown>;
}

export interface DecisionListResponse {
  decisions: AgentDecision[];
  next_cursor?: string | null;
  /** Set by the Next.js proxy when priceos-backend hasn't implemented the endpoint yet. */
  _backend_unavailable?: boolean;
  _proxy_error?: string;
}

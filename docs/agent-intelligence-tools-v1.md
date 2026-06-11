# Agent Intelligence & Instrumentation Tools (v1)

This is the **contract** for the audit's intelligence layer. The audit's thesis —
*"keep Lyzr thin, move state/learning/determinism into a service it calls as tools"* —
is already this project's architecture: Lyzr agents call tools served by the FastAPI
`priceos-backend` (`/api/agent-tools/v1/*`). The existing tools are **read-only data
fetchers** (`get_property_benchmark`, `get_property_calendar_metrics`, …). What was
missing is everything that has to **remember, learn, be deterministic, or be replayed**.

`openapi-agent-tools-intelligence-v1.json` defines those missing tools. Implement them in
`priceos-backend`, then attach each to the agent(s) listed below in Lyzr.

## What ships where

| Layer | Lives in | Status |
|---|---|---|
| Personas, routing, structured I/O | **Lyzr** (prompts in `updated_prompts_2/`) | ✅ exists |
| Read-only data tools | FastAPI `priceos-backend` | ✅ exists |
| **Instrumentation** (log + replay) | FastAPI + Mongo | ⬜ implement to this contract |
| **Learning** (elasticity, regime, comps, source-market, validated events) | FastAPI + Mongo + data | ⬜ implement |
| **Determinism** (pricing/compose, exploration, backtest) | FastAPI | ⬜ implement |

## Audit item → tool → agent

| Audit item | Endpoint (`operationId`) | Method | Called by | Notes |
|---|---|---|---|---|
| Decision log (week 1, #1) | `/audit/log-decision` (`log_decision`) | POST | **every agent, first call** | Returns `decision_id`; pass it down the chain (Property Analyst's id is referenced by PriceGuard's). |
| Read the log | `/audit/decisions` (`list_decisions`), `/audit/decision` (`get_decision`) | GET | UI / CRO Router | Powers the Agent Decisions page. |
| Replay (week 1, #2) | `/audit/replay` (`replay_decision`) | POST | tooling / CRO Router | Reconstruct state at `ts`, re-invoke same agent, diff. |
| Backtest harness (week 2) | `/backtest/run` (`backtest_run`) | POST | tooling (nightly) | Loops `/audit/replay` over history → counterfactual RevPAR scorecard. **Needs real history.** |
| Elasticity (week 4) | `/elasticity/predict`, `/elasticity/update` | POST | **PriceGuard** | PriceGuard optimizes expected RevPAR over candidate prices instead of multiplier math. |
| Regime classifier (week 5) | `/regime/classify` (`regime_classify`) | POST | **Market Research**, PriceGuard | Continuous `calm/watch/disrupted/recovering` + score + per-source-market modifiers. Replaces the 4-tier geopolitical protocol. |
| Source-market mix (week 5) | `/source-market/get-mix` | POST | Market Research, PriceGuard | From Hostaway `guest.country`. Combine with regime → property-specific demand modifier. |
| Curated comps | `/comps/get-set`, `/comps/get-state` | POST | Market Research | Stable comp identity + current price/availability. |
| Validated events | `/events/get-validated` | POST | Market Research, Event Intelligence | Only human-approved events drive premiums. |
| Deterministic composition | `/pricing/compose` (`pricing_compose`) | POST | CRO Router | Versioned, testable arbitration of sub-agent outputs → final price; logs a decision. |
| Exploration | `/exploration/select` | POST | CRO Router / PriceGuard | Bandit arm selection for unbooked nights. |

## Per-agent tool assignment (the audit's "stop making Aria the data hub")

Attach in each Lyzr agent's tool config. Sub-agents get their **own** data tools so the
CRO Router stops being the single tool bottleneck.

- **CRO Router** — `pricing_compose`, `log_decision`, `replay_decision`, `get_portfolio_overview`, `get_portfolio_revenue_snapshot` (+ fan-out to sub-agents in parallel).
- **Property Analyst** — `get_property_calendar_metrics`, `get_property_reservations`, `log_decision`.
- **Booking Intelligence** — `get_property_reservations`, `get_property_benchmark`, `source_market_get_mix`, `log_decision`.
- **Market Research** — `get_property_market_events`, `events_get_validated`, `comps_get_set`, `comps_get_state`, `regime_classify`, `log_decision`.
- **PriceGuard** — `elasticity_predict`, `regime_classify`, `get_property_benchmark`, `log_decision`. (Also: switch to a stronger model — see prompt header.)
- **Anomaly Detector** — `list_decisions`, `get_property_calendar_metrics`, `log_decision`.

## Migration order (from the audit, adjusted to this repo)

1. **Instrument** — implement `log_decision` + `replay_decision`; have every agent call `log_decision` first. *This is the unlock — you currently validate intelligence with no instruments.*
2. **Backtest** — `backtest_run` over history. ⚠️ **Reality check:** current data is synthetic (`seed_data.py`, ~90 days, 5 properties). The 24-month Hostaway backtest the audit describes needs real history first. Start logging decisions now so the corpus accrues.
3. **Lyzr config** — apply per-agent tool lists above; upgrade PriceGuard's model; structured JSON output schemas on every sub-agent; parallel fan-out for "full analysis".
4. **Elasticity** — `elasticity_predict/update`, called from PriceGuard.
5. **Regime + source-market** — `regime_classify`, `source_market_get_mix`.

## Frontend

The Next.js app exposes thin proxy routes under `/api/agent-tools/*` that forward to the
backend (Bearer + `x-tool-org-id`), and an **Agent Decisions** page that reads
`list_decisions` / `get_decision`. Until the backend implements the endpoints, the page
degrades gracefully (empty state) — no crash.

/**
 * verdict.ts — PriceGuard verdict normalization (audit fix)
 *
 * PriceGuard moved from a hard {APPROVED, FLAGGED, REJECTED} veto to a
 * confidence-scored classification {approved, flag_low, flag_high, hold_for_review}.
 * The audit's core finding was that "REJECTED with no approve button" blocks correct
 * answers in regime-shifted markets (e.g. NYE surge, war trough). So:
 *
 *   1. We accept BOTH the new lowercase verdicts and the legacy uppercase ones.
 *   2. Unknown / missing verdicts fail OPEN to "approved" — never hide a price.
 *   3. EVERY verdict is human-approvable (`canApprove` is always true).
 */

export type GuardVerdict = "approved" | "flag_low" | "flag_high" | "hold_for_review";

const LEGACY_MAP: Record<string, GuardVerdict> = {
  APPROVED: "approved",
  FLAGGED: "flag_high",
  REJECTED: "hold_for_review",
};

export function normalizeVerdict(raw: unknown): GuardVerdict {
  if (typeof raw !== "string") return "approved";
  const v = raw.trim();
  if (v === "approved" || v === "flag_low" || v === "flag_high" || v === "hold_for_review") {
    return v;
  }
  const up = v.toUpperCase();
  if (up in LEGACY_MAP) return LEGACY_MAP[up];
  if (up === "FLAG_LOW") return "flag_low";
  if (up === "FLAG_HIGH") return "flag_high";
  if (up === "HOLD_FOR_REVIEW" || up === "HOLD") return "hold_for_review";
  return "approved"; // fail open — never block a correct answer
}

export type VerdictTone = "ok" | "low" | "high" | "review";

export interface VerdictMeta {
  verdict: GuardVerdict;
  label: string;
  tone: VerdictTone;
  /** ALWAYS true — the audit fix: the human can approve any verdict. */
  canApprove: boolean;
  /** Heuristic contribution to a fallback confidence score (when the agent gives none). */
  scoreDelta: number;
}

export function verdictMeta(raw: unknown): VerdictMeta {
  const verdict = normalizeVerdict(raw);
  switch (verdict) {
    case "approved":
      return { verdict, label: "✓ PriceGuard OK", tone: "ok", canApprove: true, scoreDelta: 18 };
    case "flag_low":
      return { verdict, label: "⚑ Flagged low", tone: "low", canApprove: true, scoreDelta: -8 };
    case "flag_high":
      return { verdict, label: "⚑ Flagged high", tone: "high", canApprove: true, scoreDelta: -8 };
    case "hold_for_review":
      return { verdict, label: "⏸ Hold for review", tone: "review", canApprove: true, scoreDelta: -22 };
  }
}

/**
 * Normalize a confidence that may be 0–1 (PriceGuard) or 0–100 (legacy heuristic)
 * into a 0–100 integer. Returns null when there is no usable value.
 */
export function toConfidencePct(raw: unknown): number | null {
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  const pct = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type RegimeLabel = "calm" | "watch" | "disrupted" | "recovering";

export interface RegimeState {
  label: RegimeLabel;
  score: number; // 0 (calm) .. 1 (severe)
  booking_pace_ratio?: number;
  airbtics_score?: number;
  source_market_mix?: Record<string, number>;
  stale?: boolean;
  cached_at?: string;
  _backend_unavailable?: boolean;
}

const LABEL_CONFIG: Record<RegimeLabel, { color: string; bg: string; bar: string; description: string }> = {
  calm: {
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    bar: "bg-emerald-500",
    description: "Demand is stable — standard pricing rules apply.",
  },
  watch: {
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    bar: "bg-amber-500",
    description: "Emerging signal — monitor closely, mild upward pressure.",
  },
  disrupted: {
    color: "text-red-500 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    bar: "bg-red-500",
    description: "Demand disruption detected — consider deeper discounts or holds.",
  },
  recovering: {
    color: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/20",
    bar: "bg-sky-500",
    description: "Bounce-back in progress — occupancy improving from trough.",
  },
};

function PaceArrow({ ratio }: { ratio?: number }) {
  if (ratio === undefined) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  if (ratio > 1.05) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (ratio < 0.95) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

interface Props {
  listingId?: string;
  className?: string;
}

export function RegimeCard({ listingId, className }: Props) {
  const [state, setState] = useState<RegimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRegime = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (listingId) params.set("listingId", listingId);
      const res = await fetch(`/api/agent-tools/regime?${params}`, { cache: "no-store" });
      const data: RegimeState = await res.json();
      if (data._backend_unavailable) {
        setError("Backend not available");
        setState(null);
      } else {
        setState(data);
      }
    } catch {
      setError("Failed to load regime");
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => { fetchRegime(); }, [fetchRegime]);

  const cfg = state ? LABEL_CONFIG[state.label] ?? LABEL_CONFIG.calm : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground p-4 space-y-3 dark:border-white/10 dark:bg-white/[0.02]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
            Market Regime
          </span>
        </div>
        <button
          onClick={fetchRegime}
          disabled={loading}
          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", loading && "animate-spin")} />
        </button>
      </div>

      {loading && !state && (
        <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
      )}

      {error && (
        <p className="text-[11px] text-muted-foreground italic">{error}</p>
      )}

      {state && cfg && (
        <>
          <div className={cn("rounded-lg border px-3 py-2 flex items-center justify-between", cfg.bg)}>
            <span className={cn("text-sm font-black uppercase tracking-wide", cfg.color)}>
              {state.label}
            </span>
            <span className={cn("text-xs font-bold tabular-nums", cfg.color)}>
              {Math.round(state.score * 100)} / 100
            </span>
          </div>

          {/* Score bar */}
          <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", cfg.bar)}
              style={{ width: `${Math.round(state.score * 100)}%` }}
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-snug">{cfg.description}</p>

          {/* Signals row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 bg-muted/30 rounded-md px-2 py-1.5">
              <PaceArrow ratio={state.booking_pace_ratio} />
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Booking Pace
                </p>
                <p className="text-[11px] font-bold tabular-nums">
                  {state.booking_pace_ratio !== undefined
                    ? `${(state.booking_pace_ratio * 100).toFixed(0)}%`
                    : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-muted/30 rounded-md px-2 py-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Airbtics Score
                </p>
                <p className="text-[11px] font-bold tabular-nums">
                  {state.airbtics_score !== undefined
                    ? `${Math.round(state.airbtics_score * 100)}`
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {state.stale && (
            <p className="text-[9px] text-muted-foreground/60 italic">
              Cached signal — live data unavailable
            </p>
          )}
        </>
      )}
    </div>
  );
}

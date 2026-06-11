"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Loader2, History, AlertCircle, Play, Database, X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { verdictMeta, toConfidencePct, type VerdictTone } from "@/lib/chat/verdict";
import type { AgentDecision, DecisionListResponse, ReplayResult } from "@/types/agent-decision";

const VERDICT_FILTERS = ["all", "approved", "flag_low", "flag_high", "hold_for_review"] as const;

function toneClasses(tone: VerdictTone): string {
  switch (tone) {
    case "ok": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "review": return "bg-sky-500/10 text-sky-500 border-sky-500/20";
    default: return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }
}

function fmtTs(ts?: string): string {
  if (!ts) return "—";
  try { return format(parseISO(ts), "MMM d, HH:mm:ss"); } catch { return ts; }
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) {
    return <p className="text-xs text-muted-foreground italic">none</p>;
  }
  return (
    <pre className="text-[11px] leading-snug bg-muted/40 border border-border/40 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap break-words">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AgentDecisionsClient() {
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);
  const [agentFilter, setAgentFilter] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<(typeof VERDICT_FILTERS)[number]>("all");
  const [selected, setSelected] = useState<AgentDecision | null>(null);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (agentFilter.trim()) params.set("agentName", agentFilter.trim());
      if (verdictFilter !== "all") params.set("verdict", verdictFilter);
      const res = await fetch(`/api/agent-tools/decisions?${params}`, { cache: "no-store" });
      const data: DecisionListResponse = await res.json();
      setBackendDown(Boolean(data._backend_unavailable));
      setDecisions(Array.isArray(data.decisions) ? data.decisions : []);
    } catch {
      setBackendDown(true);
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }, [agentFilter, verdictFilter]);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const runReplay = useCallback(async (decisionId: string) => {
    setReplayLoading(true);
    setReplay(null);
    try {
      const res = await fetch(`/api/agent-tools/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_id: decisionId }),
      });
      const data = await res.json();
      if (data?._backend_unavailable) { setBackendDown(true); return; }
      setReplay(data as ReplayResult);
    } catch {
      setBackendDown(true);
    } finally {
      setReplayLoading(false);
    }
  }, []);

  const openDetail = (d: AgentDecision) => { setSelected(d); setReplay(null); };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <History className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">Agent Decisions</h1>
            <p className="text-xs text-muted-foreground">Every agent decision, logged and replayable — the audit&apos;s week-1 instrumentation layer.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDecisions} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border/40 flex flex-wrap items-center gap-2">
        <input
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          placeholder="Filter by agent (e.g. price_guard)"
          className="h-8 px-3 rounded-md border border-border/50 bg-background text-xs w-56 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
        />
        <div className="flex items-center gap-1">
          {VERDICT_FILTERS.map((v) => (
            <button
              key={v}
              onClick={() => setVerdictFilter(v)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-colors ${
                verdictFilter === v
                  ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                  : "border-border/40 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {v === "all" ? "All" : v.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Backend-not-ready explainer */}
      {backendDown && (
        <div className="m-6 rounded-xl border border-sky-500/20 bg-sky-500/5 p-5 flex gap-3">
          <Database className="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-sky-500 mb-1">Decision log endpoint not live yet</p>
            <p className="text-muted-foreground leading-relaxed">
              This page reads <code className="text-xs bg-muted/60 px-1 py-0.5 rounded">/audit/decisions</code> from{" "}
              <code className="text-xs bg-muted/60 px-1 py-0.5 rounded">priceos-backend</code>. It lights up once the backend
              implements <code className="text-xs bg-muted/60 px-1 py-0.5 rounded">POST /audit/log-decision</code> per{" "}
              <code className="text-xs bg-muted/60 px-1 py-0.5 rounded">openapi-agent-tools-intelligence-v1.json</code> and every
              agent calls it first. That decision log is the audit&apos;s #1 unlock — backtests and replay build on it.
            </p>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,420px)] gap-0">
        {/* List */}
        <div className="p-4 space-y-2 min-w-0">
          {loading && (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
          {!loading && !backendDown && decisions.length === 0 && (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-3 opacity-30" />
              No decisions logged yet. They appear here the moment agents start calling <code className="text-xs">log_decision</code>.
            </div>
          )}
          {decisions.map((d) => {
            const vm = verdictMeta(d.verdict);
            const conf = toConfidencePct(d.confidence);
            const isSel = selected?.decision_id === d.decision_id;
            return (
              <button
                key={d.decision_id}
                onClick={() => openDetail(d)}
                className={`w-full text-left rounded-xl border p-3 transition-all ${
                  isSel ? "border-amber-500/40 bg-amber-500/5" : "border-border/30 bg-background/60 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold truncate">{d.agent_name}</span>
                    {d.model && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{d.model}</span>}
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border shrink-0 ${toneClasses(vm.tone)}`}>
                    {vm.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-2">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{fmtTs(d.ts)}</span>
                  {conf !== null && (
                    <div className="flex items-center gap-1.5 w-32">
                      <div className="h-1.5 flex-1 rounded-full bg-muted/50 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${conf}%` }} />
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground tabular-nums w-8 text-right">{conf}%</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="border-l border-border/40 p-4 bg-muted/5 min-w-0">
          {!selected ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Select a decision to inspect its inputs, outputs, tool calls — and replay it.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-black">{selected.agent_name}</h2>
                  <p className="text-[10px] text-muted-foreground font-mono break-all">{selected.decision_id}</p>
                </div>
                <button onClick={() => setSelected(null)} className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center shrink-0">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <Meta label="Verdict" value={verdictMeta(selected.verdict).label} />
                <Meta label="Confidence" value={toConfidencePct(selected.confidence) !== null ? `${toConfidencePct(selected.confidence)}%` : "—"} />
                <Meta label="Model" value={selected.model ?? "—"} />
                <Meta label="Version" value={selected.agent_version ?? "—"} />
                <Meta label="Timestamp" value={fmtTs(selected.ts)} />
                <Meta label="Listing" value={selected.listingId ?? "—"} />
              </div>

              <Button size="sm" className="w-full gap-1.5" onClick={() => runReplay(selected.decision_id)} disabled={replayLoading}>
                {replayLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Replay this decision
              </Button>

              <Section title="Inputs"><JsonBlock value={selected.inputs} /></Section>
              <Section title="Outputs"><JsonBlock value={selected.outputs} /></Section>
              {selected.tool_calls && selected.tool_calls.length > 0 && (
                <Section title="Tool calls"><JsonBlock value={selected.tool_calls} /></Section>
              )}

              {replay && (
                <Section title="Replay result">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] text-emerald-500 font-bold">Re-invoked against reconstructed state</span>
                  </div>
                  {replay.diff && <Section title="Diff vs original"><JsonBlock value={replay.diff} /></Section>}
                  <JsonBlock value={replay.replayed} />
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-2">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <p className="text-[11px] font-bold truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
      {children}
    </div>
  );
}

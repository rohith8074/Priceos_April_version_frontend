"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CheckCircle2, Building2, TrendingUp, TrendingDown,
  RefreshCcw, ChevronDown, ChevronUp, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ProposalData = {
  id: string;
  listingId: string;
  date: string;
  currentPrice: string;
  proposedPrice: string | null;
  changePct: number | null;
  reasoning: string | null;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  proposalStatus: string;
  listingName: string;
};

function DeltaBadge({ pct }: { pct: number | null }) {
  if (!pct || pct === 0) return <span className="text-text-disabled text-xs">—</span>;
  const up = pct > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
      up ? "text-green-400" : "text-red-400"
    )}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

function ReasoningCell({ reasoning }: { reasoning: string | null }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return <span className="text-text-disabled text-xs">—</span>;
  const short = reasoning.length > 80;
  return (
    <div className="text-xs text-text-secondary leading-relaxed">
      <span>{open || !short ? reasoning : `${reasoning.slice(0, 80)}…`}</span>
      {short && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="ml-1.5 text-amber/70 hover:text-amber inline-flex items-center gap-0.5"
        >
          {open ? <><ChevronUp className="h-3 w-3" />less</> : <><ChevronDown className="h-3 w-3" />more</>}
        </button>
      )}
    </div>
  );
}

function ConstraintBadges({ row }: { row: ProposalData }) {
  const tags: { label: string; color: string }[] = [];
  if (row.minStay && row.minStay > 1) tags.push({ label: `${row.minStay}N min`, color: "bg-blue-500/10 text-blue-400 border-blue-500/20" });
  if (row.maxStay && row.maxStay < 30) tags.push({ label: `${row.maxStay}N max`, color: "bg-purple-500/10 text-purple-400 border-purple-500/20" });
  if (row.closedToArrival) tags.push({ label: "No arrival", color: "bg-red-500/10 text-red-400 border-red-500/20" });
  if (row.closedToDeparture) tags.push({ label: "No depart", color: "bg-red-500/10 text-red-400 border-red-500/20" });
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((t) => (
        <span key={t.label} className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border", t.color)}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

export function PricingClient({ initialProposals }: { initialProposals: ProposalData[] }) {
  const [proposals, setProposals] = useState<ProposalData[]>(initialProposals);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === proposals.length ? new Set() : new Set(proposals.map((p) => p.id)));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch(`/api/proposals/bulk-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: ids }),
      });
      if (!res.ok) throw new Error();
      const { count } = await res.json();
      toast.success(`${count} proposals ${action}d.`);
      setProposals((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
    } catch {
      toast.error(`Failed to ${action} proposals.`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Summary stats
  const increases = proposals.filter((p) => (p.changePct ?? 0) > 0).length;
  const decreases = proposals.filter((p) => (p.changePct ?? 0) < 0).length;
  const avgDelta =
    proposals.length > 0
      ? Math.round(proposals.reduce((s, p) => s + (p.changePct ?? 0), 0) / proposals.length)
      : 0;

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        </div>
        <h3 className="text-xl font-bold text-text-primary">All caught up</h3>
        <p className="text-text-secondary text-sm text-center max-w-sm">
          No pending proposals. The engine will surface new opportunities as market conditions change.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending", value: proposals.length, color: "text-amber-400" },
          { label: "Price Increases", value: increases, color: "text-green-400" },
          { label: "Price Decreases", value: decreases, color: "text-red-400" },
          { label: "Avg Change", value: `${avgDelta > 0 ? "+" : ""}${avgDelta}%`, color: avgDelta >= 0 ? "text-green-400" : "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-text-tertiary mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <Checkbox
              checked={selectedIds.size === proposals.length && proposals.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            Select all ({proposals.length})
          </label>
          {selectedIds.size > 0 && (
            <span className="text-xs text-amber font-medium">{selectedIds.size} selected</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIds.size === 0 || isProcessing}
            onClick={() => handleBulkAction("reject")}
            className="h-8 px-3 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10 gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.size === 0 || isProcessing}
            onClick={() => handleBulkAction("approve")}
            className="h-8 px-4 text-xs bg-amber text-black hover:bg-amber/90 gap-1.5"
          >
            {isProcessing ? (
              <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approve Selected
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_7rem_6rem_6rem_5rem_1fr] gap-4 items-center px-5 py-2.5 border-b border-white/5 bg-white/[0.02]">
          <span />
          <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider">Property</span>
          <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider">Date</span>
          <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider text-right">Current</span>
          <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider text-right">Proposed</span>
          <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider text-center">Change</span>
          <span className="text-[11px] font-semibold text-text-disabled uppercase tracking-wider">Reasoning</span>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {proposals.map((prop) => (
            <div
              key={prop.id}
              onClick={() => toggleSelect(prop.id)}
              className={cn(
                "grid grid-cols-[2rem_1fr_7rem_6rem_6rem_5rem_1fr] gap-4 items-start px-5 py-3.5 cursor-pointer transition-colors",
                selectedIds.has(prop.id) ? "bg-amber/5" : "hover:bg-white/[0.02]"
              )}
            >
              {/* Checkbox */}
              <div className="pt-0.5">
                <Checkbox
                  checked={selectedIds.has(prop.id)}
                  onCheckedChange={() => toggleSelect(prop.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Property */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
                  <span className="text-sm font-medium text-text-primary truncate">{prop.listingName}</span>
                </div>
                <ConstraintBadges row={prop} />
              </div>

              {/* Date */}
              <div>
                <p className="text-xs font-medium text-text-primary">
                  {format(parseISO(prop.date), "MMM d")}
                </p>
                <p className="text-[10px] text-text-disabled">
                  {format(parseISO(prop.date), "yyyy, EEE")}
                </p>
              </div>

              {/* Current */}
              <p className="text-xs text-text-disabled text-right tabular-nums line-through">
                {prop.currentPrice}
              </p>

              {/* Proposed */}
              <p className="text-sm font-bold text-text-primary text-right tabular-nums">
                {prop.proposedPrice ?? "—"}
              </p>

              {/* Change */}
              <div className="flex justify-center">
                <DeltaBadge pct={prop.changePct} />
              </div>

              {/* Reasoning */}
              <div onClick={(e) => e.stopPropagation()}>
                <ReasoningCell reasoning={prop.reasoning} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

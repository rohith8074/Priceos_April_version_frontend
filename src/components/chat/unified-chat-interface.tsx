"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send, Loader2, Settings,
  PanelRightClose, PanelRightOpen, Building2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Custom markdown renderer — handles tables, headings, lists, code without @tailwindcss/typography
function MarkdownMessage({ content, isUser }: { content: string; isUser: boolean }) {
  const mutedText = isUser ? "text-primary-foreground/70" : "text-muted-foreground";
  const baseText = isUser ? "text-primary-foreground" : "text-foreground/90";

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border/40">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-[10px]">{children}</thead>
        ),
        tbody: ({ children }) => <tbody className="divide-y divide-border/30">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-muted/20 transition-colors">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-black whitespace-nowrap">{children}</th>
        ),
        td: ({ children }) => <td className="px-3 py-2 whitespace-nowrap">{children}</td>,
        // Headings
        h1: ({ children }) => <h1 className={`text-base font-black mt-3 mb-1 ${baseText}`}>{children}</h1>,
        h2: ({ children }) => <h2 className={`text-sm font-black mt-3 mb-1 ${baseText}`}>{children}</h2>,
        h3: ({ children }) => <h3 className={`text-xs font-black uppercase tracking-wider mt-3 mb-1 ${mutedText}`}>{children}</h3>,
        // Inline
        strong: ({ children }) => <strong className={`font-black ${baseText}`}>{children}</strong>,
        em: ({ children }) => <em className="italic opacity-80">{children}</em>,
        // Paragraphs & lists
        p: ({ children }) => <p className={`text-sm leading-relaxed mb-2 last:mb-0 ${baseText}`}>{children}</p>,
        ul: ({ children }) => <ul className={`list-disc pl-4 mb-2 space-y-0.5 text-sm ${baseText}`}>{children}</ul>,
        ol: ({ children }) => <ol className={`list-decimal pl-4 mb-2 space-y-0.5 text-sm ${baseText}`}>{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Code
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <pre className="bg-muted/40 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono border border-border/30"><code>{children}</code></pre>
            : <code className="bg-muted/40 px-1.5 py-0.5 rounded text-[11px] font-mono border border-border/20">{children}</code>;
        },
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className={`border-l-2 border-primary/40 pl-3 my-2 ${mutedText} italic text-sm`}>{children}</blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="border-border/30 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

import { useContextStore } from "@/stores/context-store";
import type { PropertyWithMetrics } from "@/types";
import { DateRangePicker } from "./date-range-picker";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { toast } from "sonner";
import { readSSEStream } from "@/lib/chat/sse-reader";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: any[];
  proposalStatus?: "pending" | "saved" | "rejected";
  // per-proposal approve/reject decisions keyed by proposal_id
  proposalDecisions?: Record<string, "approved" | "rejected">;
}

interface Props {
  properties: PropertyWithMetrics[];
}

// Pricing Agent Interface

// Focused Pricing Agent Interface

export function UnifiedChatInterface({ properties: _properties }: Props) {
  const {
    contextType,
    propertyId,
    propertyName,
    isSidebarOpen,
    toggleSidebar,
    dateRange,
    setDateRange,
    triggerMarketRefresh,
    setCalendarMetrics: setGlobalMetrics,
  } = useContextStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [isChatActive, setIsChatActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** After "Run Aria" succeeds, history may still be empty — async /api/chat/history must not flip chat back to OFFLINE. */
  const ariaReadySessionRef = useRef<string | null>(null);
  const scopeKeyRef = useRef<{ propertyId?: string; from?: number; to?: number }>({});

  const ARIA_READY_STORAGE_PREFIX = "priceos-aria-chat-ready:";

  const readAriaReadyFromStorage = useCallback((sessionKey: string) => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(`${ARIA_READY_STORAGE_PREFIX}${sessionKey}`) === "1";
    } catch {
      return false;
    }
  }, []);

  const writeAriaReadyToStorage = useCallback((sessionKey: string) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(`${ARIA_READY_STORAGE_PREFIX}${sessionKey}`, "1");
    } catch {
      /* quota / private mode */
    }
  }, []);

  const isAriaReadyForSession = useCallback(
    (expectedSessionId: string) =>
      ariaReadySessionRef.current === expectedSessionId ||
      readAriaReadyFromStorage(expectedSessionId),
    [readAriaReadyFromStorage]
  );

  // Generate a unique session ID
  const generateSessionId = () => `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Session is keyed to property + date range so each Market Analysis run gets an isolated chat
  const buildSessionId = (pid: string | undefined, from: string, to: string) =>
    pid ? `property-${pid}-${from}-${to}` : generateSessionId();

  const [sessionId, setSessionId] = useState<string>(() =>
    buildSessionId(
      propertyId || undefined,
      dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start",
      dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end"
    )
  );

  useEffect(() => {
    const today = startOfDay(new Date());
    const maxTo = addDays(today, 30);

    if (!dateRange?.from || !dateRange?.to) {
      setDateRange({ from: today, to: maxTo });
      return;
    }

    const from = startOfDay(dateRange.from);
    const to = startOfDay(dateRange.to);
    const spanDays = differenceInCalendarDays(to, from);
    const needsClamp = from < today || to > maxTo || spanDays > 30 || to < from;

    if (needsClamp) {
      const safeFrom = from < today ? today : from;
      const safeToCandidate = to > maxTo ? maxTo : to;
      const safeTo =
        safeToCandidate < safeFrom
          ? safeFrom
          : differenceInCalendarDays(safeToCandidate, safeFrom) > 30
          ? addDays(safeFrom, 30)
          : safeToCandidate;
      setDateRange({ from: safeFrom, to: safeTo });
    }
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime(), setDateRange]);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Fetching helper removed since it's now in GuestChatInterface

  // Dynamic calendar metrics (occupancy + avg price for selected date range)
  const [calendarMetrics, setCalendarMetrics] = useState<any | null>(null);

  // 1. Session Initialization & Hydration
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const fromT = dateRange?.from?.getTime();
    const toT = dateRange?.to?.getTime();
    const prev = scopeKeyRef.current;
    if (prev.propertyId !== propertyId || prev.from !== fromT || prev.to !== toT) {
      ariaReadySessionRef.current = null;
      scopeKeyRef.current = { propertyId: propertyId ?? undefined, from: fromT, to: toT };
    }

    // Build the expected session ID for this property + date range combo
    const expectedSessionId = buildSessionId(
      contextType === "property" && propertyId ? propertyId : undefined,
      dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start",
      dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end"
    );

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const propParam = contextType === "property" && propertyId ? propertyId : "null";
        const res = await fetch(`/api/chat/history?propertyId=${propParam}&sessionId=${encodeURIComponent(expectedSessionId)}`);

        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
            setIsChatActive(true);
            setSessionId(expectedSessionId);
            ariaReadySessionRef.current = expectedSessionId;
            writeAriaReadyToStorage(expectedSessionId);
          } else {
            setMessages([]);
            setSessionId(expectedSessionId);
            // Keep chat ONLINE if user already ran Aria for this session (fixes race with late history fetch)
            setIsChatActive(isAriaReadyForSession(expectedSessionId));
          }
        }
      } catch (err) {
        console.error("Failed to fetch chat history", err);
        setSessionId(expectedSessionId);
        setMessages([]);
        setIsChatActive(isAriaReadyForSession(expectedSessionId));
      } finally {
        setIsHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [contextType, propertyId, dateRange?.from?.getTime(), dateRange?.to?.getTime(), isAriaReadyForSession, writeAriaReadyToStorage]);

  // Fetch calendar metrics when date range or property changes
  useEffect(() => {
    const fetchMetrics = async () => {
      if (contextType !== "property" || !propertyId || !dateRange?.from || !dateRange?.to) {
        setCalendarMetrics(null);
        setGlobalMetrics(null);
        return;
      }

      try {
        const from = format(dateRange.from, "yyyy-MM-dd");
        const to = format(dateRange.to, "yyyy-MM-dd");
        const res = await fetch(`/api/calendar-metrics?listingId=${propertyId}&from=${from}&to=${to}`);

        if (res.ok) {
          const data = await res.json();
          const metrics = {
            occupancy: data.occupancy,
            avgPrice: data.avgPrice,
            bookedDays: data.bookedDays,
            availableDays: data.availableDays,
            blockedDays: data.blockedDays,
            totalDays: data.totalDays,
            calendarDays: data.calendarDays,
            reservations: data.reservations,
          };
          setCalendarMetrics(metrics);
          setGlobalMetrics(metrics);
        }
      } catch (err) {
        console.error("Failed to fetch calendar metrics:", err);
      }
    };

    fetchMetrics();
  }, [contextType, propertyId, dateRange?.from?.getTime(), dateRange?.to?.getTime(), setGlobalMetrics]);

  const handleMarketSetup = async () => {
    if (isSettingUp || !dateRange?.from || !dateRange?.to) return;

    // Guardrails are no longer a blocker — Agent 10 will set them if they are 0!

    setIsSettingUp(true);
    useContextStore.getState().setIsMarketAnalysisRunning(true);

    toast("Initializing Aria...", {
      description: "Setting up research agents for your location...",
    });

    try {
      // Simulate multiple toast stages for better UX since it takes a few seconds
      setTimeout(() => {
        if (useContextStore.getState().isMarketAnalysisRunning) {
          toast("Searching Internet...", {
            description: "Scanning for global events, holidays, and competitor rates...",
          });
        }
      }, 3000);

      setTimeout(() => {
        if (useContextStore.getState().isMarketAnalysisRunning) {
          toast("Benchmarking...", {
            description: "Calculating market percentiles and price positioning...",
          });
        }
      }, 7000);

      const response = await fetch("/api/market-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRange: {
            from: format(dateRange.from, "yyyy-MM-dd"),
            to: format(dateRange.to, "yyyy-MM-dd"),
          },
          context: {
            type: contextType,
            propertyId,
            propertyName,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.includes("403") || data.error?.includes("permission")) {
          throw new Error("Lyzr Permission Error: Your API key doesn't have permission to access this Agent.");
        }
        throw new Error(data.error || "Analysis failed");
      }

      // ── New session per date range: clear chat history and generate a fresh session ID ──
      const newFrom = format(dateRange.from, "yyyy-MM-dd");
      const newTo = format(dateRange.to, "yyyy-MM-dd");
      const newSessionId = buildSessionId(propertyId || undefined, newFrom, newTo);

      setMessages([]);          // clear chat history for this new session
      setSessionId(newSessionId); // isolate Lyzr conversation
      ariaReadySessionRef.current = newSessionId;
      writeAriaReadyToStorage(newSessionId);
      setIsChatActive(true);

      console.log("🔍 Market Analysis Data Received:", {
        eventsCount: data.eventsCount,
        hasTrace: !!data.sqlTrace,
        traceLength: data.sqlTrace?.length
      });

      // ── TECHNICAL PIPELINE TRACE ──
      // Log to console for debugging, don't clutter the chat UI
      if (data.sqlTrace && data.sqlTrace.length > 0) {
        console.log(`🛠️ [Data Pipeline] ${data.sqlTrace.length} queries executed:`);
        data.sqlTrace.forEach((t: any) => console.log(`  → ${t.name}: ${t.sql.substring(0, 80)}...`));
      }

      // Start with a clean chat — no trace messages
      setMessages([]);

      toast.success("Aria is Ready", {
        description: `Analyzed ${data.eventsCount} market signals in ${data.duration}. Ask me anything!`,
      });

      if (data.guardrailsSetByAi && data.guardrails) {
        // Wait a slight moment so they don't overlap too intensely
        setTimeout(() => {
          toast.info("Auto-Guardrails Configured", {
            description: "Aria has set the floor and ceiling values automatically based on market intelligence. Check them; if you want, you can overwrite them too.",
            duration: 8000, // Longer duration for reading
          });
        }, 800);
      }

      triggerMarketRefresh();
      // Data injection now happens automatically on the user's first real message
      // in route.ts — no need for a separate grounding call.


    } catch (error) {
      console.error("Market Analysis Error:", error);
      toast.error("Analysis Failed", {
        description: error instanceof Error ? error.message : "Marketing Agent could not be reached.",
      });
    } finally {
      setIsSettingUp(false);
      useContextStore.getState().setIsMarketAnalysisRunning(false);
    }
  };

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStatusText("Connecting to PriceOS…");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          context: {
            type: contextType,
            propertyId: contextType === "property" ? propertyId : undefined,
            propertyName: contextType === "property" ? propertyName : undefined,
            metrics: calendarMetrics ? {
              occupancy: calendarMetrics.occupancy,
              bookedDays: calendarMetrics.bookedDays,
              availableDays: calendarMetrics.availableDays,
              blockedDays: calendarMetrics.blockedDays,
              totalDays: calendarMetrics.totalDays,
              bookableDays: calendarMetrics.totalDays - calendarMetrics.blockedDays,
              avgPrice: calendarMetrics.avgPrice,
            } : undefined
          },
          dateRange: dateRange ? {
            from: format(dateRange.from!, "yyyy-MM-dd"),
            to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : format(dateRange.from!, "yyyy-MM-dd"),
          } : undefined,
          isChatActive,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      await readSSEStream(
        response,
        (msg) => setStatusText(msg),
        (data) => {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.message || "Sorry, I couldn't get a response.",
            proposals: data.proposals || undefined,
            proposalStatus: data.proposals ? "pending" : undefined,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        },
        (errMsg) => {
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: errMsg || "Sorry, something went wrong.",
          };
          setMessages((prev) => [...prev, errorMessage]);
        },
      );
    } catch (error) {
      console.error(`Chat Error:`, error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error connecting to the agent. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  };

  // Per-proposal approve/reject decision
  const handleProposalDecision = (messageId: string, proposalId: string, decision: "approved" | "rejected") => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, proposalDecisions: { ...msg.proposalDecisions, [proposalId]: decision } }
          : msg
      )
    );
  };

  const handleSaveProposals = (messageId: string, proposals: any[]) => {
    // Only save proposals that have been individually approved (or all if none decided yet)
    const msg = messages.find(m => m.id === messageId);
    const decisions = msg?.proposalDecisions || {};
    const toSave = proposals.filter(p => {
      const id = p.proposal_id;
      // If user explicitly approved → save. If no decision yet + guard is APPROVED/FLAGGED → save.
      if (decisions[id] === "rejected") return false;
      if (decisions[id] === "approved") return true;
      return p.guard_verdict !== "REJECTED";
    });

    if (toSave.length === 0) {
      toast.info("No proposals to save — all were rejected.");
      return;
    }

    // ── OPTIMISTIC: flip UI to "saved" immediately ──
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, proposalStatus: "saved" } : msg
      )
    );
    toast.success(`Saving ${toSave.length} proposal${toSave.length > 1 ? "s" : ""} to Pricing…`, {
      description: "They will appear in the Pricing section for review.",
    });

    // ── BACKGROUND: fire-and-forget DB write ──
    // Map agent snake_case fields → API camelCase fields and inject listingId from context
    const mappedProposals = toSave.map((p: any) => ({
      listingId: propertyId,                        // required by the API — comes from context
      date: p.date,
      proposedPrice: p.proposed_price ?? p.proposedPrice,
      changePct: p.change_pct ?? p.changePct,
      reasoning: typeof p.reasoning === "object"
        ? Object.values(p.reasoning as Record<string, string>).filter(Boolean).join(" | ")
        : (p.reasoning ?? ""),
    }));

    fetch("/api/proposals/bulk-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposals: mappedProposals }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Save failed (${res.status})`);
        }
        const data = await res.json();
        console.log(`✅ Saved ${data.modified ?? data.savedCount} proposals to Pricing`);
      })
      .catch((err) => {
        console.error("Proposal save error:", err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, proposalStatus: "pending" } : msg
          )
        );
        toast.error("Save failed — please try again.");
      });
  };

  const handleRejectProposals = (messageId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, proposalStatus: "rejected" } : msg
      )
    );
    toast.info("All proposals rejected. No changes were made.");
  };

  if (contextType === "portfolio") {
    return (
      <div className="flex flex-col flex-1 items-center justify-center h-full text-muted-foreground p-8 text-center bg-muted/5">
        <Building2 className="h-16 w-16 mb-6 opacity-10" />
        <h3 className="text-xl font-bold text-foreground">Select a Property</h3>
        <p className="mt-2 text-sm max-w-sm">
          Please select a property from the sidebar to view metrics, market signals, and chat with the AI Pricing Analyst.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <div className="border-b bg-background flex flex-col shrink-0 relative z-10 shadow-sm">
        <div className="flex flex-wrap items-center justify-between px-6 py-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <Send className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                {contextType === "property" && propertyName ? propertyName : "Portfolio Overview"}
              </h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Pricing & Market Copilot
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isSidebarOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={toggleSidebar}
              className="h-9 gap-2"
            >
              {isSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              <span className="hidden sm:inline font-bold">Sidebar</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/30 p-1.5 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors">

            <div className="flex bg-muted p-1 rounded-xl shrink-0">
              <Button
                variant="default"
                size="sm"
                className="h-7 px-4 font-bold shadow-sm"
              >
                Pricing Agent
              </Button>
            </div>

            <div className="hidden sm:block h-6 w-px bg-border/50 mx-1" />

            <div id="tour-date-range">
              <DateRangePicker
                date={dateRange}
                setDate={(newRange) => {
                  setDateRange(newRange);
                  if (!newRange?.from || !newRange?.to) {
                    setIsChatActive(false);
                    ariaReadySessionRef.current = null;
                  }
                }}
              />
            </div>

            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span id="tour-run-aria" tabIndex={0} className="inline-flex">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMarketSetup}
                      disabled={isLoading || isSettingUp || !dateRange?.from || !dateRange?.to}
                      className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm"
                    >
                      <Settings className={`h-4 w-4 ${isSettingUp ? "animate-spin text-amber-500" : ""}`} />
                      <span className="hidden sm:inline">{isSettingUp ? "Processing..." : "Run Aria"}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
              </Tooltip>
            </TooltipProvider>

            <div className="hidden sm:block h-6 w-px bg-border/50 mx-1" />

            <div className="flex items-center gap-3 px-2">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">
                  Agent
                </span>
                <span className={`text-[10px] font-black tracking-widest leading-none ${isChatActive ? 'text-amber-500' : 'text-muted-foreground/50'}`}>
                  {isChatActive ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <Switch checked={isChatActive} disabled={true} className="data-[state=checked]:bg-amber-500 scale-90" />
            </div>

          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden relative">

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isHistoryLoading && <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 shadow-xl ${message.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-background/60 backdrop-blur-xl border border-border/50 text-foreground rounded-tl-none"}`}>
                  <div className="break-words">
                    <MarkdownMessage content={message.content} isUser={message.role === "user"} />
                  </div>
                  {message.proposals && message.proposals.length > 0 && (
                    <div className="mt-5 border border-border/40 rounded-2xl bg-white/5 backdrop-blur-md overflow-hidden shadow-inner">
                      {/* Header */}
                      <div className="bg-primary/5 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] border-b border-border/40 text-primary flex items-center justify-between">
                        <span>Live Price Proposals ({message.proposals.length})</span>
                        {message.proposalStatus === "saved" && (
                          <span className="text-emerald-500 text-[10px] font-black">✓ Saved to Pricing</span>
                        )}
                        {message.proposalStatus === "rejected" && (
                          <span className="text-muted-foreground text-[10px] font-black">✗ Rejected</span>
                        )}
                      </div>

                      {/* Proposal rows */}
                      <div className="p-4 text-sm space-y-4">
                        {message.proposals.map((prop, idx) => {
                          const decision = message.proposalDecisions?.[prop.proposal_id];
                          const isApproved = decision === "approved";
                          const isRejected = decision === "rejected" || prop.guard_verdict === "REJECTED";
                          const isFlagged = prop.guard_verdict === "FLAGGED";
                          const canApprove = (prop.action_buttons || []).includes("approve");
                          const alreadySaved = message.proposalStatus === "saved";

                          return (
                            <div key={idx} className={`flex flex-col gap-2.5 pb-4 border-b border-border/20 last:border-0 last:pb-0 rounded-lg px-2 pt-2 transition-colors ${isApproved ? "bg-emerald-500/5" : isRejected ? "bg-red-500/5 opacity-60" : ""}`}>
                              {/* Row 1: Date + price + verdict badge */}
                              <div className="flex justify-between font-bold items-center">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm tracking-tight text-foreground/80">{prop.date}</span>
                                  {prop.date_classification && (
                                    <Badge variant="outline" className="text-[9px] font-black uppercase hidden sm:inline-flex">
                                      {prop.date_classification}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {/* Guard verdict badge */}
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                                    prop.guard_verdict === "APPROVED" ? "bg-emerald-500/15 text-emerald-500" :
                                    prop.guard_verdict === "FLAGGED"  ? "bg-amber-500/15 text-amber-500" :
                                                                        "bg-red-500/15 text-red-500"
                                  }`}>
                                    {prop.guard_verdict === "APPROVED" ? "✓ Approved" : prop.guard_verdict === "FLAGGED" ? "⚠ Flagged" : "✗ Blocked"}
                                  </span>
                                  {/* Price */}
                                  <span className={`text-sm font-black tabular-nums ${prop.change_pct > 0 ? "text-emerald-500" : "text-amber-500"}`}>
                                    AED {prop.proposed_price}
                                    <span className="text-[10px] ml-1 opacity-70">({prop.change_pct > 0 ? "+" : ""}{prop.change_pct}%)</span>
                                  </span>
                                </div>
                              </div>

                              {/* Row 2: Risk + comparisons */}
                              <div className="flex flex-wrap gap-2 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                  prop.risk_level === "low"    ? "bg-emerald-500/10 text-emerald-600" :
                                  prop.risk_level === "medium" ? "bg-amber-500/10 text-amber-600" :
                                                                 "bg-red-500/10 text-red-500"
                                }`}>
                                  {prop.risk_level} risk
                                </span>
                                {prop.comparisons?.vs_p50 && (
                                  <span className="text-muted-foreground">vs P50 {prop.comparisons.vs_p50.diff_pct > 0 ? "+" : ""}{prop.comparisons.vs_p50.diff_pct}%</span>
                                )}
                                {prop.comparisons?.vs_recommended && (
                                  <span className="text-muted-foreground">vs recommended {prop.comparisons.vs_recommended.diff_pct > 0 ? "+" : ""}{prop.comparisons.vs_recommended.diff_pct}%</span>
                                )}
                                {prop.comparisons?.vs_top_comp?.comp_name && (
                                  <span className="text-muted-foreground">vs {prop.comparisons.vs_top_comp.comp_name} {prop.comparisons.vs_top_comp.diff_pct > 0 ? "+" : ""}{prop.comparisons.vs_top_comp.diff_pct}%</span>
                                )}
                              </div>

                              {/* Row 3: Primary reasoning */}
                              {(prop.reasoning?.reason_market || prop.reasoning?.reason_guardrails) && (
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                  {prop.reasoning.reason_guardrails && prop.guard_verdict === "REJECTED"
                                    ? `🛡 ${prop.reasoning.reason_guardrails}`
                                    : prop.reasoning.reason_market
                                      ? `📊 ${prop.reasoning.reason_market}`
                                      : null}
                                </p>
                              )}

                              {/* Row 4: FLAGGED caution */}
                              {isFlagged && (
                                <p className="text-[11px] text-amber-500/80 leading-snug bg-amber-500/5 rounded px-2 py-1">
                                  ⚠ PriceGuard flagged this for review — outside normal range but not hard-blocked. Approve with caution.
                                </p>
                              )}

                              {/* Row 5: Per-proposal action buttons */}
                              {!alreadySaved && message.proposalStatus !== "rejected" && (
                                <div className="flex items-center gap-2 pt-1">
                                  {canApprove && !isRejected && (
                                    <button
                                      onClick={() => handleProposalDecision(message.id, prop.proposal_id, isApproved ? "approved" : "approved")}
                                      className={`text-[10px] font-black px-3 py-1 rounded-full border transition-all ${
                                        isApproved
                                          ? "bg-emerald-500 text-white border-emerald-500"
                                          : "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                                      }`}
                                    >
                                      {isApproved ? "✓ Approved" : "Approve"}
                                    </button>
                                  )}
                                  {!isRejected && (
                                    <button
                                      onClick={() => handleProposalDecision(message.id, prop.proposal_id, "rejected")}
                                      className="text-[10px] font-black px-3 py-1 rounded-full border border-red-400/40 text-red-400 hover:bg-red-500/10 transition-all"
                                    >
                                      Reject
                                    </button>
                                  )}
                                  {prop.guard_verdict === "REJECTED" && (
                                    <span className="text-[10px] text-red-400/70 font-bold">Blocked by PriceGuard — cannot approve</span>
                                  )}
                                  {decision === "rejected" && (
                                    <button
                                      onClick={() => handleProposalDecision(message.id, prop.proposal_id, "approved")}
                                      className="text-[10px] text-muted-foreground underline"
                                    >
                                      Undo
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer: Save all / Reject all */}
                      {message.proposalStatus === "pending" && (
                        <div className="px-4 py-3 border-t border-border/40 bg-muted/20 flex items-center justify-between gap-3">
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Approve individual proposals above, then save to the Pricing section.
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleRejectProposals(message.id)}
                              className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:bg-muted transition-colors"
                            >
                              Reject All
                            </button>
                            <button
                              onClick={() => handleSaveProposals(message.id, message.proposals!)}
                              className="text-[11px] font-bold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                            >
                              Save to Pricing →
                            </button>
                          </div>
                        </div>
                      )}

                      {message.proposalStatus === "saved" && (
                        <div className="px-4 py-3 border-t border-border/40 bg-emerald-500/5 flex items-center gap-2">
                          <span className="text-[11px] text-emerald-600 font-black">✓ Saved to Pricing section</span>
                          <span className="text-[10px] text-muted-foreground">— review and push to Hostaway from the Pricing page</span>
                        </div>
                      )}

                      {message.proposalStatus === "rejected" && (
                        <div className="px-4 py-3 border-t border-border/40 bg-muted/10 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground font-bold">✗ All proposals rejected. No changes made.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex justify-start"><Card className="max-w-2xl"><CardContent className="p-4 flex items-center space-x-3"><Loader2 className="h-4 w-4 animate-spin text-amber" /><span className="text-sm text-muted-foreground animate-pulse">{statusText || "Thinking…"}</span></CardContent></Card></div>}
            <div ref={messagesEndRef} />
          </div>

          <div id="tour-chat-input" className="border-t p-4 bg-background">
            <form onSubmit={handleSubmit} className="flex space-x-2">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={!isChatActive ? "Select date range and click 'Run Aria' to start..." : "Ask about pricing, events, market rates..."}
                        disabled={isLoading || !isChatActive}
                        className="w-full"
                      />
                    </div>
                  </TooltipTrigger>
                </Tooltip>
              </TooltipProvider>
              <Button type="submit" disabled={isLoading || !input.trim() || !isChatActive}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div >
  );
}

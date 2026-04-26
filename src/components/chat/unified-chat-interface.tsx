"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send, Loader2, Settings,
  PanelRightClose, PanelRightOpen, Building2, MessageSquarePlus,
} from "lucide-react";
import {
  IconCircleCheck,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Maximize2, Zap, Activity } from "lucide-react";
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
import { pollJob } from "@/lib/api/poll-job";
import { normalizeChatAgentOutput, hydrateAssistantMessage } from "@/lib/chat/normalize-agent-response";
import { buildBaseScopeId, generateThreadSessionId } from "@/lib/chat/agent-session-id";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { LiveInferenceFlowGraph, type FlowStage } from "./live-inference-flow-graph";
import type { LyzrAgentEvent } from "@/hooks/use-lyzr-agent-events";


const GRAPH_STAGES: FlowStage[] = [
  { id: "routing", label: "CRO Router", status: "pending" },
  { id: "analyzing", label: "Property Analyst", status: "pending" },
  { id: "validating", label: "PriceGuard", status: "pending" },
  { id: "generating", label: "Response", status: "pending" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: any[];
  proposalStatus?: "pending" | "saved" | "rejected";
  // per-proposal approve/reject decisions keyed by proposal_id
  proposalDecisions?: Record<string, "approved" | "rejected">;
  metadata?: any;
}

interface ChatSessionRow {
  sessionId: string;
  lastMessageAt: string;
  messageCount: number;
}

interface Props {
  properties: PropertyWithMetrics[];
  orgId: string;
}

// Pricing Agent Interface

// Focused Pricing Agent Interface

export function UnifiedChatInterface({ properties: _properties, orgId }: Props) {
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
  const [showLiveGraph, setShowLiveGraph] = useState(false);
  const [stages, setStages] = useState<FlowStage[]>(GRAPH_STAGES);
  const [graphEvents, setGraphEvents] = useState<LyzrAgentEvent[]>([]);
  const [graphFlowStatus, setGraphFlowStatus] = useState<string>("pending");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync stages with constant when initialized
  useEffect(() => {
    setStages(GRAPH_STAGES.map(s => ({ ...s, status: "pending" })));
  }, []);

  const [sessionId, setSessionId] = useState<string>("");

  // Sync sessionId with context
  useEffect(() => {
    const newId = buildBaseScopeId(
      propertyId || undefined,
      dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start",
      dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end"
    );
    setSessionId(newId);
  }, [propertyId, dateRange]);

  const [lastThinkingMessage, setLastThinkingMessage] = useState<string | null>(null);
  /** After "Run Aria" succeeds, history may still be empty — async /api/chat/history must not flip chat back to OFFLINE. */
  const ariaReadyScopeRef = useRef<string | null>(null);
  const scopeKeyRef = useRef<{ propertyId?: string; from?: number; to?: number }>({});

  const ARIA_READY_STORAGE_PREFIX = "priceos-aria-chat-ready:";
  const THREAD_PREF_STORAGE_PREFIX = "priceos-agent-thread:";

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

  const readThreadPref = useCallback((baseScopeId: string): string => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(`${THREAD_PREF_STORAGE_PREFIX}${baseScopeId}`) || "";
    } catch {
      return "";
    }
  }, []);

  const writeThreadPref = useCallback((baseScopeId: string, threadSessionId: string) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(`${THREAD_PREF_STORAGE_PREFIX}${baseScopeId}`, threadSessionId);
    } catch {
      /* quota / private mode */
    }
  }, []);

  const loadThreadMessages = useCallback(
    async (threadSessionId: string): Promise<number> => {
      const propParam = contextType === "property" && propertyId ? propertyId : "null";
      const res = await fetch(
        `/api/chat/history?propertyId=${propParam}&sessionId=${encodeURIComponent(threadSessionId)}`
      );
      if (res.ok) {
        const data = await res.json();
        const list = data.messages || [];
        if (list.length > 0) {
          setMessages(list.map((m: Message) => hydrateAssistantMessage(m)));
          return list.length;
        }
        setMessages([]);
        return 0;
      }
      setMessages([]);
      return 0;
    },
    [contextType, propertyId]
  );

  const isAriaReadyForScope = useCallback(
    (baseScopeId: string) =>
      ariaReadyScopeRef.current === baseScopeId ||
      readAriaReadyFromStorage(baseScopeId),
    [readAriaReadyFromStorage]
  );



  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);

  const sessionSelectOptions = useMemo(() => {
    const map = new Map<string, ChatSessionRow>();
    for (const s of chatSessions) {
      map.set(s.sessionId, s);
    }
    if (sessionId && !map.has(sessionId)) {
      map.set(sessionId, {
        sessionId,
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
      });
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }, [chatSessions, sessionId]);

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
      ariaReadyScopeRef.current = null;
      scopeKeyRef.current = { propertyId: propertyId ?? undefined, from: fromT, to: toT };
    }

    const fromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start";
    const toStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end";
    const baseScopeId = buildBaseScopeId(
      contextType === "property" && propertyId ? propertyId : undefined,
      fromStr,
      toStr
    );

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const propParam = contextType === "property" && propertyId ? propertyId : "null";

        let sessions: ChatSessionRow[] = [];
        if (contextType === "property" && propertyId && fromStr !== "start" && toStr !== "end") {
          const sessionsRes = await fetch(
            `/api/chat/sessions?propertyId=${encodeURIComponent(propertyId)}&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`
          );
          if (sessionsRes.ok) {
            const sd = await sessionsRes.json();
            sessions = sd.sessions || [];
            setChatSessions(sessions);
          }
        } else {
          setChatSessions([]);
        }

        const pref = readThreadPref(baseScopeId);
        const chosen =
          pref && sessions.some((s) => s.sessionId === pref)
            ? pref
            : sessions[0]?.sessionId ?? baseScopeId;

        setSessionId(chosen);
        writeThreadPref(baseScopeId, chosen);

        const res = await fetch(
          `/api/chat/history?propertyId=${propParam}&sessionId=${encodeURIComponent(chosen)}`
        );

        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages.map((m: Message) => hydrateAssistantMessage(m)));
            setIsChatActive(true);
            ariaReadyScopeRef.current = baseScopeId;
            writeAriaReadyToStorage(baseScopeId);
          } else {
            setMessages([]);
            setIsChatActive(isAriaReadyForScope(baseScopeId));
          }
        }
      } catch (err) {
        console.error("Failed to fetch chat history", err);
        setSessionId(baseScopeId);
        setMessages([]);
        setIsChatActive(isAriaReadyForScope(baseScopeId));
      } finally {
        setIsHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [
    contextType,
    propertyId,
    dateRange?.from?.getTime(),
    dateRange?.to?.getTime(),
    isAriaReadyForScope,
    writeAriaReadyToStorage,
    readThreadPref,
    writeThreadPref,
  ]);

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

      // ── New Lyzr thread for this property + date range (keeps history of older threads in DB) ──
      const newFrom = format(dateRange.from, "yyyy-MM-dd");
      const newTo = format(dateRange.to, "yyyy-MM-dd");
      const baseScopeId = buildBaseScopeId(propertyId || undefined, newFrom, newTo);
      const newSessionId = generateThreadSessionId(baseScopeId);

      setMessages([]);
      setSessionId(newSessionId);
      writeThreadPref(baseScopeId, newSessionId);
      ariaReadyScopeRef.current = baseScopeId;
      writeAriaReadyToStorage(baseScopeId);
      setIsChatActive(true);
      setChatSessions((prev) => [
        { sessionId: newSessionId, lastMessageAt: new Date().toISOString(), messageCount: 0 },
        ...prev.filter((s) => s.sessionId !== newSessionId),
      ]);

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
    setShowLiveGraph(true);

    // Reset graph state immediately for new query
    setGraphEvents([]);
    setGraphFlowStatus("active");
    setLastThinkingMessage(null);
    setStages(prev => prev.map(s => ({ ...s, status: "pending" })));

    // Seed the initial "pipeline started" event
    setGraphEvents([{
      event_type: "agent_process_start",
      message: "Starting Agentic Pipeline...",
      thinking: "Analyzing context and routing request...",
      status: "active",
      timestamp: new Date().toISOString(),
      iteration: 1,
    }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          context: {
            type: contextType,
            propertyId: propertyId || undefined,
            propertyName: propertyName || undefined,
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
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const { jobId } = await response.json();

      const stepAgentMap: Record<string, { tool: string; agent: string }> = {
        routing:    { tool: "CRO Router",         agent: "CRO Router" },
        analyzing:  { tool: "Property Analyst",   agent: "Property Analyst" },
        validating: { tool: "PriceGuard",         agent: "PriceGuard" },
        generating: { tool: "Response Generator", agent: "CRO Router" },
      };
      const stepKeys = Object.keys(stepAgentMap);

      // Animate graph stages based on elapsed poll time
      const data = await pollJob<{ message: string; metadata?: unknown; proposals?: unknown[] }>(jobId, {
        onPoll: (elapsed) => {
          const idx = Math.min(Math.floor(elapsed / 8000), stepKeys.length - 1);
          const step = stepKeys[idx];
          const { tool, agent } = stepAgentMap[step];
          const now = new Date().toISOString();

          setStatusText(`${agent} is working…`);
          setLastThinkingMessage(`${agent} is working…`);

          setStages(prev => prev.map(s => {
            if (s.id === step) return { ...s, status: "active" };
            if (stepKeys.indexOf(s.id) < idx) return { ...s, status: "done" };
            return s;
          }));

          const completedEvents: LyzrAgentEvent[] = stepKeys.slice(0, idx).map((prevStep) => ({
            event_type: "tool_response",
            tool_name: stepAgentMap[prevStep].tool,
            agent_name: stepAgentMap[prevStep].agent,
            status: "completed",
            timestamp: now,
            iteration: 1,
          }));
          const activeEvent: LyzrAgentEvent = {
            event_type: "tool_called",
            tool_name: tool,
            agent_name: agent,
            status: "active",
            timestamp: now,
            iteration: 1,
          };
          setGraphEvents(prev => {
            const base = prev.filter(e => !Object.values(stepAgentMap).some(m => m.tool === e.tool_name));
            return [...base, ...completedEvents, activeEvent];
          });
        },
      });

      setStages(prev => prev.map(s => ({ ...s, status: "done" })));
      setGraphFlowStatus("done");
      setGraphEvents(prev => [
        ...prev,
        { event_type: "output_generated", message: "Analysis Complete", status: "done", timestamp: new Date().toISOString(), iteration: 1 },
      ]);

      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.message,
        metadata: data.metadata,
        proposals: data.proposals && data.proposals.length > 0 ? data.proposals : undefined,
        proposalStatus: data.proposals && data.proposals.length > 0 ? "pending" : undefined,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.proposals && data.proposals.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedProposals = (data.proposals as any[]).map((p) => ({
          listingId: propertyId,
          date: p.date,
          proposedPrice: p.proposed_price ?? p.proposedPrice,
          changePct: p.change_pct ?? p.changePct,
          reasoning: typeof p.reasoning === "object"
            ? Object.values(p.reasoning as Record<string, string>).filter(Boolean).join(" | ")
            : (p.reasoning ?? ""),
          status: "pending",
        }));
        fetch("/api/proposals/bulk-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, proposals: mappedProposals }),
        }).then(res => {
          if (res.ok) console.log("✅ Auto-saved proposals as pending");
        }).catch(err => console.error("Auto-save failed", err));
      }
    } catch (error) {
      console.error(`Chat Error:`, error);
      setGraphFlowStatus("failed");
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

  // Per-proposal approve/reject — permanent, no toggle. Approve saves immediately.
  const handleProposalDecision = (messageId: string, proposalId: string, decision: "approved" | "rejected") => {
    const msg = messages.find(m => m.id === messageId);
    // Once decided, don't allow changes
    if (msg?.proposalDecisions?.[proposalId]) return;

    // Update UI — mark this proposal as decided
    setMessages((prev) =>
      prev.map((m) =>
        m.id !== messageId
          ? m
          : { ...m, proposalDecisions: { ...(m.proposalDecisions || {}), [proposalId]: decision } }
      )
    );

    // When approved, mark the whole message as saved immediately
    if (decision === "approved") {
      setMessages((prev) =>
        prev.map((m) => (m.id !== messageId ? m : { ...m, proposalStatus: "saved" as const }))
      );
    }

    // ── SYNC: Save to Pricing section in DB ──
    const prop = msg?.proposals?.find(p => p.proposal_id === proposalId);
    if (prop) {
      const reasoning = typeof prop.reasoning === "object"
        ? Object.values(prop.reasoning as Record<string, string>).filter(Boolean).join(" | ")
        : (prop.reasoning ?? "");

      const mapped = {
        date: prop.date,
        currentPrice: prop.current_price ?? prop.currentPrice,
        proposedPrice: prop.proposed_price ?? prop.proposedPrice,
        changePct: prop.change_pct ?? prop.changePct,
        reasoning,
        status: decision,
        listingId: prop.listing_id || prop.listingId || propertyId,
      };

      const finalOrgId = orgId || (msg?.metadata?.orgId as string);
      if (!finalOrgId) {
        console.error("Cannot sync decision: missing orgId");
        return;
      }

      fetch("/api/proposals/bulk-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: finalOrgId, proposals: [mapped] }),
      }).then(res => {
        if (res.ok) {
          toast.success(
            decision === "approved"
              ? "Proposal approved & saved to Pricing section"
              : "Proposal rejected"
          );
        } else {
          toast.error("Failed to sync decision to Pricing section");
        }
      }).catch(err => {
        console.error("Failed to sync decision", err);
        toast.error("Network error syncing decision");
      });
    }
  };

  const handleRejectProposals = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.proposals) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, proposalStatus: "rejected" } : m
      )
    );

    // ── SYNC: Update all as rejected in DB ──
    const mapped = msg.proposals.map((p) => ({
      listingId: p.listing_id || p.listingId || propertyId,
      date: p.date,
      proposedPrice: p.proposed_price ?? p.proposedPrice,
      changePct: p.change_pct ?? p.changePct,
      reasoning: p.reasoning,
      status: "rejected"
    }));

    fetch("/api/proposals/bulk-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, proposals: mapped }),
    })
      .then(() => {
        toast.info("All proposals rejected. Status synced to inventory.");
      })
      .catch((err) => {
        console.error("Failed to sync reject all", err);
        toast.error("Failed to sync rejection to database");
      });
  };

  const handleNewChat = useCallback(() => {
    if (contextType !== "property" || !propertyId || !dateRange?.from || !dateRange?.to) {
      toast.error("Select a property and date range first.");
      return;
    }
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    const baseScopeId = buildBaseScopeId(propertyId, fromStr, toStr);
    const newId = generateThreadSessionId(baseScopeId);
    setSessionId(newId);
    writeThreadPref(baseScopeId, newId);
    setMessages([]);
    setIsChatActive(isAriaReadyForScope(baseScopeId));
    setChatSessions((prev) => [
      { sessionId: newId, lastMessageAt: new Date().toISOString(), messageCount: 0 },
      ...prev.filter((s) => s.sessionId !== newId),
    ]);
    toast.success("New chat started", {
      description: "Same property and dates — a fresh thread. Older chats stay in history.",
    });
  }, [contextType, propertyId, dateRange, writeThreadPref, isAriaReadyForScope]);

  const handleSessionSelect = useCallback(
    async (nextId: string) => {
      if (nextId === sessionId) return;
      if (contextType !== "property" || !propertyId || !dateRange?.from || !dateRange?.to) return;
      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");
      const baseScopeId = buildBaseScopeId(propertyId, fromStr, toStr);
      setIsHistoryLoading(true);
      setSessionId(nextId);
      writeThreadPref(baseScopeId, nextId);
      try {
        const n = await loadThreadMessages(nextId);
        setIsChatActive(n > 0 || isAriaReadyForScope(baseScopeId));
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [
      sessionId,
      contextType,
      propertyId,
      dateRange,
      writeThreadPref,
      loadThreadMessages,
      isAriaReadyForScope,
    ]
  );

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
              variant="outline"
              size="sm"
              onClick={() => setShowLiveGraph((v) => !v)}
              className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm"
            >
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">{showLiveGraph ? "Hide Graph" : "Live Graph"}</span>
            </Button>
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
                    ariaReadyScopeRef.current = null;
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

            {contextType === "property" && propertyId && dateRange?.from && dateRange?.to && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleNewChat}
                  disabled={isLoading || isSettingUp}
                  className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm shrink-0"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  <span className="hidden sm:inline">New chat</span>
                </Button>
                {sessionSelectOptions.length > 0 && (
                  <Select value={sessionId} onValueChange={handleSessionSelect}>
                    <SelectTrigger className="h-9 w-[min(240px,42vw)] text-[10px] font-bold bg-background border-border/50 shrink-0">
                      <SelectValue placeholder="Chat thread" />
                    </SelectTrigger>
                    <SelectContent>
                      {sessionSelectOptions.map((s, i) => (
                        <SelectItem key={s.sessionId} value={s.sessionId} className="text-xs font-medium">
                          Chat {sessionSelectOptions.length - i} · {s.messageCount} msg
                          {s.messageCount === 1 ? "" : "s"} · {format(new Date(s.lastMessageAt), "MMM d")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}

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

          {/* LIVE GRAPH OVERLAY */}
          {showLiveGraph && (
            <div className="absolute top-0 right-0 left-0 sm:left-auto h-[400px] w-full sm:w-[500px] z-40 bg-background/95 backdrop-blur-xl border-l border-b border-border shadow-2xl sm:rounded-bl-3xl overflow-hidden flex flex-col transition-all duration-300">
              <div className="px-4 py-2 bg-muted/30 border-b border-border/50 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${isLoading ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`} />
                  Execution Graph
                </span>
                <div className="flex items-center gap-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground">
                        <Maximize2 className="h-3 w-3" />
                        Expand
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] p-0 overflow-hidden flex flex-col">
                      <DialogHeader className="px-6 py-4 border-b shrink-0 bg-muted/20">
                        <DialogTitle className="flex items-center gap-3">
                          <Activity className="h-5 w-5 text-emerald-600" />
                          <div className="flex flex-col">
                            <span className="text-base font-black tracking-tight">Full Execution Trace</span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Detailed Agent & Tool Interaction Lineage</span>
                          </div>
                        </DialogTitle>
                      </DialogHeader>
                      <div className="flex-1 relative bg-grid-black/[0.01]">
                        <LiveInferenceFlowGraph
                          stages={stages}
                          streamEvents={graphEvents}
                          flowStatus={graphFlowStatus}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-muted" onClick={() => setShowLiveGraph(false)}>
                    ✕
                  </Button>
                </div>
              </div>
              <div className="flex-1 relative w-full h-full bg-grid-black/[0.02]">
                <LiveInferenceFlowGraph
                  stages={stages}
                  streamEvents={graphEvents}
                  flowStatus={graphFlowStatus}
                />
              </div>
              {lastThinkingMessage && (
                <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border/50 p-2 px-3 text-[10px] text-muted-foreground truncate">
                  <span className="font-bold text-foreground">Thinking: </span>
                  {lastThinkingMessage}
                </div>
              )}
            </div>
          )}

          <div className={`flex-1 overflow-y-auto p-6 space-y-4 transition-all duration-300 ${showLiveGraph ? "pt-[420px] sm:pt-6 sm:pr-[520px]" : ""}`}>
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
                          const isDecided = isApproved || decision === "rejected";
                          const isFlagged = prop.guard_verdict === "FLAGGED";
                          const canApprove = prop.guard_verdict !== "REJECTED";

                          // Build full reasoning text from object or string
                          const reasoningText = (() => {
                            if (!prop.reasoning) return null;
                            if (typeof prop.reasoning === "string") return prop.reasoning.trim() || null;
                            const parts: string[] = [];
                            const r = prop.reasoning as Record<string, string>;
                            if (r.reason_market) parts.push(`📊 ${r.reason_market}`);
                            if (r.reason_event) parts.push(`🗓 ${r.reason_event}`);
                            if (r.reason_seasonality) parts.push(`🌤 ${r.reason_seasonality}`);
                            if (r.reason_guardrails) parts.push(`🛡 ${r.reason_guardrails}`);
                            const others = Object.entries(r)
                              .filter(([k]) => !["reason_market","reason_event","reason_seasonality","reason_guardrails"].includes(k))
                              .map(([, v]) => v)
                              .filter(Boolean);
                            parts.push(...others);
                            return parts.join(" | ") || null;
                          })();

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
                                  {/* User Decision Badge */}
                                  {isApproved && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                                      <IconCircleCheck className="size-2.5" />
                                      Approved & Saved
                                    </span>
                                  )}
                                  {decision === "rejected" && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-red-500/10 text-red-600 border border-red-500/20">
                                      Rejected
                                    </span>
                                  )}

                                  {/* Guard verdict badge (shown only when no user decision yet) */}
                                  {!isDecided && (
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${prop.guard_verdict === "APPROVED" ? "bg-emerald-500/15 text-emerald-500" :
                                        prop.guard_verdict === "FLAGGED" ? "bg-amber-500/15 text-amber-500" :
                                          "bg-red-500/15 text-red-500"
                                      }`}>
                                      {prop.guard_verdict === "APPROVED" ? "✓ Approved" : prop.guard_verdict === "FLAGGED" ? "⚠ Flagged" : "✗ Blocked"}
                                    </span>
                                  )}

                                  {/* Price */}
                                  <span className="text-sm font-black tabular-nums text-amber-600">
                                    AED {prop.proposed_price}
                                    <span className="text-[10px] ml-1 opacity-70">({prop.change_pct > 0 ? "+" : ""}{prop.change_pct}%)</span>
                                  </span>
                                </div>
                              </div>

                              {/* Row 2: Risk + comparisons */}
                              <div className="flex flex-wrap gap-2 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded-full font-bold uppercase ${prop.risk_level === "low" ? "bg-emerald-500/10 text-emerald-600" :
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

                              {/* Row 3: Full reasoning */}
                              {reasoningText && (
                                <div className="bg-muted/30 rounded-md px-2.5 py-2 border border-border/30">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Reasoning</p>
                                  <p className="text-[11px] text-foreground/80 leading-snug">{reasoningText}</p>
                                </div>
                              )}

                              {/* Row 4: FLAGGED caution */}
                              {isFlagged && !isDecided && (
                                <p className="text-[11px] text-amber-500/80 leading-snug bg-amber-500/5 rounded px-2 py-1">
                                  ⚠ PriceGuard flagged this for review — outside normal range but not hard-blocked. Approve with caution.
                                </p>
                              )}

                              {/* Row 5: Action buttons — hidden once decided */}
                              {!isDecided && message.proposalStatus !== "rejected" && (
                                <div className="flex items-center gap-2 pt-1">
                                  {canApprove && (
                                    <button
                                      onClick={() => handleProposalDecision(message.id, prop.proposal_id, "approved")}
                                      className="text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 transition-all"
                                    >
                                      Approve
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleProposalDecision(message.id, prop.proposal_id, "rejected")}
                                    className="text-[10px] font-black px-3 py-1 rounded-full border border-red-400/40 text-red-400 hover:bg-red-500/10 transition-all"
                                  >
                                    Reject
                                  </button>
                                  {prop.guard_verdict === "REJECTED" && (
                                    <span className="text-[10px] text-red-400/70 font-bold">Blocked by PriceGuard — cannot approve</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer: Reject All (only when still pending) */}
                      {message.proposalStatus === "pending" && (
                        <div className="px-4 py-3 border-t border-border/40 bg-muted/20 flex items-center justify-between gap-3">
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Approve or reject each proposal — approved ones are saved to Pricing instantly.
                          </p>
                          <button
                            onClick={() => handleRejectProposals(message.id)}
                            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:bg-muted transition-colors shrink-0"
                          >
                            Reject All
                          </button>
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

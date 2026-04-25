"use client"

import { memo, useEffect, useMemo, useState } from "react"
import {
    Background,
    Controls,
    Handle,
    MarkerType,
    MiniMap,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type Edge,
    type Node,
    type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
    IconAlertCircle,
    IconActivity,
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconCircleCheck,
    IconDatabase,
    IconInfoCircle,
    IconLoader2,
    IconRobot,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import type { LyzrAgentEvent } from "@/hooks/use-lyzr-agent-events"

export type FlowStageState = "pending" | "active" | "done" | "failed"

export interface FlowStage {
    id: string
    label: string
    hint?: string
    status: FlowStageState
}

type FlowNodeKind = "stage" | "iteration" | "tool" | "thinking" | "artifact" | "meta"

interface GraphNodeData extends Record<string, unknown> {
    title: string
    subtitle?: string
    chips?: string[]
    status: FlowStageState
    kind: FlowNodeKind
    hasIn?: boolean
    hasOut?: boolean
}

const STATUS_STYLES: Record<
    FlowStageState,
    {
        node: string
        title: string
        hint: string
    }
> = {
    done: {
        node: "border-emerald-300/70 bg-emerald-50/82",
        title: "text-emerald-900",
        hint: "text-emerald-800/80",
    },
    active: {
        node: "border-[#A1855D]/50 bg-[#F8F2E9]",
        title: "text-[#3E2B1E]",
        hint: "text-[#67391B]/72",
    },
    pending: {
        node: "border-[#67391B]/20 bg-white/82",
        title: "text-[#3E2B1E]/72",
        hint: "text-[#67391B]/45",
    },
    failed: {
        node: "border-rose-300/70 bg-rose-50/86",
        title: "text-rose-900",
        hint: "text-rose-700/80",
    },
}

const KIND_STYLES: Record<FlowNodeKind, string> = {
    stage: "from-[#FDF8F2] to-[#F7EFE6]",
    iteration: "from-[#FFF9F0] to-[#F7EFE6]",
    tool: "from-[#FFFDF8] to-[#F8F1E8]",
    thinking: "from-[#F7F3EE] to-[#F1E7DB]",
    artifact: "from-[#F5F8FA] to-[#EDF3F7]",
    meta: "from-[#F5F6FA] to-[#ECEFF6]",
}

function edgeColor(status: FlowStageState, subtle = false): string {
    if (subtle) return "rgba(103, 57, 27, 0.28)"
    if (status === "failed") return "#e11d48"
    if (status === "active") return "#A1855D"
    if (status === "done") return "#67391B"
    return "rgba(103, 57, 27, 0.35)"
}

function toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value.trim())
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

function shortText(value: string | undefined, max = 140): string | undefined {
    if (!value) return undefined
    const clean = value.replace(/\s+/g, " ").trim()
    if (!clean) return undefined
    if (clean.length <= max) return clean
    return `${clean.slice(0, Math.max(16, max - 1)).trimEnd()}...`
}

function titleCase(value: string | undefined): string {
    if (!value) return "Unknown"
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase())
}

function readNumericStat(raw: string, key: string): number | undefined {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`["']?${escapedKey}["']?\\s*:\\s*(\\d+)`, "i")
    const match = raw.match(pattern)
    if (!match) return undefined
    const parsed = Number(match[1])
    return Number.isFinite(parsed) ? parsed : undefined
}

function readStringStat(raw: string, key: string): string | undefined {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`["']?${escapedKey}["']?\\s*:\\s*["']([^"']+)["']`, "i")
    const match = raw.match(pattern)
    return match?.[1]?.trim() || undefined
}

function statusFromText(value: string | undefined): FlowStageState {
    const normalized = (value ?? "").trim().toLowerCase()
    if (!normalized) return "pending"
    if (normalized.includes("fail") || normalized.includes("error")) return "failed"
    if (
        normalized.includes("process") ||
        normalized.includes("queue") ||
        normalized.includes("run") ||
        normalized.includes("progress")
    ) {
        return "active"
    }
    return "done"
}

function mergeStatus(current: FlowStageState, incoming: FlowStageState): FlowStageState {
    const rank: Record<FlowStageState, number> = {
        pending: 0,
        active: 1,
        done: 2,
        failed: 3,
    }
    return rank[incoming] > rank[current] ? incoming : current
}

interface ToolStats {
    name: string
    calls: number
    outputs: number
    responses: number
    returnedRows: number
    totalMatchedRows: number
    executionMs?: number
    parallel: boolean
    collection?: string
    note?: string
    status: FlowStageState
    arguments?: string
}

interface IterationBucket {
    iteration: number
    thoughts: string[]
    tools: Map<string, ToolStats>
    agents: Set<string>
}

interface CompletionArtifact {
    summary?: string
    recommendation?: string
    proposalTitle?: string
    proposalConfidence?: number
    proposalImpactUsd?: number
    proposalAffected?: number
    tableCount: number
    chartCount: number
    dataSources: { name: string; detail?: string }[]
}

interface GraphMeta {
    iterations: number
    tools: number
    agents: number
    outputs: number
    thoughts: number
    records: number
    lastEventLabel: string
}

interface GraphBuildResult {
    nodes: Node<GraphNodeData>[]
    edges: Edge[]
    meta: GraphMeta
    height: number
}

function extractToolStats(
    response: string | Record<string, unknown> | undefined,
    toolOutput: string | Record<string, unknown> | undefined
): {
    returned?: number
    totalMatched?: number
    collection?: string
    note?: string
} {
    const pickFromRecord = (
        value: Record<string, unknown> | null
    ): { returned?: number; totalMatched?: number; collection?: string; note?: string } => {
        if (!value) return {}
        const collection = asString(value.collection)
        const totalMatched =
            asNumber(value.total_matched) ??
            asNumber(value.totalMatched) ??
            asNumber(value.total_count) ??
            asNumber(value.total) ??
            asNumber(value.count) ??
            asNumber(value.totalProperties)
        const returned =
            asNumber(value.returned) ??
            asNumber(value.rows_returned) ??
            asNumber(value.rowsReturned) ??
            asNumber(value.limit) ??
            asNumber(value.count) ??
            asNumber(value.results_count) ??
            (Array.isArray(value.data) ? value.data.length : undefined) ??
            (Array.isArray(value.events) ? value.events.length : undefined) ??
            (Array.isArray(value.properties) ? value.properties.length : undefined) ??
            (Array.isArray(value.rows) ? value.rows.length : undefined) ??
            (Array.isArray(value.results) ? value.results.length : undefined)
        return {
            returned,
            totalMatched,
            collection,
            note:
                returned != null && totalMatched != null && totalMatched > returned
                    ? `${returned}/${totalMatched} rows`
                    : returned != null
                      ? `${returned} rows`
                      : undefined,
        }
    }

    const responseRecord = toRecord(response)
    const outputRecord = toRecord(toolOutput)
    const fromRecord = pickFromRecord(responseRecord ?? outputRecord)
    if (fromRecord.returned != null || fromRecord.totalMatched != null || fromRecord.collection) {
        return fromRecord
    }

    const text = typeof toolOutput === "string" ? toolOutput : typeof response === "string" ? response : ""
    if (!text) return {}

    const returned = readNumericStat(text, "returned") ?? readNumericStat(text, "limit")
    const totalMatched =
        readNumericStat(text, "total_matched") ??
        readNumericStat(text, "totalMatched") ??
        readNumericStat(text, "total_count")
    const collection = readStringStat(text, "collection")
    return {
        returned,
        totalMatched,
        collection,
        note:
            returned != null && totalMatched != null
                ? `${returned}/${totalMatched} rows`
                : returned != null
                  ? `${returned} rows`
                  : shortText(text, 96),
    }
}

function parseCompletionArtifact(response: string | Record<string, unknown> | undefined): CompletionArtifact | null {
    let payload: Record<string, unknown> | null = null
    if (typeof response === "string") {
        try {
            payload = toRecord(JSON.parse(response))
        } catch {
            payload = null
        }
    } else {
        payload = toRecord(response)
    }
    if (!payload) return null

    const proposal = toRecord(payload.proposal)
    const recommendation = toRecord(payload.recommendation)
    const dataUsed = Array.isArray(payload.data_used) ? payload.data_used : []
    const sources = dataUsed
        .map((entry) => toRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
            name: asString(entry.tool_name) ?? "Data source",
            detail: shortText(asString(entry.key_data_points), 86),
        }))
        .filter((entry) => entry.name.trim().length > 0)

    return {
        summary: shortText(asString(payload.summary), 170),
        recommendation:
            shortText(asString(recommendation?.priority_action), 140) ??
            shortText(asString(recommendation?.rationale), 140),
        proposalTitle: shortText(asString(proposal?.title), 120),
        proposalConfidence: asNumber(proposal?.confidence_pct),
        proposalImpactUsd: asNumber(proposal?.financial_impact_usd),
        proposalAffected: asNumber(proposal?.affected_count),
        tableCount: Array.isArray(payload.table_data) ? payload.table_data.length : 0,
        chartCount: Array.isArray(payload.chart_data) ? payload.chart_data.length : 0,
        dataSources: sources.slice(0, 5),
    }
}

function mapFlowStatus(status: string | undefined): FlowStageState {
    if (!status) return "pending"
    if (status === "failed") return "failed"
    if (status === "queued" || status === "processing" || status === "submitting") return "active"
    if (status === "completed") return "done"
    return statusFromText(status)
}

function pushEdge(
    edges: Edge[],
    source: string,
    target: string,
    status: FlowStageState,
    options?: { subtle?: boolean; animated?: boolean; type?: Edge["type"] }
): void {
    const stroke = edgeColor(status, options?.subtle)
    edges.push({
        id: `${source}->${target}`,
        source,
        target,
        animated: options?.animated ?? (status === "active" || (status === "pending" && options?.subtle !== true)),
        type: options?.type ?? "smoothstep",
        style: {
            stroke,
            strokeWidth: options?.subtle ? 1.4 : 2.25,
            strokeDasharray: options?.subtle ? "4 4" : undefined,
            filter: status === "active" ? "drop-shadow(0 0 3px rgba(161, 133, 93, 0.5))" : undefined,
        },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
        },
    })
}

function FlowNode({ data }: NodeProps<Node<GraphNodeData>>) {
    const style = STATUS_STYLES[data.status]
    const chips = Array.isArray(data.chips) ? data.chips.slice(0, 4) : []
    return (
        <div
            className={cn(
                "min-w-[210px] max-w-[260px] rounded-xl border bg-gradient-to-br px-3 py-2.5 shadow-[0_8px_18px_rgba(62,43,30,0.08)] backdrop-blur-[1px] transition-all duration-300",
                KIND_STYLES[data.kind],
                style.node,
                data.status === "active" && "animate-pulse-subtle shadow-[0_0_20px_rgba(161,133,93,0.3)] ring-2 ring-[#A1855D]/30 border-[#A1855D]"
            )}
        >
            {data.hasIn ? (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!h-2 !w-2 !border !border-[#67391B]/35 !bg-[#F8F2E9]"
                />
            ) : null}
            {data.hasOut ? (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!h-2 !w-2 !border !border-[#67391B]/35 !bg-[#F8F2E9]"
                />
            ) : null}

            <div className="flex items-start gap-2">
                {data.status === "active" ? (
                    <IconLoader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-[#A1855D]" />
                ) : data.status === "failed" ? (
                    <IconAlertCircle className="mt-0.5 size-3.5 shrink-0 text-rose-600" />
                ) : data.status === "done" ? (
                    <IconCircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                ) : (
                    <span className="mt-1 inline-block size-2.5 shrink-0 rounded-full bg-[#67391B]/30" />
                )}
                <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-1.5">
                        {data.kind === "iteration" ? (
                            <IconRobot className="size-3 shrink-0 text-[#67391B]/65" />
                        ) : data.kind === "tool" ? (
                            <IconDatabase className="size-3 shrink-0 text-[#67391B]/60" />
                        ) : data.kind === "thinking" ? (
                            <IconInfoCircle className="size-3 shrink-0 text-[#67391B]/60" />
                        ) : null}
                        <p className={cn("truncate text-[12px] font-semibold", style.title)}>{data.title}</p>
                    </div>
                    {data.subtitle ? (
                        <p className={cn("line-clamp-2 text-[10px] leading-tight", style.hint)}>
                            {data.subtitle}
                        </p>
                    ) : null}
                    {chips.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {chips.map((chip) => (
                                <span
                                    key={`${data.title}-${chip}`}
                                    className="rounded-full border border-[#67391B]/14 bg-white/70 px-1.5 py-[1px] text-[9px] font-medium text-[#67391B]/74"
                                >
                                    {chip}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

const nodeTypes = {
    flowNode: memo(FlowNode),
}


function buildFallbackStageGraph(stages: FlowStage[]): GraphBuildResult {
    const nodes: Node<GraphNodeData>[] = []
    const edges: Edge[] = []

    const y = 170
    const xStart = 90
    const xStep = 290

    stages.forEach((stage, index) => {
        const nodeId = `stage-${stage.id}`
        nodes.push({
            id: nodeId,
            type: "flowNode",
            position: { x: xStart + index * xStep, y },
            data: {
                title: stage.label,
                subtitle: stage.hint,
                status: stage.status,
                kind: "stage",
                hasIn: index > 0,
                hasOut: index < stages.length - 1,
            },
        })
        if (index > 0) {
            const prev = `stage-${stages[index - 1].id}`
            pushEdge(edges, prev, nodeId, stage.status)
        }
    })

    return {
        nodes,
        edges,
        meta: {
            iterations: 0,
            tools: 0,
            agents: 0,
            outputs: 0,
            thoughts: 0,
            records: 0,
            lastEventLabel: stages[stages.length - 1]?.label ?? "Flow",
        },
        height: 370,
    }
}

function buildEventGraph(
    stages: FlowStage[],
    streamEvents: LyzrAgentEvent[],
    flowStatus?: string
): GraphBuildResult {
    if (streamEvents.length === 0) return buildFallbackStageGraph(stages)

    const orderedEvents = [...streamEvents].reverse()
    const buckets = new Map<number, IterationBucket>()

    const ensureBucket = (iteration: number): IterationBucket => {
        const safe = Math.max(1, Math.trunc(iteration))
        const existing = buckets.get(safe)
        if (existing) return existing
        const created: IterationBucket = {
            iteration: safe,
            thoughts: [],
            tools: new Map(),
            agents: new Set(),
        }
        buckets.set(safe, created)
        return created
    }

    let activeIteration = 1
    let thoughtCount = 0
    let outputEventCount = 0
    let totalMatchedRows = 0
    let lastEventType = ""
    let completionArtifact: CompletionArtifact | null = null

    for (const event of orderedEvents) {
        const type = (event.event_type ?? "").trim().toLowerCase()
        if (type) {
            lastEventType = type
            if (type === "status" && event.message) {
                lastEventType = event.message
            }
        }

        if (type === "tool_calling_iteration") {
            const iter = event.iteration ?? activeIteration
            activeIteration = Math.max(1, Math.trunc(iter))
            ensureBucket(activeIteration)
            continue
        }

        const iter = Math.max(1, Math.trunc(event.iteration ?? activeIteration))
        const bucket = ensureBucket(iter)

        if (type === "thinking_log" || (event.thinking ?? "").trim().length > 0) {
            thoughtCount += 1
            const thought = shortText(event.thinking ?? event.message, 170)
            if (thought) bucket.thoughts.push(thought)
        }

        const agentName = event.agent_name?.trim()
        if (agentName) {
            bucket.agents.add(agentName)
        }

        const toolName = (event.tool_name ?? event.function_name ?? "").trim()
        if (toolName) {
            const existing = bucket.tools.get(toolName)
            const tool =
                existing ??
                ({
                    name: toolName,
                    calls: 0,
                    outputs: 0,
                    responses: 0,
                    returnedRows: 0,
                    totalMatchedRows: 0,
                    parallel: false,
                    status: "pending",
                    arguments: undefined,
                } satisfies ToolStats)

            if (type === "tool_call_prepare" || type === "tool_called") {
                tool.calls += 1
                tool.status = mergeStatus(tool.status, "active")
                if (event.arguments) {
                    tool.arguments = JSON.stringify(event.arguments)
                }
            }
            if (type === "tool_response") {
                tool.responses += 1
                outputEventCount += 1
                tool.status = mergeStatus(tool.status, "done")
            }
            if (type === "tool_output") {
                tool.outputs += 1
                outputEventCount += 1
                tool.status = mergeStatus(tool.status, "done")
            }
            if (type.includes("error") || statusFromText(event.status) === "failed") {
                tool.status = "failed"
            }
            if (event.parallel_execution) tool.parallel = true
            if (typeof event.execution_time === "number" && Number.isFinite(event.execution_time)) {
                const executionMs = Math.max(1, Math.round(event.execution_time * 1000))
                tool.executionMs = Math.max(executionMs, tool.executionMs ?? 0)
            }

            const stats = extractToolStats(event.response, event.tool_output)
            if (stats.returned != null) {
                tool.returnedRows = Math.max(tool.returnedRows, stats.returned)
            }
            if (stats.totalMatched != null) {
                tool.totalMatchedRows = Math.max(tool.totalMatchedRows, stats.totalMatched)
                totalMatchedRows += stats.totalMatched
            }
            if (stats.collection) tool.collection = stats.collection
            if (stats.note) tool.note = stats.note

            bucket.tools.set(toolName, tool)
        }

        if (type === "output_generated" || type === "final_response" || type === "complete") {
            outputEventCount += 1
            lastEventType = "output_generated"
        }

        if (type === "process_complete") {
            completionArtifact = parseCompletionArtifact(event.response) ?? completionArtifact
        }
    }

    const iterations = [...buckets.values()].sort((a, b) => a.iteration - b.iteration)
    if (iterations.length === 0) {
        return buildFallbackStageGraph(stages)
    }

    const nodes: Node<GraphNodeData>[] = []
    const edges: Edge[] = []

    const startNodeId = "flow-query"
    const xStart = 60
    const xStep = 360
    const yMain = 220
    const yThinking = 72
    const yToolsBase = 360
    const yToolStep = 112
    const maxToolsVisiblePerIteration = 4

    nodes.push({
        id: startNodeId,
        type: "flowNode",
        position: { x: xStart, y: yMain },
        data: {
            title: "Query Received",
            subtitle: "Agent orchestration pipeline started",
            status: "done",
            kind: "stage",
            hasIn: false,
            hasOut: true,
            chips: [orderedEvents.length > 0 ? `${orderedEvents.length} events` : "No events"],
        },
    })

    let previousMainNodeId = startNodeId
    let maxToolRows = 1

    iterations.forEach((bucket, index) => {
        const iterationNodeId = `iter-${bucket.iteration}`
        const x = xStart + xStep * (index + 1)
        const sortedTools = [...bucket.tools.values()].sort((a, b) => {
            const statusScore: Record<FlowStageState, number> = {
                failed: 3,
                active: 2,
                done: 1,
                pending: 0,
            }
            return (
                statusScore[b.status] - statusScore[a.status] ||
                b.totalMatchedRows - a.totalMatchedRows ||
                b.returnedRows - a.returnedRows
            )
        })

        const isLastIteration = index === iterations.length - 1
        const iterationStatus: FlowStageState = isLastIteration
            ? mapFlowStatus(flowStatus)
            : sortedTools.some((tool) => tool.status === "failed")
              ? "failed"
              : "done"

        nodes.push({
            id: iterationNodeId,
            type: "flowNode",
            position: { x, y: yMain },
            data: {
                title: `Iteration ${bucket.iteration}`,
                subtitle:
                    sortedTools.length > 0
                        ? `${sortedTools.length} tools executed`
                        : "Reasoning and orchestration",
                status: iterationStatus,
                kind: "iteration",
                hasIn: true,
                hasOut: true,
                chips: [
                    `${sortedTools.length} tools`,
                    `${bucket.thoughts.length} thoughts`,
                    `${bucket.iteration}/${orderedEvents[orderedEvents.length - 1]?.max_iterations ?? "?"}`,
                ],
            },
        })
        pushEdge(edges, previousMainNodeId, iterationNodeId, iterationStatus)
        previousMainNodeId = iterationNodeId

        if (bucket.thoughts.length > 0) {
            const thoughtNodeId = `${iterationNodeId}-thought`
            nodes.push({
                id: thoughtNodeId,
                type: "flowNode",
                position: { x, y: yThinking },
                data: {
                    title: "Reasoning",
                    subtitle: bucket.thoughts[0],
                    status: "done",
                    kind: "thinking",
                    hasIn: true,
                    hasOut: false,
                    chips: [`${bucket.thoughts.length} logs`],
                },
            })
            pushEdge(edges, iterationNodeId, thoughtNodeId, "pending", {
                subtle: true,
                type: "straight",
                animated: false,
            })
        }

        const visibleTools = sortedTools.slice(0, maxToolsVisiblePerIteration)
        const hiddenTools = Math.max(0, sortedTools.length - visibleTools.length)
        maxToolRows = Math.max(maxToolRows, visibleTools.length + (hiddenTools > 0 ? 1 : 0))

        visibleTools.forEach((tool, toolIndex) => {
            const toolNodeId = `${iterationNodeId}-tool-${tool.name}-${toolIndex}`
            const subtitleParts: string[] = []
            if (tool.note) subtitleParts.push(tool.note)
            if (tool.arguments) subtitleParts.push(shortText(tool.arguments, 60)!)
            if (tool.collection) subtitleParts.push(tool.collection)
            if (!tool.note && !tool.arguments && tool.calls > 0) subtitleParts.push(`${tool.calls} call(s)`)
            if (!tool.note && !tool.arguments && tool.outputs + tool.responses > 0) {
                subtitleParts.push(`${tool.outputs + tool.responses} output event(s)`)
            }

            const chips: string[] = []
            if (tool.parallel) chips.push("parallel")
            if (tool.executionMs != null) chips.push(`${tool.executionMs} ms`)
            if (tool.totalMatchedRows > 0) chips.push(`${tool.totalMatchedRows} matched`)
            if (tool.returnedRows > 0) chips.push(`${tool.returnedRows} returned`)

            nodes.push({
                id: toolNodeId,
                type: "flowNode",
                position: { x, y: yToolsBase + toolIndex * yToolStep },
                data: {
                    title: titleCase(tool.name),
                    subtitle: subtitleParts.join(" • "),
                    status: tool.status,
                    kind: "tool",
                    hasIn: true,
                    hasOut: false,
                    chips,
                },
            })
            pushEdge(edges, iterationNodeId, toolNodeId, tool.status, {
                subtle: true,
                animated: tool.status === "active",
            })
        })

        if (hiddenTools > 0) {
            const overflowNodeId = `${iterationNodeId}-tool-overflow`
            nodes.push({
                id: overflowNodeId,
                type: "flowNode",
                position: { x, y: yToolsBase + visibleTools.length * yToolStep },
                data: {
                    title: `+${hiddenTools} more tool calls`,
                    subtitle: "Zoom/pan to inspect complete execution lineage",
                    status: "pending",
                    kind: "meta",
                    hasIn: true,
                    hasOut: false,
                    chips: ["truncated view"],
                },
            })
            pushEdge(edges, iterationNodeId, overflowNodeId, "pending", {
                subtle: true,
                animated: false,
            })
        }
    })

    const finalNodeId = "flow-final"
    const finalX = xStart + xStep * (iterations.length + 1)
    const finalStatus = mapFlowStatus(flowStatus)
    nodes.push({
        id: finalNodeId,
        type: "flowNode",
        position: { x: finalX, y: yMain },
        data: {
            title:
                finalStatus === "failed"
                    ? "Process Failed"
                    : finalStatus === "done"
                      ? "Process Complete"
                      : "Generating Final Response",
            subtitle:
                finalStatus === "done"
                    ? "Structured response and recommendation prepared"
                    : finalStatus === "failed"
                      ? "Execution ended with a recoverable error"
                      : "Waiting for final synthesis",
            status: finalStatus,
            kind: "stage",
            hasIn: true,
            hasOut: true,
            chips: [titleCase(lastEventType || "processing")],
        },
    })
    pushEdge(edges, previousMainNodeId, finalNodeId, finalStatus)

    if (completionArtifact) {
        const artifactX = finalX + 340
        const summaryNodeId = "artifact-summary"
        if (completionArtifact.summary) {
            nodes.push({
                id: summaryNodeId,
                type: "flowNode",
                position: { x: artifactX, y: 88 },
                data: {
                    title: "Execution Summary",
                    subtitle: completionArtifact.summary,
                    status: "done",
                    kind: "artifact",
                    hasIn: true,
                    hasOut: false,
                },
            })
            pushEdge(edges, finalNodeId, summaryNodeId, "done", { subtle: true, animated: false })
        }

        const dataNodeId = "artifact-data"
        const dataChips: string[] = []
        if (completionArtifact.tableCount > 0) dataChips.push(`${completionArtifact.tableCount} table(s)`)
        if (completionArtifact.chartCount > 0) dataChips.push(`${completionArtifact.chartCount} chart(s)`)
        dataChips.push(`${completionArtifact.dataSources.length} source(s)`)

        nodes.push({
            id: dataNodeId,
            type: "flowNode",
            position: { x: artifactX, y: 240 },
            data: {
                title: "Data Artifacts",
                subtitle: "Validated tool outputs transformed into analytics artifacts",
                status: "done",
                kind: "artifact",
                hasIn: true,
                hasOut: completionArtifact.dataSources.length > 0,
                chips: dataChips,
            },
        })
        pushEdge(edges, finalNodeId, dataNodeId, "done", { subtle: true, animated: false })

        completionArtifact.dataSources.forEach((source, idx) => {
            const sourceNodeId = `artifact-source-${idx}`
            nodes.push({
                id: sourceNodeId,
                type: "flowNode",
                position: { x: artifactX + 300, y: 138 + idx * 108 },
                data: {
                    title: titleCase(source.name),
                    subtitle: source.detail,
                    status: "done",
                    kind: "artifact",
                    hasIn: true,
                    hasOut: false,
                },
            })
            pushEdge(edges, dataNodeId, sourceNodeId, "pending", {
                subtle: true,
                animated: false,
            })
        })

        if (completionArtifact.recommendation) {
            const recommendationNodeId = "artifact-recommendation"
            nodes.push({
                id: recommendationNodeId,
                type: "flowNode",
                position: { x: artifactX, y: 392 },
                data: {
                    title: "Recommended Action",
                    subtitle: completionArtifact.recommendation,
                    status: "done",
                    kind: "artifact",
                    hasIn: true,
                    hasOut: false,
                },
            })
            pushEdge(edges, finalNodeId, recommendationNodeId, "done", {
                subtle: true,
                animated: false,
            })
        }

        if (completionArtifact.proposalTitle) {
            const proposalNodeId = "artifact-proposal"
            const chips: string[] = []
            if (completionArtifact.proposalConfidence != null) {
                chips.push(`${completionArtifact.proposalConfidence}% confidence`)
            }
            if (completionArtifact.proposalAffected != null) {
                chips.push(`${completionArtifact.proposalAffected} affected`)
            }
            if (completionArtifact.proposalImpactUsd != null) {
                chips.push(`$${Math.round(completionArtifact.proposalImpactUsd).toLocaleString()}`)
            }

            nodes.push({
                id: proposalNodeId,
                type: "flowNode",
                position: { x: artifactX, y: 540 },
                data: {
                    title: "Proposal Candidate",
                    subtitle: completionArtifact.proposalTitle,
                    status: "done",
                    kind: "artifact",
                    hasIn: true,
                    hasOut: false,
                    chips,
                },
            })
            pushEdge(edges, finalNodeId, proposalNodeId, "done", {
                subtle: true,
                animated: false,
            })
        }
    }

    const totalToolCount = iterations.reduce((sum, bucket) => sum + bucket.tools.size, 0)
    const uniqueAgents = new Set<string>()
    iterations.forEach(b => b.agents.forEach(a => uniqueAgents.add(a)))
    const agentCount = Math.max(1, uniqueAgents.size)
    const computedHeight = Math.min(
        760,
        Math.max(
            480,
            350 + maxToolRows * yToolStep + (completionArtifact ? 170 : 0)
        )
    )

    return {
        nodes,
        edges,
        meta: {
            iterations: iterations.length,
            tools: totalToolCount,
            agents: agentCount,
            outputs: outputEventCount,
            thoughts: thoughtCount,
            records: totalMatchedRows,
            lastEventLabel: titleCase(lastEventType || "processing"),
        },
        height: computedHeight,
    }
}

export function LiveInferenceFlowGraph({
    stages,
    streamEvents = [],
    flowStatus,
    className,
    onExpandChange,
    isExpandedInitial = false,
}: {
    stages: FlowStage[]
    streamEvents?: LyzrAgentEvent[]
    flowStatus?: string
    className?: string
    onExpandChange?: (expanded: boolean) => void
    isExpandedInitial?: boolean
}) {
    const [internalIsExpanded, setInternalIsExpanded] = useState(isExpandedInitial)
    const isExpanded = onExpandChange ? isExpandedInitial : internalIsExpanded

    const toggleExpand = () => {
        const next = !isExpanded
        if (onExpandChange) {
            onExpandChange(next)
        } else {
            setInternalIsExpanded(next)
        }
    }
    const graph = useMemo(
        () =>
            streamEvents.length > 0
                ? buildEventGraph(stages, streamEvents, flowStatus)
                : buildFallbackStageGraph(stages),
        [flowStatus, stages, streamEvents]
    )

    if (graph.nodes.length === 0) return null

    return (
        <div className={cn("space-y-4", className)}>
            {/* Summary Stats Row */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-[#67391B]/14 bg-white/70 p-2.5 shadow-sm backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#67391B]/50">Iterations</p>
                    <p className={cn("text-lg font-black text-[#3E2B1E]", flowStatus === "active" && "animate-pulse-subtle")}>{graph.meta.iterations}</p>
                </div>
                <div className="rounded-xl border border-[#67391B]/14 bg-white/70 p-2.5 shadow-sm backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#67391B]/50">Tools</p>
                    <p className={cn("text-lg font-black text-[#16a34a]", flowStatus === "active" && "animate-pulse-subtle")}>{graph.meta.tools}</p>
                </div>
                <div className="rounded-xl border border-[#67391B]/14 bg-white/70 p-2.5 shadow-sm backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#67391B]/50">Outputs</p>
                    <p className={cn("text-lg font-black text-[#A1855D]", flowStatus === "active" && "animate-pulse-subtle")}>{graph.meta.outputs}</p>
                </div>
                <div className="rounded-xl border border-[#67391B]/14 bg-white/70 p-2.5 shadow-sm backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#67391B]/50">Thinking</p>
                    <p className={cn("text-lg font-black text-[#3E2B1E]", flowStatus === "active" && "animate-pulse-subtle")}>{graph.meta.thoughts}</p>
                </div>
                <div className="rounded-xl border border-[#67391B]/14 bg-white/70 p-2.5 shadow-sm backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#67391B]/50">Records</p>
                    <p className="text-lg font-black text-[#3E2B1E]">
                        {graph.meta.records > 0 ? graph.meta.records.toLocaleString() : "—"}
                    </p>
                </div>
                <div className="rounded-xl border border-[#67391B]/14 bg-white/70 p-2.5 shadow-sm backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#67391B]/50">Agents</p>
                    <p className={cn("text-lg font-black text-[#3E2B1E]", flowStatus === "active" && "animate-pulse-subtle")}>{graph.meta.agents}</p>
                </div>
                <div className="rounded-xl border border-[#67391B]/14 bg-white/70 p-2.5 shadow-sm backdrop-blur-md overflow-hidden">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#67391B]/50">Status</p>
                    <p className="truncate text-xs font-bold text-[#3E2B1E]">
                        {graph.meta.lastEventLabel}
                    </p>
                </div>
            </div>

            <div className="w-full overflow-hidden rounded-2xl border-2 border-[#67391B]/15 bg-white/80 shadow-xl relative transition-all duration-500 ease-in-out"
                 style={{ height: isExpanded ? "100%" : `${Math.max(400, graph.height)}px` }}>
                
                {/* Graph Header */}
                <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-[#67391B]/10 bg-white/90 px-5 py-4 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#A1855D] to-[#3E2B1E] text-white shadow-lg ring-4 ring-[#A1855D]/10">
                            <IconActivity className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-base font-black tracking-tight text-[#3E2B1E]">
                                Execution Intelligence
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className={`inline-block h-2 w-2 rounded-full ${flowStatus === "active" ? "bg-emerald-500 animate-pulse" : "bg-muted"}`} />
                                <p className="text-[11px] font-bold text-[#3E2B1E]/60 uppercase tracking-wider">
                                    {flowStatus === "active" ? "Processing Live Stream..." : "Analysis Complete"}
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={toggleExpand}
                            className="flex items-center gap-2 rounded-xl bg-[#3E2B1E] px-4 py-2 text-[12px] font-black text-white hover:bg-[#3E2B1E]/90 transition-all shadow-md active:scale-95"
                        >
                            {isExpanded ? (
                                <><IconArrowsMinimize className="h-4 w-4" /> Collapse</>
                            ) : (
                                <><IconArrowsMaximize className="h-4 w-4" /> Expand Graph</>
                            )}
                        </button>
                    </div>
                </div>

            {/* Live Indicator Overlay */}
            {flowStatus === "active" && (
                <div className="absolute top-20 right-3 z-50 flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 backdrop-blur-sm">
                    <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Live Syncing</span>
                </div>
            )}
                <ReactFlowProvider>
                    <ReactFlow
                        nodes={graph.nodes}
                        edges={graph.edges}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.3 }}
                        minZoom={0.1}
                        maxZoom={1.5}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable={false}
                        proOptions={{ hideAttribution: true }}
                        defaultEdgeOptions={{ type: "smoothstep" }}
                    >
                        <Background gap={32} size={1} color="rgba(103, 57, 27, 0.18)" />
                        <MiniMap
                            pannable
                            zoomable
                            maskColor="rgba(245, 241, 235, 0.58)"
                            nodeColor={(node) => {
                                const status =
                                    (node.data as GraphNodeData | undefined)?.status ?? "pending"
                                if (status === "failed") return "#f43f5e"
                                if (status === "active") return "#A1855D"
                                if (status === "done") return "#16a34a"
                                return "#9a7f67"
                            }}
                        />
                        <Controls
                            showInteractive={false}
                            className="!border-[#67391B]/15 !bg-white/82 [&>button]:!border-[#67391B]/15 [&>button]:!bg-white/88 [&>button]:!text-[#67391B]"
                        />
                    </ReactFlow>
                </ReactFlowProvider>
            </div>
        </div>
    )
}


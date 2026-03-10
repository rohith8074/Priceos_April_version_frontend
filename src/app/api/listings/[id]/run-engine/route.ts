import { runPipeline } from "@/lib/engine/pipeline";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: idStr } = await params;
        const id = parseInt(idStr);
        const body = await req.json().catch(() => ({}));

        const run = await runPipeline(id, body.triggerDetail || "Manual UI Trigger");

        return NextResponse.json({
            success: true,
            runId: run.id,
            daysChanged: run.daysChanged,
            status: run.status,
        });
    } catch (error: any) {
        console.error("❌ [run-engine POST] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

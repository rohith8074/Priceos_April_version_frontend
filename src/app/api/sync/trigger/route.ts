import { NextResponse } from "next/server";
import { startBackgroundSync } from "@/lib/sync/background-sync";
import { getSession } from "@/lib/auth/server";

export async function POST() {
    const session = await getSession();
    if (!session?.orgId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const result = startBackgroundSync(session.orgId);

    if (!result.started) {
        return NextResponse.json({
            success: false,
            status: result.status,
            message: result.message,
        }, { status: 409 });
    }

    return NextResponse.json({
        success: true,
        status: result.status,
        message: result.message,
    }, { status: 202 });
}

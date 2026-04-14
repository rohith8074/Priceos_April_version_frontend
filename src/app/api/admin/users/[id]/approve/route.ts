import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

// POST /api/admin/users/[id]/approve — approve or revoke a user
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (session.role !== "owner" && session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;
        const body = await req.json().catch(() => ({}));
        // allow explicit revoke: { approve: false }
        const approve: boolean = body.approve !== false;

        await connectDB();

        const org = await Organization.findByIdAndUpdate(
            id,
            { $set: { isApproved: approve } },
            { new: true }
        ).select("_id email isApproved");

        if (!org) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        console.log(`[admin/approve] ${approve ? "Approved" : "Revoked"} org ${org._id} (${org.email}) by ${session.email}`);

        return NextResponse.json({
            success: true,
            id: org._id.toString(),
            email: org.email,
            isApproved: org.isApproved,
        });
    } catch (err) {
        console.error("[admin/approve]", err);
        return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// GET /api/admin/users — list all registered users (admin only)
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (session.role !== "owner" && session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectDB();

        const orgs = await Organization.find({})
            .select("_id fullName name email role isApproved marketCode currency plan createdAt")
            .sort({ createdAt: -1 })
            .lean();

        const users = orgs.map((o: any) => ({
            id: o._id.toString(),
            name: o.fullName || o.name,
            email: o.email,
            role: o.role,
            isApproved: o.isApproved,
            marketCode: o.marketCode,
            currency: o.currency,
            plan: o.plan,
            createdAt: o.createdAt,
        }));

        return NextResponse.json({ users });
    } catch (err) {
        console.error("[admin/users GET]", err);
        return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
    }
}

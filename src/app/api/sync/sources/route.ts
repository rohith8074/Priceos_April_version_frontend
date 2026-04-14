import { NextResponse } from "next/server";
import { connectDB, Source } from "@/lib/db";
import { SOURCES_SEED } from "@/lib/db/seed/sources-detectors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();

    // Auto-seed if the collection is empty (first boot / no seed script run)
    const count = await Source.countDocuments();
    if (count === 0) {
      await Source.insertMany(SOURCES_SEED);
    }

    const sources = await Source.find({}).sort({ sourceId: 1 }).lean();
    return NextResponse.json({ success: true, sources });
  } catch (error) {
    console.error("[Sync/Sources GET]", error);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}

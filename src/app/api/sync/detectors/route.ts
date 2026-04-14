import { NextResponse } from "next/server";
import { connectDB, Detector } from "@/lib/db";
import { DETECTORS_SEED } from "@/lib/db/seed/sources-detectors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();

    // Auto-seed if the collection is empty (first boot / no seed script run)
    const count = await Detector.countDocuments();
    if (count === 0) {
      await Detector.insertMany(DETECTORS_SEED);
    }

    const detectors = await Detector.find({}).sort({ detectorId: 1 }).lean();
    return NextResponse.json({ success: true, detectors });
  } catch (error) {
    console.error("[Sync/Detectors GET]", error);
    return NextResponse.json({ error: "Failed to fetch detectors" }, { status: 500 });
  }
}

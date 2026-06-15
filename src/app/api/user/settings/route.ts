import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

const OrgSettingsSchema = new mongoose.Schema(
  {
    orgId: { type: String, required: true, unique: true },
    hostawayApiKey: String,
    hostawayAccountId: String,
    marketCode: String,
    lyzrApiKey: String,
  },
  { timestamps: true, collection: "org_settings" }
);

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
}

function getModel() {
  return mongoose.models.OrgSettings ?? mongoose.model("OrgSettings", OrgSettingsSchema);
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);

    await connectDB();
    const OrgSettings = getModel();
    const settings = await OrgSettings.findOne({ orgId: payload.orgId }).lean();

    return NextResponse.json({
      hostawayApiKey: (settings as any)?.hostawayApiKey ?? "",
      hostawayAccountId: (settings as any)?.hostawayAccountId ?? "",
      marketCode: (settings as any)?.marketCode ?? "",
      lyzrApiKey: (settings as any)?.lyzrApiKey ?? "",
    });
  } catch (err) {
    console.error("[user/settings GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const body = await req.json();

    await connectDB();
    const OrgSettings = getModel();
    await OrgSettings.findOneAndUpdate(
      { orgId: payload.orgId },
      { $set: body },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[user/settings POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

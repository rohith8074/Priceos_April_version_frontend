import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { SignJWT } from "jose";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

const UserSchema = new mongoose.Schema(
  {
    email: String,
    role: String,
    isApproved: Boolean,
    onboardingStep: String,
    plan: String,
  },
  { timestamps: true, collection: "users" }
);

const ListingSchema = new mongoose.Schema(
  {
    orgId: String,
    externalId: String,
    name: String,
    bedrooms: Number,
    city: String,
    type: String,
    thumbnail: String,
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "listings" }
);

const OrgSettingsSchema = new mongoose.Schema(
  { orgId: { type: String, unique: true }, hostawayApiKey: String, hostawayAccountId: String, marketCode: String, strategy: String },
  { timestamps: true, collection: "org_settings" }
);

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
}

function secretKey(s: string) {
  return new TextEncoder().encode(s);
}

export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyAccessToken(token);
    const body = await req.json().catch(() => ({}));

    await connectDB();

    const User = mongoose.models.User ?? mongoose.model("User", UserSchema);
    const Listing = mongoose.models.Listing ?? mongoose.model("Listing", ListingSchema);
    const OrgSettings = mongoose.models.OrgSettings ?? mongoose.model("OrgSettings", OrgSettingsSchema);

    const { step, listings, activatedListingIds, marketCode, strategy } = body;

    // Upsert listings into DB
    if (Array.isArray(listings) && listings.length > 0) {
      for (const l of listings) {
        await Listing.findOneAndUpdate(
          { orgId: payload.orgId, externalId: String(l.id) },
          {
            $set: {
              orgId: payload.orgId,
              externalId: String(l.id),
              name: l.name,
              bedrooms: l.bedrooms ?? 0,
              city: l.city ?? "",
              type: l.type ?? "property",
              thumbnail: l.thumbnail ?? null,
              isActive: Array.isArray(activatedListingIds) && activatedListingIds.includes(l.id),
            },
          },
          { upsert: true }
        );
      }
    }

    // Save org settings
    if (marketCode || strategy) {
      await OrgSettings.findOneAndUpdate(
        { orgId: payload.orgId },
        { $set: { ...(marketCode && { marketCode }), ...(strategy && { strategy }) } },
        { upsert: true }
      );
    }

    // Update user onboarding step
    const newStep = step === "complete" ? "complete" : (step ?? payload.onboardingStep ?? "complete");
    await User.findByIdAndUpdate(payload.userId, { $set: { onboardingStep: newStep } });

    // Issue fresh JWT
    const now = Math.floor(Date.now() / 1000);
    const newPayload = { ...payload, onboardingStep: newStep };
    const accessToken = await new SignJWT(newPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 7 * 24 * 60 * 60)
      .sign(secretKey(JWT_SECRET));

    const refreshToken = await new SignJWT({ userId: payload.userId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 30 * 24 * 60 * 60)
      .sign(secretKey(JWT_REFRESH_SECRET));

    const response = NextResponse.json({ success: true, onboardingStep: newStep });
    response.cookies.set("priceos-session", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    response.cookies.set("priceos-refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[onboarding PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

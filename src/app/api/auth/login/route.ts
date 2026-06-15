import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const MONGODB_URI = process.env.MONGODB_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

// Minimal User schema — mirrors the MongoDB collection
const UserSchema = new mongoose.Schema(
  {
    name: String,
    fullName: String,
    email: { type: String, lowercase: true, trim: true },
    passwordHash: String,
    role: { type: String, default: "owner" },
    isApproved: { type: Boolean, default: false },
    onboardingStep: { type: String, default: "complete" },
    plan: String,
  },
  { timestamps: true, collection: "users" }
);

let cached: typeof mongoose | null = null;
async function connectDB() {
  if (cached && mongoose.connection.readyState === 1) return;
  cached = await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
}

function getUser() {
  return mongoose.models.User ?? mongoose.model("User", UserSchema);
}

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    await connectDB();
    const User = getUser();
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const payload = {
      userId: user._id.toString(),
      orgId: user._id.toString(),
      email: user.email,
      role: user.role ?? "owner",
      isApproved: user.isApproved ?? false,
      onboardingStep: user.onboardingStep ?? "complete",
    };

    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 7 * 24 * 60 * 60)
      .sign(secretKey(JWT_SECRET));

    const refreshToken = await new SignJWT({ userId: user._id.toString() })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 30 * 24 * 60 * 60)
      .sign(secretKey(JWT_REFRESH_SECRET));

    const responseData: Record<string, unknown> = { accessToken, refreshToken, ...payload };
    if (!user.isApproved) responseData.pending = true;
    if (user.onboardingStep && user.onboardingStep !== "complete") responseData.needsOnboarding = true;

    const response = NextResponse.json(responseData, { status: 200 });
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
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

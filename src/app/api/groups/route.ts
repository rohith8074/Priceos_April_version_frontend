/**
 * GET  /api/groups        — list all groups for the org
 * POST /api/groups        — create a new group
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB, PropertyGroup } from "@/lib/db";
import mongoose from "mongoose";

export async function GET() {
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const groups = await PropertyGroup.find({
    orgId: new mongoose.Types.ObjectId(session.orgId),
  }).sort({ name: 1 }).lean();

  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();
  const { name, description, color, listingIds } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }

  const group = await PropertyGroup.create({
    orgId: new mongoose.Types.ObjectId(session.orgId),
    name: name.trim(),
    description: description?.trim() ?? "",
    color: color ?? "#6366f1",
    listingIds: (listingIds ?? []).map((id: string) => new mongoose.Types.ObjectId(id)),
  });

  return NextResponse.json(group, { status: 201 });
}

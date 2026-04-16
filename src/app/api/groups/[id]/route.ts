/**
 * GET    /api/groups/[id]   — fetch one group
 * PUT    /api/groups/[id]   — update name / description / color / listingIds
 * DELETE /api/groups/[id]   — delete group (rules are NOT deleted — they become orphaned and ignored)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB, PropertyGroup, PricingRule } from "@/lib/db";
import mongoose from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const group = await PropertyGroup.findOne({
    _id: new mongoose.Types.ObjectId(id),
    orgId: new mongoose.Types.ObjectId(session.orgId),
  }).lean();

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(group);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();
  const { name, description, color, listingIds } = body;

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name.trim();
  if (description !== undefined) patch.description = description.trim();
  if (color !== undefined) patch.color = color;
  if (listingIds !== undefined) {
    patch.listingIds = listingIds.map((i: string) => new mongoose.Types.ObjectId(i));
  }

  const group = await PropertyGroup.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(id), orgId: new mongoose.Types.ObjectId(session.orgId) },
    { $set: patch },
    { new: true }
  ).lean();

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(group);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const gid = new mongoose.Types.ObjectId(id);
  const orgId = new mongoose.Types.ObjectId(session.orgId);

  const group = await PropertyGroup.findOne({ _id: gid, orgId }).lean();
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete all group-scoped rules belonging to this group
  await PricingRule.deleteMany({ groupId: gid, scope: "group" });
  await PropertyGroup.deleteOne({ _id: gid, orgId });

  return NextResponse.json({ success: true });
}

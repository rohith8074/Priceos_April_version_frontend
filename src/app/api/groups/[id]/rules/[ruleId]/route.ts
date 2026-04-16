/**
 * PUT    /api/groups/[id]/rules/[ruleId]  — update a group rule
 * DELETE /api/groups/[id]/rules/[ruleId]  — delete a group rule
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB, PricingRule, PropertyGroup } from "@/lib/db";
import mongoose from "mongoose";

type Ctx = { params: Promise<{ id: string; ruleId: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id, ruleId } = await params;
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const orgId = new mongoose.Types.ObjectId(session.orgId);
  const gid = new mongoose.Types.ObjectId(id);

  const group = await PropertyGroup.findOne({ _id: gid, orgId }).lean();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const body = await req.json();
  const rule = await PricingRule.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(ruleId), groupId: gid, scope: "group" },
    { $set: body },
    { new: true }
  ).lean();

  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, ruleId } = await params;
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const orgId = new mongoose.Types.ObjectId(session.orgId);
  const gid = new mongoose.Types.ObjectId(id);

  const group = await PropertyGroup.findOne({ _id: gid, orgId }).lean();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  await PricingRule.deleteOne({
    _id: new mongoose.Types.ObjectId(ruleId),
    groupId: gid,
    scope: "group",
  });

  return NextResponse.json({ success: true });
}

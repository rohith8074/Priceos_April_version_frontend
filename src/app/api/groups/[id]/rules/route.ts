/**
 * GET  /api/groups/[id]/rules   — list all rules for this group
 * POST /api/groups/[id]/rules   — create a new rule scoped to this group
 *
 * Creating one group rule automatically fans it out to all group members
 * at pipeline-run time (pipeline.ts merges group rules with +1000 priority offset).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { connectDB, PropertyGroup, PricingRule } from "@/lib/db";
import mongoose from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

function categoryFromRuleType(ruleType: string) {
  if (ruleType === "SEASON") return "SEASONS";
  if (ruleType === "ADMIN_BLOCK") return "DATE_OVERRIDES";
  if (ruleType === "LOS_DISCOUNT") return "LOS_DISCOUNTS";
  return "LEAD_TIME";
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const gid = new mongoose.Types.ObjectId(id);
  const orgId = new mongoose.Types.ObjectId(session.orgId);

  const group = await PropertyGroup.findOne({ _id: gid, orgId }).lean();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const rules = await PricingRule.find({ groupId: gid, scope: "group" })
    .sort({ priority: 1 })
    .lean();

  return NextResponse.json(rules);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const gid = new mongoose.Types.ObjectId(id);
  const orgId = new mongoose.Types.ObjectId(session.orgId);

  const group = await PropertyGroup.findOne({ _id: gid, orgId }).lean();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const body = await req.json();
  const rule = await PricingRule.create({
    ...body,
    ruleCategory: body?.ruleCategory || categoryFromRuleType(String(body?.ruleType || "EVENT")),
    orgId,
    groupId: gid,
    listingId: undefined,
    scope: "group",
  });

  return NextResponse.json(rule, { status: 201 });
}

import { db } from "@/lib/db";
import { pricingRules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const result = await db
      .select()
      .from(pricingRules)
      .where(eq(pricingRules.listingId, id));

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const body = await req.json();

    const [rule] = await db
      .insert(pricingRules)
      .values({
        ...body,
        listingId: id,
      })
      .returning();

    return NextResponse.json(rule);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  // We need a rule ID to delete. It can be passed in the URL?
  // Usually /api/listings/[id]/rules?ruleId=123
  const { searchParams } = new URL(req.url);
  const ruleId = parseInt(searchParams.get("ruleId") || "");

  if (!ruleId) {
    return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });
  }

  try {
    await db
      .delete(pricingRules)
      .where(
        and(
          eq(pricingRules.id, ruleId),
          eq(pricingRules.listingId, parseInt(idStr))
        )
      );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

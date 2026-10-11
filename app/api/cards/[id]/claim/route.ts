import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as { claimedBy?: unknown };

  if (typeof body.claimedBy !== "string" || !body.claimedBy.trim()) {
    return NextResponse.json({ error: "claimedBy required" }, { status: 400 });
  }

  const claimedBy = body.claimedBy.trim();

  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = await getDb();

  const card = await db
    .collection("cards")
    .findOneAndUpdate(
      { _id: oid, status: { $nin: ["claimed", "working"] } },
      { $set: { status: "claimed", claimedBy } },
      { returnDocument: "after" }
    );

  if (!card) {
    return NextResponse.json(
      { error: "not found or already claimed" },
      { status: 409 }
    );
  }

  await db.collection("feed").insertOne({
    text: `${claimedBy} claimed "${(card as { title?: string }).title ?? id}"`,
    at: new Date(),
  });

  return NextResponse.json({ ok: true });
}

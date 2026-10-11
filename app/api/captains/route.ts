import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const captains = await db.collection("captains").find().sort({ joinedAt: 1 }).toArray();
  return NextResponse.json(captains.map((c) => ({ ...c, _id: String(c._id) })));
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const db = await getDb();
  const existing = await db.collection("captains").findOne({ name: body.name.trim() });
  if (existing) {
    return NextResponse.json({ ok: true, _id: String(existing._id) });
  }
  const now = new Date();
  const result = await db.collection("captains").insertOne({
    name: body.name.trim(),
    joinedAt: now,
  });
  await db.collection("chat").insertOne({
    author: "system",
    text: `${body.name.trim()} joined the floor`,
    at: now,
    isSystem: true,
  });
  return NextResponse.json({ ok: true, _id: String(result.insertedId) });
}

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const messages = await db
    .collection("chat")
    .find()
    .sort({ at: 1 })
    .limit(100)
    .toArray();
  return NextResponse.json(
    messages.map((m) => ({ ...m, _id: String(m._id) }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { author?: string; text?: string };
  if (!body.author?.trim() || !body.text?.trim()) {
    return NextResponse.json({ error: "author and text required" }, { status: 400 });
  }
  const db = await getDb();
  const now = new Date();
  const result = await db.collection("chat").insertOne({
    author: body.author.trim(),
    text: body.text.trim(),
    at: now,
  });
  return NextResponse.json({ ok: true, _id: String(result.insertedId) });
}

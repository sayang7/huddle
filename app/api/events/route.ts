import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const events = await db
    .collection("events")
    .find()
    .sort({ time: 1 })
    .limit(30)
    .toArray();
  return NextResponse.json(
    events.map((e) => ({ ...e, _id: String(e._id) }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { title?: string; time?: string; createdBy?: string };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const db = await getDb();
  const now = new Date();
  const result = await db.collection("events").insertOne({
    title: body.title.trim(),
    time: body.time ? new Date(body.time) : now,
    createdBy: body.createdBy ?? "captain",
    createdAt: now,
  });
  await db.collection("feed").insertOne({
    text: `📅 ${body.createdBy ?? "Captain"} added "${body.title.trim().slice(0, 40)}" to schedule`,
    at: now,
  });
  return NextResponse.json({ ok: true, _id: String(result.insertedId) });
}

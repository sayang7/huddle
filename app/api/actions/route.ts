import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const actions = await db
    .collection("pendingActions")
    .find({ status: "pending" })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return NextResponse.json(
    actions.map((a) => ({ ...a, _id: String(a._id) }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { actionId?: string; decision?: "approved" | "dismissed" };
  if (!body.actionId || !body.decision) {
    return NextResponse.json({ error: "actionId and decision required" }, { status: 400 });
  }

  const db = await getDb();
  const action = await db.collection("pendingActions").findOne({
    _id: new ObjectId(body.actionId),
    status: "pending",
  });

  if (!action) {
    return NextResponse.json({ error: "action not found" }, { status: 404 });
  }

  await db.collection("pendingActions").updateOne(
    { _id: new ObjectId(body.actionId) },
    { $set: { status: body.decision, resolvedAt: new Date() } }
  );

  if (body.decision === "approved" && action.type === "notify") {
    const now = new Date();
    await db.collection("notifications").insertOne({
      to: action.to,
      phone: action.phone ?? null,
      message: action.message,
      agentName: action.agentName,
      at: now,
    });
    await db.collection("feed").insertOne({
      text: `📱 ${action.agentName} → ${action.to}${action.phone ? ` (${action.phone})` : ""}: "${String(action.message).slice(0, 50)}${String(action.message).length > 50 ? "…" : ""}"`,
      at: now,
    });
  }

  return NextResponse.json({ ok: true });
}

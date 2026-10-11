import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function stringifyIds<T extends { _id?: unknown }>(
  docs: T[]
): (Omit<T, "_id"> & { _id: string })[] {
  return docs.map((d) => ({ ...d, _id: String(d._id) }));
}

export async function GET() {
  const db = await getDb();

  const [cards, feed, agents, dancers, notifications, events] = await Promise.all([
    db.collection("cards").find().sort({ createdAt: -1 }).limit(60).toArray(),
    db.collection("feed").find().sort({ at: -1 }).limit(40).toArray(),
    db.collection("agents").find().toArray(),
    db.collection("dancers").find().toArray(),
    db.collection("notifications").find().sort({ at: -1 }).limit(20).toArray(),
    db.collection("events").find().sort({ time: 1 }).limit(20).toArray(),
  ]);

  return NextResponse.json({
    cards: stringifyIds(cards),
    feed: stringifyIds(feed),
    agents: stringifyIds(agents),
    dancers: stringifyIds(dancers),
    notifications: stringifyIds(notifications),
    events: stringifyIds(events),
  });
}

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

  const [cards, feed, agents] = await Promise.all([
    db
      .collection("cards")
      .find()
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
    db.collection("feed").find().sort({ at: -1 }).limit(30).toArray(),
    db.collection("agents").find().toArray(),
  ]);

  return NextResponse.json({
    cards: stringifyIds(cards),
    feed: stringifyIds(feed),
    agents: stringifyIds(agents),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Ordered to cover every agent during a linear demo run (indices 0-9):
//   0 → Roster (substitute)   4 → Supplies
//   1 → Medical               5 → Ops (logistics)
//   2 → Alex (request)        6 → Roster again (different scenario)
//   3 → Security              7 → Hype (morale)
//   8 → Medical (critical)    9 → Hype (morale, hour-34 wall)
const DEMO_EVENTS = [
  {
    title: "Dancer in section 112 needs a sub — exhausted at hour 18",
    tag: "substitute",
  },
  {
    title: "Dancer in Block C collapsed — possible dehydration, section 301",
    tag: "medical",
  },
  {
    title: "Need coordination help — multiple situations hitting at once near stage left",
    tag: "request",
  },
  {
    title: "Unauthorized person spotted near Block D entrance — not wearing wristband",
    tag: "security",
  },
  {
    title: "Water station empty at section 213 — dancers haven't had water in 25 min",
    tag: "supplies",
  },
  {
    title: "DJ booth audio cutting out — sound system issue near stage",
    tag: "logistics",
  },
  {
    title: "Dancer Blake Williams in section 204 requesting sub — knee pain",
    tag: "substitute",
  },
  {
    title: "Energy level critically low in Block B — section 208 going quiet, hour 22",
    tag: "morale",
  },
  {
    title: "Dancer with allergic reaction in section 125 — throat tightening, needs EpiPen",
    tag: "medical",
  },
  {
    title: "Section 316 crowd energy hitting the hour-34 wall — need a morale boost NOW",
    tag: "morale",
  },
] as const;

export async function POST(req: NextRequest) {
  const body = await req.json() as { author?: string; index?: number };
  const author = body.author ?? "Demo";

  const idx =
    body.index !== undefined
      ? body.index % DEMO_EVENTS.length
      : Math.floor(Math.random() * DEMO_EVENTS.length);

  const event = DEMO_EVENTS[idx];
  const db = await getDb();
  const now = new Date();

  await db.collection("cards").insertOne({
    title: event.title,
    body: "",
    tag: event.tag,
    author,
    status: "idle",
    createdAt: now,
  });

  return NextResponse.json({ ok: true, fired: event.title, tag: event.tag, index: idx });
}

// POST /api/worker/tick
// Stateless polling alternative to the change-stream worker.
// Called by Vercel Cron (vercel.json) on a schedule, or triggered manually.
// Processes one idle card per call to stay within serverless timeout limits.
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { llm } from "@/lib/llm";
import { Db, Document, ObjectId } from "mongodb";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — requires Vercel Pro for >10s

interface Agent {
  name: string;
  emoji: string;
  instructions: string;
  trigger: Document;
}

interface CardDoc extends Document {
  _id: ObjectId;
  title: string;
  body?: string;
  tag?: string;
  author: string;
  status: string;
}

interface Dancer {
  _id: ObjectId;
  name: string;
  block: string;
  section: string;
  status: "active" | "available" | "out";
  phone?: string;
}

interface Contact {
  _id: ObjectId;
  name: string;
  role: string;
  phone: string;
  location: string;
}

interface ItineraryItem {
  _id: ObjectId;
  title: string;
  description: string;
  type: string;
  time: Date;
}

const BLOCK_MAP: Record<string, string> = { "1": "A", "2": "B", "3": "C", "4": "D" };

function extractBlock(text: string): string | null {
  const m = text.match(/\b([1-4]\d{2})\b/);
  return m ? (BLOCK_MAP[m[1][0]] ?? null) : null;
}

async function buildContext(db: Db, doc: CardDoc): Promise<string> {
  const parts: string[] = [];

  if (doc.tag === "substitute") {
    const block = extractBlock(`${doc.title} ${doc.body ?? ""}`);
    const query = block ? { status: "available" as const, block } : { status: "available" as const };
    const backups = await db.collection<Dancer>("dancers").find(query).limit(3).toArray();
    parts.push(
      backups.length > 0
        ? `Available backup dancers: ${backups.map(d => `${d.name} (section ${d.section}${d.phone ? ", " + d.phone : ""})`).join(", ")}`
        : "No backup dancers available in this block."
    );
  }
  if (doc.tag === "medical") {
    const c = await db.collection<Contact>("contacts").findOne({ role: "Medical Lead" });
    if (c) parts.push(`Medical Lead: ${c.name} at ${c.location} (${c.phone}).`);
  }
  if (doc.tag === "supplies") {
    const c = await db.collection<Contact>("contacts").findOne({ role: "Hospitality Lead" });
    if (c) parts.push(`Hospitality Lead: ${c.name} at ${c.location} (${c.phone}).`);
  }
  if (doc.tag === "security") {
    const c = await db.collection<Contact>("contacts").findOne({ role: "R&R Lead" });
    if (c) parts.push(`R&R Lead: ${c.name} at ${c.location} (${c.phone}).`);
  }
  if (doc.tag === "logistics") {
    const c = await db.collection<Contact>("contacts").findOne({ role: "Operations Lead" });
    if (c) parts.push(`Operations Lead: ${c.name} at ${c.location} (${c.phone}).`);
  }
  if (doc.tag === "morale") {
    const c = await db.collection<Contact>("contacts").findOne({ role: "Entertainment Lead" });
    if (c) parts.push(`Entertainment Lead: ${c.name} at ${c.location} (${c.phone}).`);
    const next = await db.collection<ItineraryItem>("itinerary").findOne({
      time: { $gte: new Date() },
      type: { $in: ["morale", "milestone"] },
    });
    if (next) parts.push(`Next scheduled event: "${next.title}"`);
  }

  return parts.length > 0 ? `\n\n[Context: ${parts.join(" ")}]` : "";
}

function extractSendMessage(text: string): { to: string; message: string } | null {
  const m = text.match(/Send:\s*['"](.+?)['"]/i);
  if (!m) return null;
  const toMatch = m[1].match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),/);
  return { to: toMatch ? toMatch[1] : "Team", message: m[1] };
}

async function postProcess(db: Db, doc: CardDoc, agent: Agent, result: string) {
  if (doc.tag === "substitute") {
    const block = extractBlock(`${doc.title} ${doc.body ?? ""}`);
    const query = block ? { status: "available" as const, block } : { status: "available" as const };
    const backup = await db.collection<Dancer>("dancers").findOne(query);
    if (backup) {
      await db.collection("dancers").updateOne({ _id: backup._id }, { $set: { status: "active", updatedAt: new Date() } });
      const nameMatch = doc.title.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
      if (nameMatch) {
        await db.collection("dancers").updateOne({ name: nameMatch[1], status: "active" }, { $set: { status: "out", updatedAt: new Date() } });
      }
      await db.collection("pendingActions").insertOne({
        type: "notify", agentName: agent.name,
        description: `Text ${backup.name}${backup.phone ? ` (${backup.phone})` : ""}: "You're up — ${backup.section ? `section ${backup.section}` : "the floor"} needs you NOW"`,
        to: backup.name, phone: backup.phone ?? null,
        message: `You're up — ${backup.section ? `section ${backup.section}` : "the floor"} needs you NOW`,
        cardId: doc._id, status: "pending", createdAt: new Date(),
      });
    }
  }

  if (["security", "supplies", "logistics", "morale", "medical"].includes(doc.tag ?? "")) {
    const parsed = extractSendMessage(result);
    if (parsed) {
      const contact = await db.collection<Contact>("contacts").findOne({ name: { $regex: new RegExp(`^${parsed.to}`, "i") } });
      await db.collection("pendingActions").insertOne({
        type: "notify", agentName: agent.name,
        description: `Text ${parsed.to}${contact?.phone ? ` (${contact.phone})` : ""}: "${parsed.message}"`,
        to: parsed.to, phone: contact?.phone ?? null,
        message: parsed.message, cardId: doc._id, status: "pending", createdAt: new Date(),
      });
    }
  }
}

export async function POST() {
  const db = await getDb();
  const agents: Agent[] = await db.collection<Agent>("agents").find().toArray();
  const agentNameSet = new Set(agents.map(a => a.name));

  // Find one idle card that matches any agent's trigger tag
  const agentTags = agents
    .map(a => a.trigger["fullDocument.tag"])
    .filter((t): t is string => typeof t === "string");

  const doc = await db.collection<CardDoc>("cards").findOne({
    status: "idle",
    tag: { $in: agentTags },
    author: { $nin: Array.from(agentNameSet) },
  });

  if (!doc) return NextResponse.json({ ok: true, processed: 0 });

  // Find the matching agent
  const agent = agents.find(a => a.trigger["fullDocument.tag"] === doc.tag);
  if (!agent) return NextResponse.json({ ok: true, processed: 0 });

  // Atomic lock
  const locked = await db.collection("cards").findOneAndUpdate(
    { _id: doc._id, status: "idle" },
    { $set: { status: "working" } }
  );
  if (!locked) return NextResponse.json({ ok: true, processed: 0 });

  try {
    const context = await buildContext(db, doc);
    const result = await llm(agent.instructions, `Title: ${doc.title}\n\n${doc.body ?? ""}${context}`);
    const now = new Date();

    await db.collection("cards").insertOne({
      title: result, body: "", tag: "agent-output",
      author: agent.name, status: "idle", createdAt: now,
    });
    await db.collection("cards").updateOne({ _id: doc._id }, { $set: { status: "claimed", claimedBy: agent.name } });
    await db.collection("feed").insertOne({
      text: `${agent.emoji} ${agent.name} handled "${doc.title.slice(0, 45)}${doc.title.length > 45 ? "…" : ""}"`,
      at: now,
    });
    await postProcess(db, doc, agent, result);

    return NextResponse.json({ ok: true, processed: 1, agent: agent.name, card: doc.title.slice(0, 60) });
  } catch (err) {
    await db.collection("cards").updateOne({ _id: doc._id }, { $set: { status: "idle" } }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

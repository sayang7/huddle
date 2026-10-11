import { config } from "dotenv";
config({ path: ".env.local" });

import { ChangeStream, Db, Document, ObjectId } from "mongodb";
import { getDb, closeDb } from "../lib/db";
import { llm } from "../lib/llm";

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

// ── Context enrichment ────────────────────────────────────────────
// Builds extra context injected into the LLM prompt based on the card's
// content and tag. Keeps every response data-driven, not generic.
// Map section prefix digit ("1","2","3","4") → block letter ("A","B","C","D")
const BLOCK_MAP: Record<string, string> = { "1": "A", "2": "B", "3": "C", "4": "D" };

function extractBlock(text: string): string | null {
  const m = text.match(/\b([1-4]\d{2})\b/);
  return m ? (BLOCK_MAP[m[1][0]] ?? null) : null;
}

async function buildContext(db: Db, doc: CardDoc): Promise<string> {
  const parts: string[] = [];

  if (doc.tag === "substitute") {
    const text = `${doc.title} ${doc.body ?? ""}`;
    const block = extractBlock(text);

    const query = block
      ? { status: "available", block }
      : { status: "available" };

    const backups = await db
      .collection<Dancer>("dancers")
      .find(query)
      .limit(3)
      .toArray();

    if (backups.length > 0) {
      const list = backups
        .map((d) => `${d.name} (section ${d.section}${d.phone ? ", " + d.phone : ""})`)
        .join(", ");
      parts.push(`Available backup dancers: ${list}`);
    } else {
      parts.push("No backup dancers currently available in this block.");
    }
  }

  if (doc.tag === "medical") {
    parts.push("First aid team is on standby. Emergency services can be reached via floor command.");
  }

  if (doc.tag === "supplies") {
    parts.push("Supply cart locations: Zone 1 (near stage), Zone 2 (Block B entrance), Zone 3 (Block D corridor).");
  }

  return parts.length > 0 ? `\n\n[Context: ${parts.join(" ")}]` : "";
}

// ── Post-processing after agent responds ──────────────────────────
// Performs real side effects: dancer swaps, notification logs.
async function postProcess(
  db: Db,
  doc: CardDoc,
  agent: Agent,
  _result: string
): Promise<void> {
  if (doc.tag === "substitute") {
    const text = `${doc.title} ${doc.body ?? ""}`;
    const block = extractBlock(text);

    const query = block
      ? { status: "available", block }
      : { status: "available" };

    const backup = await db.collection<Dancer>("dancers").findOne(query);

    if (backup) {
      // Mark backup as active
      await db
        .collection("dancers")
        .updateOne({ _id: backup._id }, { $set: { status: "active", updatedAt: new Date() } });

      // Try to mark the departing dancer as out (name mentioned before "needs" / "backing" / "subbing")
      const nameMatch = doc.title.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
      if (nameMatch) {
        await db
          .collection("dancers")
          .updateOne(
            { name: nameMatch[1], status: "active" },
            { $set: { status: "out", updatedAt: new Date() } }
          );
      }

      // Log notification
      const message = `You're up — ${backup.section ? `section ${backup.section}` : "the floor"} needs you NOW`;
      await db.collection("notifications").insertOne({
        to: backup.name,
        phone: backup.phone ?? null,
        message,
        agentName: agent.name,
        at: new Date(),
      });

      await db.collection("feed").insertOne({
        text: `📱 ${agent.name} notified ${backup.name}${backup.phone ? " (" + backup.phone + ")" : ""} — heading to section ${backup.section}`,
        at: new Date(),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────

async function main() {
  const db = await getDb();

  let agents: Agent[] = await db.collection<Agent>("agents").find().toArray();
  console.log(`Worker running with ${agents.length} agents: ${agents.map((a) => a.name).join(", ")}`);

  let cardStreams: ChangeStream[] = [];

  function openCardStreams(currentAgents: Agent[]) {
    for (const s of cardStreams) s.close().catch(() => {});
    cardStreams = [];

    const agentNameSet = new Set(currentAgents.map((a) => a.name));

    for (const agent of currentAgents) {
      const stream = db.collection("cards").watch(
        [{ $match: { operationType: "insert", ...agent.trigger } }],
        { fullDocument: "updateLookup" }
      );

      stream.on("change", async (event) => {
        if (event.operationType !== "insert") return;
        const doc = event.fullDocument as CardDoc;
        if (!doc) return;
        if (doc.tag === "agent-output") return;
        if (agentNameSet.has(doc.author)) return;

        // Atomic lock — prevents duplicate processing if stream replays
        const locked = await db.collection("cards").findOneAndUpdate(
          { _id: doc._id, status: "idle" },
          { $set: { status: "working" } }
        );
        if (!locked) return;

        try {
          // Build data-driven context for this card
          const context = await buildContext(db, doc);

          const result = await llm(
            agent.instructions,
            `Title: ${doc.title}\n\n${doc.body ?? ""}${context}`
          );

          const now = new Date();

          await db.collection("cards").insertOne({
            title: result,
            body: "",
            tag: "agent-output",
            author: agent.name,
            status: "idle",
            createdAt: now,
          });

          await db.collection("cards").updateOne(
            { _id: doc._id },
            { $set: { status: "claimed", claimedBy: agent.name } }
          );

          await db.collection("feed").insertOne({
            text: `${agent.emoji} ${agent.name} handled "${doc.title.slice(0, 45)}${doc.title.length > 45 ? "…" : ""}"`,
            at: now,
          });

          // Run tag-specific side effects (dancer swaps, notifications)
          await postProcess(db, doc, agent, result);

          console.log(`[${agent.name}] ✓ "${doc.title.slice(0, 60)}"`);
        } catch (err) {
          console.error(`[${agent.name}] error:`, err);
          await db
            .collection("cards")
            .updateOne({ _id: doc._id }, { $set: { status: "idle" } })
            .catch(() => {});
        }
      });

      stream.on("error", (err) => {
        console.error(`[${agent.name}] stream error:`, err);
      });

      cardStreams.push(stream);
    }
  }

  openCardStreams(agents);

  // Hot-reload when agents collection changes (new agent spawned via UI)
  const agentStream = db.collection("agents").watch();
  agentStream.on("change", async () => {
    agents = await db.collection<Agent>("agents").find().toArray();
    console.log(`Agents reloaded: ${agents.map((a) => a.name).join(", ")}`);
    openCardStreams(agents);
  });

  process.on("SIGINT", async () => {
    for (const s of cardStreams) await s.close().catch(() => {});
    await agentStream.close().catch(() => {});
    await closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

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

interface Contact {
  _id: ObjectId;
  name: string;
  role: string;
  phone: string;
  location: string;
  assignments: string[];
}

interface ItineraryItem {
  _id: ObjectId;
  title: string;
  description: string;
  type: string;
  time: Date;
  offsetHours: number;
}

// ── Block mapping: section prefix digit → block letter ────────
const BLOCK_MAP: Record<string, string> = { "1": "A", "2": "B", "3": "C", "4": "D" };

function extractBlock(text: string): string | null {
  const m = text.match(/\b([1-4]\d{2})\b/);
  return m ? (BLOCK_MAP[m[1][0]] ?? null) : null;
}

// ── Context enrichment ────────────────────────────────────────
// Injects live DB data into the LLM prompt so agents respond with
// real names, phone numbers, and schedule context — not generic text.
async function buildContext(db: Db, doc: CardDoc): Promise<string> {
  const parts: string[] = [];

  if (doc.tag === "substitute") {
    const text = `${doc.title} ${doc.body ?? ""}`;
    const block = extractBlock(text);
    const query = block
      ? { status: "available" as const, block }
      : { status: "available" as const };
    const backups = await db.collection<Dancer>("dancers").find(query).limit(3).toArray();

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
    const medContact = await db.collection<Contact>("contacts").findOne({ role: "Medical Lead" });
    if (medContact) {
      parts.push(`Medical Lead: ${medContact.name} at ${medContact.location} (${medContact.phone}). First aid team is on standby.`);
    } else {
      parts.push("First aid team is on standby. Emergency services can be reached via floor command.");
    }
  }

  if (doc.tag === "supplies") {
    const supplyContact = await db.collection<Contact>("contacts").findOne({ role: "Hospitality Lead" });
    const backupContact = await db.collection<Contact>("contacts").findOne({ role: "Hospitality Backup" });
    if (supplyContact) {
      parts.push(`Hospitality Lead: ${supplyContact.name} at ${supplyContact.location} (${supplyContact.phone}).${backupContact ? ` Backup: ${backupContact.name} at ${backupContact.location} (${backupContact.phone}).` : ""}`);
    } else {
      parts.push("Supply cart locations: Zone 1 (near stage), Zone 2 (Block B entrance), Zone 3 (Block D corridor).");
    }
  }

  if (doc.tag === "security") {
    const secContact = await db.collection<Contact>("contacts").findOne({ role: "R&R Lead" });
    const backupSec = await db.collection<Contact>("contacts").findOne({ role: "R&R Backup" });
    if (secContact) {
      parts.push(`R&R Lead: ${secContact.name} at ${secContact.location} (${secContact.phone}).${backupSec ? ` Backup: ${backupSec.name} (${backupSec.phone}).` : ""}`);
    }
  }

  if (doc.tag === "logistics") {
    const opsContact = await db.collection<Contact>("contacts").findOne({ role: "Operations Lead" });
    const techContact = await db.collection<Contact>("contacts").findOne({ role: "AV Tech" });
    if (opsContact) {
      parts.push(`Operations Lead: ${opsContact.name} at ${opsContact.location} (${opsContact.phone}).${techContact ? ` AV Tech: ${techContact.name} at ${techContact.location} (${techContact.phone}).` : ""}`);
    }
  }

  if (doc.tag === "morale") {
    const hypeLead = await db.collection<Contact>("contacts").findOne({ role: "Entertainment Lead" });
    const djLiaison = await db.collection<Contact>("contacts").findOne({ role: "DJ Liaison" });
    if (hypeLead) {
      parts.push(`Entertainment Lead: ${hypeLead.name} at ${hypeLead.location} (${hypeLead.phone}).${djLiaison ? ` DJ Liaison: ${djLiaison.name} at ${djLiaison.location} (${djLiaison.phone}).` : ""}`);
    }

    // Add upcoming itinerary for morale context
    const next = await db.collection<ItineraryItem>("itinerary").findOne({
      time: { $gte: new Date() },
      type: { $in: ["morale", "milestone"] },
    });
    if (next) {
      parts.push(`Next scheduled event: "${next.title}" — ${next.description}`);
    }
  }

  return parts.length > 0 ? `\n\n[Context: ${parts.join(" ")}]` : "";
}

// ── Extract "Send: '...'" from agent output ───────────────────
// Agents like Security/Supplies/Ops/Hype are instructed to end with
//   Send: 'the exact message to text them'
// We parse that out to create a pending action for human approval.
function extractSendMessage(text: string): { to: string; message: string } | null {
  const m = text.match(/Send:\s*['"](.+?)['"]/i);
  if (!m) return null;
  // Try to extract recipient name from the message itself (first word after 'text')
  const toMatch = m[1].match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),/);
  const to = toMatch ? toMatch[1] : "Team";
  return { to, message: m[1] };
}

// ── Post-processing: real side effects after agent responds ───
async function postProcess(
  db: Db,
  doc: CardDoc,
  agent: Agent,
  result: string
): Promise<void> {
  // SwapBot: update dancer DB + create pending notification
  if (doc.tag === "substitute") {
    const text = `${doc.title} ${doc.body ?? ""}`;
    const block = extractBlock(text);
    const query = block
      ? { status: "available" as const, block }
      : { status: "available" as const };
    const backup = await db.collection<Dancer>("dancers").findOne(query);

    if (backup) {
      await db.collection("dancers").updateOne(
        { _id: backup._id },
        { $set: { status: "active", updatedAt: new Date() } }
      );

      const nameMatch = doc.title.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
      if (nameMatch) {
        await db.collection("dancers").updateOne(
          { name: nameMatch[1], status: "active" },
          { $set: { status: "out", updatedAt: new Date() } }
        );
      }

      const message = `You're up — ${backup.section ? `section ${backup.section}` : "the floor"} needs you NOW`;
      await db.collection("pendingActions").insertOne({
        type: "notify",
        agentName: agent.name,
        description: `Text ${backup.name}${backup.phone ? ` (${backup.phone})` : ""}: "${message}"`,
        to: backup.name,
        phone: backup.phone ?? null,
        message,
        cardId: doc._id,
        status: "pending",
        createdAt: new Date(),
      });
    }
  }

  // Security / Supplies / Ops / Hype: parse the "Send: '...'" instruction
  // from their structured output and queue it as a pending action
  if (["security", "supplies", "logistics", "morale", "medical"].includes(doc.tag ?? "")) {
    const parsed = extractSendMessage(result);
    if (parsed) {
      // Find the contact by name to get their phone
      const contact = await db.collection<Contact>("contacts").findOne({
        name: { $regex: new RegExp(`^${parsed.to}`, "i") },
      });

      await db.collection("pendingActions").insertOne({
        type: "notify",
        agentName: agent.name,
        description: `Text ${parsed.to}${contact?.phone ? ` (${contact.phone})` : ""}: "${parsed.message}"`,
        to: parsed.to,
        phone: contact?.phone ?? null,
        message: parsed.message,
        cardId: doc._id,
        status: "pending",
        createdAt: new Date(),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────

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

  // Hot-reload when agents collection changes
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

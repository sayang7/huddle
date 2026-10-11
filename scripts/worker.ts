import { config } from "dotenv";
config({ path: ".env.local" });

import { ChangeStream, Document, ObjectId } from "mongodb";
import { getDb, closeDb } from "../lib/db";
import { llm } from "../lib/llm";

// ── Demo-mode fallback (fires when LLM is unavailable) ───────────
function demoFallback(title: string, tag?: string): string {
  const t = (title + " " + (tag ?? "")).toLowerCase();
  if (t.includes("water") || t.includes("drink") || t.includes("hydrat")) {
    return "Water cart on the way — supplies team dispatched to your section now";
  }
  if (t.includes("collaps") || t.includes("unrespons") || t.includes("faint") || t.includes("unconsci")) {
    return "Medical situation flagged as critical — first aid team paged, do NOT move the dancer";
  }
  if (t.includes("dizz") || t.includes("nausea") || t.includes("cramp") || t.includes("pain") || t.includes("allerg")) {
    return "Medical team en route — medical situation confirmed, keep the dancer still";
  }
  if (t.includes("energy") || t.includes("morale") || t.includes("tired") || t.includes("zoning") || t.includes("restless")) {
    return "Morale check triggered — hype squad heading over to reinvigorate that section";
  }
  if (t.includes("snack") || t.includes("food") || t.includes("granola") || t.includes("supplies") || t.includes("blanket")) {
    return "Supplies restock incoming — volunteer with a cart is heading your way now";
  }
  if (t.includes("security") || t.includes("unauthorized") || t.includes("unknown") || t.includes("argument") || t.includes("conflict")) {
    return "Security situation flagged — keeping the area clear until staff arrives";
  }
  if (t.includes("bathroom") || t.includes("line") || t.includes("congestion") || t.includes("crowd") || t.includes("logistics")) {
    return "Logistics issue logged — rerouting foot traffic and sending staff to manage the flow";
  }
  if (t.includes("light") || t.includes("sound") || t.includes("equipment") || t.includes("technical") || t.includes("dj")) {
    return "Technical issue flagged — AV crew notified and heading over to fix it";
  }
  return "Got it — on it right now, I'll update the floor once I know more";
}

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

async function main() {
  const db = await getDb();

  let agents: Agent[] = await db
    .collection<Agent>("agents")
    .find()
    .toArray();

  console.log(`Worker running with ${agents.length} agents`);

  let cardStreams: ChangeStream[] = [];

  function openCardStreams(currentAgents: Agent[]) {
    // close old streams
    for (const s of cardStreams) {
      s.close().catch(() => {});
    }
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

        try {
          await db
            .collection("cards")
            .updateOne({ _id: doc._id }, { $set: { status: "working" } });

          let result: string;
          try {
            result = await llm(
              agent.instructions,
              `Title: ${doc.title}\n\n${doc.body ?? ""}`
            );
          } catch (llmErr) {
            console.warn(`[${agent.name}] LLM unavailable, using demo fallback:`, llmErr);
            result = demoFallback(doc.title, doc.tag);
          }

          const now = new Date();

          // Agent's reply appears as a plain chat message (no robot prefix)
          await db.collection("cards").insertOne({
            title: result,
            body: "",
            tag: "agent-output",
            author: agent.name,
            status: "idle",
            createdAt: now,
          });

          // Mark original card as claimed by the agent
          await db
            .collection("cards")
            .updateOne({ _id: doc._id }, { $set: { status: "claimed", claimedBy: agent.name } });

          await db.collection("feed").insertOne({
            text: `${agent.name} jumped on "${doc.title}"`,
            at: now,
          });
        } catch (err) {
          console.error(`[${agent.name}] error:`, err);
          try {
            await db
              .collection("cards")
              .updateOne({ _id: doc._id }, { $set: { status: "idle" } });
            await db.collection("feed").insertOne({
              text: `${agent.emoji} ${agent.name} failed on "${doc.title}"`,
              at: new Date(),
            });
          } catch {
            // ignore cleanup error
          }
        }
      });

      stream.on("error", (err) => {
        console.error(`[${agent.name}] stream error:`, err);
      });

      cardStreams.push(stream);
    }
  }

  openCardStreams(agents);

  // Watch agents collection for changes; reload on any change
  const agentStream = db.collection("agents").watch();
  agentStream.on("change", async () => {
    console.log("Agents changed — reloading...");
    agents = await db.collection<Agent>("agents").find().toArray();
    console.log(`Reloaded ${agents.length} agents`);
    openCardStreams(agents);
  });

  // Keep process alive
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

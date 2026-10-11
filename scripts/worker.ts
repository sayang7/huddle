import { config } from "dotenv";
config({ path: ".env.local" });

import { ChangeStream, Document, ObjectId } from "mongodb";
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

async function main() {
  const db = await getDb();

  let agents: Agent[] = await db
    .collection<Agent>("agents")
    .find()
    .toArray();

  console.log(`Worker running with ${agents.length} agents`);

  let cardStreams: ChangeStream[] = [];

  function openCardStreams(currentAgents: Agent[]) {
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

        // Atomic lock — only process if card is still idle.
        // Prevents duplicate processing when the change stream replays an event.
        const locked = await db.collection("cards").findOneAndUpdate(
          { _id: doc._id, status: "idle" },
          { $set: { status: "working" } }
        );
        if (!locked) return;

        try {
          const result = await llm(
            agent.instructions,
            `Title: ${doc.title}\n\n${doc.body ?? ""}`
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
            text: `${agent.emoji} ${agent.name} is on it — "${doc.title.slice(0, 40)}${doc.title.length > 40 ? "…" : ""}"`,
            at: now,
          });

          console.log(`[${agent.name}] handled: "${doc.title}"`);
        } catch (err) {
          console.error(`[${agent.name}] LLM error:`, err);
          // Release the lock so a captain can manually claim
          await db.collection("cards").updateOne(
            { _id: doc._id },
            { $set: { status: "idle" } }
          ).catch(() => {});
        }
      });

      stream.on("error", (err) => {
        console.error(`[${agent.name}] stream error:`, err);
      });

      cardStreams.push(stream);
    }
  }

  openCardStreams(agents);

  const agentStream = db.collection("agents").watch();
  agentStream.on("change", async () => {
    console.log("Agents changed — reloading...");
    agents = await db.collection<Agent>("agents").find().toArray();
    console.log(`Active agents: ${agents.map(a => a.name).join(", ")}`);
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

// Local agent: answers cards tagged "ask-local" using a private file on this
// machine and a local Ollama model. The private file is never sent to a cloud
// LLM — only the final answer is posted back to the board as a card.
//
// Env (.env.local):
//   LOCAL_AGENT_FILE   path to the private file to answer from (required)
//   OLLAMA_URL         default http://localhost:11434
//   OLLAMA_MODEL       default llama3.2
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "fs/promises";
import { Document, ObjectId } from "mongodb";
import { getDb, closeDb } from "../lib/db";

const AGENT_NAME = "Local";
const AGENT_EMOJI = "🔒";
const TRIGGER_TAG = "ask-local";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const FILE_PATH = process.env.LOCAL_AGENT_FILE;

interface CardDoc extends Document {
  _id: ObjectId;
  title: string;
  body?: string;
  tag?: string;
  author: string;
}

async function askOllama(system: string, user: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const data = (await res.json()) as { message: { content: string } };
  return data.message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function main() {
  if (!FILE_PATH) throw new Error("LOCAL_AGENT_FILE is not set");
  // Fail fast if the file is unreadable; it is re-read per card so edits are picked up.
  await readFile(FILE_PATH, "utf8");

  const db = await getDb();
  const cards = db.collection("cards");

  const stream = cards.watch(
    [{ $match: { operationType: "insert", "fullDocument.tag": TRIGGER_TAG } }],
    { fullDocument: "updateLookup" }
  );

  console.log(
    `${AGENT_EMOJI} ${AGENT_NAME} agent watching #${TRIGGER_TAG} (model ${OLLAMA_MODEL}, file ${FILE_PATH})`
  );

  stream.on("change", async (event) => {
    if (event.operationType !== "insert") return;
    const doc = event.fullDocument as CardDoc | undefined;
    if (!doc) return;
    // Never react to our own (or any agent's) output.
    if (doc.author === AGENT_NAME || doc.tag === "agent-output") return;

    try {
      await cards.updateOne({ _id: doc._id }, { $set: { status: "working" } });

      const privateNotes = await readFile(FILE_PATH, "utf8");
      const answer = await askOllama(
        "You answer questions from THON volunteers using ONLY the private notes below. " +
          "If the notes don't contain the answer, say so. Be brief and actionable.\n\n" +
          `--- PRIVATE NOTES ---\n${privateNotes}\n--- END NOTES ---`,
        `Title: ${doc.title}\n\n${doc.body ?? ""}`
      );

      const now = new Date();
      await cards.insertOne({
        title: `${AGENT_EMOJI} ${AGENT_NAME}: ${doc.title}`,
        body: answer,
        tag: "agent-output",
        author: AGENT_NAME,
        status: "idle",
        createdAt: now,
      });
      await cards.updateOne({ _id: doc._id }, { $set: { status: "idle" } });
      await db.collection("feed").insertOne({
        text: `${AGENT_EMOJI} ${AGENT_NAME} handled "${doc.title}"`,
        at: now,
      });
    } catch (err) {
      console.error(`[${AGENT_NAME}] error:`, err);
      try {
        await cards.updateOne({ _id: doc._id }, { $set: { status: "idle" } });
        await db.collection("feed").insertOne({
          text: `${AGENT_EMOJI} ${AGENT_NAME} failed on "${doc.title}"`,
          at: new Date(),
        });
      } catch {
        // ignore cleanup error
      }
    }
  });

  stream.on("error", (err) => {
    console.error(`[${AGENT_NAME}] stream error:`, err);
  });

  process.on("SIGINT", async () => {
    await stream.close().catch(() => {});
    await closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

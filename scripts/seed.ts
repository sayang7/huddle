import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb, closeDb } from "../lib/db";
import template from "../template.json";

async function main() {
  const db = await getDb();

  await db.collection("cards").deleteMany({});
  await db.collection("agents").deleteMany({});
  await db.collection("tests").deleteMany({});
  await db.collection("feed").deleteMany({});

  const now = new Date();

  const cardDocs = template.cards.map((c) => ({
    ...c,
    status: "idle",
    createdAt: now,
  }));
  const cardsResult = await db.collection("cards").insertMany(cardDocs);

  const agentsResult = await db.collection("agents").insertMany(template.agents);

  const testsResult = await db.collection("tests").insertMany(template.tests);

  await db.collection("feed").insertOne({ text: "Board seeded", at: now });

  console.log(
    `Seeded: ${Object.keys(cardsResult.insertedIds).length} cards, ` +
      `${Object.keys(agentsResult.insertedIds).length} agents, ` +
      `${Object.keys(testsResult.insertedIds).length} tests`
  );

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

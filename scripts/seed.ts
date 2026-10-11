import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb, closeDb } from "../lib/db";
import template from "../template.json";

async function main() {
  const db = await getDb();

  await Promise.all([
    db.collection("cards").deleteMany({}),
    db.collection("agents").deleteMany({}),
    db.collection("tests").deleteMany({}),
    db.collection("feed").deleteMany({}),
    db.collection("dancers").deleteMany({}),
    db.collection("notifications").deleteMany({}),
  ]);

  const now = new Date();

  const cardDocs = template.cards.map((c) => ({
    ...c,
    status: "idle",
    createdAt: now,
  }));

  const [cardsResult, agentsResult, testsResult] = await Promise.all([
    db.collection("cards").insertMany(cardDocs),
    db.collection("agents").insertMany(template.agents),
    db.collection("tests").insertMany(template.tests),
  ]);

  // Seed dancer roster from template
  const tmpl = template as typeof template & { dancers?: object[] };
  if (tmpl.dancers?.length) {
    await db.collection("dancers").insertMany(
      tmpl.dancers.map((d) => ({ ...d, updatedAt: now }))
    );
  }

  await db.collection("feed").insertOne({ text: "🎉 THON 2026 command center is live", at: now });

  console.log(
    `Seeded: ${Object.keys(cardsResult.insertedIds).length} cards, ` +
    `${Object.keys(agentsResult.insertedIds).length} agents, ` +
    `${Object.keys(testsResult.insertedIds).length} tests, ` +
    `${tmpl.dancers?.length ?? 0} dancers`
  );

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb, closeDb } from "../lib/db";
import template from "../template.json";

type TemplateWithExtras = typeof template & {
  dancers?: object[];
  contacts?: object[];
  itinerary?: { offsetHours: number; title: string; description: string; type: string }[];
};

async function main() {
  const db = await getDb();

  await Promise.all([
    db.collection("cards").deleteMany({}),
    db.collection("agents").deleteMany({}),
    db.collection("tests").deleteMany({}),
    db.collection("feed").deleteMany({}),
    db.collection("dancers").deleteMany({}),
    db.collection("notifications").deleteMany({}),
    db.collection("pendingActions").deleteMany({}),
    db.collection("contacts").deleteMany({}),
    db.collection("itinerary").deleteMany({}),
    db.collection("events").deleteMany({}),
  ]);

  const now = new Date();

  const cardDocs = template.cards.map((c) => ({
    ...c,
    status: "idle",
    createdAt: now,
  }));

  const tmpl = template as TemplateWithExtras;

  const [cardsResult, agentsResult, testsResult] = await Promise.all([
    db.collection("cards").insertMany(cardDocs),
    db.collection("agents").insertMany(template.agents),
    db.collection("tests").insertMany(template.tests),
  ]);

  if (tmpl.dancers?.length) {
    await db.collection("dancers").insertMany(
      tmpl.dancers.map((d) => ({ ...d, updatedAt: now }))
    );
  }

  if (tmpl.contacts?.length) {
    await db.collection("contacts").insertMany(
      tmpl.contacts.map((c) => ({ ...c, createdAt: now }))
    );
  }

  // Seed itinerary relative to now (THON "started" when we seeded)
  if (tmpl.itinerary?.length) {
    const thonStart = new Date(now.getTime() - 0); // treat now as hour-0
    await db.collection("itinerary").insertMany(
      tmpl.itinerary.map((item) => ({
        title: item.title,
        description: item.description,
        type: item.type,
        time: new Date(thonStart.getTime() + item.offsetHours * 60 * 60 * 1000),
        offsetHours: item.offsetHours,
        createdAt: now,
      }))
    );
  }

  await db.collection("feed").insertOne({ text: "🎉 THON 2026 command center is live", at: now });

  console.log(
    `Seeded: ${Object.keys(cardsResult.insertedIds).length} cards, ` +
    `${Object.keys(agentsResult.insertedIds).length} agents, ` +
    `${Object.keys(testsResult.insertedIds).length} tests, ` +
    `${tmpl.dancers?.length ?? 0} dancers, ` +
    `${tmpl.contacts?.length ?? 0} contacts, ` +
    `${tmpl.itinerary?.length ?? 0} itinerary items`
  );

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

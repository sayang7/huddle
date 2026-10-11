import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb, closeDb } from "../lib/db";
import { llm } from "../lib/llm";

interface TestDoc {
  agent: string;
  input: string;
  mustInclude: string[];
  split: "train" | "heldout";
}

interface AgentDoc {
  name: string;
  instructions: string;
}

const CONCURRENCY = 6;

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function score(
  instructions: string,
  tests: TestDoc[]
): Promise<{ passed: number; total: number }> {
  if (tests.length === 0) return { passed: 0, total: 0 };

  const results = await runWithConcurrency(tests, async (test) => {
    try {
      const output = await llm(instructions, test.input);
      return test.mustInclude.every((s) =>
        output.toLowerCase().includes(s.toLowerCase())
      );
    } catch {
      return false;
    }
  });

  const passed = results.filter(Boolean).length;
  return { passed, total: tests.length };
}

async function main() {
  const agentName = process.argv[2];
  if (!agentName) {
    console.error("Usage: npm run evolve -- <AgentName>");
    process.exit(1);
  }

  const db = await getDb();

  const agent = await db
    .collection<AgentDoc>("agents")
    .findOne({ name: agentName });
  if (!agent) {
    console.error(`Agent "${agentName}" not found`);
    process.exit(1);
  }

  const allTests = await db
    .collection<TestDoc>("tests")
    .find({ agent: agentName })
    .toArray();

  const trainTests = allTests.filter((t) => t.split === "train");
  const heldoutTests = allTests.filter((t) => t.split === "heldout");

  console.log(
    `Loaded ${trainTests.length} train tests, ${heldoutTests.length} heldout tests`
  );

  let bestInstructions = agent.instructions;

  const baselineTrain = await score(bestInstructions, trainTests);
  const baselineHeldout = await score(bestInstructions, heldoutTests);

  console.log(
    `Baseline — train: ${baselineTrain.passed}/${baselineTrain.total}, ` +
      `heldout: ${baselineHeldout.passed}/${baselineHeldout.total}`
  );

  let bestTrainScore = baselineTrain.passed;

  for (let round = 1; round <= 5; round++) {
    // Find failing train tests
    const failing: TestDoc[] = [];
    for (const test of trainTests) {
      try {
        const output = await llm(bestInstructions, test.input);
        const passes = test.mustInclude.every((s) =>
          output.toLowerCase().includes(s.toLowerCase())
        );
        if (!passes) failing.push(test);
      } catch {
        failing.push(test);
      }
    }

    if (failing.length === 0) {
      console.log(`Round ${round}: all train tests pass — stopping early`);
      break;
    }

    const failureSummary = failing
      .map(
        (t) =>
          `Input: ${t.input}\nExpected to include: ${t.mustInclude.join(", ")}`
      )
      .join("\n---\n");

    // Generate 4 candidate instruction rewrites in parallel
    const candidatePromises = Array.from({ length: 4 }, () =>
      llm(
        `You are an instruction optimizer. Current instructions:\n${bestInstructions}\n\nRewrite these agent instructions so the agent passes these failing cases. Return ONLY the new instructions, nothing else.`,
        failureSummary
      ).catch(() => bestInstructions)
    );

    const candidates = await Promise.all(candidatePromises);

    // Score all candidates on train
    const candidateScores = await runWithConcurrency(candidates, async (c) => {
      const s = await score(c, trainTests);
      return { instructions: c, passed: s.passed };
    });

    const best = candidateScores.reduce((a, b) =>
      b.passed > a.passed ? b : a
    );

    if (best.passed > bestTrainScore) {
      bestTrainScore = best.passed;
      bestInstructions = best.instructions;
      console.log(
        `Round ${round}: improved train score to ${best.passed}/${trainTests.length}`
      );
    } else {
      console.log(
        `Round ${round}: best train score ${bestTrainScore}/${trainTests.length} (no improvement)`
      );
    }
  }

  const finalHeldout = await score(bestInstructions, heldoutTests);
  console.log(
    `\nFinal heldout: ${finalHeldout.passed}/${finalHeldout.total} ` +
      `(baseline was ${baselineHeldout.passed}/${baselineHeldout.total})`
  );
  console.log(`\nBest instructions:\n${bestInstructions}`);

  await db
    .collection("agents")
    .updateOne({ name: agentName }, { $set: { instructions: bestInstructions } });

  console.log(`\nSaved improved instructions to agent "${agentName}"`);

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

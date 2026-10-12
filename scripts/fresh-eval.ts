// Fresh-test check: original Alex prompt vs evolved Alex prompt on 12 new
// cases the optimizer never saw (written after the evolve run), 2 runs each.
// Usage: npx tsx scripts/fresh-eval.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { readFileSync, writeFileSync } from "node:fs";
import { llm } from "../lib/llm";

const FRESH: [string, string[]][] = [
  ["Title: Dancer having a seizure in Block D\n\n", ["medical", "critical"]],
  ["Title: Dancer fainted near the stage and isn't waking up\n\n", ["medical", "critical"]],
  ["Title: Dancer twisted an ankle in Section 118\n\nThey're limping and it's swelling.", ["medical", "urgent"]],
  ["Title: Dancer throwing up in Section 210\n\n", ["medical", "urgent"]],
  ["Title: Fight breaking out in the upper stands\n\n", ["security", "urgent"]],
  ["Title: Stranger without a wristband on the dance floor\n\n", ["security", "urgent"]],
  ["Title: Dancer in Section 140 hasn't had water in an hour\n\n", ["supplies", "urgent"]],
  ["Title: Snack table in Zone 2 is out of fruit\n\n", ["supplies", "routine"]],
  ["Title: Dancer asking for an extra blanket during rest\n\n", ["supplies", "routine"]],
  ["Title: Water leaking from the ceiling onto the dance floor\n\n", ["logistics", "urgent"]],
  ["Title: Projector screen showing the wrong slides\n\n", ["logistics", "routine"]],
  ["Title: Section 330 dancers are bored and quiet\n\n", ["morale", "routine"]],
];
const RUNS = 2;

// Both prompts come from the evolve run itself
const run = JSON.parse(readFileSync("evolve-results.json", "utf8"));
const original = run.baselineInstructions as string;
const evolved = run.bestInstructions as string;

async function score(prompt: string): Promise<number> {
  let passed = 0;
  const jobs = Array.from({ length: RUNS }, () => FRESH).flat();
  for (let i = 0; i < jobs.length; i += 4) {
    const results = await Promise.all(jobs.slice(i, i + 4).map(async ([input, must]) => {
      try {
        const out = (await llm(prompt, input)).toLowerCase();
        return must.every((m) => out.includes(m));
      } catch { return false; }
    }));
    passed += results.filter(Boolean).length;
  }
  return passed;
}

(async () => {
  const total = FRESH.length * RUNS;
  const [before, after] = [await score(original), await score(evolved)];
  const result = { tests: FRESH.length, runs: RUNS, total, original: before, evolved: after, ranAt: new Date().toISOString() };
  writeFileSync("fresh-test-results.json", JSON.stringify(result, null, 2));
  console.log(`Fresh tests (${FRESH.length} cases x ${RUNS} runs): original ${before}/${total} -> evolved ${after}/${total}`);
})();

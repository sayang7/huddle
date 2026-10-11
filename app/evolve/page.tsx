import { readFile } from "node:fs/promises";
import path from "node:path";
import styles from "./evolve.module.css";

export const dynamic = "force-dynamic";

type Score = [number, number]; // [passed, total]

interface EvolveResults {
  agent: string;
  model?: string;
  ranAt?: string;
  candidatesPerRound: number;
  baseline: { train: Score; heldout: Score };
  rounds: { round: number; best: number; total: number; improved: boolean }[];
  final: { train: Score; heldout: Score };
  baselineInstructions?: string;
  bestInstructions?: string;
}

async function loadResults(): Promise<EvolveResults | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "evolve-results.json"), "utf8");
    return JSON.parse(raw) as EvolveResults;
  } catch {
    return null;
  }
}

const pct = ([p, t]: Score) => (t ? Math.round((p / t) * 100) : 0);

export default async function EvolvePage() {
  const r = await loadResults();

  if (!r) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Evolve</h1>
        <p className={styles.muted}>
          No evolve run yet. Run <code>npm run evolve -- Alex</code> and refresh.
        </p>
      </main>
    );
  }

  const steps = [
    { label: "Baseline", score: r.baseline.train, improved: false },
    ...r.rounds.map((x) => ({
      label: `Round ${x.round}`,
      score: [x.best, x.total] as Score,
      improved: x.improved,
    })),
  ];

  return (
    <main className={styles.page}>
      <header>
        <h1 className={styles.title}>Evolve · {r.agent}</h1>
        <p className={styles.muted}>
          {r.candidatesPerRound} rewritten prompts compete in parallel each round
          {r.model ? ` (${r.model} on Luminal)` : ""}. The best one is kept only if it
          scores higher on the train tests. Held-out tests are never shown to the
          optimizer.
        </p>
      </header>

      <section className={styles.tiles}>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Train tests</div>
          <div className={styles.tileValue}>
            {r.baseline.train[0]}/{r.baseline.train[1]}
            <span className={styles.arrow}>&rarr;</span>
            {r.final.train[0]}/{r.final.train[1]}
          </div>
        </div>
        <div className={`${styles.tile} ${styles.tileHero}`}>
          <div className={styles.tileLabel}>Held-out tests (never seen)</div>
          <div className={styles.tileValue}>
            {r.baseline.heldout[0]}/{r.baseline.heldout[1]}
            <span className={styles.arrow}>&rarr;</span>
            {r.final.heldout[0]}/{r.final.heldout[1]}
          </div>
          <div className={styles.muted}>
            {pct(r.baseline.heldout)}% &rarr; {pct(r.final.heldout)}%
          </div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Rounds run</div>
          <div className={styles.tileValue}>{r.rounds.length}</div>
        </div>
      </section>

      <section>
        <h2 className={styles.h2}>Train score per round</h2>
        <div className={styles.chart} role="img" aria-label="Train score per round">
          {steps.map((s) => (
            <div
              key={s.label}
              className={styles.col}
              title={`${s.label}: ${s.score[0]}/${s.score[1]} passed`}
            >
              <div className={styles.barValue}>{s.score[0]}</div>
              <div className={styles.barTrack}>
                <div className={styles.bar} style={{ height: `${pct(s.score)}%` }} />
              </div>
              <div className={styles.barLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        <table className={styles.table}>
          <thead>
            <tr><th>Step</th><th>Train passed</th><th>Change</th></tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{s.score[0]}/{s.score[1]}</td>
                <td>{s.label === "Baseline" ? "—" : s.improved ? "Improved, kept" : "No gain, kept previous"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(r.baselineInstructions || r.bestInstructions) && (
        <section className={styles.prompts}>
          {r.baselineInstructions && (
            <details>
              <summary>Baseline prompt</summary>
              <pre>{r.baselineInstructions}</pre>
            </details>
          )}
          {r.bestInstructions && (
            <details open>
              <summary>Evolved prompt (now live on the board)</summary>
              <pre>{r.bestInstructions}</pre>
            </details>
          )}
        </section>
      )}
    </main>
  );
}

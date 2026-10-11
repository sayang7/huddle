"use client";

import { useEffect, useRef, useState } from "react";

interface Card {
  _id: string;
  title: string;
  body: string;
  tag: string;
  author: string;
  status: string;
  claimedBy?: string;
  createdAt: string;
}

interface FeedItem {
  _id: string;
  text: string;
  at: string;
}

interface Agent {
  _id: string;
  name: string;
  emoji: string;
  instructions: string;
  trigger: Record<string, unknown>;
}

interface State {
  cards: Card[];
  feed: FeedItem[];
  agents: Agent[];
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function Home() {
  const [name, setName] = useState<string>("");
  const [state, setState] = useState<State>({ cards: [], feed: [], agents: [] });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("request");
  const [spawnDesc, setSpawnDesc] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stored = localStorage.getItem("huddle-name");
    if (!stored) {
      stored = prompt("Enter your name:") ?? "Anonymous";
      localStorage.setItem("huddle-name", stored);
    }
    setName(stored);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/state");
        if (res.ok) {
          const data = (await res.json()) as State;
          setState(data);
        }
      } catch {
        // network error — ignore
      }
    };
    poll();
    intervalRef.current = setInterval(poll, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const agentNames = new Set(state.agents.map((a) => a.name));
  const agentByName = new Map(state.agents.map((a) => [a.name, a]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !name.trim()) return;
    await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, tag, author: name }),
    });
    setTitle("");
    setBody("");
    setTag("request");
  }

  async function handleClaim(cardId: string) {
    if (!name) return;
    setClaiming(cardId);
    try {
      await fetch(`/api/cards/${cardId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimedBy: name }),
      });
    } finally {
      setClaiming(null);
    }
  }

  async function handleSpawn(e: React.FormEvent) {
    e.preventDefault();
    if (!spawnDesc.trim()) return;
    setSpawning(true);
    try {
      const res = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: spawnDesc }),
      });
      if (res.ok) setSpawnDesc("");
      else {
        const err = (await res.json()) as { error?: string };
        alert(err.error ?? "Failed to spawn agent");
      }
    } finally {
      setSpawning(false);
    }
  }

  return (
    <>
      <header className="header">
        <h1>Huddle</h1>
        <span className="header-sep">·</span>
        <span className="header-event">THON 2026</span>
        {name && <span className="username">— {name}</span>}
      </header>

      <div className="layout">
        <main className="main-col">
          <form className="add-form" onSubmit={handleSubmit}>
            <h2>New Card</h2>
            <input
              placeholder="Title  (e.g. Section 112 dancer needs water)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <textarea
              placeholder="Details (optional)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="form-row">
              <input
                placeholder="Tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <button type="submit" className="btn">
                Drop Card
              </button>
            </div>
          </form>

          <div className="card-grid">
            {state.cards.map((card) => {
              const isAgent = agentNames.has(card.author);
              const agent = isAgent ? agentByName.get(card.author) : undefined;
              const isWorking = card.status === "working";
              const isClaimed = card.status === "claimed";
              const canClaim = !isAgent && !isClaimed && !isWorking;
              const classes = [
                "card",
                isAgent ? "agent-card" : "",
                isWorking ? "working" : "",
                isClaimed ? "claimed" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div key={card._id} className={classes}>
                  <div className="card-title">
                    {agent && <span>{agent.emoji}</span>}
                    {card.title}
                  </div>
                  {card.body && (
                    <div className="card-body">{card.body}</div>
                  )}
                  <div className="card-meta">
                    {card.tag && (
                      <span
                        className={`tag${card.tag === "agent-output" ? " agent-output" : ""}`}
                      >
                        {card.tag}
                      </span>
                    )}
                    {isClaimed && card.claimedBy && (
                      <span className="claimed-badge">✓ {card.claimedBy}</span>
                    )}
                    <span className="card-author">
                      {isAgent && agent ? `${agent.emoji} ` : ""}
                      {card.author}
                    </span>
                    <span className="card-time">{timeAgo(card.createdAt)}</span>
                  </div>
                  {canClaim && (
                    <button
                      className="btn-claim"
                      disabled={claiming === card._id}
                      onClick={() => handleClaim(card._id)}
                    >
                      {claiming === card._id ? "Claiming…" : "Claim"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        <aside className="side-col">
          <div className="spawn-form-wrap">
            <div className="side-section-title">Spawn Agent</div>
            <form className="spawn-form" onSubmit={handleSpawn}>
              <input
                placeholder="Describe in one sentence…"
                value={spawnDesc}
                onChange={(e) => setSpawnDesc(e.target.value)}
                disabled={spawning}
              />
              <button type="submit" className="btn btn-sm" disabled={spawning}>
                {spawning ? "Creating…" : "Spawn"}
              </button>
            </form>
          </div>

          <div className="agents-section">
            <div className="side-section-title">Active Agents</div>
            {state.agents.map((agent) => (
              <div key={agent._id} className="agent-item">
                <div className="agent-name">
                  {agent.emoji} {agent.name}
                </div>
                <div className="agent-trigger">
                  trigger: {JSON.stringify(agent.trigger)}
                </div>
              </div>
            ))}
          </div>

          <div className="feed-section">
            <div className="side-section-title">Live Feed</div>
            {state.feed.map((item) => (
              <div key={item._id} className="feed-item">
                {item.text}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

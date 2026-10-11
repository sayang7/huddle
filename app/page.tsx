"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

function parseUrgency(body: string): "critical" | "high" | "medium" | "low" | null {
  const m = body.match(/URGENCY:\s*(critical|high|medium|low)/i);
  return m ? (m[1].toLowerCase() as "critical" | "high" | "medium" | "low") : null;
}

function parseCategory(body: string): string | null {
  const m = body.match(/CATEGORY:\s*(\w+)/i);
  return m ? m[1].toLowerCase() : null;
}

function parseAction(body: string): string | null {
  const m = body.match(/ACTION:\s*(.+)/i);
  return m ? m[1].trim() : null;
}

function stripAgentPrefix(title: string): string {
  const idx = title.indexOf(": ");
  return idx !== -1 ? title.slice(idx + 2) : title;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// card animation variants
const cardVariants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

const feedVariants = {
  initial: { opacity: 0, x: 6 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.18 } },
};

export default function Home() {
  const [name, setName] = useState<string>("");
  const [nameInput, setNameInput] = useState("");
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [state, setState] = useState<State>({ cards: [], feed: [], agents: [] });
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("request");
  const [spawnDesc, setSpawnDesc] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("huddle-name");
    if (!stored) setShowNameEntry(true);
    else setName(stored);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/state");
        if (res.ok) setState((await res.json()) as State);
      } catch { /* ignore */ }
    };
    poll();
    intervalRef.current = setInterval(poll, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.cards.length]);

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem("huddle-name", n);
    setName(n);
    setShowNameEntry(false);
  }

  const agentNames = new Set(state.agents.map((a) => a.name));
  const agentByName = new Map(state.agents.map((a) => [a.name, a]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !name.trim()) return;
    await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body: "", tag, author: name }),
    });
    setTitle("");
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
      else alert(((await res.json()) as { error?: string }).error ?? "Spawn failed");
    } finally {
      setSpawning(false);
    }
  }

  // ── Name entry screen ──────────────────────────────
  if (showNameEntry) {
    return (
      <div className="name-overlay">
        <motion.form
          className="name-card"
          onSubmit={handleNameSubmit}
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="name-logo">HUDDLE</div>
          <div className="name-subtitle">Floor Command</div>
          <div className="name-sub2">THON 2026 · 46 hours</div>
          <input
            className="name-input"
            placeholder="Your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
          />
          <motion.button
            type="submit"
            className="btn name-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Join the floor
          </motion.button>
        </motion.form>
      </div>
    );
  }

  const sortedCards = [...state.cards].reverse();

  return (
    <>
      {/* ── Header ── */}
      <header className="header">
        <span className="header-wordmark">Huddle</span>
        <span className="header-sep">·</span>
        <span className="header-event">THON 2026</span>
        <div className="header-pills">
          <AnimatePresence>
            {state.agents.map((a) => (
              <motion.span
                key={a._id}
                className="agent-pill"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                {a.emoji} {a.name}
                <span className="pill-live" />
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        {name && <span className="header-username">{name}</span>}
      </header>

      <div className="layout">
        {/* ── Left sidebar: teammates ── */}
        <aside className="left-col">
          <div>
            <div className="section-label">On the floor</div>
            <AnimatePresence>
              {state.agents.map((agent) => (
                <motion.div
                  key={agent._id}
                  className="agent-card-sm"
                  style={{ marginBottom: 8 }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                >
                  <div className="agent-card-sm-header">
                    <span style={{ fontSize: "1rem" }}>{agent.emoji}</span>
                    <span className="agent-card-sm-name">{agent.name}</span>
                    <span className="agent-live-badge">
                      <span className="agent-live-dot" /> live
                    </span>
                  </div>
                  <div className="agent-card-sm-trigger">
                    reacts to: {String(agent.trigger["fullDocument.tag"] ?? "all cards")}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div>
            <div className="section-label">Add teammate</div>
            <form className="spawn-form" onSubmit={handleSpawn}>
              <textarea
                className="spawn-input"
                rows={3}
                placeholder="e.g. Flag anything mentioning heat or exhaustion"
                value={spawnDesc}
                onChange={(e) => setSpawnDesc(e.target.value)}
                disabled={spawning}
              />
              <motion.button
                type="submit"
                className="btn btn-sm"
                disabled={spawning}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {spawning ? "Creating…" : "Add"}
              </motion.button>
            </form>
          </div>
        </aside>

        {/* ── Center: floor feed ── */}
        <main className="chat-col">
          <div className="chat-feed">
            <AnimatePresence initial={false}>
              {sortedCards.map((card) => {
                const isAgent = agentNames.has(card.author);
                const agent = isAgent ? agentByName.get(card.author) : undefined;
                const isWorking = card.status === "working";
                const isClaimed = card.status === "claimed";
                const canClaim = !isAgent && !isClaimed && !isWorking;

                const urgency = isAgent ? parseUrgency(card.body) : null;
                const category = isAgent ? parseCategory(card.body) : null;
                const action = isAgent ? parseAction(card.body) : null;
                const displayTitle = isAgent ? stripAgentPrefix(card.title) : card.title;

                const cardClass = [
                  "floor-card",
                  isAgent ? "card-agent" : "",
                  isClaimed ? "card-claimed" : "",
                  isWorking ? "card-working" : "",
                  urgency ? `u-${urgency}` : (!isAgent ? "u-default" : ""),
                ].filter(Boolean).join(" ");

                return (
                  <motion.div
                    key={card._id}
                    className={cardClass}
                    variants={cardVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    layout
                  >
                    {/* header row */}
                    <div className="card-header">
                      {isAgent && agent ? (
                        <div className="card-avatar av-agent">{agent.emoji}</div>
                      ) : (
                        <div className="card-avatar">{initials(card.author)}</div>
                      )}
                      <span className={`card-author${isAgent ? " is-agent" : ""}`}>
                        {card.author}
                      </span>
                      <div className="card-badges">
                        {!isAgent && card.tag && (
                          <span className="badge badge-tag">{card.tag}</span>
                        )}
                        {urgency && (
                          <span className={`badge badge-${urgency}`}>{urgency.toUpperCase()}</span>
                        )}
                        {category && (
                          <span className="badge badge-category">{category}</span>
                        )}
                      </div>
                      <span className="card-time">{timeAgo(card.createdAt)}</span>
                    </div>

                    {/* title */}
                    <div className="card-title">{displayTitle}</div>

                    {/* body */}
                    {isAgent && action ? (
                      <div className="card-action">{action}</div>
                    ) : card.body ? (
                      <div className="card-body-text">{card.body}</div>
                    ) : null}

                    {/* triaging animation */}
                    {isWorking && !isAgent && (
                      <div className="triaging-indicator">
                        <span className="triaging-dots">
                          <span /><span /><span />
                        </span>
                        Dispatcher is triaging
                      </div>
                    )}

                    {/* footer */}
                    {(canClaim || isClaimed) && (
                      <div className="card-footer">
                        {isClaimed && card.claimedBy && (
                          <motion.span
                            className="badge badge-claimed"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                          >
                            ✓ {card.claimedBy} is on it
                          </motion.span>
                        )}
                        {canClaim && (
                          <motion.button
                            className="btn-claim"
                            disabled={claiming === card._id}
                            onClick={() => handleClaim(card._id)}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {claiming === card._id ? "…" : "I'm on it"}
                          </motion.button>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>

          {/* input bar */}
          <form className="chat-input-bar" onSubmit={handleSubmit}>
            <select
              className="tag-select"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="request">request</option>
              <option value="medical">medical</option>
              <option value="supplies">supplies</option>
              <option value="logistics">logistics</option>
              <option value="morale">morale</option>
              <option value="security">security</option>
              <option value="note">note</option>
            </select>
            <input
              className="chat-text-input"
              placeholder="What's happening on the floor?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <motion.button
              type="submit"
              className="btn"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
            >
              Call it in
            </motion.button>
          </form>
        </main>

        {/* ── Right sidebar: activity ── */}
        <aside className="right-col">
          <div className="section-label">Activity</div>
          <AnimatePresence initial={false}>
            {state.feed.map((item) => (
              <motion.div
                key={item._id}
                className="feed-row"
                variants={feedVariants}
                initial="initial"
                animate="animate"
              >
                {item.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </aside>
      </div>
    </>
  );
}

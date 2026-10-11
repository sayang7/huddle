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

// Deterministic avatar color from name
const COLORS = ["#7c65f6","#e8445a","#2bac76","#e87722","#3b82f6","#ec4899","#10b981","#f59e0b"];
function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[h % COLORS.length];
}
function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Detect urgency keywords in text for subtle tinting
function urgencyClass(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("critical") || t.includes("unresponsive") || t.includes("collapsed")) return "urg-critical";
  if (t.includes("urgent") || t.includes("now") || t.includes("immediately") || t.includes("asap")) return "urg-high";
  if (t.includes("warning") || t.includes("getting bad")) return "urg-medium";
  return "";
}

export default function Home() {
  const [myName, setMyName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showEntry, setShowEntry] = useState(false);
  const [state, setState] = useState<State>({ cards: [], feed: [], agents: [] });
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("request");
  const [spawnDesc, setSpawnDesc] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("huddle-name");
    if (!stored) setShowEntry(true);
    else setMyName(stored);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/state");
        if (res.ok) setState((await res.json()) as State);
      } catch { /* ignore */ }
    };
    poll();
    pollRef.current = setInterval(poll, 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.cards.length]);

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem("huddle-name", n);
    setMyName(n);
    setShowEntry(false);
  }

  const agentNames = new Set(state.agents.map(a => a.name));

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !myName) return;
    await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body: "", tag, author: myName }),
    });
    setTitle("");
    setTag("request");
  }

  async function claim(cardId: string) {
    if (!myName) return;
    setClaiming(cardId);
    try {
      await fetch(`/api/cards/${cardId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimedBy: myName }),
      });
    } finally { setClaiming(null); }
  }

  async function spawnAgent(e: React.FormEvent) {
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
      else alert(((await res.json()) as { error?: string }).error ?? "Failed");
    } finally { setSpawning(false); }
  }

  // ── Name entry ──────────────────────────────────────────
  if (showEntry) {
    return (
      <div className="name-overlay">
        <motion.form
          className="name-card"
          onSubmit={submitName}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="name-logo">huddle<span>.</span></div>
          <div className="name-sub">THON 2026 · Floor Command · 46 hours</div>
          <input
            className="name-input"
            placeholder="Your name"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
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

  // ── Build message groups ────────────────────────────────
  // State returns newest-first; reverse for oldest-first display
  const cards = [...state.cards].reverse();

  // Build unique authors for sidebar (from cards)
  const humanAuthors = Array.from(
    new Set(cards.filter(c => !agentNames.has(c.author) && c.author !== "system").map(c => c.author))
  );

  // Working card IDs (agent is processing)
  const workingCards = cards.filter(c => c.status === "working" && !agentNames.has(c.author));

  return (
    <div className="app-shell">
      {/* ── Left sidebar ── */}
      <aside className="sidebar-left">
        <div className="workspace-header">
          <div className="workspace-name">
            <span className="dot" />
            huddle.
          </div>
          <div className="workspace-subtitle">THON 2026 · Floor Command</div>
        </div>

        <div className="sidebar-scroll">
          {/* AI teammates */}
          <div className="sidebar-section-label">AI Teammates</div>
          <AnimatePresence>
            {state.agents.map(agent => (
              <motion.div
                key={agent._id}
                className="person-row is-agent"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
              >
                <div className="person-avatar" style={{ background: avatarColor(agent.name), borderRadius: 6 }}>
                  {initials(agent.name)}
                </div>
                <span className="person-name">{agent.name}</span>
                <span className="ai-badge">AI</span>
                <span className="online-dot" />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Human captains */}
          {humanAuthors.length > 0 && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 12 }}>Captains</div>
              {humanAuthors.map(name => (
                <div key={name} className="person-row">
                  <div className="person-avatar" style={{ background: avatarColor(name) }}>
                    {initials(name)}
                  </div>
                  <span className="person-name">{name}</span>
                  <span className="online-dot" />
                </div>
              ))}
            </>
          )}

          {/* Spawn new agent */}
          <div className="spawn-section" style={{ marginTop: 16 }}>
            <div className="spawn-label">Add AI Teammate</div>
            <form className="spawn-form" onSubmit={spawnAgent}>
              <textarea
                className="spawn-input"
                rows={3}
                placeholder="e.g. Flag anything mentioning heat exhaustion"
                value={spawnDesc}
                onChange={e => setSpawnDesc(e.target.value)}
                disabled={spawning}
              />
              <motion.button
                type="submit"
                className="btn btn-sm"
                disabled={spawning}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {spawning ? "Creating…" : "Add teammate"}
              </motion.button>
            </form>
          </div>
        </div>
      </aside>

      {/* ── Main chat ── */}
      <div className="chat-area">
        <div className="chat-header">
          <span className="chat-header-hash">#</span>
          <span className="chat-header-name">floor</span>
          <span className="chat-header-desc">— every request gets a response</span>
        </div>

        <div className="msg-feed">
          <div className="date-divider">
            <span className="date-label">THON 2026 · Today</span>
          </div>

          <AnimatePresence initial={false}>
            {cards.map((card, i) => {
              const isAgent = agentNames.has(card.author);
              const isSystem = card.author === "system";
              const isClaimed = card.status === "claimed";
              const isWorking = card.status === "working";
              const canClaim = !isAgent && !isSystem && !isClaimed && !isWorking;

              const prev = i > 0 ? cards[i - 1] : null;
              const sameAuthor = prev?.author === card.author &&
                (new Date(card.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60 * 1000;

              const urgClass = isAgent ? urgencyClass(card.title) : "";

              if (isSystem) {
                return (
                  <motion.div
                    key={card._id}
                    className="sys-msg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {card.title}
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={card._id}
                  className={`msg-group ${sameAuthor ? "continued" : ""} ${urgClass}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  layout
                >
                  {sameAuthor && (
                    <span className="msg-side-time">{timeLabel(card.createdAt)}</span>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <div
                      className="msg-avatar"
                      style={{ background: avatarColor(card.author) }}
                    >
                      {initials(card.author)}
                    </div>
                    <div className="msg-content-col">
                      {!sameAuthor && (
                        <div className="msg-author-row">
                          <span className="msg-author">{card.author}</span>
                          {isAgent && <span className="ai-badge">AI</span>}
                          <span className="msg-time">{timeLabel(card.createdAt)}</span>
                        </div>
                      )}
                      <div className="msg-text">{card.title}</div>
                      <div className="msg-footer">
                        {!isAgent && !isSystem && card.tag && (
                          <span className="msg-tag">{card.tag}</span>
                        )}
                        {isClaimed && card.claimedBy && (
                          <motion.span
                            className="claimed-line"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            ✓ {card.claimedBy} is on it
                          </motion.span>
                        )}
                        {canClaim && (
                          <motion.button
                            className="btn-claim"
                            disabled={claiming === card._id}
                            onClick={() => claim(card._id)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.94 }}
                          >
                            {claiming === card._id ? "…" : "I'm on it"}
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing indicator when agent is processing */}
          <AnimatePresence>
            {workingCards.length > 0 && state.agents.length > 0 && (
              <motion.div
                className="typing-row"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
              >
                <div
                  className="typing-avatar"
                  style={{ background: avatarColor(state.agents[0].name) }}
                >
                  {initials(state.agents[0].name)}
                </div>
                <div className="typing-bubble">
                  <span /><span /><span />
                </div>
                <span className="typing-label">{state.agents[0].name} is responding…</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={feedEndRef} />
        </div>

        {/* Compose bar */}
        <form className="compose-bar" onSubmit={submitCard}>
          <div className="compose-top">
            <input
              className="compose-input"
              placeholder={`What's happening on the floor, ${myName}?`}
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
            <motion.button
              type="submit"
              className="compose-send"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
            >
              ↑
            </motion.button>
          </div>
          <div className="compose-toolbar">
            {["request","medical","supplies","logistics","morale","security","note"].map(t => (
              <button
                key={t}
                type="button"
                className={`compose-tag-btn${tag === t ? " active" : ""}`}
                onClick={() => setTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* ── Right sidebar: activity ── */}
      <aside className="sidebar-right">
        <div className="sidebar-section-label">Activity</div>
        <AnimatePresence initial={false}>
          {state.feed.map(item => (
            <motion.div
              key={item._id}
              className="activity-row"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
            >
              {item.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </aside>
    </div>
  );
}

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

interface Dancer {
  _id: string;
  name: string;
  block: string;
  section: string;
  status: "active" | "available" | "out";
  phone?: string;
}

interface Notification {
  _id: string;
  to: string;
  phone: string | null;
  message: string;
  agentName: string;
  at: string;
}

interface CalEvent {
  _id: string;
  title: string;
  time: string;
  createdBy: string;
}

interface State {
  cards: Card[];
  feed: FeedItem[];
  agents: Agent[];
  dancers: Dancer[];
  notifications: Notification[];
  events: CalEvent[];
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

// ── SVG icon for AI agents (role-based, no emoji) ───────────────
function AgentIcon({ name, size = 18 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  // Medical
  if (n.includes("med") || n.includes("health"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="10" y="3" width="4" height="18" rx="2" fill="currentColor"/><rect x="3" y="10" width="18" height="4" rx="2" fill="currentColor"/></svg>;
  // Security
  if (n.includes("sec") || n.includes("guard") || n.includes("safe"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5 3.5 9.3 8 10.4C16.5 21.3 20 17 20 12V6L12 2z" fill="currentColor" fillOpacity=".9"/></svg>;
  // Supplies/logistics
  if (n.includes("suppl") || n.includes("box") || n.includes("stock"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" stroke="currentColor" strokeWidth="1.8" fill="none"/><path d="M3 8l9 5 9-5M12 13v8" stroke="currentColor" strokeWidth="1.8"/></svg>;
  // Morale/energy/hype
  if (n.includes("hype") || n.includes("morale") || n.includes("energy"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H13L13 2z" fill="currentColor"/></svg>;
  // Swap/substitute
  if (n.includes("swap") || n.includes("sub") || n.includes("replac"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M7 4l-4 4 4 4M17 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M3 8h18M3 16h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M7 20l-4-4 4-4M17 20l4-4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  // Floor/logistics
  if (n.includes("floor") || n.includes("logist") || n.includes("map"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="10" r="3" fill="currentColor"/><path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7z" stroke="currentColor" strokeWidth="1.8" fill="none"/></svg>;
  // Alex / command
  if (n.includes("alex") || n.includes("command") || n.includes("captain"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" fill="currentColor"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/><path d="M18 4c1.5 1 2.5 2.7 2.5 4.5 0 1.5-.6 2.9-1.5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/><path d="M6 4C4.5 5 3.5 6.7 3.5 8.5c0 1.5.6 2.9 1.5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/></svg>;
  // Default bot
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="5" y="8" width="14" height="10" rx="3" fill="currentColor" fillOpacity=".9"/><circle cx="9" cy="13" r="1.5" fill="white" fillOpacity=".9"/><circle cx="15" cy="13" r="1.5" fill="white" fillOpacity=".9"/><path d="M9 18v2M15 18v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="10" y="4" width="4" height="4" rx="1" fill="currentColor" fillOpacity=".7"/><path d="M12 4V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}

// THON ribbon SVG icon
function ThonRibbon() {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      {/* Loop top-left */}
      <path d="M11 13 C11 13 2 9 2 4.5 C2 2 4 0.5 6.5 0.5 C9 0.5 11 2.5 11 5" stroke="#1E407C" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      {/* Loop top-right */}
      <path d="M11 13 C11 13 20 9 20 4.5 C20 2 18 0.5 15.5 0.5 C13 0.5 11 2.5 11 5" stroke="#1E407C" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      {/* Left tail */}
      <path d="M11 13 L7 22 L5 25" stroke="#1E407C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Right tail */}
      <path d="M11 13 L15 22 L17 25" stroke="#1E407C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Center knot fill */}
      <circle cx="11" cy="13" r="2.5" fill="#1E407C"/>
    </svg>
  );
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
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<State>({ cards: [], feed: [], agents: [], dancers: [], notifications: [], events: [] });
  const [showCalForm, setShowCalForm] = useState(false);
  const [calTitle, setCalTitle] = useState("");
  const [calTime, setCalTime] = useState("");
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("request");
  const [spawnDesc, setSpawnDesc] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState("");
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
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    poll();
    pollRef.current = setInterval(poll, 1000);
    // Safety: never hang on splash longer than 3s
    const t = setTimeout(() => setLoading(false), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); clearTimeout(t); };
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
    // @mention → force request tag
    const mentionedAgent = state.agents.find(a =>
      title.toLowerCase().includes(`@${a.name.toLowerCase()}`)
    );
    const effectiveTag = mentionedAgent ? "request" : tag;
    await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body: "", tag: effectiveTag, author: myName }),
    });
    // If tagged as schedule, also create a calendar event
    if (effectiveTag === "schedule") {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, time: new Date().toISOString(), createdBy: myName }),
      });
    }
    setTitle("");
    setTag("request");
  }

  async function addCalendarEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!calTitle.trim()) return;
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: calTitle, time: calTime || new Date().toISOString(), createdBy: myName }),
    });
    setCalTitle("");
    setCalTime("");
    setShowCalForm(false);
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
    setSpawnError("");
    try {
      const res = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: spawnDesc }),
      });
      if (res.ok) { setSpawnDesc(""); }
      else { const j = await res.json() as { error?: string }; setSpawnError(j.error ?? "Failed"); }
    } catch { setSpawnError("Network error"); }
    finally { setSpawning(false); }
  }

  // ── Loading splash ──────────────────────────────────────
  if (loading) {
    return (
      <div className="name-overlay">
        <motion.div
          className="splash-inner"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="splash-logo">huddle<span>.</span></div>
          <div className="splash-sub">THON 2026 · Floor Command</div>
          <div className="splash-dots">
            <span /><span /><span />
          </div>
        </motion.div>
      </div>
    );
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

  // Cards currently being processed by an agent
  const workingCards = cards.filter(c => c.status === "working" && !agentNames.has(c.author));
  // Which agents are actively processing right now
  const busyAgents = state.agents.filter(a =>
    workingCards.some(() => true) // any working card = show first available agent typing
  );

  // Substitution cards
  const subCards = cards.filter(c => c.tag === "substitute");

  // Open critical/hazard cards (unclaimed, high urgency)
  const hazardCards = cards.filter(c =>
    !agentNames.has(c.author) && c.author !== "system" &&
    c.status !== "claimed" && urgencyClass(c.title) === "urg-critical"
  );

  // Dancer roster grouped by block
  const rosterByBlock = ["A", "B", "C", "D"].map(block => ({
    block,
    active: state.dancers.filter(d => d.block === block && d.status === "active"),
    available: state.dancers.filter(d => d.block === block && d.status === "available"),
    out: state.dancers.filter(d => d.block === block && d.status === "out"),
  }));

  return (
    <div className="app-shell">
      {/* ── Left sidebar ── */}
      <aside className="sidebar-left">
        <div className="workspace-header">
          <div className="workspace-name">
            <ThonRibbon />
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
                <div className="person-avatar agent-avatar" style={{ background: avatarColor(agent.name) }}>
                  <AgentIcon name={agent.name} size={15} />
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
              {spawnError && <div className="spawn-error">{spawnError}</div>}
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

        <AnimatePresence>
          {hazardCards.length > 0 && (
            <motion.div
              className="hazard-banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <span className="hazard-dot" />
              <span>{hazardCards.length} critical situation{hazardCards.length > 1 ? "s" : ""} open — needs a captain</span>
            </motion.div>
          )}
        </AnimatePresence>

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
                      className={`msg-avatar${isAgent ? " agent-avatar" : ""}`}
                      style={{ background: avatarColor(card.author) }}
                    >
                      {isAgent ? <AgentIcon name={card.author} size={17} /> : initials(card.author)}
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
                          <span className="msg-tag" data-tag={card.tag}>{card.tag}</span>
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

          {/* Typing indicator — shown for each actively-processing agent */}
          <AnimatePresence>
            {busyAgents.map(agent => (
              <motion.div
                key={`typing-${agent._id}`}
                className="typing-row"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2 }}
              >
                <div className="typing-avatar agent-avatar" style={{ background: avatarColor(agent.name) }}>
                  <AgentIcon name={agent.name} size={15} />
                </div>
                <div className="typing-bubble">
                  <span /><span /><span />
                </div>
                <span className="typing-label">{agent.name} is on it…</span>
              </motion.div>
            ))}
          </AnimatePresence>

          <div ref={feedEndRef} />
        </div>

        {/* Compose bar */}
        <form className="compose-bar" onSubmit={submitCard}>
          <div className="compose-top">
            <input
              className="compose-input"
              placeholder={`Message the floor, ${myName}… try @Alex, or pick a tag below`}
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
            {["request","medical","substitute","supplies","logistics","morale","security","schedule"].map(t => (
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

      {/* ── Right sidebar: roster + notifications + activity ── */}
      <aside className="sidebar-right">

        {/* Floor Roster */}
        <div className="sidebar-section-label">Floor Roster</div>
        {state.dancers.length === 0 ? (
          <div className="sub-empty">Loading roster…</div>
        ) : (
          rosterByBlock.map(({ block, active, available, out }) => (
            <div key={block} className="roster-block">
              <div className="roster-block-header">
                <span className="roster-block-name">Block {block}</span>
                <span className="roster-counts">
                  <span className="roster-active">{active.length}</span>
                  <span className="roster-sep">/</span>
                  <span className="roster-avail">{available.length} backup</span>
                  {out.length > 0 && <span className="roster-out">{out.length} out</span>}
                </span>
              </div>
              <AnimatePresence>
                {out.map(d => (
                  <motion.div key={d._id} className="roster-dancer out"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <span className="roster-status-dot out" />
                    <span className="roster-name">{d.name}</span>
                    <span className="roster-section">§{d.section}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))
        )}

        {/* Recent notifications from agents */}
        {state.notifications.length > 0 && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: 14 }}>Notifications Sent</div>
            <AnimatePresence initial={false}>
              {state.notifications.map(n => (
                <motion.div key={n._id} className="notif-row"
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                  <span className="notif-icon">📱</span>
                  <div className="notif-body">
                    <div className="notif-to">{n.to}{n.phone ? ` · ${n.phone}` : ""}</div>
                    <div className="notif-msg">{n.message}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </>
        )}

        {/* Substitutions */}
        {subCards.length > 0 && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: 14 }}>Swaps</div>
            {subCards.map(c => (
              <div key={c._id} className="sub-row">
                <span className="sub-icon">⇄</span>
                <span className="sub-text">{c.title}</span>
                {c.claimedBy && <span className="sub-claimed">✓ {c.claimedBy}</span>}
              </div>
            ))}
          </>
        )}

        {/* Schedule / Calendar */}
        <div className="sidebar-section-label" style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Schedule</span>
          <button className="cal-add-btn" onClick={() => setShowCalForm(v => !v)}>+</button>
        </div>
        <AnimatePresence>
          {showCalForm && (
            <motion.form
              className="cal-form"
              onSubmit={addCalendarEvent}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <input
                className="cal-input"
                placeholder="Event title"
                value={calTitle}
                onChange={e => setCalTitle(e.target.value)}
                required
              />
              <input
                className="cal-input"
                type="datetime-local"
                value={calTime}
                onChange={e => setCalTime(e.target.value)}
              />
              <button type="submit" className="btn btn-sm" style={{ width: "100%" }}>Add to schedule</button>
            </motion.form>
          )}
        </AnimatePresence>
        {state.events.length === 0 ? (
          <div className="sub-empty">No events yet — post with #schedule or use +</div>
        ) : (
          <AnimatePresence initial={false}>
            {state.events.map(ev => (
              <motion.div key={ev._id} className="cal-event-row"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                <div className="cal-event-time">
                  {new Date(ev.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="cal-event-title">{ev.title}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Activity feed */}
        <div className="sidebar-section-label" style={{ marginTop: 14 }}>Activity</div>
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

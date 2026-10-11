"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sounds } from "./lib/sounds";

// ─── Types ───────────────────────────────────────────────────
interface Card { _id: string; title: string; body: string; tag: string; author: string; status: string; claimedBy?: string; createdAt: string; }
interface FeedItem { _id: string; text: string; at: string; }
interface Agent { _id: string; name: string; emoji: string; instructions: string; trigger: Record<string, unknown>; }
interface Dancer { _id: string; name: string; block: string; section: string; status: "active" | "available" | "out"; phone?: string; }
interface Notification { _id: string; to: string; phone: string | null; message: string; agentName: string; at: string; }
interface CalEvent { _id: string; title: string; time: string; createdBy: string; }
interface PendingAction { _id: string; type: string; agentName: string; description: string; to: string; phone: string | null; message: string; status: "pending"; createdAt: string; }
interface Contact { _id: string; name: string; role: string; phone: string; location: string; }
interface ItineraryItem { _id: string; title: string; description: string; type: string; time: string; offsetHours: number; }
interface ChatMsg { _id: string; author: string; text: string; at: string; isSystem?: boolean; }
interface State {
  cards: Card[]; feed: FeedItem[]; agents: Agent[]; dancers: Dancer[];
  notifications: Notification[]; events: CalEvent[]; pendingActions: PendingAction[];
  contacts: Contact[]; itinerary: ItineraryItem[]; chat: ChatMsg[];
}

// ─── Helpers ─────────────────────────────────────────────────
const AGENT_COLORS: Record<string,string> = { alex:"#6366f1", medical:"#ef4444", roster:"#f59e0b", security:"#f97316", supplies:"#10b981", ops:"#3b82f6", hype:"#ec4899" };
const PALETTE = ["#6366f1","#ef4444","#f59e0b","#f97316","#10b981","#3b82f6","#ec4899","#8b5cf6","#06b6d4","#84cc16"];
function avatarColor(s: string) { const key = s.toLowerCase().split(" ")[0]; if (AGENT_COLORS[key]) return AGENT_COLORS[key]; let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))&0x7fffffff; return PALETTE[h%PALETTE.length]; }
function initials(s: string) { return s.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function timeFmt(iso: string) { return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }

const SP  = { type:"spring" as const, stiffness:440, damping:32 };
const SPF = { type:"spring" as const, stiffness:300, damping:26 };

// ─── Icons ───────────────────────────────────────────────────
function AgentIcon({ name, size=18 }: { name:string; size?:number }) {
  const n = name.toLowerCase();
  if (n.includes("med"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="10" y="3" width="4" height="18" rx="2" fill="currentColor"/><rect x="3" y="10" width="18" height="4" rx="2" fill="currentColor"/></svg>;
  if (n.includes("sec") || n.includes("guard"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5 3.5 9.3 8 10.4C16.5 21.3 20 17 20 12V6L12 2z" fill="currentColor"/></svg>;
  if (n.includes("suppl"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" stroke="currentColor" strokeWidth="1.8" fill="none"/><path d="M3 8l9 5 9-5M12 13v8" stroke="currentColor" strokeWidth="1.8"/></svg>;
  if (n.includes("hype") || n.includes("morale"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H13L13 2z" fill="currentColor"/></svg>;
  if (n.includes("roster") || n.includes("swap"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M7 4l-4 4 4 4M17 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M3 8h18M3 16h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M7 20l-4-4 4-4M17 20l4-4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  if (n.includes("ops") || n.includes("logist"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>;
  if (n.includes("alex") || n.includes("command"))
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" fill="currentColor"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/><path d="M18 4c1.5 1 2.5 2.7 2.5 4.5 0 1.5-.6 2.9-1.5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/><path d="M6 4C4.5 5 3.5 6.7 3.5 8.5c0 1.5.6 2.9 1.5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="5" y="8" width="14" height="10" rx="3" fill="currentColor" fillOpacity=".9"/><circle cx="9" cy="13" r="1.5" fill="white" fillOpacity=".9"/><circle cx="15" cy="13" r="1.5" fill="white" fillOpacity=".9"/><path d="M9 18v2M15 18v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="10" y="4" width="4" height="4" rx="1" fill="currentColor" fillOpacity=".7"/></svg>;
}

function ThonRibbon({ size=22 }: { size?: number }) {
  const s = size / 22;
  return (
    <svg width={size} height={size*26/22} viewBox="0 0 22 26" fill="none" style={{ flexShrink:0 }}>
      <path d="M11 13 C11 13 2 9 2 4.5 C2 2 4 0.5 6.5 0.5 C9 0.5 11 2.5 11 5" stroke="#1E407C" strokeWidth={2.5*s} strokeLinecap="round" fill="none"/>
      <path d="M11 13 C11 13 20 9 20 4.5 C20 2 18 0.5 15.5 0.5 C13 0.5 11 2.5 11 5" stroke="#1E407C" strokeWidth={2.5*s} strokeLinecap="round" fill="none"/>
      <path d="M11 13 L7 22 L5 25" stroke="#1E407C" strokeWidth={2.5*s} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M11 13 L15 22 L17 25" stroke="#1E407C" strokeWidth={2.5*s} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="11" cy="13" r="2.5" fill="#1E407C"/>
    </svg>
  );
}

function urgClass(text: string) {
  const t = text.toLowerCase();
  if (t.includes("critical")||t.includes("unresponsive")||t.includes("collapsed")||t.includes("throat")) return "urg-critical";
  if (t.includes("urgent")||t.includes("exhausted")||t.includes("allergic")) return "urg-high";
  if (t.includes("warning")||t.includes("dropping")) return "urg-medium";
  return "";
}

// ─── Dance Floor Arena ───────────────────────────────────────
const SECTIONS: Record<string, string[]> = {
  A: ["112","115","120","125"],
  B: ["204","208","213","218"],
  C: ["301","306","311","316"],
  D: ["401","407","412","418"],
};

function DanceFloor({ dancers }: { dancers: Dancer[] }) {
  const stat = (sec: string) => ({
    active:    dancers.filter(d=>d.section===sec&&d.status==="active").length,
    available: dancers.filter(d=>d.section===sec&&d.status==="available").length,
    out:       dancers.filter(d=>d.section===sec&&d.status==="out").length,
  });
  const totalActive = dancers.filter(d=>d.status==="active").length;
  const totalOut    = dancers.filter(d=>d.status==="out").length;

  function Tile({ sec }: { sec: string }) {
    const s = stat(sec);
    const state = s.out>0 ? "out" : s.active>0 ? "on" : "off";
    return (
      <motion.div
        className={`ft ft--${state}`}
        whileHover={{ scale:1.12, zIndex:2 }}
        transition={SP}
        title={`§${sec}: ${s.active} active, ${s.available} backup${s.out?`, ${s.out} out`:""}`}
      >
        <span className="ft-num">{sec}</span>
        <motion.span
          className="ft-count"
          key={s.active}
          initial={{ scale:1.4, opacity:0 }}
          animate={{ scale:1, opacity:1 }}
          transition={SP}
        >
          {s.active}
        </motion.span>
        {s.out>0 && <span className="ft-out-dot" />}
      </motion.div>
    );
  }

  return (
    <div className="floor-wrap">
      <div className="floor-legend">
        <span className="floor-legend-item floor-legend-on">active</span>
        <span className="floor-legend-item floor-legend-out">subbed</span>
        <span className="floor-legend-item floor-legend-off">standby</span>
      </div>
      <div className="floor-arena">
        {/* Block A — top rail */}
        <div className="floor-rail floor-rail--top">
          <span className="floor-blk-tag">A</span>
          {SECTIONS.A.map(s=><Tile key={s} sec={s}/>)}
        </div>

        {/* Middle row */}
        <div className="floor-mid">
          <div className="floor-col">
            <span className="floor-blk-tag floor-blk-tag--v">B</span>
            {SECTIONS.B.map(s=><Tile key={s} sec={s}/>)}
          </div>

          <div className="floor-court">
            <div className="floor-court-inner">
              <div className="floor-court-logo">
                <ThonRibbon size={28} />
                <span className="floor-court-name">THON<span>.</span></span>
                <span className="floor-court-year">2026</span>
              </div>
              <div className="floor-court-stats">
                <motion.span key={totalActive} className="floor-stat-num" initial={{scale:1.3,opacity:0}} animate={{scale:1,opacity:1}} transition={SP}>
                  {totalActive}
                </motion.span>
                <span className="floor-stat-label"> on the floor</span>
              </div>
              {totalOut>0 && (
                <motion.div className="floor-court-alert" initial={{opacity:0}} animate={{opacity:1}}>
                  {totalOut} subbed out
                </motion.div>
              )}
              <div className="floor-court-ring" />
              <div className="floor-court-ring floor-court-ring--2" />
            </div>
          </div>

          <div className="floor-col floor-col--right">
            {SECTIONS.D.map(s=><Tile key={s} sec={s}/>)}
            <span className="floor-blk-tag floor-blk-tag--v">D</span>
          </div>
        </div>

        {/* Block C — bottom rail */}
        <div className="floor-rail floor-rail--bottom">
          <span className="floor-blk-tag">C</span>
          {SECTIONS.C.map(s=><Tile key={s} sec={s}/>)}
        </div>
      </div>
    </div>
  );
}

// ─── Floating Approval Cards ─────────────────────────────────
function ApprovalDock({
  actions, resolving, onResolve,
}: {
  actions: PendingAction[];
  resolving: string | null;
  onResolve: (id:string, d:"approved"|"dismissed") => void;
}) {
  return (
    <div className="approval-dock">
      <AnimatePresence>
        {actions.map((a) => (
          <motion.div
            key={a._id}
            className="approval-card"
            initial={{ opacity:0, x:60, scale:0.92 }}
            animate={{ opacity:1, x:0, scale:1 }}
            exit={{ opacity:0, x:60, scale:0.92 }}
            transition={SP}
            layout
          >
            <div className="approval-header">
              <div className="approval-agent-dot" style={{ background: avatarColor(a.agentName) }}>
                <AgentIcon name={a.agentName} size={10} />
              </div>
              <span className="approval-agent">{a.agentName}</span>
              <span className="approval-verb">wants to send</span>
            </div>
            <div className="approval-to">→ {a.to}{a.phone ? <span className="approval-phone"> {a.phone}</span> : null}</div>
            <div className="approval-msg">"{a.message}"</div>
            <div className="approval-btns">
              <motion.button
                className="approval-btn approval-btn--send"
                disabled={resolving===a._id}
                onClick={() => onResolve(a._id,"approved")}
                whileHover={{ scale:1.04 }} whileTap={{ scale:0.95 }}
              >
                {resolving===a._id ? "…" : "Send"}
              </motion.button>
              <motion.button
                className="approval-btn approval-btn--skip"
                disabled={resolving===a._id}
                onClick={() => onResolve(a._id,"dismissed")}
                whileHover={{ scale:1.04 }} whileTap={{ scale:0.95 }}
              >
                Skip
              </motion.button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────
export default function Home() {
  const [myName, setMyName]       = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showEntry, setShowEntry] = useState(false);
  const [editName, setEditName]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<"floor"|"chat"|"agents">("floor");
  const [activePanel, setActivePanel] = useState<"roster"|"contacts"|"schedule">("roster");

  const [state, setState] = useState<State>({
    cards:[], feed:[], agents:[], dancers:[],
    notifications:[], events:[], pendingActions:[],
    contacts:[], itinerary:[], chat:[],
  });

  const [title, setTitle]         = useState("");
  const [tag, setTag]             = useState("request");
  const [chatMsg, setChatMsg]     = useState("");
  const [spawnDesc, setSpawnDesc] = useState("");
  const [spawning, setSpawning]   = useState(false);
  const [spawnError, setSpawnError] = useState("");
  const [newAgent, setNewAgent]   = useState<string|null>(null);
  const [claiming, setClaiming]   = useState<string|null>(null);
  const [resolving, setResolving] = useState<string|null>(null);
  const [showCalForm, setShowCalForm] = useState(false);
  const [calTitle, setCalTitle]   = useState("");
  const [calTime, setCalTime]     = useState("");
  const [demoFiring, setDemoFiring] = useState(false);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const prevCardsLen   = useRef(0);
  const prevActionsLen = useRef(0);
  const prevHazardLen  = useRef(0);

  // ── Polling ────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("huddle-name");
    if (!stored) setShowEntry(true);
    else {
      setMyName(stored);
      fetch("/api/captains", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name: stored }),
      }).catch(()=>{});
    }
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) return;
        const data = await res.json() as State;

        // Sound triggers
        const cards = [...data.cards].reverse();
        if (prevCardsLen.current > 0 && data.cards.length > prevCardsLen.current) {
          const newest = cards[cards.length-1];
          if (newest) {
            if (new Set(data.agents.map(a=>a.name)).has(newest.author)) sounds.agentReply();
            else sounds.message();
          }
        }
        prevCardsLen.current = data.cards.length;

        if (prevActionsLen.current < data.pendingActions.length) sounds.alert();
        prevActionsLen.current = data.pendingActions.length;

        const hz = cards.filter(c=>
          !new Set(data.agents.map(a=>a.name)).has(c.author) &&
          c.author!=="system" && c.status!=="claimed" && urgClass(c.title)==="urg-critical"
        ).length;
        if (prevHazardLen.current < hz) sounds.alert();
        prevHazardLen.current = hz;

        setState(data);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 1000);
    const t  = setTimeout(() => setLoading(false), 3000);
    return () => { clearInterval(id); clearTimeout(t); };
  }, []);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [state.cards.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [state.chat.length]);

  // ── Actions ────────────────────────────────────────────────
  function submitName(e: React.FormEvent) {
    e.preventDefault();
    const n = nameInput.trim(); if (!n) return;
    localStorage.setItem("huddle-name", n);
    setMyName(n); setShowEntry(false); setEditName(false); setNameInput("");
    sounds.join();
    fetch("/api/captains", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ name: n }),
    }).catch(()=>{});
  }

  const agentNames = new Set(state.agents.map(a=>a.name));

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !myName) return;
    const mentionedAgent = state.agents.find(a=>title.toLowerCase().includes(`@${a.name.toLowerCase()}`));
    const eff = mentionedAgent ? "request" : tag;
    await fetch("/api/cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,body:"",tag:eff,author:myName})});
    if (eff==="schedule") {
      await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,time:new Date().toISOString(),createdBy:myName})});
    }
    sounds.message();
    setTitle(""); setTag("request");
  }

  async function submitChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatMsg.trim() || !myName) return;
    await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({author:myName,text:chatMsg.trim()})});
    sounds.message();
    setChatMsg("");
  }

  async function addCalEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!calTitle.trim()) return;
    await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:calTitle,time:calTime||new Date().toISOString(),createdBy:myName})});
    setCalTitle(""); setCalTime(""); setShowCalForm(false);
  }

  async function claim(id: string) {
    if (!myName) return;
    setClaiming(id);
    try { await fetch(`/api/cards/${id}/claim`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({claimedBy:myName})}); }
    finally { setClaiming(null); }
  }

  const resolveAction = useCallback(async (id:string, decision:"approved"|"dismissed") => {
    setResolving(id);
    try {
      await fetch("/api/actions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actionId:id,decision})});
      if (decision==="approved") sounds.approve(); else sounds.dismiss();
    } finally { setResolving(null); }
  }, []);

  async function spawnAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!spawnDesc.trim()) return;
    setSpawning(true); setSpawnError("");
    try {
      const res = await fetch("/api/agents/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:spawnDesc})});
      if (res.ok) {
        const j = await res.json() as { agent?: { name?: string } };
        setSpawnDesc("");
        setNewAgent(j.agent?.name ?? "New Agent");
        sounds.spawn();
        setTimeout(()=>setNewAgent(null), 4000);
      } else {
        const j = await res.json() as { error?: string };
        setSpawnError(j.error ?? "Failed");
      }
    } catch { setSpawnError("Network error"); }
    finally { setSpawning(false); }
  }

  async function fireDemo() {
    setDemoFiring(true);
    await fetch("/api/demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({author:myName||"Demo"})});
    sounds.message();
    setTimeout(()=>setDemoFiring(false), 1200);
  }

  // ── Derived ────────────────────────────────────────────────
  const cards       = [...state.cards].reverse();
  const humanNames  = Array.from(new Set(cards.filter(c=>!agentNames.has(c.author)&&c.author!=="system").map(c=>c.author)));
  const workingCards = cards.filter(c=>c.status==="working"&&!agentNames.has(c.author));
  const busyAgent   = workingCards.length>0 ? (state.agents.find(a=>workingCards.some(c=>c.claimedBy===a.name)) ?? state.agents[0]) : null;
  const hazards     = cards.filter(c=>!agentNames.has(c.author)&&c.author!=="system"&&c.status!=="claimed"&&urgClass(c.title)==="urg-critical");
  const totalActive = state.dancers.filter(d=>d.status==="active").length;
  const totalBackup = state.dancers.filter(d=>d.status==="available").length;
  const handledCnt  = cards.filter(c=>agentNames.has(c.author)&&c.tag==="agent-output").length;

  const rosterByBlock = ["A","B","C","D"].map(block=>({
    block,
    active:    state.dancers.filter(d=>d.block===block&&d.status==="active"),
    available: state.dancers.filter(d=>d.block===block&&d.status==="available"),
    out:       state.dancers.filter(d=>d.block===block&&d.status==="out"),
  }));

  const allSchedule = [
    ...state.itinerary.map(i=>({_id:i._id,title:i.title,time:i.time,type:i.type,source:"plan" as const})),
    ...state.events.map(e=>({_id:e._id,title:e.title,time:e.time,type:"event",source:"added" as const})),
  ].sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());

  // ── Loading ────────────────────────────────────────────────
  if (loading) return (
    <div className="splash-overlay">
      <motion.div className="splash-body" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5,ease:[0.22,1,0.36,1]}}>
        <div className="splash-ribbon-wrap"><ThonRibbon size={36} /></div>
        <div className="splash-wordmark">huddle<span>.</span></div>
        <div className="splash-tagline">THON 2026 · Floor Command · 46 Hours</div>
        <div className="splash-dots"><span/><span/><span/></div>
        <div className="splash-hint">AI-powered command center. Every request gets a response.</div>
      </motion.div>
    </div>
  );

  // ── Name entry / edit ──────────────────────────────────────
  if (showEntry || editName) return (
    <div className="splash-overlay">
      <motion.form className="name-card" onSubmit={submitName} initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={SPF}>
        <div className="name-logo">huddle<span>.</span></div>
        {editName
          ? <div className="name-sub">Updating — currently <strong>{myName}</strong></div>
          : <div className="name-sub">THON 2026 · Floor Command · 46 hours</div>
        }
        <input className="name-input" placeholder={editName ? `New name (was ${myName})` : "Your name"} value={nameInput} onChange={e=>setNameInput(e.target.value)} autoFocus />
        <div className="name-row">
          <motion.button type="submit" className="btn name-btn" whileHover={{scale:1.02}} whileTap={{scale:0.97}}>
            {editName ? "Save" : "Join the floor"}
          </motion.button>
          {editName && (
            <motion.button type="button" className="btn btn-ghost" onClick={()=>{setEditName(false);setNameInput("");}} whileHover={{scale:1.02}} whileTap={{scale:0.97}}>
              Cancel
            </motion.button>
          )}
        </div>
      </motion.form>
    </div>
  );

  return (
    <>
      {/* Floating agent approval dock */}
      <ApprovalDock actions={state.pendingActions} resolving={resolving} onResolve={resolveAction} />

      <div className="app-shell">

        {/* ══ LEFT SIDEBAR ════════════════════════════════════ */}
        <aside className="sidebar-left">
          <div className="workspace-header">
            <div className="workspace-name"><ThonRibbon size={20} />huddle.</div>
            <div className="workspace-subtitle">THON 2026 · Floor Command</div>
          </div>

          <div className="sidebar-scroll">
            <div className="sidebar-section-label">AI Teammates</div>
            <AnimatePresence>
              {state.agents.map(agent => {
                const handled = cards.filter(c=>c.author===agent.name&&c.tag==="agent-output").length;
                const isNew   = newAgent === agent.name;
                return (
                  <motion.div key={agent._id}
                    className={`person-row is-agent${isNew?" is-new":""}`}
                    initial={{opacity:0,x:-14}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-14}} transition={SP}
                  >
                    <div className="person-avatar agent-avatar" style={{background:avatarColor(agent.name)}}>
                      <AgentIcon name={agent.name} size={13}/>
                    </div>
                    <div className="agent-info">
                      <span className="person-name">{agent.name}</span>
                      <span className="agent-trigger">
                        #{String(agent.trigger["fullDocument.tag"]??"")}
                      </span>
                    </div>
                    {handled>0 && <span className="agent-handled-badge">{handled}</span>}
                    <span className="ai-badge">AI</span>
                    <span className="online-dot"/>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            <AnimatePresence>
              {newAgent && (
                <motion.div className="spawn-celebration" initial={{opacity:0,y:6,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,scale:0.9}} transition={SP}>
                  <span className="spawn-cel-glyph">⚡</span>
                  <span className="spawn-cel-text"><strong>{newAgent}</strong> is now live on the floor</span>
                </motion.div>
              )}
            </AnimatePresence>

            {humanNames.length>0 && (
              <>
                <div className="sidebar-section-label" style={{marginTop:12}}>Captains Online</div>
                {humanNames.map(name=>(
                  <div key={name} className="person-row">
                    <div className="person-avatar" style={{background:avatarColor(name)}}>{initials(name)}</div>
                    <span className="person-name">{name}</span>
                    <span className="online-dot"/>
                  </div>
                ))}
              </>
            )}

            {/* Spawn agent */}
            <div className="spawn-section">
              <div className="spawn-header"><span className="spawn-label">Deploy Agent</span><span className="spawn-label-sub">Powered by Luminal</span></div>
              <p className="spawn-description">Describe a role. Luminal names, configures, and deploys it — live in seconds.</p>
              <form className="spawn-form" onSubmit={spawnAgent}>
                <textarea className="spawn-input" rows={3}
                  placeholder={`e.g. "Watch for heat exhaustion and alert Dr. Kim"`}
                  value={spawnDesc} onChange={e=>setSpawnDesc(e.target.value)} disabled={spawning}/>
                <AnimatePresence>
                  {spawnDesc.trim().length>0 && !spawning && (
                    <motion.div className="spawn-preview" initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} transition={SPF}>
                      <span className="spawn-preview-icon">✦</span>
                      <span className="spawn-preview-text">Luminal will name, configure, and deploy this agent instantly. Works for any workflow — not just THON.</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {spawnError && <div className="spawn-error">{spawnError}</div>}
                <motion.button type="submit" className={`btn btn-spawn${spawning?" spawning":""}`}
                  disabled={spawning||!spawnDesc.trim()} whileHover={spawning?{}:{scale:1.02}} whileTap={spawning?{}:{scale:0.97}}>
                  {spawning ? <span className="spawn-btn-inner"><span className="spawn-dots"><span/><span/><span/></span>Spawning…</span> : "Deploy agent"}
                </motion.button>
              </form>
            </div>

            <div className="sidebar-nav-links">
              <a href="/evolve" className="sidebar-link">↻ Self-improvement results</a>
            </div>
          </div>
        </aside>

        {/* ══ MAIN AREA ════════════════════════════════════════ */}
        <div className="chat-area">
          <div className="chat-header">
            <div className="chat-nav">
              {(["floor","chat","agents"] as const).map(v=>(
                <button key={v} className={`chat-nav-btn${view===v?" active":""}`} onClick={()=>setView(v)}>
                  {v==="floor" ? "Floor" : v==="chat" ? "Captains" : "Agents"}
                </button>
              ))}
            </div>
            <div className="chat-header-right">
              <motion.button className="demo-btn" onClick={fireDemo} disabled={demoFiring}
                whileHover={{scale:1.04}} whileTap={{scale:0.94}}
                title="Fire a random floor event for demo">
                {demoFiring ? <span className="demo-btn-inner"><span className="demo-dots"><span/><span/><span/></span></span> : <><span className="demo-btn-icon">⚡</span>Simulate</>}
              </motion.button>
              <span className="header-live-dot"/>
              <span className="header-live-label">LIVE</span>
            </div>
          </div>

          {/* Stats strip */}
          <div className="stats-bar">
            <div className="stat-pill stat-pill--green">
              <motion.span className="stat-num" key={totalActive} initial={{scale:1.3,opacity:0}} animate={{scale:1,opacity:1}} transition={SP}>{totalActive}</motion.span>
              <span className="stat-label">dancing</span>
            </div>
            <div className="stat-pill stat-pill--dim">
              <span className="stat-num">{totalBackup}</span>
              <span className="stat-label">on deck</span>
            </div>
            <div className="stat-pill stat-pill--purple">
              <motion.span className="stat-num" key={handledCnt} initial={{scale:1.3,opacity:0}} animate={{scale:1,opacity:1}} transition={SP}>{handledCnt}</motion.span>
              <span className="stat-label">handled</span>
            </div>
            <div className="stat-pill stat-pill--accent">
              <span className="stat-num">{state.agents.length}</span>
              <span className="stat-label">agents live</span>
            </div>
          </div>

          {/* Hazard banner */}
          <AnimatePresence>
            {hazards.length>0 && (
              <motion.div className="hazard-banner" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={SP}>
                <span className="hazard-dot"/>
                <span>{hazards.length} critical situation{hazards.length>1?"s":""} open — needs a captain</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Floor view ─────────────────────────────────── */}
          {view==="floor" && (
            <>
              <div className="msg-feed">
                <div className="date-divider"><span className="date-label">THON 2026 · Today</span></div>
                <AnimatePresence initial={false}>
                  {cards.map((card,i)=>{
                    const isAgent  = agentNames.has(card.author);
                    const isSys    = card.author==="system";
                    const isClaimed = card.status==="claimed";
                    const isWorking = card.status==="working";
                    const canClaim  = !isAgent&&!isSys&&!isClaimed&&!isWorking;
                    const prev = i>0?cards[i-1]:null;
                    const sameAuthor = prev?.author===card.author &&
                      (new Date(card.createdAt).getTime()-new Date(prev.createdAt).getTime())<5*60*1000;
                    const urg = isAgent ? urgClass(card.title) : "";

                    if (isSys) return (
                      <motion.div key={card._id} className="sys-msg" initial={{opacity:0}} animate={{opacity:1}}>{card.title}</motion.div>
                    );
                    return (
                      <motion.div key={card._id} className={`msg-group ${sameAuthor?"continued":""} ${urg}`}
                        initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={SP} layout>
                        {sameAuthor && <span className="msg-side-time">{timeFmt(card.createdAt)}</span>}
                        <div style={{display:"flex",gap:10}}>
                          <div className={`msg-avatar${isAgent?" agent-avatar":""}`} style={{background:avatarColor(card.author)}}>
                            {isAgent ? <AgentIcon name={card.author} size={17}/> : initials(card.author)}
                          </div>
                          <div className="msg-content-col">
                            {!sameAuthor && (
                              <div className="msg-author-row">
                                <span className="msg-author">{card.author}</span>
                                {isAgent && <span className="ai-badge">AI</span>}
                                <span className="msg-time">{timeFmt(card.createdAt)}</span>
                              </div>
                            )}
                            <div className="msg-text">{card.title}</div>
                            <div className="msg-footer">
                              {!isAgent&&!isSys&&card.tag&&<span className="msg-tag" data-tag={card.tag}>{card.tag}</span>}
                              {isClaimed&&card.claimedBy&&<motion.span className="claimed-line" initial={{opacity:0}} animate={{opacity:1}}>✓ {card.claimedBy} is on it</motion.span>}
                              {canClaim&&<motion.button className="btn-claim" disabled={claiming===card._id} onClick={()=>claim(card._id)} whileHover={{scale:1.06}} whileTap={{scale:0.94}}>{claiming===card._id?"…":"I'm on it"}</motion.button>}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <AnimatePresence>
                  {busyAgent && (
                    <motion.div className="typing-row" key="typing" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={SP}>
                      <div className="typing-avatar agent-avatar" style={{background:avatarColor(busyAgent.name)}}><AgentIcon name={busyAgent.name} size={15}/></div>
                      <div className="typing-bubble"><span/><span/><span/></div>
                      <span className="typing-label">{busyAgent.name} is on it…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={feedEndRef}/>
              </div>

              <form className="compose-bar" onSubmit={submitCard}>
                <div className="compose-top">
                  <input className="compose-input"
                    placeholder={`Message the floor${myName?`, ${myName}`:""}… try @Alex or pick a tag`}
                    value={title} onChange={e=>setTitle(e.target.value)} required/>
                  <motion.button type="submit" className="compose-send" whileHover={{scale:1.08}} whileTap={{scale:0.90}}>↑</motion.button>
                </div>
                <div className="compose-footer">
                  <div className="compose-toolbar">
                    {["request","medical","substitute","supplies","logistics","morale","security","schedule"].map(t=>(
                      <button key={t} type="button" className={`compose-tag-btn${tag===t?" active":""}`} onClick={()=>setTag(t)}>{t}</button>
                    ))}
                  </div>
                  <motion.button type="button" className="compose-name-btn" onClick={()=>{setNameInput(myName);setEditName(true);}}
                    whileHover={{scale:1.1}} whileTap={{scale:0.9}} title={`You: ${myName}`}
                    style={{background:avatarColor(myName||"?")}}>
                    {initials(myName)||"?"}
                  </motion.button>
                </div>
              </form>
            </>
          )}

          {/* ── Captain chat ───────────────────────────────── */}
          {view==="chat" && (
            <>
              <div className="msg-feed">
                <div className="date-divider"><span className="date-label">Captain chat — THON 2026</span></div>
                <AnimatePresence initial={false}>
                  {state.chat.map((msg,i)=>{
                    const isSys = !!msg.isSystem;
                    const isMe  = msg.author===myName;
                    const prev  = i>0?state.chat[i-1]:null;
                    const same  = prev?.author===msg.author&&!prev?.isSystem&&
                      (new Date(msg.at).getTime()-new Date(prev.at).getTime())<3*60*1000;
                    if (isSys) return (
                      <motion.div key={msg._id} className="sys-msg" initial={{opacity:0}} animate={{opacity:1}}>{msg.text}</motion.div>
                    );
                    return (
                      <motion.div key={msg._id} className={`msg-group${same?" continued":""}${isMe?" msg-mine":""}`}
                        initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={SP} layout>
                        {same&&<span className="msg-side-time">{timeFmt(msg.at)}</span>}
                        <div style={{display:"flex",gap:10,flexDirection:isMe?"row-reverse":"row"}}>
                          <div className="msg-avatar" style={{background:avatarColor(msg.author)}}>{initials(msg.author)}</div>
                          <div className="msg-content-col">
                            {!same&&(
                              <div className="msg-author-row" style={{flexDirection:isMe?"row-reverse":"row"}}>
                                <span className="msg-author">{msg.author}</span>
                                <span className="msg-time">{timeFmt(msg.at)}</span>
                              </div>
                            )}
                            <div className={`msg-text${isMe?" msg-text-mine":""}`}>{msg.text}</div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={chatEndRef}/>
              </div>
              <form className="compose-bar" onSubmit={submitChat}>
                <div className="compose-top">
                  <input className="compose-input" placeholder={`Message the captains, ${myName||"..."}` } value={chatMsg} onChange={e=>setChatMsg(e.target.value)} required/>
                  <motion.button type="submit" className="compose-send" whileHover={{scale:1.08}} whileTap={{scale:0.90}}>↑</motion.button>
                </div>
              </form>
            </>
          )}

          {/* ── Agent status view ──────────────────────────── */}
          {view==="agents" && (
            <div className="agents-view">
              <div className="agents-grid">
                {state.agents.map(agent=>{
                  const handled = cards.filter(c=>c.author===agent.name&&c.tag==="agent-output").length;
                  const latest  = cards.filter(c=>c.author===agent.name&&c.tag==="agent-output")[0];
                  const isWorking = workingCards.length>0;
                  return (
                    <motion.div key={agent._id} className="agent-card"
                      initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={SPF}
                      whileHover={{y:-2,boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
                      <div className="agent-card-header">
                        <div className="agent-card-avatar" style={{background:avatarColor(agent.name)}}>
                          <AgentIcon name={agent.name} size={22}/>
                        </div>
                        <div className="agent-card-identity">
                          <div className="agent-card-name">{agent.name}</div>
                          <div className="agent-card-tag">#{String(agent.trigger["fullDocument.tag"]??"")}</div>
                        </div>
                        <div className={`agent-card-status${isWorking?" active":""}`}>
                          <span className="agent-status-dot"/>{isWorking?"active":"ready"}
                        </div>
                      </div>
                      <div className="agent-card-stats">
                        <div className="agent-stat">
                          <span className="agent-stat-num">{handled}</span>
                          <span className="agent-stat-label">handled</span>
                        </div>
                        <div className="agent-stat">
                          <span className="agent-stat-num">∞</span>
                          <span className="agent-stat-label">uptime</span>
                        </div>
                        <div className="agent-stat">
                          <a href="/evolve" className="agent-evolve-link">↻ evolve</a>
                        </div>
                      </div>
                      {latest && (
                        <div className="agent-card-last">
                          <span className="agent-card-last-label">last response</span>
                          <span className="agent-card-last-text">{latest.title.slice(0,80)}{latest.title.length>80?"…":""}</span>
                        </div>
                      )}
                      <div className="agent-card-instructions">
                        <details>
                          <summary className="agent-instructions-toggle">System prompt</summary>
                          <div className="agent-instructions-body">{agent.instructions.slice(0,200)}{agent.instructions.length>200?"…":""}</div>
                        </details>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ══ RIGHT SIDEBAR ════════════════════════════════════ */}
        <aside className="sidebar-right">
          <div className="panel-tabs">
            {(["roster","contacts","schedule"] as const).map(p=>(
              <button key={p} className={`panel-tab${activePanel===p?" active":""}`} onClick={()=>setActivePanel(p)}>
                  {p==="roster" ? "Roster" : p==="contacts" ? "Contacts" : "Schedule"}
                </button>
            ))}
          </div>

          {activePanel==="roster" && (
            <>
              <DanceFloor dancers={state.dancers}/>
              <div className="sidebar-section-label" style={{marginTop:10}}>Blocks</div>
              {rosterByBlock.map(({block,active,available,out})=>(
                <div key={block} className="roster-block">
                  <div className="roster-block-header">
                    <span className="roster-block-name">Block {block}</span>
                    <span className="roster-counts">
                      <span className="roster-active">{active.length}</span>
                      <span className="roster-sep">/</span>
                      <span className="roster-avail">{available.length} backup</span>
                      {out.length>0&&<span className="roster-out">{out.length} out</span>}
                    </span>
                  </div>
                  <AnimatePresence>
                    {out.map(d=>(
                      <motion.div key={d._id} className="roster-dancer out" initial={{opacity:0}} animate={{opacity:1}} transition={SP}>
                        <span className="roster-status-dot out"/><span className="roster-name">{d.name}</span><span className="roster-section">§{d.section}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ))}
              {state.notifications.length>0&&(
                <>
                  <div className="sidebar-section-label" style={{marginTop:12}}>Sent Alerts</div>
                  {state.notifications.slice(0,5).map(n=>(
                    <div key={n._id} className="notif-row">
                      <span className="notif-icon">📱</span>
                      <div className="notif-body">
                        <div className="notif-to">{n.to}{n.phone?` · ${n.phone}`:""}</div>
                        <div className="notif-msg">{n.message}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {activePanel==="contacts" && (
            <>
              <div className="sidebar-section-label">Committee Staff</div>
              {state.contacts.map(c=>(
                <motion.div key={c._id} className="contact-row" initial={{opacity:0}} animate={{opacity:1}} transition={SP}>
                  <div className="contact-avatar" style={{background:avatarColor(c.name)}}>{initials(c.name)}</div>
                  <div className="contact-info">
                    <div className="contact-name">{c.name}</div>
                    <div className="contact-role">{c.role}</div>
                    <div className="contact-location">{c.location}</div>
                  </div>
                  <div className="contact-phone">{c.phone}</div>
                </motion.div>
              ))}
            </>
          )}

          {activePanel==="schedule" && (
            <>
              <div className="sidebar-section-label" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span>Schedule</span>
                <button className="cal-add-btn" onClick={()=>setShowCalForm(v=>!v)}>+</button>
              </div>
              <AnimatePresence>
                {showCalForm&&(
                  <motion.form className="cal-form" onSubmit={addCalEvent}
                    initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} transition={SPF}>
                    <input className="cal-input" placeholder="Event title" value={calTitle} onChange={e=>setCalTitle(e.target.value)} required/>
                    <input className="cal-input" type="datetime-local" value={calTime} onChange={e=>setCalTime(e.target.value)}/>
                    <button type="submit" className="btn btn-sm" style={{width:"100%"}}>Add</button>
                  </motion.form>
                )}
              </AnimatePresence>
              {allSchedule.length===0 ? <div className="sub-empty">No schedule yet</div> : (
                allSchedule.map(ev=>(
                  <motion.div key={ev._id} className={`cal-event-row${ev.source==="plan"?" cal-plan":""}`}
                    initial={{opacity:0,x:8}} animate={{opacity:1,x:0}} transition={SP}>
                    <div className="cal-event-left">
                      <div className="cal-event-time">{new Date(ev.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                      {ev.source==="plan"&&<span className="cal-plan-badge">plan</span>}
                    </div>
                    <div className="cal-event-title">{ev.title}</div>
                  </motion.div>
                ))
              )}
            </>
          )}

          <div className="sidebar-section-label" style={{marginTop:14}}>Activity</div>
          <AnimatePresence initial={false}>
            {state.feed.map(item=>(
              <motion.div key={item._id} className="activity-row" initial={{opacity:0,x:8}} animate={{opacity:1,x:0}} transition={SP}>
                {item.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </aside>
      </div>
    </>
  );
}

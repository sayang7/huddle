// POST /api/agents/generate
// Body: { description: string }
// Turns a one-sentence description into an agent (name/emoji/tag/instructions)
// via the LLM, inserts it into the agents collection, and returns { ok: true, agent }.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { llm } from "@/lib/llm";

export const dynamic = "force-dynamic";

// Tags the agent system already uses for other purposes.
const RESERVED_TAGS = new Set(["agent-output", "ask-local"]);

const SYSTEM_PROMPT = `You design AI helper agents for Huddle, a live coordination board used during THON, Penn State's 46-hour dance marathon. Volunteers post cards; each agent watches for cards with one specific tag and replies to them.

Given a one-sentence description of the agent someone wants, reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:

{
  "name": "<short PascalCase or Title Case name, max 24 chars>",
  "emoji": "<one emoji>",
  "tag": "<single lowercase word or hyphenated-words the agent should react to>",
  "instructions": "<system prompt for the agent: who it is, what to do with a card, and the exact reply format. Keep replies short and actionable for volunteers on the floor.>"
}`;

interface GeneratedAgent {
  name: string;
  emoji: string;
  tag: string;
  instructions: string;
}

function extractJson(raw: string): unknown {
  const unfenced = raw.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(unfenced.slice(start, end + 1));
}

function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validate(parsed: unknown): GeneratedAgent | string {
  if (!parsed || typeof parsed !== "object") return "LLM did not return an object";
  const p = parsed as Record<string, unknown>;
  for (const key of ["name", "emoji", "tag", "instructions"]) {
    if (typeof p[key] !== "string" || (p[key] as string).trim() === "") {
      return `LLM response is missing "${key}"`;
    }
  }
  const tag = normalizeTag(p.tag as string);
  if (!tag) return "LLM produced an empty tag";
  if (RESERVED_TAGS.has(tag)) return `LLM picked reserved tag "${tag}"`;
  return {
    name: (p.name as string).trim().slice(0, 40),
    emoji: (p.emoji as string).trim(),
    tag,
    instructions: (p.instructions as string).trim(),
  };
}

export async function POST(req: NextRequest) {
  let body: { description?: unknown; sentence?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const description = body.description ?? body.sentence;
  if (typeof description !== "string" || description.trim() === "") {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 }
    );
  }

  let generated: GeneratedAgent | string;
  try {
    const raw = await llm(SYSTEM_PROMPT, description.trim());
    try {
      generated = validate(extractJson(raw));
    } catch {
      generated = "LLM returned invalid JSON";
    }
  } catch (err) {
    console.error("[agents/generate] LLM error:", err);
    return NextResponse.json(
      { error: "LLM request failed" },
      { status: 502 }
    );
  }
  if (typeof generated === "string") {
    return NextResponse.json({ error: generated }, { status: 502 });
  }

  const db = await getDb();
  const agents = db.collection("agents");

  if (await agents.findOne({ name: generated.name })) {
    return NextResponse.json(
      { error: `An agent named "${generated.name}" already exists` },
      { status: 409 }
    );
  }

  const agent = {
    name: generated.name,
    emoji: generated.emoji,
    instructions: generated.instructions,
    trigger: { operationType: "insert", "fullDocument.tag": generated.tag },
  };

  const result = await agents.insertOne(agent);

  await db.collection("feed").insertOne({
    text: `${agent.emoji} ${agent.name} joined — watching #${generated.tag}`,
    at: new Date(),
  });

  return NextResponse.json({
    ok: true,
    agent: { _id: result.insertedId, ...agent },
  });
}

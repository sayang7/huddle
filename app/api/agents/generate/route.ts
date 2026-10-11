// Owned by Teammate B — skeleton only.
// POST /api/agents/generate
// Body: { description: string }
// Should parse description, call LLM to extract name/emoji/trigger/instructions,
// insert into agents collection, and return { ok: true, agent }.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Not implemented yet — Teammate B owns this route." },
    { status: 501 }
  );
}

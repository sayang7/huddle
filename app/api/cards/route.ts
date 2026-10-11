import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    title?: unknown;
    body?: unknown;
    tag?: unknown;
    author?: unknown;
  };

  const { title, body: cardBody, tag, author } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 }
    );
  }
  if (typeof author !== "string" || author.trim() === "") {
    return NextResponse.json(
      { error: "author is required" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const now = new Date();

  await db.collection("cards").insertOne({
    title: title.trim(),
    body: typeof cardBody === "string" ? cardBody : "",
    tag: typeof tag === "string" ? tag.toLowerCase().trim() : "",
    author: author.trim(),
    status: "idle",
    createdAt: now,
  });

  await db.collection("feed").insertOne({
    text: `${author.trim()} added "${title.trim()}"`,
    at: now,
  });

  return NextResponse.json({ ok: true });
}

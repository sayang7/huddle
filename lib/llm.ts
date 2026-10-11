async function callLlm(system: string, user: string): Promise<Response> {
  const baseUrl = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY ?? "";
  const model = process.env.LLM_MODEL ?? "";

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      // DeepSeek spends ~300-400 tokens reasoning before it answers;
      // at 400 the answer was often cut off or empty.
      max_tokens: 1500,
    }),
  });
}

export async function llm(system: string, user: string): Promise<string> {
  let res = await callLlm(system, user);

  if (!res.ok) {
    const text = await res.text();
    // retry once, after a pause (Luminal returns 429 when too many calls run at once)
    await new Promise((r) => setTimeout(r, 2000));
    res = await callLlm(system, user);
    if (!res.ok) {
      const text2 = await res.text();
      throw new Error(
        `LLM request failed: HTTP ${res.status} — ${text2 || text}`
      );
    }
  }

  const data = (await res.json()) as {
    choices: { message: { content: string; reasoning_content?: string } }[];
  };
  // DeepSeek reasoning models put the answer in content;
  // reasoning_content is the chain-of-thought (we discard it)
  const raw = data.choices[0].message.content ?? "";
  const answer = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // Never post a blank card: throwing lets the worker release the card
  if (!answer) throw new Error("LLM returned an empty reply");
  return answer;
}

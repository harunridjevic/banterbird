import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  PRACTICE_BOT_OUTPUT_JSON_RULES,
  PRACTICE_BOT_SYSTEM_INSTRUCTIONS,
} from "@/lib/ai-practice-bot/instructions";
import { createClient } from "@/utils/supabase/server";

type ChatTurn = { role: "user" | "assistant"; content: string };

type AiPracticeTurnResult =
  | { action: "reply"; reply: string }
  | { action: "skip"; parting: string | null };

function googleApiKey(): string | undefined {
  return (
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

function baseSystemPrompt(): string {
  const fromEnv =
    process.env.PRACTICE_BOT_SYSTEM_PROMPT?.trim() ||
    process.env.OPENAI_PRACTICE_BOT_SYSTEM_PROMPT?.trim();
  if (fromEnv) return fromEnv;
  return PRACTICE_BOT_SYSTEM_INSTRUCTIONS;
}

function fullSystemPrompt(): string {
  return `${baseSystemPrompt()}\n\n${PRACTICE_BOT_OUTPUT_JSON_RULES}`.trim();
}

const FALLBACKS = [
  "hey",
  "yo",
  "sup",
  "hmm interesting",
  "lol fair",
  "same honestly",
  "wild",
  "mhm",
  "nice",
  "damn",
  "fr?",
  "lowkey yeah",
];

function pickFallback(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACKS[h % FALLBACKS.length] ?? "hey";
}

function parseModelTurn(raw: string, history: ChatTurn[]): AiPracticeTurnResult {
  const seed = history.map((m) => m.content).join("|") || "open";
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        obj = JSON.parse(raw.slice(start, end + 1));
      } catch {
        // ignore
      }
    }
  }

  if (obj && typeof obj === "object" && obj !== null) {
    const o = obj as Record<string, unknown>;
    if (o.action === "skip") {
      const p = o.parting;
      if (typeof p === "string") {
        const t = p.replace(/\s+/g, " ").trim().slice(0, 200);
        return { action: "skip", parting: t.length > 0 ? t : null };
      }
      return { action: "skip", parting: null };
    }
    if (o.action === "reply" && typeof o.text === "string") {
      const text = o.text.replace(/\s+/g, " ").trim().slice(0, 200);
      if (text.length > 0) return { action: "reply", reply: text };
    }
  }

  const flat = raw.replace(/\s+/g, " ").trim().slice(0, 200);
  if (flat.length > 0) return { action: "reply", reply: flat };
  return { action: "reply", reply: pickFallback(seed) };
}

function decideFallbackTurn(history: ChatTurn[]): AiPracticeTurnResult {
  const users = history.filter((m) => m.role === "user");
  const seed = history.map((m) => m.content).join("|") || "open";

  if (users.length === 0) {
    return { action: "reply", reply: pickFallback(seed) };
  }

  const last = users[users.length - 1]?.content ?? "";
  const coarseSensitive =
    /\b(sex|nude|naked|porn|nsfw|suicid|kill you|murder|rape|pedo|cp\b|address\b|social security|ssn\b)\b/i.test(
      last,
    );
  if (coarseSensitive) {
    return { action: "skip", parting: "nah im out" };
  }

  if (users.length >= 3 && Math.random() < 0.07) {
    return { action: "skip", parting: Math.random() < 0.55 ? "gotta go" : null };
  }

  return { action: "reply", reply: pickFallback(seed) };
}

async function callGemini(history: ChatTurn[]): Promise<AiPracticeTurnResult> {
  const key = googleApiKey();
  if (!key) {
    return decideFallbackTurn(history);
  }

  const model = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const contents = history.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: fullSystemPrompt() }],
      },
      contents,
      generationConfig: {
        temperature: 1.05,
        maxOutputTokens: 128,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Gemini error:", res.status, errText);
    return decideFallbackTurn(history);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw =
    json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";
  if (!raw) return decideFallbackTurn(history);
  return parseModelTurn(raw, history);
}

async function callOpenAI(history: ChatTurn[]): Promise<AiPracticeTurnResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return decideFallbackTurn(history);
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      temperature: 1.05,
      max_tokens: 128,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: fullSystemPrompt() }, ...history],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("OpenAI error:", res.status, errText);
    return decideFallbackTurn(history);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return decideFallbackTurn(history);
  return parseModelTurn(raw, history);
}

function jsonBody(result: AiPracticeTurnResult) {
  if (result.action === "reply") {
    return { action: "reply" as const, reply: result.reply };
  }
  return { action: "skip" as const, parting: result.parting };
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      roomId?: string;
      messages?: ChatTurn[];
    };
    const roomId = body.roomId;
    const history = Array.isArray(body.messages) ? body.messages : [];
    if (!roomId) {
      return NextResponse.json({ error: "roomId required" }, { status: 400 });
    }

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id,is_ai_room,user_a,user_b,ended_at")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (room.ended_at) {
      return NextResponse.json({ error: "Room ended" }, { status: 400 });
    }
    if (!room.is_ai_room || room.user_a !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const trimmedHistory = history.slice(-24);
    let result = googleApiKey()
      ? await callGemini(trimmedHistory)
      : await callOpenAI(trimmedHistory);
    const hasUserTurn = trimmedHistory.some((m) => m.role === "user");
    if (!hasUserTurn && result.action === "skip") {
      result = { action: "reply", reply: pickFallback("open") };
    }

    return NextResponse.json(jsonBody(result));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

type ChatTurn = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are a random stranger in a minimal anonymous text chat (like Omegle). You are NOT an AI assistant — never mention models, policies, or being a bot.
Rules:
- Reply in 1–6 words almost always. Occasionally up to 12 words if it feels natural.
- Lowercase often, casual, imperfect. No emojis unless rare (max one).
- No lectures, no lists, no URLs.
- Match the vibe of the last message; ask a tiny follow-up sometimes.
- Never break character as a helpful assistant.`;

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

async function callOpenAI(history: ChatTurn[]): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const seed = history.map((m) => m.content).join("|") || "open";
    return pickFallback(seed);
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
      max_tokens: 48,
      messages: [{ role: "system", content: SYSTEM }, ...history],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("OpenAI error:", res.status, errText);
    const seed = history.map((m) => m.content).join("|") || "open";
    return pickFallback(seed);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    const seed = history.map((m) => m.content).join("|") || "open";
    return pickFallback(seed);
  }
  return raw.replace(/\s+/g, " ").slice(0, 200);
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
    const reply = await callOpenAI(trimmedHistory);
    return NextResponse.json({ reply });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

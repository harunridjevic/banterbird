import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  PRACTICE_BOT_OUTPUT_JSON_RULES,
  PRACTICE_BOT_SYSTEM_INSTRUCTIONS,
} from "@/lib/ai-practice-bot/instructions";
import { buildUserMemory, contextualFallbackReply, formatUserMemoryBlock } from "@/lib/ai-practice-bot/memory";
import { buildBotPersona, formatPersonaPrompt, personaAllowsSexualChat, personaTiming, type SelfGender } from "@/lib/ai-practice-bot/persona";
import { parseBotSettings, type BotSettings } from "@/lib/ops/bot-settings";
import {
  applySessionPolicy,
  decideFallbackTurn,
  GEMINI_OPENER_USER_TURN,
  jsonBody,
  parseModelTurn,
  sessionContextOverlay,
  triggerOverlay,
  type AiPracticeTurnResult,
  type AiReplyTrigger,
  type ChatTurn,
} from "@/lib/ai-practice-bot/turn";
import { createClient } from "@/utils/supabase/server";

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

function buildSystemPrompt(
  personaBlock: string,
  memoryBlock: string,
  sessionBlock: string,
  trigger: AiReplyTrigger,
  settings?: BotSettings | null,
): string {
  const triggerLine = triggerOverlay(trigger, settings);
  return [
    baseSystemPrompt(),
    personaBlock,
    memoryBlock,
    sessionBlock,
    PRACTICE_BOT_OUTPUT_JSON_RULES,
    triggerLine,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function geminiSystemPrompt(
  personaBlock: string,
  memoryBlock: string,
  sessionBlock: string,
  trigger: AiReplyTrigger,
  flirtyStarter: boolean,
  chatMode: "friendly" | "flirty",
  settings?: BotSettings | null,
): string {
  const opener =
    flirtyStarter && chatMode === "flirty"
      ? 'Opening turn (user msg is only "."): flirty/suggestive opener OR casual hi — messages array.'
      : 'Opening turn (user msg is only "."): casual friendly hi — messages array.';
  return `${buildSystemPrompt(personaBlock, memoryBlock, sessionBlock, trigger, settings)}\n\n${opener}`;
}

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    action: { type: "STRING", enum: ["reply", "skip", "away"] },
    messages: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Chat bubbles shown to the other person when action is reply or away.",
    },
    text: { type: "STRING", description: "Legacy single line if messages omitted." },
    parting: {
      type: "STRING",
      description: "Optional sign-off when action is skip.",
      nullable: true,
    },
    awaySeconds: {
      type: "NUMBER",
      description: "Seconds away when action is away (20-120).",
    },
    returnMessages: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Lines sent after coming back from away.",
    },
  },
  required: ["action"],
} as const;

function geminiContents(history: ChatTurn[]) {
  if (history.length === 0) {
    return [{ role: "user", parts: [{ text: GEMINI_OPENER_USER_TURN }] }];
  }
  return history.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
}

async function fetchGeminiRaw(
  history: ChatTurn[],
  systemPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): Promise<string | null> {
  const key = googleApiKey();
  if (!key) return null;

  const model = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: geminiContents(history),
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Gemini error:", res.status, errText);
    return null;
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (
    json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? null
  );
}

async function fetchOpenAIRaw(
  history: ChatTurn[],
  systemPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      temperature,
      max_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt }, ...history],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("OpenAI error:", res.status, errText);
    return null;
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content?.trim() ?? null;
}

async function callLlm(
  history: ChatTurn[],
  systemPrompt: string,
  persona: ReturnType<typeof buildBotPersona>,
  memory: ReturnType<typeof buildUserMemory>,
  settings?: BotSettings | null,
): Promise<AiPracticeTurnResult> {
  const maxOutputTokens = memory.sexualVibe
    ? (settings?.maxOutputTokensSexual ?? 768)
    : (settings?.maxOutputTokens ?? 512);
  const temperature = settings?.llmTemperature ?? 1.08;
  const fetchRaw = googleApiKey() ? fetchGeminiRaw : fetchOpenAIRaw;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await fetchRaw(history, systemPrompt, maxOutputTokens, temperature);
    if (!raw) continue;
    const parsed = parseModelTurn(raw, history, persona, memory, settings);
    if (parsed) return parsed;
  }

  return {
    action: "reply",
    messages: contextualFallbackReply(
      history,
      memory,
      personaAllowsSexualChat(persona, memory.sexualVibe),
    ),
    timing: personaTiming(persona, settings),
  };
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
      trigger?: AiReplyTrigger;
      botSettings?: unknown;
    };
    const roomId = body.roomId;
    const history = Array.isArray(body.messages) ? body.messages : [];
    const trigger: AiReplyTrigger =
      body.trigger === "idle_ping" || body.trigger === "idle_skip" ? body.trigger : "normal";
    const botSettings = parseBotSettings(body.botSettings);

    if (!roomId) {
      return NextResponse.json({ error: "roomId required" }, { status: 400 });
    }

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id,is_ai_room,user_a,user_b,user_a_gender,user_b_gender,bot_gender,ended_at")
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

    const botGender = (room.bot_gender ?? room.user_b_gender ?? "female") as SelfGender;
    const userGender = (room.user_a_gender ?? "male") as SelfGender;
    const persona = buildBotPersona(roomId, botGender, userGender, botSettings);
    const trimmedHistory = history.slice(-28);
    const memory = buildUserMemory(trimmedHistory);
    const memoryBlock = formatUserMemoryBlock(memory, persona);
    const sessionBlock = sessionContextOverlay(memory, persona, botSettings);
    const personaBlock = formatPersonaPrompt(persona);

    if (trigger === "idle_ping" || trigger === "idle_skip") {
      const result = decideFallbackTurn(trimmedHistory, persona, trigger, memory, botSettings);
      return NextResponse.json({
        ...jsonBody(result),
        persona: {
          version: persona.version,
          genderTag: persona.genderTag,
          country: persona.country,
        },
      });
    }

    const systemPrompt = googleApiKey()
      ? geminiSystemPrompt(personaBlock, memoryBlock, sessionBlock, trigger, persona.flirtyStarter, persona.chatMode, botSettings)
      : buildSystemPrompt(personaBlock, memoryBlock, sessionBlock, trigger, botSettings);

    let result = await callLlm(trimmedHistory, systemPrompt, persona, memory, botSettings);

    result = applySessionPolicy(trimmedHistory, result, persona, memory, trigger, botSettings);

    const hasUserTurn = trimmedHistory.some((m) => m.role === "user");
    if (!hasUserTurn && result.action === "skip") {
      result = decideFallbackTurn(trimmedHistory, persona, "normal", memory, botSettings);
    }

    return NextResponse.json({
      ...jsonBody(result),
      persona: {
        version: persona.version,
        genderTag: persona.genderTag,
        country: persona.country,
        sexualDisposition: persona.sexualDisposition,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

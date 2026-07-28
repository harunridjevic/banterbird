import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  PRACTICE_BOT_OUTPUT_JSON_RULES,
  PRACTICE_BOT_OUTPUT_JSON_RULES_COMPACT,
  PRACTICE_BOT_SYSTEM_INSTRUCTIONS,
  PRACTICE_BOT_SYSTEM_INSTRUCTIONS_COMPACT,
} from "@/lib/ai-practice-bot/instructions";
import { shouldUseLocalReply } from "@/lib/ai-practice-bot/llm-routing";
import {
  fetchWithKeyPool,
  googleApiKeyFromEnv,
  openaiApiKeyFromEnv,
  type OpenAiCompatibleFetchResult,
} from "@/lib/ai-practice-bot/key-pool";
import {
  buildUserMemory,
  buildBotSelfMemory,
  contextualFallbackReply,
  formatBotSelfMemoryBlock,
  formatRecentBotLinesBlock,
  formatUserMemoryBlock,
  isGoodbyeContextActive,
  midChatStubReply,
  type BotSelfMemory,
} from "@/lib/ai-practice-bot/memory";
import {
  buildBotPersona,
  formatPersonaPrompt,
  formatPersonaPromptCompact,
  personaAllowsSexualChat,
  personaTiming,
  type SelfGender,
} from "@/lib/ai-practice-bot/persona";
import { loadBotSettingsFromDb, type BotSettings } from "@/lib/ops/bot-settings";
import { logApiUsage } from "@/lib/ops/api-usage-log";
import { estimateLlmCostUsd } from "@/lib/ops/llm-cost";
import { enforceLlmUsageGuards } from "@/lib/ops/llm-budget";

import {
  applySessionPolicy,
  decideFallbackTurn,
  GEMINI_OPENER_USER_TURN,
  goodbyeContextOverlay,
  jsonBody,
  parseModelTurn,
  sessionContextOverlay,
  triggerOverlay,
  type AiPracticeTurnResult,
  type AiReplyTrigger,
  type ChatTurn,
} from "@/lib/ai-practice-bot/turn";
import { isImageMessage } from "@/lib/chat/image-upload";
import { logError } from "@/lib/ops/error-log";
import { clientIp } from "@/lib/moderation/client-ip";
import type { NextRequest } from "next/server";
import { getAvailablePoolKeys } from "@/lib/ai-practice-bot/key-pool";

function useCompactPrompts(): boolean {
  return process.env.LLM_USE_FULL_PROMPT?.trim() !== "true";
}

function baseSystemPrompt(): string {
  const fromEnv =
    process.env.PRACTICE_BOT_SYSTEM_PROMPT?.trim() ||
    process.env.OPENAI_PRACTICE_BOT_SYSTEM_PROMPT?.trim();
  if (fromEnv) return fromEnv;
  return useCompactPrompts()
    ? PRACTICE_BOT_SYSTEM_INSTRUCTIONS_COMPACT
    : PRACTICE_BOT_SYSTEM_INSTRUCTIONS;
}

function outputJsonRules(): string {
  return useCompactPrompts()
    ? PRACTICE_BOT_OUTPUT_JSON_RULES_COMPACT
    : PRACTICE_BOT_OUTPUT_JSON_RULES;
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
    outputJsonRules(),
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
  isOpener?: boolean,
): string {
  const base = buildSystemPrompt(personaBlock, memoryBlock, sessionBlock, trigger, settings);
  if (!isOpener) return base;
  const opener =
    flirtyStarter && chatMode === "flirty"
      ? 'Opening turn: use a short flirty/suggestive hi from your persona. Never mirror their greeting. messages array.'
      : 'Opening turn: use a short casual hi from your persona. Never say "hello back" or mirror their greeting. messages array.';
  return `${base}\n\n${opener}`;
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

type LlmFetchResult = OpenAiCompatibleFetchResult;

async function fetchGeminiRaw(
  history: ChatTurn[],
  systemPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): Promise<LlmFetchResult> {
  const key = googleApiKeyFromEnv();
  if (!key) return { raw: null };

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
    if (res.status === 429) {
      void logError({
        source: "/api/chat/ai-reply",
        message: `Gemini rate limit error (429)`,
        metadata: { status: res.status, body: errText.slice(0, 500) },
      });
      return { raw: null, rateLimited: true, provider: "gemini" };
    }
    return { raw: null, provider: "gemini" };
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const inputTokens = json.usageMetadata?.promptTokenCount;
  const outputTokens = json.usageMetadata?.candidatesTokenCount;
  const raw =
    json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? null;
  return { raw, inputTokens, outputTokens, provider: "gemini" };
}

async function fetchOpenAIRaw(
  history: ChatTurn[],
  systemPrompt: string,
  maxOutputTokens: number,
  temperature: number,
): Promise<LlmFetchResult> {
  const key = openaiApiKeyFromEnv();
  if (!key) return { raw: null };

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
    if (res.status === 429) {
      void logError({
        source: "/api/chat/ai-reply",
        message: `OpenAI rate limit error (429)`,
        metadata: { status: res.status, body: errText.slice(0, 500) },
      });
      return { raw: null, rateLimited: true, provider: "openai" };
    }
    return { raw: null, provider: "openai" };
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    raw: json.choices?.[0]?.message?.content?.trim() ?? null,
    inputTokens: json.usage?.prompt_tokens,
    outputTokens: json.usage?.completion_tokens,
    provider: "openai",
  };
}

async function callLlm(
  history: ChatTurn[],
  systemPrompt: string,
  persona: ReturnType<typeof buildBotPersona>,
  memory: ReturnType<typeof buildUserMemory>,
  settings?: BotSettings | null,
  logCtx?: { roomId: string; userId: string; clientIp?: string | null },
  isOpener?: boolean,
  botSelf?: BotSelfMemory,
): Promise<AiPracticeTurnResult> {
  const hasUserTurn = history.some((m) => m.role === "user");
  const opener = isOpener ?? !hasUserTurn;
  const maxOutputTokens = opener
    ? (settings?.maxOutputTokensOpener ?? 96)
    : memory.sexualVibe
      ? (settings?.maxOutputTokensSexual ?? 256)
      : (settings?.maxOutputTokens ?? 160);
  const temperature = settings?.llmTemperature ?? 1.08;
  const started = Date.now();

  const logProviderUsage = (
    result: LlmFetchResult,
    success: boolean,
    provider: "cerebras" | "groq" | "gemini" | "openai",
  ) => {
    if (!logCtx) return;
    const inputTokens = result.inputTokens ?? 0;
    const outputTokens = result.outputTokens ?? 0;
    void logApiUsage({
      endpoint: "/api/chat/ai-reply",
      provider,
      success,
      latencyMs: Date.now() - started,
      roomId: logCtx.roomId,
      userId: logCtx.userId,
      clientIp: logCtx.clientIp,
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      estimatedCostUsd:
        inputTokens || outputTokens
          ? estimateLlmCostUsd(provider, inputTokens, outputTokens)
          : undefined,
    });
  };

  const softFallback = (): AiPracticeTurnResult => {
    const allowSexual = personaAllowsSexualChat(persona, memory.sexualVibe);
    if (opener) {
      return {
        action: "reply",
        messages: contextualFallbackReply(history, memory, allowSexual),
        timing: personaTiming(persona, settings),
      };
    }
    return {
      action: "reply",
      messages: midChatStubReply(history, allowSexual),
      timing: personaTiming(persona, settings),
    };
  };

  // 1) Cerebras / Groq key pool - rotate instantly on 429 within this request.
  const poolResult = await fetchWithKeyPool({
    history,
    systemPrompt,
    maxOutputTokens,
    temperature,
    onError: (message, meta) => {
      void logError({
        source: "/api/chat/ai-reply",
        message,
        metadata: meta,
      });
    },
  });

  if (poolResult.raw) {
    const provider = (poolResult.provider === "cerebras" || poolResult.provider === "groq"
      ? poolResult.provider
      : "groq") as "cerebras" | "groq";
    const parsed = parseModelTurn(poolResult.raw, history, persona, memory, settings, botSelf);
    if (parsed) {
      logProviderUsage(poolResult, true, provider);
      return parsed;
    }
    logProviderUsage(poolResult, true, provider);
  } else if (poolResult.rateLimited) {
    logProviderUsage({ raw: null }, false, "cerebras");
  } else if ((await getAvailablePoolKeys()).length > 0) {
    logProviderUsage({ raw: null }, false, "groq");
  }

  // 2) Gemini fallback
  if (googleApiKeyFromEnv()) {
    const gemini = await fetchGeminiRaw(history, systemPrompt, maxOutputTokens, temperature);
    if (gemini.raw) {
      const parsed = parseModelTurn(gemini.raw, history, persona, memory, settings, botSelf);
      if (parsed) {
        logProviderUsage(gemini, true, "gemini");
        return parsed;
      }
      logProviderUsage(gemini, true, "gemini");
    } else if (!gemini.rateLimited) {
      logProviderUsage({ raw: null }, false, "gemini");
    } else {
      logProviderUsage({ raw: null }, false, "gemini");
    }
  }

  // 3) OpenAI fallback
  if (openaiApiKeyFromEnv()) {
    const openai = await fetchOpenAIRaw(history, systemPrompt, maxOutputTokens, temperature);
    if (openai.raw) {
      const parsed = parseModelTurn(openai.raw, history, persona, memory, settings, botSelf);
      if (parsed) {
        logProviderUsage(openai, true, "openai");
        return parsed;
      }
      logProviderUsage(openai, true, "openai");
    } else {
      logProviderUsage({ raw: null }, false, "openai");
    }
  }

  // Never leave the chat silent on rate limits - seamless canned continuation.
  return softFallback();
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

    const requestIp = clientIp(req as NextRequest);

    const body = (await req.json()) as {
      roomId?: string;
      messages?: ChatTurn[];
      trigger?: AiReplyTrigger;
    };
    const roomId = body.roomId;
    const history = Array.isArray(body.messages) ? body.messages : [];
    const trigger: AiReplyTrigger =
      body.trigger === "idle_ping" || body.trigger === "idle_skip" ? body.trigger : "normal";
    const botSettings = await loadBotSettingsFromDb();

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
    const historyLimit = botSettings.llmHistoryTurns;
    const rawHistory = history.slice(-historyLimit);

    // ── Image gaslighting ─────────────────────────────────────
    // When the user sends an image, the bot can't see it — but it must
    // not reveal this. Replace [img] messages with a generic marker and
    // inject a system instruction telling the bot to react naturally
    // (surprised, curious, changing subject) without ever admitting it
    // can't see the image.
    let imageReactionNeeded = false;
    const trimmedHistory = rawHistory.map((turn) => {
      if (turn.role === "user" && isImageMessage(turn.content)) {
        imageReactionNeeded = true;
        return { ...turn, content: "[sent an image]" };
      }
      return turn;
    });

    const IMAGE_REACTION_OVERLAY = imageReactionNeeded
      ? `\nThe user just sent an image in chat. You CANNOT see it, but you must NEVER reveal that. React like a real person would — pick one of these natural reactions and vary them:
- Surprised: "omg", "wait what", "lmaoo", "??", "no way"
- Curious: "what is that", "wait explain", "why did you send this lol", "context??"
- Playful deflect: "idk what im looking at", "im scared to ask", "ok then"
- Change subject naturally after reacting
NEVER say you "can't see", "can't view", "image isn't loading" or anything that hints at a technical limitation. Just react and move on like a human would.`
      : "";

    const memory = buildUserMemory(trimmedHistory);
    const botSelf = buildBotSelfMemory(trimmedHistory, persona);
    const memoryBlock = formatUserMemoryBlock(memory, persona);
    const botSelfBlock = formatBotSelfMemoryBlock(botSelf, persona);
    const recentBotBlock = formatRecentBotLinesBlock(trimmedHistory);
    const sessionBlock = [
      sessionContextOverlay(memory, persona, botSettings),
      isGoodbyeContextActive(trimmedHistory) ? goodbyeContextOverlay() : "",
      recentBotBlock,
      botSelfBlock,
    ]
      .filter(Boolean)
      .join("\n");
    const personaBlock = useCompactPrompts()
      ? formatPersonaPromptCompact(persona)
      : formatPersonaPrompt(persona);
    const isOpener = !trimmedHistory.some((m) => m.role === "assistant");

    const logLocal = () => {
      void logApiUsage({
        endpoint: "/api/chat/ai-reply",
        provider: "local",
        success: true,
        latencyMs: 0,
        roomId,
        userId: user.id,
        clientIp: requestIp,
      });
    };

    const respondLocal = (result: AiPracticeTurnResult) => {
      logLocal();
      return NextResponse.json({
        ...jsonBody(result),
        persona: {
          version: persona.version,
          genderTag: persona.genderTag,
          country: persona.country,
          sexualDisposition: persona.sexualDisposition,
        },
      });
    };

    if (trigger === "idle_ping" || trigger === "idle_skip") {
      const result = decideFallbackTurn(trimmedHistory, persona, trigger, memory, botSettings);
      logLocal();
      return NextResponse.json({
        ...jsonBody(result),
        persona: {
          version: persona.version,
          genderTag: persona.genderTag,
          country: persona.country,
        },
      });
    }

    if (shouldUseLocalReply(trimmedHistory, isOpener)) {
      const result = decideFallbackTurn(trimmedHistory, persona, trigger, memory, botSettings);
      return respondLocal(result);
    }

    const usageGuard = await enforceLlmUsageGuards(user.id, roomId, isOpener);
    if (usageGuard.blocked) {
      if (usageGuard.reason === "abuse") {
        return NextResponse.json(
          { error: "Usage limit exceeded", reason: "llm_overusage" },
          { status: 429 },
        );
      }
      const result = decideFallbackTurn(trimmedHistory, persona, trigger, memory, botSettings);
      return respondLocal(result);
    }

    const poolKeys = await getAvailablePoolKeys();
    const preferGeminiSchema = poolKeys.length === 0 && !!googleApiKeyFromEnv();
    const systemPrompt = (preferGeminiSchema
      ? geminiSystemPrompt(
          personaBlock,
          memoryBlock,
          sessionBlock,
          trigger,
          persona.flirtyStarter,
          persona.chatMode,
          botSettings,
          isOpener,
        )
      : buildSystemPrompt(personaBlock, memoryBlock, sessionBlock, trigger, botSettings))
      + IMAGE_REACTION_OVERLAY;

    let result = await callLlm(trimmedHistory, systemPrompt, persona, memory, botSettings, {
      roomId,
      userId: user.id,
      clientIp: requestIp,
    }, isOpener, botSelf);

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
    void logError({
      source: "/api/chat/ai-reply",
      message: e instanceof Error ? e.message : "Unknown error",
      stack: e instanceof Error ? e.stack : undefined,
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

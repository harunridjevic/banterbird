import {
  invalidateApiKeyCache,
  markEnvKeyCooldown,
  markOpsApiKeyRateLimited,
  getEnvKeyCooldownUntil,
  resolveApiKeyPool,
  type ApiKeyProvider,
  type ResolvedApiKey,
} from "@/lib/ops/api-keys";

/** In-process cooldown for ops keys (fast path before DB write lands). */
const localCooldownUntil = new Map<string, number>();

const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

export type LlmPoolProvider = ApiKeyProvider | "gemini" | "openai";

export type OpenAiCompatibleFetchResult = {
  raw: string | null;
  inputTokens?: number;
  outputTokens?: number;
  rateLimited?: boolean;
  provider?: LlmPoolProvider;
  keyId?: string;
  keyName?: string;
};

function parseRetryAfterMs(res: Response, body: string): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const asNum = Number(header);
    if (Number.isFinite(asNum) && asNum >= 0) {
      return Math.min(MAX_COOLDOWN_MS, Math.max(1_000, asNum * 1000));
    }
    const asDate = Date.parse(header);
    if (Number.isFinite(asDate)) {
      return Math.min(MAX_COOLDOWN_MS, Math.max(1_000, asDate - Date.now()));
    }
  }
  const reset = res.headers.get("x-ratelimit-reset-tokens") || res.headers.get("x-ratelimit-reset-requests");
  if (reset) {
    const n = Number(reset);
    if (Number.isFinite(n) && n > 0) {
      // Groq sometimes sends unix seconds
      if (n > 1_000_000_000) {
        return Math.min(MAX_COOLDOWN_MS, Math.max(1_000, n * 1000 - Date.now()));
      }
      return Math.min(MAX_COOLDOWN_MS, Math.max(1_000, n * 1000));
    }
  }
  if (/rate.?limit|tokens per|TPM|RPM/i.test(body)) {
    return DEFAULT_COOLDOWN_MS;
  }
  return DEFAULT_COOLDOWN_MS;
}

export async function markKeyRateLimited(
  key: ResolvedApiKey,
  untilMs: number,
  lastError?: string,
): Promise<void> {
  localCooldownUntil.set(key.id, untilMs);
  invalidateApiKeyCache();
  if (key.source === "env" || key.id.startsWith("env:")) {
    markEnvKeyCooldown(key.id, untilMs, lastError);
    return;
  }
  await markOpsApiKeyRateLimited(key.id, untilMs, lastError);
}

function isLocallyCooling(keyId: string, now: number): boolean {
  const until = Math.max(localCooldownUntil.get(keyId) ?? 0, getEnvKeyCooldownUntil(keyId));
  return until > now;
}

export async function getAvailablePoolKeys(now = Date.now()): Promise<ResolvedApiKey[]> {
  const pool = await resolveApiKeyPool(now);
  return pool.filter((k) => !isLocallyCooling(k.id, now));
}

type OpenAiChatConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
  history: { role: string; content: string }[];
  systemPrompt: string;
  maxOutputTokens: number;
  temperature: number;
};

async function fetchOpenAiCompatible(
  config: OpenAiChatConfig,
): Promise<{ ok: boolean; status: number; bodyText: string; json?: unknown; res: Response }> {
  // Reasoning models (like openai/gpt-oss-20b and gpt-oss-120b) use internal reasoning tokens
  // that count against max_tokens. Ensure at least 384 tokens so JSON is never truncated.
  const maxTokens = Math.max(config.maxOutputTokens || 0, 384);

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: config.systemPrompt }, ...config.history],
    }),
  });
  const bodyText = await res.text().catch(() => "");
  let json: unknown;
  if (res.ok) {
    try {
      json = JSON.parse(bodyText) as unknown;
    } catch {
      json = undefined;
    }
  }
  return { ok: res.ok, status: res.status, bodyText, json, res };
}

function extractChatCompletion(json: unknown): {
  raw: string | null;
  inputTokens?: number;
  outputTokens?: number;
} {
  const j = json as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    raw: j.choices?.[0]?.message?.content?.trim() ?? null,
    inputTokens: j.usage?.prompt_tokens,
    outputTokens: j.usage?.completion_tokens,
  };
}

function modelFor(provider: ApiKeyProvider): string {
  if (provider === "cerebras") {
    return process.env.CEREBRAS_CHAT_MODEL?.trim() || "gpt-oss-120b";
  }
  return process.env.GROQ_CHAT_MODEL?.trim() || "openai/gpt-oss-20b";
}

function endpointFor(provider: ApiKeyProvider): string {
  if (provider === "cerebras") {
    return "https://api.cerebras.ai/v1/chat/completions";
  }
  return "https://api.groq.com/openai/v1/chat/completions";
}

/**
 * Try pool keys in priority order. On 429, cool that key and immediately try the next,
 * same request, no user-visible pause beyond the failed attempt latency.
 */
export async function fetchWithKeyPool(input: {
  history: { role: string; content: string }[];
  systemPrompt: string;
  maxOutputTokens: number;
  temperature: number;
  onError?: (message: string, meta?: Record<string, unknown>) => void;
}): Promise<OpenAiCompatibleFetchResult> {
  const keys = await getAvailablePoolKeys();
  if (keys.length === 0) {
    return { raw: null };
  }

  for (const key of keys) {
    try {
      const result = await fetchOpenAiCompatible({
        endpoint: endpointFor(key.provider),
        model: modelFor(key.provider),
        apiKey: key.apiKey,
        history: input.history,
        systemPrompt: input.systemPrompt,
        maxOutputTokens: input.maxOutputTokens,
        temperature: input.temperature,
      });

      if (result.status === 429) {
        const cooldown = parseRetryAfterMs(result.res, result.bodyText);
        const until = Date.now() + cooldown;
        void markKeyRateLimited(key, until, result.bodyText.slice(0, 300));
        input.onError?.(`${key.provider} rate limit (429)`, {
          keyId: key.id,
          keyName: key.name,
          keyPrefix: key.keyPrefix,
          body: result.bodyText.slice(0, 500),
        });
        continue;
      }

      if (!result.ok) {
        input.onError?.(`${key.provider} API error ${result.status}`, {
          keyId: key.id,
          keyName: key.name,
          status: result.status,
          body: result.bodyText.slice(0, 500),
        });
        // Non-429 errors: try next key (auth/billing issues) rather than stalling the chat.
        if (result.status === 401 || result.status === 403 || result.status === 402) {
          void markKeyRateLimited(key, Date.now() + 5 * 60_000, `http_${result.status}`);
          continue;
        }
        continue;
      }

      const parsed = extractChatCompletion(result.json);
      return {
        ...parsed,
        provider: key.provider,
        keyId: key.id,
        keyName: key.name,
      };
    } catch (e) {
      input.onError?.(`${key.provider} network error`, {
        keyId: key.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { raw: null, rateLimited: true };
}

export function googleApiKeyFromEnv(): string | undefined {
  return (
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

export function openaiApiKeyFromEnv(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

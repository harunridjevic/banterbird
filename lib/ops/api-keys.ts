import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ApiKeyProvider, OpsApiKeyPublic } from "@/lib/ops/api-keys-types";

export type { ApiKeyProvider, OpsApiKeyPublic } from "@/lib/ops/api-keys-types";

export type OpsApiKeyRecord = {
  id: string;
  name: string;
  provider: ApiKeyProvider;
  keyCiphertext: string;
  keyPrefix: string;
  priority: number;
  enabled: boolean;
  rateLimitedUntil: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedApiKey = {
  id: string;
  name: string;
  provider: ApiKeyProvider;
  apiKey: string;
  keyPrefix: string;
  priority: number;
  source: "ops" | "env";
};

function secretsKeyMaterial(): Buffer {
  const raw =
    process.env.OPS_API_KEYS_SECRET?.trim() ||
    process.env.OPS_ANALYTICS_COOKIE_SECRET?.trim() ||
    process.env.OPS_ANALYTICS_PASSWORD?.trim() ||
    "banterbird-dev-api-keys";
  return createHash("sha256").update(raw).digest();
}

export function encryptApiKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretsKeyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptApiKey(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid API key ciphertext");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretsKeyMaterial(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function keyPrefixFromSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 10) return `${trimmed.slice(0, 4)}…`;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

function isProvider(v: unknown): v is ApiKeyProvider {
  return v === "cerebras" || v === "groq";
}

function mapRow(row: Record<string, unknown>): OpsApiKeyRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    provider: row.provider as ApiKeyProvider,
    keyCiphertext: String(row.key_ciphertext),
    keyPrefix: String(row.key_prefix),
    priority: Number(row.priority) || 100,
    enabled: Boolean(row.enabled),
    rateLimitedUntil: (row.rate_limited_until as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toPublicKey(record: OpsApiKeyRecord, now = Date.now()): OpsApiKeyPublic {
  const until = record.rateLimitedUntil ? Date.parse(record.rateLimitedUntil) : 0;
  return {
    id: record.id,
    name: record.name,
    provider: record.provider,
    keyPrefix: record.keyPrefix,
    priority: record.priority,
    enabled: record.enabled,
    rateLimitedUntil: record.rateLimitedUntil,
    rateLimited: Number.isFinite(until) && until > now,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: "ops",
  };
}

/** In-process cooldown for env keys (shared with key-pool). */
const envCooldownUntil = new Map<string, number>();
const envCooldownError = new Map<string, string>();

export function markEnvKeyCooldown(id: string, untilMs: number, lastError?: string): void {
  envCooldownUntil.set(id, untilMs);
  if (lastError) envCooldownError.set(id, lastError.slice(0, 500));
}

export function clearEnvKeyCooldown(id: string): void {
  envCooldownUntil.delete(id);
  envCooldownError.delete(id);
}

export function getEnvKeyCooldownUntil(id: string): number {
  return envCooldownUntil.get(id) ?? 0;
}

function envKeysAsPublic(now = Date.now()): OpsApiKeyPublic[] {
  const out: OpsApiKeyPublic[] = [];
  for (const provider of ["cerebras", "groq"] as const) {
    for (const envKey of envKeysForProvider(provider)) {
      const until = envCooldownUntil.get(envKey.id) ?? 0;
      const rateLimited = until > now;
      out.push({
        id: envKey.id,
        name: envKey.name,
        provider: envKey.provider,
        keyPrefix: envKey.keyPrefix,
        priority: envKey.priority,
        enabled: true,
        rateLimitedUntil: rateLimited ? new Date(until).toISOString() : null,
        rateLimited,
        lastError: rateLimited ? (envCooldownError.get(envKey.id) ?? null) : null,
        createdAt: "",
        updatedAt: "",
        source: "env",
      });
    }
  }
  return out;
}

export async function listOpsApiKeys(): Promise<OpsApiKeyPublic[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("ops_api_keys")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) {
    console.error("listOpsApiKeys", error?.message);
    return [];
  }
  return data.map((row) => toPublicKey(mapRow(row as Record<string, unknown>)));
}

/** Ops UI: DB-managed keys first, then env fallbacks (read-only). */
export async function listOpsApiKeysWithEnv(now = Date.now()): Promise<OpsApiKeyPublic[]> {
  const ops = await listOpsApiKeys();
  const env = envKeysAsPublic(now);
  // Hide env entries that look like the same key already stored in ops (prefix match).
  const opsPrefixes = new Set(ops.map((k) => `${k.provider}:${k.keyPrefix}`));
  const envVisible = env.filter((k) => !opsPrefixes.has(`${k.provider}:${k.keyPrefix}`));
  return [...ops, ...envVisible];
}

export async function createOpsApiKey(input: {
  name: string;
  provider: ApiKeyProvider;
  apiKey: string;
  priority?: number;
}): Promise<OpsApiKeyPublic> {
  if (!isProvider(input.provider)) throw new Error("Invalid provider");
  const secret = input.apiKey.trim();
  if (!secret) throw new Error("API key required");
  const name = input.name.trim() || `${input.provider} key`;
  const admin = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("ops_api_keys")
    .insert({
      name,
      provider: input.provider,
      key_ciphertext: encryptApiKey(secret),
      key_prefix: keyPrefixFromSecret(secret),
      priority: Math.max(0, Math.round(input.priority ?? 100)),
      enabled: true,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create API key");
  return toPublicKey(mapRow(data as Record<string, unknown>));
}

export async function updateOpsApiKey(
  id: string,
  patch: {
    name?: string;
    priority?: number;
    enabled?: boolean;
    apiKey?: string;
    clearRateLimit?: boolean;
  },
): Promise<OpsApiKeyPublic> {
  const admin = createServiceRoleClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") updates.name = patch.name.trim() || "Unnamed key";
  if (typeof patch.priority === "number") updates.priority = Math.max(0, Math.round(patch.priority));
  if (typeof patch.enabled === "boolean") updates.enabled = patch.enabled;
  if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    const secret = patch.apiKey.trim();
    updates.key_ciphertext = encryptApiKey(secret);
    updates.key_prefix = keyPrefixFromSecret(secret);
    updates.rate_limited_until = null;
    updates.last_error = null;
  }
  if (patch.clearRateLimit) {
    updates.rate_limited_until = null;
    updates.last_error = null;
  }
  const { data, error } = await admin
    .from("ops_api_keys")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update API key");
  return toPublicKey(mapRow(data as Record<string, unknown>));
}

export async function deleteOpsApiKey(id: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("ops_api_keys").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderOpsApiKeys(
  orderedIds: string[],
): Promise<OpsApiKeyPublic[]> {
  const admin = createServiceRoleClient();
  const now = new Date().toISOString();
  await Promise.all(
    orderedIds.map((id, index) =>
      admin
        .from("ops_api_keys")
        .update({ priority: (index + 1) * 10, updated_at: now })
        .eq("id", id),
    ),
  );
  return listOpsApiKeys();
}

export async function markOpsApiKeyRateLimited(
  id: string,
  untilMs: number,
  lastError?: string,
): Promise<void> {
  if (id.startsWith("env:")) return;
  try {
    const admin = createServiceRoleClient();
    await admin
      .from("ops_api_keys")
      .update({
        rate_limited_until: new Date(untilMs).toISOString(),
        last_error: lastError?.slice(0, 500) ?? "rate_limited",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (e) {
    console.error("markOpsApiKeyRateLimited", e);
  }
}

function parseEnvKeyList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function envKeysForProvider(provider: ApiKeyProvider): ResolvedApiKey[] {
  const singles =
    provider === "cerebras"
      ? [process.env.CEREBRAS_API_KEY]
      : [process.env.GROQ_API_KEY];
  const lists =
    provider === "cerebras"
      ? parseEnvKeyList(process.env.CEREBRAS_API_KEYS)
      : parseEnvKeyList(process.env.GROQ_API_KEYS);
  const seen = new Set<string>();
  const out: ResolvedApiKey[] = [];
  let i = 0;
  for (const secret of [...singles.filter(Boolean) as string[], ...lists]) {
    const apiKey = secret.trim();
    if (!apiKey || seen.has(apiKey)) continue;
    seen.add(apiKey);
    i += 1;
    out.push({
      id: `env:${provider}:${i}`,
      name: `Env ${provider} #${i}`,
      provider,
      apiKey,
      keyPrefix: keyPrefixFromSecret(apiKey),
      priority: 1000 + i,
      source: "env",
    });
  }
  return out;
}

let resolvedCache: { at: number; keys: ResolvedApiKey[] } | null = null;
const RESOLVE_CACHE_MS = 15_000;

export function invalidateApiKeyCache(): void {
  resolvedCache = null;
}

/** Ordered pool: ops keys by priority, then env keys. Skips currently rate-limited ops keys. */
export async function resolveApiKeyPool(now = Date.now()): Promise<ResolvedApiKey[]> {
  if (resolvedCache && now - resolvedCache.at < RESOLVE_CACHE_MS) {
    return resolvedCache.keys;
  }

  const keys: ResolvedApiKey[] = [];
  const seenSecrets = new Set<string>();

  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("ops_api_keys")
      .select("*")
      .eq("enabled", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    for (const row of data ?? []) {
      const record = mapRow(row as Record<string, unknown>);
      const until = record.rateLimitedUntil ? Date.parse(record.rateLimitedUntil) : 0;
      if (Number.isFinite(until) && until > now) continue;
      try {
        const apiKey = decryptApiKey(record.keyCiphertext);
        if (!apiKey || seenSecrets.has(apiKey)) continue;
        seenSecrets.add(apiKey);
        keys.push({
          id: record.id,
          name: record.name,
          provider: record.provider,
          apiKey,
          keyPrefix: record.keyPrefix,
          priority: record.priority,
          source: "ops",
        });
      } catch (e) {
        console.error("decrypt ops api key failed", record.id, e);
      }
    }
  } catch (e) {
    console.error("resolveApiKeyPool db", e);
  }

  for (const provider of ["cerebras", "groq"] as const) {
    for (const envKey of envKeysForProvider(provider)) {
      if (seenSecrets.has(envKey.apiKey)) continue;
      seenSecrets.add(envKey.apiKey);
      keys.push(envKey);
    }
  }

  keys.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.provider !== b.provider) {
      // Prefer cerebras slightly when priorities tie
      if (a.provider === "cerebras") return -1;
      if (b.provider === "cerebras") return 1;
    }
    return a.name.localeCompare(b.name);
  });

  resolvedCache = { at: now, keys };
  return keys;
}

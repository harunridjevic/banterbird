export type ApiKeyProvider = "cerebras" | "groq";

/** Safe for ops UI — never includes the full secret. */
export type OpsApiKeyPublic = {
  id: string;
  name: string;
  provider: ApiKeyProvider;
  keyPrefix: string;
  priority: number;
  enabled: boolean;
  rateLimitedUntil: string | null;
  rateLimited: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

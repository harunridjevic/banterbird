import { createHash, timingSafeEqual } from "node:crypto";

export function analyticsPasswordConfigured(): boolean {
  return Boolean(process.env.OPS_ANALYTICS_PASSWORD?.trim());
}

/** Compare passwords without leaking length via early return on length mismatch. */
export function verifyAnalyticsPassword(attempt: string): boolean {
  const expected = process.env.OPS_ANALYTICS_PASSWORD?.trim();
  if (!expected) return false;
  const a = createHash("sha256").update(attempt, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

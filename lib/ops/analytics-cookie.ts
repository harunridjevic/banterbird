import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "bb_ops_analytics_v1";
const TTL_MS = 12 * 60 * 60 * 1000;

export { COOKIE_NAME };

export function cookieSecret(): string {
  return (
    process.env.OPS_ANALYTICS_COOKIE_SECRET?.trim() ||
    process.env.OPS_ANALYTICS_PASSWORD?.trim() ||
    ""
  );
}

export function signAnalyticsCookie(secret: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = String(exp);
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAnalyticsCookie(secret: string, token: string | undefined): boolean {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expStr)) return false;
  if (Number(expStr) < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(expStr).digest("base64url");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

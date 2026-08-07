import { createHmac, timingSafeEqual } from "crypto";
import { PRO_PRODUCT_NAME } from "./constants";

const API_BASE = "https://api.paddle.com";
const SANDBOX_API_BASE = "https://sandbox-api.paddle.com";

function getApiKey(): string {
  const sandbox = isSandbox();
  const key = sandbox
    ? process.env.PADDLE_API_KEY_SANDBOX?.trim()
    : process.env.PADDLE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      sandbox
        ? "PADDLE_API_KEY_SANDBOX is not configured"
        : "PADDLE_API_KEY is not configured"
    );
  }
  return key;
}

function getClientToken(): string {
  const sandbox = isSandbox();
  const token = sandbox
    ? process.env.PADDLE_CLIENT_TOKEN_SANDBOX?.trim()
    : process.env.PADDLE_CLIENT_TOKEN?.trim();
  if (!token) {
    throw new Error(
      sandbox
        ? "PADDLE_CLIENT_TOKEN_SANDBOX is not configured"
        : "PADDLE_CLIENT_TOKEN is not configured"
    );
  }
  return token;
}

function getWebhookSecret(): string {
  const sandbox = isSandbox();
  const secret = sandbox
    ? process.env.PADDLE_WEBHOOK_SECRET_SANDBOX?.trim()
    : process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error(
      sandbox
        ? "PADDLE_WEBHOOK_SECRET_SANDBOX is not configured"
        : "PADDLE_WEBHOOK_SECRET is not configured"
    );
  }
  return secret;
}

function getPriceId(): string {
  const sandbox = isSandbox();
  const priceId = sandbox
    ? process.env.PADDLE_PRICE_ID_SANDBOX?.trim()
    : process.env.PADDLE_PRICE_ID?.trim();
  if (!priceId) {
    throw new Error(
      sandbox
        ? "PADDLE_PRICE_ID_SANDBOX is not configured"
        : "PADDLE_PRICE_ID is not configured"
    );
  }
  return priceId;
}

function isSandbox(): boolean {
  return process.env.PADDLE_SANDBOX === "true";
}

function apiBase(): string {
  return isSandbox() ? SANDBOX_API_BASE : API_BASE;
}

async function paddleRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${apiBase()}${path}`;
  const reqBody = body ? JSON.stringify(body) : undefined;

  console.log(`[Paddle] ${method} ${url}`);
  if (reqBody) console.log(`[Paddle] request body:`, reqBody);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    ...(body ? { body: reqBody } : {}),
  });

  const rawText = await res.text();
  console.log(`[Paddle] response status: ${res.status}`);
  console.log(`[Paddle] response body:`, rawText);

  let json: { data?: unknown; error?: { type?: string; code?: string; detail?: string; errors?: unknown } } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    throw new Error(`Paddle API returned non-JSON (${res.status}): ${rawText.slice(0, 200)}`);
  }

  if (!res.ok) {
    const detail =
      json.error?.detail ??
      json.error?.code ??
      `Paddle API error (${res.status})`;
    console.error(`[Paddle] error:`, JSON.stringify(json.error ?? {}));
    throw new Error(detail);
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (HMAC-SHA256)
// Header: Paddle-Signature: ts=<unix>;h1=<hex>
// Signed payload: `${ts}:${rawBody}`
// ---------------------------------------------------------------------------
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;

  const secret = getWebhookSecret();

  // Parse ts and h1 from "ts=1234;h1=abcd..."
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => p.split("=") as [string, string]),
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;

  // Replay attack guard — reject events older than 5 minutes
  const age = Date.now() - parseInt(ts) * 1000;
  if (isNaN(age) || age > 5 * 60 * 1000) return false;

  const signedPayload = `${ts}:${rawBody}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(h1, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Transaction — used to pre-create a checkout so we can pass custom_data
// (user_id) before the user hits the Paddle overlay.
// ---------------------------------------------------------------------------
export type PaddleTransactionResult = {
  id: string;
  /** The checkout URL (pass to Paddle.js as transactionId or redirect) */
  checkoutUrl: string;
};

export async function createPaddleTransaction(opts: {
  userId: string;
  customerEmail?: string | null;
}): Promise<PaddleTransactionResult> {
  const priceId = getPriceId();
  const data = (await paddleRequest("POST", "/transactions", {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { user_id: opts.userId },
    ...(opts.customerEmail
      ? { customer: { email: opts.customerEmail } }
      : {}),
  })) as { id: string; checkout?: { url?: string } };

  const checkoutUrl = data.checkout?.url ?? "";
  return { id: data.id, checkoutUrl };
}

// ---------------------------------------------------------------------------
// Customer portal link — lets the user manage/cancel their subscription
// ---------------------------------------------------------------------------
export async function getPaddleCustomerPortalUrl(
  customerId: string,
  subscriptionId: string,
): Promise<string> {
  const data = (await paddleRequest(
    "POST",
    `/customers/${customerId}/auth-token`,
  )) as { customer_auth_token?: string };

  const token = data.customer_auth_token;
  if (!token) throw new Error("Could not get customer portal token");

  const base = isSandbox()
    ? "https://sandbox-buyer-portal.paddle.com"
    : "https://buyer-portal.paddle.com";

  return `${base}/subscriptions/${subscriptionId}?token=${token}`;
}

/** Fetch customer ID from Paddle if we don't have it stored locally. */
export async function getCustomerIdFromSubscription(
  subscriptionId: string,
): Promise<string> {
  const data = (await paddleRequest(
    "GET",
    `/subscriptions/${subscriptionId}`,
  )) as { customer_id?: string };

  if (!data.customer_id) throw new Error("Could not fetch customer ID from Paddle");
  return data.customer_id;
}

// ---------------------------------------------------------------------------
// Cancel a subscription (called when user deletes account, etc.)
// ---------------------------------------------------------------------------
export async function cancelPaddleSubscription(
  subscriptionId: string,
): Promise<void> {
  // First, clear any pending scheduled changes that would block cancellation
  try {
    await paddleRequest("PATCH", `/subscriptions/${subscriptionId}`, {
      scheduled_change: null,
    });
  } catch {
    // Non-fatal — may not have scheduled changes
  }

  await paddleRequest("POST", `/subscriptions/${subscriptionId}/cancel`, {
    effective_from: "immediately",
  });
}

export { PRO_PRODUCT_NAME, getClientToken, getPriceId };

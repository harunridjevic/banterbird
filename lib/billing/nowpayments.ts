import { createHmac, timingSafeEqual } from "crypto";
import { PRO_PERIOD_DAYS, PRO_PRODUCT_NAME } from "./constants";

const API_BASE = "https://api.nowpayments.io/v1";

export type NowPaymentsInvoice = {
  id: string | number;
  token_id?: string;
  order_id?: string;
  order_description?: string;
  price_amount: string | number;
  price_currency: string;
  invoice_url: string;
};

function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY?.trim();
  if (!key) throw new Error("NOWPAYMENTS_API_KEY is not configured");
  return key;
}

function getIpnSecret(): string {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET?.trim();
  if (!secret) throw new Error("NOWPAYMENTS_IPN_SECRET is not configured");
  return secret;
}

/** Recursively sort object keys (required for IPN HMAC — matches NOWPayments docs). */
export function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const val = obj[key];
      result[key] =
        val !== null && typeof val === "object"
          ? sortObject(val as Record<string, unknown>)
          : val;
      return result;
    }, {});
}

/** Verify x-nowpayments-sig against the parsed JSON body. */
export function verifyIpnSignature(
  body: Record<string, unknown>,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const secret = process.env.NOWPAYMENTS_IPN_SECRET?.trim();
  if (!secret) return false;

  const sorted = sortObject(body);
  const expected = createHmac("sha512", secret)
    .update(JSON.stringify(sorted))
    .digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isSuccessfulPaymentStatus(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  // finished = funds reached merchant wallet / custody
  // confirmed = chain confirmed; fiat on-ramp flows (Banxa/Guardarian) often
  //             send confirmed as the terminal status without a subsequent finished
  return s === "finished" || s === "confirmed";
}

export async function createProInvoice(opts: {
  orderId: string;
  priceUsd: number;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): Promise<NowPaymentsInvoice> {
  // Touch secret so misconfig fails early even though invoice create uses API key
  getIpnSecret();

  const res = await fetch(`${API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
    body: JSON.stringify({
      price_amount: opts.priceUsd,
      price_currency: "usd",
      order_id: opts.orderId,
      order_description: `${PRO_PRODUCT_NAME} — ${PRO_PERIOD_DAYS} days`,
      ipn_callback_url: opts.ipnCallbackUrl,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      is_fixed_rate: true,
      ...(opts.customerEmail ? { customer_email: opts.customerEmail } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as NowPaymentsInvoice & {
    message?: string;
    code?: string;
  };

  if (!res.ok || !data.invoice_url) {
    const msg = data.message ?? `NOWPayments invoice failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

export function addProPeriod(from: Date = new Date()): Date {
  const end = new Date(from.getTime());
  end.setUTCDate(end.getUTCDate() + PRO_PERIOD_DAYS);
  return end;
}

/** Extend from the later of now or existing pro_until. */
export function computeNewProUntil(existingUntil: string | null | undefined): Date {
  const now = new Date();
  const base =
    existingUntil && new Date(existingUntil).getTime() > now.getTime()
      ? new Date(existingUntil)
      : now;
  return addProPeriod(base);
}

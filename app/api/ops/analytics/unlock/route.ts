import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  cookieSecret,
  signAnalyticsCookie,
} from "@/lib/ops/analytics-cookie";
import { analyticsPasswordConfigured, verifyAnalyticsPassword } from "@/lib/ops/analytics-password";

export async function POST(req: Request) {
  if (!analyticsPasswordConfigured()) {
    return NextResponse.json({ error: "Analytics is not configured on the server." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const password = typeof body === "object" && body !== null && "password" in body ? (body as { password?: unknown }).password : undefined;
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  if (!verifyAnalyticsPassword(password)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = cookieSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const token = signAnalyticsCookie(secret);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}

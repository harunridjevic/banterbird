import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadAppSettings, saveAppSettings, normalizeAppSettings } from "@/lib/ops/app-settings";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await loadAppSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    rateLimiting?: Record<string, unknown>;
    ageGate?: Record<string, unknown>;
    blockedWords?: Record<string, unknown>;
    llmGuards?: Record<string, unknown>;
    billing?: Record<string, unknown>;
  };
  const saved = await saveAppSettings(normalizeAppSettings(body));
  return NextResponse.json(saved);
}

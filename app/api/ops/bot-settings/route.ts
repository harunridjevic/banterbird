import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  loadBotSettingsFromDb,
  saveBotSettingsToDb,
  parseBotSettings,
  DEFAULT_BOT_SETTINGS,
  invalidateBotSettingsCache,
} from "@/lib/ops/bot-settings";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await loadBotSettingsFromDb();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  const parsed = parseBotSettings(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }
  const saved = await saveBotSettingsToDb(parsed);
  invalidateBotSettingsCache();
  return NextResponse.json(saved);
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const saved = await saveBotSettingsToDb(DEFAULT_BOT_SETTINGS);
  invalidateBotSettingsCache();
  return NextResponse.json(saved);
}

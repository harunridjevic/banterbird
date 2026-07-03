import { NextResponse } from "next/server";
import { loadAppSettings } from "@/lib/ops/app-settings";
import { loadBotSettingsFromDb } from "@/lib/ops/bot-settings";

export async function GET() {
  const [settings, botSettings] = await Promise.all([loadAppSettings(), loadBotSettingsFromDb()]);
  return NextResponse.json({
    ageGate: settings.ageGate,
    rateLimiting: {
      enabled: settings.rateLimiting.enabled,
    },
    botSettings,
  });
}

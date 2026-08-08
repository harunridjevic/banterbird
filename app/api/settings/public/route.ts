import { NextResponse } from "next/server";
import { loadAppSettings } from "@/lib/ops/app-settings";
import { loadBotSettingsFromDb } from "@/lib/ops/bot-settings";

export async function GET() {
  const [settings, botSettings] = await Promise.all([loadAppSettings(), loadBotSettingsFromDb()]);

  // Only expose the fields the client UI actually needs.
  // Never return internal LLM config, API key pool settings, match-mode
  // overrides, or anything else that could aid abuse or reveal ops config.
  return NextResponse.json(
    {
      ageGate: settings.ageGate,
      rateLimiting: {
        enabled: settings.rateLimiting.enabled,
      },
      billing: {
        proPriceUsd: settings.billing.proPriceUsd,
        proPeriodDays: settings.billing.proPeriodDays,
      },
      ads: {
        showBannerAds: settings.ads.showBannerAds,
        showOutstreamAds: settings.ads.showOutstreamAds,
      },
      botSettings: {
        matchMode: botSettings.matchMode,
        hideGenderFilters: botSettings.hideGenderFilters,
        displayOnlineCountOverride: botSettings.displayOnlineCountOverride,
        displayOnlineCountMin: botSettings.displayOnlineCountMin,
        displayOnlineCountMax: botSettings.displayOnlineCountMax,
        displayOnlineCountChangeMinMs: botSettings.displayOnlineCountChangeMinMs,
        displayOnlineCountChangeMaxMs: botSettings.displayOnlineCountChangeMaxMs,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

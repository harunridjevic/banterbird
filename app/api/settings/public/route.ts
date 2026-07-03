import { NextResponse } from "next/server";
import { loadAppSettings } from "@/lib/ops/app-settings";

export async function GET() {
  const settings = await loadAppSettings();
  return NextResponse.json({
    ageGate: settings.ageGate,
    rateLimiting: {
      enabled: settings.rateLimiting.enabled,
    },
  });
}

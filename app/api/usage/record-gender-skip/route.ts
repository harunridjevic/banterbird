/**
 * POST /api/usage/record-gender-skip
 * Increments the daily gender-skip counter for this IP.
 * Called once per gender filter selection (Men or Women button click),
 * NOT on every match poll — that would cause double-counting.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { clientIp } from "@/lib/moderation/client-ip";
import { recordGenderSkip } from "@/lib/moderation/daily-usage";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const ip = clientIp(req as import("next/server").NextRequest);

    const { newCount, remaining } = await recordGenderSkip(ip, null, user?.id ?? null);

    return NextResponse.json({ newCount, remaining });
  } catch {
    return NextResponse.json({ error: "Failed to record skip" }, { status: 500 });
  }
}

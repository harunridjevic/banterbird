/**
 * GET /api/usage/daily
 * Returns today's usage counts (image sends, gender skips) and limits.
 * Also returns whether the current user is PRO.
 * Called client-side to drive UI badges and upgrade gates.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { clientIp } from "@/lib/moderation/client-ip";
import { getDailyUsage, FREE_DAILY_IMAGE_LIMIT, FREE_DAILY_GENDER_SKIP_LIMIT } from "@/lib/moderation/daily-usage";

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const ip = clientIp(req as import("next/server").NextRequest);
    // deviceId is passed as a query param since this is a GET
    const url = new URL(req.url);
    const deviceId = url.searchParams.get("deviceId") || null;

    let isPro = false;
    if (user) {
      const svc = createServiceRoleClient();
      const { data: profile } = await svc
        .from("profiles")
        .select("is_pro,pro_until")
        .eq("id", user.id)
        .maybeSingle();
      isPro = Boolean(
        profile?.is_pro &&
          profile.pro_until &&
          new Date(profile.pro_until).getTime() > Date.now(),
      );
    }

    const usage = await getDailyUsage(ip, deviceId);

    return NextResponse.json({
      isPro,
      imagesSent: usage.imagesSent,
      genderSkips: usage.genderSkips,
      imageDailyLimit: isPro ? null : FREE_DAILY_IMAGE_LIMIT,
      genderSkipDailyLimit: isPro ? null : FREE_DAILY_GENDER_SKIP_LIMIT,
      // Remaining (null = unlimited for pro)
      imagesRemaining: isPro ? null : Math.max(0, FREE_DAILY_IMAGE_LIMIT - usage.imagesSent),
      genderSkipsRemaining: isPro ? null : Math.max(0, FREE_DAILY_GENDER_SKIP_LIMIT - usage.genderSkips),
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}

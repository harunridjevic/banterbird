import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * GET /api/billing/status
 * Returns current PRO status for the signed-in user (syncs expiry first).
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ isPro: false, proUntil: null });
    }

    const svc = createServiceRoleClient();
    await svc.rpc("sync_expired_pro", { p_user_id: user.id });

    const { data: profile } = await svc
      .from("profiles")
      .select("is_pro,pro_until")
      .eq("id", user.id)
      .maybeSingle();

    const isPro = Boolean(
      profile?.is_pro &&
        profile.pro_until &&
        new Date(profile.pro_until).getTime() > Date.now(),
    );

    return NextResponse.json({
      isPro,
      proUntil: profile?.pro_until ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Status error" },
      { status: 500 },
    );
  }
}

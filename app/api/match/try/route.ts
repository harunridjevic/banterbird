import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logError } from "@/lib/ops/error-log";
import { clientIp } from "@/lib/moderation/client-ip";
import { detectVpn } from "@/lib/moderation/vpn-detect";
import { normalizeBlockedUserIds } from "@/lib/moderation/blocked-user-ids";
import {
  checkGenderSkipAllowed,
  FREE_DAILY_GENDER_SKIP_LIMIT,
} from "@/lib/moderation/daily-usage";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      selfGender?: string;
      wantsGender?: string;
      blockedUserIds?: string[];
      deviceId?: string;
    };

    const ip = clientIp(req as import("next/server").NextRequest);
    const deviceId = body.deviceId?.trim() || null;

    // ── VPN / proxy check ────────────────────────────────────────────────────
    const vpnResult = await detectVpn(ip);
    if (vpnResult.isVpn) {
      return NextResponse.json(
        { error: "VPN and proxy connections are not allowed.", reason: "vpn_detected" },
        { status: 403 },
      );
    }

    const { data: blocked } = await supabase.rpc("is_moderation_blocked", {
      p_user_id: user.id,
      p_ip: ip,
      p_device_id: deviceId,
    });
    if (blocked) {
      await supabase.rpc("leave_match_queue");
      await supabase.rpc("end_user_active_rooms");
      return NextResponse.json({ error: "Your access has been restricted." }, { status: 403 });
    }

    // ── PRO status ───────────────────────────────────────────────────────────
    const svc = createServiceRoleClient();
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

    // ── Daily gender-match limit (10/day for male/female; any = unlimited) ──
    // NOTE: We only CHECK here — we do NOT increment.
    // The increment happens client-side when the user selects a gender filter,
    // so polling (every 2.2s) never causes double-counting.
    const wantsGender = body.wantsGender ?? "any";
    const isGenderFiltered = wantsGender !== "any";

    if (isGenderFiltered) {
      const genderCheck = await checkGenderSkipAllowed(ip, deviceId, wantsGender, isPro);
      if (!genderCheck.allowed) {
        return NextResponse.json(
          {
            error: "You've used all your gender-based matches for today. Come back tomorrow or upgrade to PRO.",
            reason: "daily_gender_limit",
            used: FREE_DAILY_GENDER_SKIP_LIMIT,
            remaining: 0,
          },
          { status: 429 },
        );
      }
      // Do NOT call recordGenderSkip here — the client increments on filter selection.
    }

    const clientBlocked = normalizeBlockedUserIds(body.blockedUserIds);

    const { data: friendships } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);

    const friendIds = (friendships ?? []).map((f: { friend_id: string }) => f.friend_id);
    const friendIdSet = new Set(friendIds);

    const { data: acceptedRequests } = await supabase
      .from("friend_requests")
      .select("from_id, to_id")
      .eq("status", "accepted")
      .or(`from_id.eq.${user.id},to_id.eq.${user.id}`);

    const formerFriendIds = new Set(
      (acceptedRequests ?? []).flatMap((r: { from_id: string; to_id: string }) =>
        r.from_id === user.id ? [r.to_id] : [r.from_id],
      ),
    );

    const modBlocked = clientBlocked.filter(
      (id) => !friendIdSet.has(id) && !formerFriendIds.has(id),
    );

    const now = new Date().toISOString();
    const { data: dbBlocksAsBlocker } = await supabase
      .from("session_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .gt("expires_at", now);

    const { data: dbBlocksAsBlocked } = await supabase
      .from("session_blocks")
      .select("blocker_id")
      .eq("blocked_id", user.id)
      .gt("expires_at", now);

    const dbBlocked = [
      ...((dbBlocksAsBlocker ?? []).map((r: { blocked_id: string }) => r.blocked_id)),
      ...((dbBlocksAsBlocked ?? []).map((r: { blocker_id: string }) => r.blocker_id)),
    ];

    const allBlockedIds = Array.from(new Set([...modBlocked, ...friendIds, ...dbBlocked]));

    const { data: roomId, error } = await supabase.rpc("try_match", {
      p_self_gender: body.selfGender ?? "male",
      p_wants_gender: wantsGender,
      p_blocked_user_ids: allBlockedIds,
    });

    if (error) {
      void logError({
        source: "/api/match/try",
        message: error.message,
        userId: user.id,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ roomId });
  } catch (e) {
    console.error(e);
    void logError({
      source: "/api/match/try",
      message: e instanceof Error ? e.message : "Unknown error",
      stack: e instanceof Error ? e.stack : undefined,
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

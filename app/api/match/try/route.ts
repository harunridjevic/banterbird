import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { logError } from "@/lib/ops/error-log";
import { clientIp } from "@/lib/moderation/client-ip";
import { normalizeBlockedUserIds } from "@/lib/moderation/blocked-user-ids";

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

    // Merge client-supplied blocked IDs with the user's friends list so
    // friends are never matched against each other in random chat.
    const clientBlocked = normalizeBlockedUserIds(body.blockedUserIds);

    const { data: friendships } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);

    const friendIds = (friendships ?? []).map((f: { friend_id: string }) => f.friend_id);

    const allBlockedIds = Array.from(new Set([...clientBlocked, ...friendIds]));

    const { data: roomId, error } = await supabase.rpc("try_match", {
      p_self_gender: body.selfGender ?? "male",
      p_wants_gender: body.wantsGender ?? "any",
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

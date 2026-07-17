import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { loadAppSettings } from "@/lib/ops/app-settings";
import { logError } from "@/lib/ops/error-log";
import { clientIp } from "@/lib/moderation/client-ip";

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
      roomId?: string;
      content?: string;
      deviceId?: string;
    };
    const roomId = body.roomId;
    const content = body.content?.trim();
    if (!roomId || !content) {
      return NextResponse.json({ error: "roomId and content required" }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

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

    const settings = await loadAppSettings();
    if (settings.rateLimiting.enabled) {
      const { data: rateResult } = await supabase.rpc("check_rate_limit", {
        p_user_id: user.id,
        p_event_type: "message",
        p_max_per_minute: settings.rateLimiting.maxMessagesPerMinute,
        p_max_burst: settings.rateLimiting.maxMessagesPer10Seconds,
        p_block_minutes: settings.rateLimiting.blockDurationMinutes,
      });
      const result = rateResult as { allowed?: boolean; reason?: string; blocked?: boolean } | null;
      if (result && !result.allowed) {
        return NextResponse.json(
          {
            error:
              result.reason === "burst_limit" || result.reason === "rate_limit"
                ? "Slow down. You're sending messages too quickly."
                : "Slow down. You're sending messages too quickly.",
            reason: result.reason,
          },
          { status: 429 },
        );
      }
    }

    // Check for blocked words
    if (settings.blockedWords.enabled && settings.blockedWords.words.length > 0) {
      const contentLower = content.toLowerCase();
      const hasBlockedWord = settings.blockedWords.words.some((word) =>
        contentLower.includes(word.toLowerCase())
      );
      if (hasBlockedWord) {
        return NextResponse.json(
          { error: "Your message contains blocked content." },
          { status: 400 }
        );
      }
    }

    const { data: room } = await supabase
      .from("rooms")
      .select("id,user_a,user_b,ended_at,is_ai_room")
      .eq("id", roomId)
      .maybeSingle();

    if (!room || room.ended_at) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (room.user_a !== user.id && room.user_b !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: msg, error: insErr } = await supabase
      .from("messages")
      .insert({ room_id: roomId, user_id: user.id, content })
      .select("id,room_id,user_id,content,created_at,is_from_ai")
      .single();

    if (insErr) {
      void logError({
        source: "/api/chat/send-message",
        message: insErr.message,
        userId: user.id,
        metadata: { roomId },
      });
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ message: msg });
  } catch (e) {
    console.error(e);
    void logError({
      source: "/api/chat/send-message",
      message: e instanceof Error ? e.message : "Unknown error",
      stack: e instanceof Error ? e.stack : undefined,
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

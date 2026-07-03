import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { logError } from "@/lib/ops/error-log";
import { clientIp } from "@/lib/moderation/client-ip";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
      reportedUserId?: string | null;
      roomId?: string;
      reason?: string;
      transcript?: { role: string; content: string; at?: string }[];
      reporterDeviceId?: string;
      reportedDeviceId?: string;
      blockForSession?: boolean;
    };

    if (!body.roomId || !body.reason?.trim()) {
      return NextResponse.json({ error: "roomId and reason required" }, { status: 400 });
    }

    const { data: reportId, error } = await supabase.rpc("submit_user_report", {
      p_reported_user_id: body.reportedUserId ?? null,
      p_room_id: body.roomId,
      p_reason: body.reason.trim(),
      p_transcript: body.transcript ?? [],
      p_reporter_device_id: body.reporterDeviceId ?? null,
      p_reported_device_id: body.reportedDeviceId ?? null,
    });

    if (error) {
      void logError({
        source: "/api/chat/report",
        message: error.message,
        userId: user.id,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ip = clientIp(req as import("next/server").NextRequest);
    if (reportId && ip) {
      const admin = createServiceRoleClient();
      await admin.from("user_reports").update({ reporter_ip: ip }).eq("id", reportId);
    }

    await supabase.rpc("end_active_room", { p_room_id: body.roomId });

    return NextResponse.json({
      reportId,
      blockForSession: Boolean(body.blockForSession && body.reportedUserId),
      reportedUserId: body.reportedUserId ?? null,
    });
  } catch (e) {
    console.error(e);
    void logError({
      source: "/api/chat/report",
      message: e instanceof Error ? e.message : "Unknown error",
      stack: e instanceof Error ? e.stack : undefined,
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

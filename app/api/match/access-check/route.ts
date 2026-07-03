import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { clientIp } from "@/lib/moderation/client-ip";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ allowed: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { deviceId?: string };
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
    return NextResponse.json({ allowed: false, reason: "blocked" }, { status: 403 });
  }

  return NextResponse.json({ allowed: true });
}

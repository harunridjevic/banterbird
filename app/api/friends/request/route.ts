import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendFriendSystemMessage } from "@/lib/friends/chat-system-message";

/**
 * POST /api/friends/request
 * Body: { username: string } - find by username (from friends panel)
 *    OR { peerId: string }   - find by user ID directly (from chat room)
 *
 * Always does a true DELETE + INSERT so Supabase Realtime fires an INSERT
 * event on the recipient's subscription, even if they had a previous request.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { username?: string; peerId?: string };

    let targetId: string | null = null;

    if (body.peerId) {
      targetId = body.peerId;
    } else if (body.username?.trim()) {
      const { data: target } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", body.username.trim())
        .maybeSingle();
      if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
      targetId = target.id;
    } else {
      return NextResponse.json({ error: "username or peerId required" }, { status: 400 });
    }

    if (targetId === user.id) {
      return NextResponse.json({ error: "You can't add yourself." }, { status: 400 });
    }

    // targetId is guaranteed non-null here — all null paths returned above
    const resolvedTargetId: string = targetId;

    // Already friends → bail
    const { data: alreadyFriend } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id)
      .eq("friend_id", resolvedTargetId)
      .maybeSingle();

    if (alreadyFriend) return NextResponse.json({ error: "Already friends." }, { status: 409 });

    // Resolve sender's username for system message text
    const svc = createServiceRoleClient();
    const { data: senderProfile } = await svc
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    const senderName = senderProfile?.username ?? "Someone";

    // Delete any prior request (accepted/declined/pending) so we can INSERT fresh.
    await svc
      .from("friend_requests")
      .delete()
      .eq("from_id", user.id)
      .eq("to_id", resolvedTargetId);

    // Also delete any reverse request (in case they already sent one to us).
    // If so, just accept it and become friends instead of creating a loop.
    const { data: reverseRequest } = await supabase
      .from("friend_requests")
      .select("id")
      .eq("from_id", resolvedTargetId)
      .eq("to_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (reverseRequest) {
      // Auto-accept: they already asked us, so just become friends
      await svc.from("friend_requests").update({ status: "accepted" }).eq("id", reverseRequest.id);
      await svc.from("friendships").upsert([
        { user_id: user.id, friend_id: resolvedTargetId },
        { user_id: resolvedTargetId, friend_id: user.id },
      ], { onConflict: "user_id,friend_id" });

      // System message: you are now friends (visible to both sides)
      await sendFriendSystemMessage(user.id, resolvedTargetId, `You are now friends with ${senderName}`);

      return NextResponse.json({ ok: true, autoAccepted: true });
    }

    // Fresh INSERT - triggers Realtime INSERT event on recipient
    const { error: insertErr } = await svc
      .from("friend_requests")
      .insert({ from_id: user.id, to_id: resolvedTargetId, status: "pending" });

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // System message to both sides: sender sees confirmation, recipient sees the request
    await sendFriendSystemMessage(user.id, resolvedTargetId, `${senderName} sent a friend request`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}

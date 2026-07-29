import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendFriendSystemMessage } from "@/lib/friends/chat-system-message";

/** POST /api/friends/respond - accept or decline a pending friend request */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { requestId?: string; action?: "accept" | "decline" };
    const { requestId, action } = body;
    if (!requestId || !action) return NextResponse.json({ error: "requestId and action required" }, { status: 400 });
    if (action !== "accept" && action !== "decline") return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });

    // Verify the request is addressed to this user
    const { data: request } = await supabase
      .from("friend_requests")
      .select("id,from_id,to_id,status")
      .eq("id", requestId)
      .eq("to_id", user.id)
      .maybeSingle();

    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (request.status !== "pending") return NextResponse.json({ error: "Request already resolved." }, { status: 409 });

    // Resolve usernames for system message text
    const svc = createServiceRoleClient();
    const [{ data: responderProfile }, { data: senderProfile }] = await Promise.all([
      svc.from("profiles").select("username").eq("id", user.id).maybeSingle(),
      svc.from("profiles").select("username").eq("id", request.from_id).maybeSingle(),
    ]);
    const responderName = responderProfile?.username ?? "Someone";
    const senderName = senderProfile?.username ?? "Someone";

    if (action === "decline") {
      await supabase.from("friend_requests").update({ status: "declined" }).eq("id", requestId);
      // Let the sender know in-chat if they're still in the same room
      await sendFriendSystemMessage(
        user.id,
        request.from_id,
        `${responderName} declined your friend request`,
      );
      return NextResponse.json({ ok: true });
    }

    // Accept: mark request + insert mutual friendship rows (service role bypasses RLS)
    await svc.from("friend_requests").update({ status: "accepted" }).eq("id", requestId);
    await svc.from("friendships").upsert([
      { user_id: request.from_id, friend_id: request.to_id },
      { user_id: request.to_id, friend_id: request.from_id },
    ], { onConflict: "user_id,friend_id" });

    // System message visible to both sides
    await sendFriendSystemMessage(
      user.id,
      request.from_id,
      `${responderName} accepted ${senderName}'s friend request — you are now friends`,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

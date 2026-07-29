import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Find the active (non-ended) room shared by two users and insert a
 * [system] message into it. Silent no-op if no active room exists.
 */
export async function sendFriendSystemMessage(
  userIdA: string,
  userIdB: string,
  text: string,
): Promise<void> {
  try {
    const svc = createServiceRoleClient();

    // Use two separate queries to avoid fragile PostgREST compound-or syntax.
    // Check both orderings since user_a/user_b assignment depends on who matched first.
    const [{ data: roomAB }, { data: roomBA }] = await Promise.all([
      svc
        .from("rooms")
        .select("id")
        .eq("user_a", userIdA)
        .eq("user_b", userIdB)
        .is("ended_at", null)
        .maybeSingle(),
      svc
        .from("rooms")
        .select("id")
        .eq("user_a", userIdB)
        .eq("user_b", userIdA)
        .is("ended_at", null)
        .maybeSingle(),
    ]);

    const room = roomAB ?? roomBA;
    if (!room) return;

    // messages_sender_ai_check constraint: user_id null requires is_from_ai true
    await svc.from("messages").insert({
      room_id: room.id,
      user_id: null,
      content: `[system]${text}`,
      is_from_ai: true,
    });
  } catch {
    // System messages are best-effort — never block the main action
  }
}

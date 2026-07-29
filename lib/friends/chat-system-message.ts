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

    // Look for an active room where both users are participants
    const { data: room } = await svc
      .from("rooms")
      .select("id")
      .or(
        `and(user_a.eq.${userIdA},user_b.eq.${userIdB}),and(user_a.eq.${userIdB},user_b.eq.${userIdA})`,
      )
      .is("ended_at", null)
      .maybeSingle();

    if (!room) return;

    await svc.from("messages").insert({
      room_id: room.id,
      user_id: null,
      content: `[system]${text}`,
      is_from_ai: false,
    });
  } catch {
    // System messages are best-effort — never block the main action
  }
}

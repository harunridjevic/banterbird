import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseUrl } from "@/utils/supabase/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { roomId } = (await request.json()) as { roomId?: string };

  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  }

  const supabaseUrl = getSupabaseUrl();
  // IMPORTANT: Use the service role key to bypass RLS.
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase URL or Service Role Key is not configured.");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Delete messages associated with the room
    const { error: messagesError } = await supabaseAdmin.from("messages").delete().eq("room_id", roomId);

    if (messagesError) {
      console.error(`Error deleting messages for room ${roomId}:`, messagesError);
      // We can choose to continue to delete the room even if message deletion fails.
    }

    // Delete the room itself
    const { error: roomError } = await supabaseAdmin.from("rooms").delete().eq("id", roomId);

    if (roomError) {
      console.error(`Error deleting room ${roomId}:`, roomError);
      return NextResponse.json({ error: roomError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const error = e as Error;
    console.error(`Unexpected error cleaning up room ${roomId}:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
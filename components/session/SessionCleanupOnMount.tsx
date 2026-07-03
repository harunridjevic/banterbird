"use client";

import { useEffect } from "react";
import { useSupabase } from "@/app/providers";
import { tabCloseFetch } from "@/lib/presence/tab-close-fetch";

/** Leave match queue and end active chats when navigating away to legal/static pages. */
export function SessionCleanupOnMount() {
  const { client, ready } = useSupabase();

  useEffect(() => {
    if (!ready) return;
    void client.rpc("leave_match_queue");
    void client.rpc("end_user_active_rooms");
    tabCloseFetch("/api/presence/leave");
  }, [client, ready]);

  return null;
}

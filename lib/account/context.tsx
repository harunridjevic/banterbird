"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountState, Profile } from "./types";

type AccountCtx = {
  state: AccountState;
  refresh: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  modalOpen: boolean;
};

const AccountContext = createContext<AccountCtx | null>(null);

export function AccountProvider({
  children,
  supabase,
}: {
  children: ReactNode;
  supabase: SupabaseClient;
}) {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const [modalOpen, setModalOpen] = useState(false);

  // Track the last known anonymous user ID so we can migrate
  // pending friend requests when they sign up / sign in.
  const lastAnonIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setState({ status: "anonymous" });
      return;
    }

    const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous ?? false;

    if (isAnonymous) {
      // Remember the anonymous user ID — needed for migration if they sign up
      lastAnonIdRef.current = user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url,self_gender,wants_gender")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.username) {
        setState({ status: "named", profile: profile as Profile });
      } else {
        setState({ status: "anonymous" });
      }
      return;
    }

    // Named / OAuth user — fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url,self_gender,wants_gender")
      .eq("id", user.id)
      .maybeSingle();

    setState({
      status: "named",
      profile: (profile ?? {
        id: user.id,
        username: null,
        display_name: null,
        avatar_url: null,
        self_gender: null,
        wants_gender: null,
      }) as Profile,
    });

    // If we have a previous anonymous ID that is different from this named ID,
    // migrate any pending friend requests that were addressed to the anon session.
    const oldAnonId = lastAnonIdRef.current;
    if (oldAnonId && oldAnonId !== user.id) {
      lastAnonIdRef.current = null; // clear so we only migrate once
      void fetch("/api/auth/migrate-pending-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldUserId: oldAnonId }),
      });
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [supabase, refresh]);

  return (
    <AccountContext.Provider
      value={{
        state,
        refresh,
        openModal: () => setModalOpen(true),
        closeModal: () => setModalOpen(false),
        modalOpen,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountCtx {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}

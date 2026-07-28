"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setState({ status: "anonymous" });
      return;
    }

    const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous ?? false;

    if (isAnonymous) {
      // Check if they have a profile with a username (converted anonymous user)
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

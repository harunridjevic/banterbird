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
import { isProActive, type AccountState, type Profile } from "./types";

const PROFILE_COLUMNS =
  "id,username,display_name,avatar_url,self_gender,wants_gender,is_pro,pro_until";

function asProfile(row: Partial<Profile> | null | undefined, fallbackId: string): Profile {
  return {
    id: row?.id ?? fallbackId,
    username: row?.username ?? null,
    display_name: row?.display_name ?? null,
    avatar_url: row?.avatar_url ?? null,
    self_gender: row?.self_gender ?? null,
    wants_gender: row?.wants_gender ?? null,
    is_pro: Boolean(row?.is_pro),
    pro_until: row?.pro_until ?? null,
  };
}

type AccountCtx = {
  state: AccountState;
  /** Active PRO for the named account (false while loading / anonymous). */
  isPro: boolean;
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
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.username) {
        // Soft-expire PRO if the period already ended
        void fetch("/api/billing/status").catch(() => {});
        setState({ status: "named", profile: asProfile(profile as Profile, user.id) });
      } else {
        setState({ status: "anonymous" });
      }
      return;
    }

    // Named / OAuth user — fetch profile
    let { data: profile } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();

    // Self-healing: if a Google (or any OAuth) user has no username yet,
    // ask the server to assign one derived from their email, then re-fetch.
    if (!profile?.username) {
      try {
        const res = await fetch("/api/auth/repair-username", { method: "POST" });
        if (res.ok) {
          const { data: repaired } = await supabase
            .from("profiles")
            .select(PROFILE_COLUMNS)
            .eq("id", user.id)
            .maybeSingle();
          if (repaired) profile = repaired;
        }
      } catch {
        // Non-fatal — fall through with whatever profile we have.
      }
    }

    // Sync expired PRO on the server, then re-read flags if needed
    try {
      const statusRes = await fetch("/api/billing/status");
      if (statusRes.ok) {
        const status = (await statusRes.json()) as {
          isPro?: boolean;
          proUntil?: string | null;
        };
        if (profile) {
          profile = {
            ...profile,
            is_pro: Boolean(status.isPro),
            pro_until: status.proUntil ?? null,
          };
        }
      }
    } catch {
      // Non-fatal
    }

    setState({
      status: "named",
      profile: asProfile(profile as Profile | null, user.id),
    });
  }, [supabase]);

  useEffect(() => {
    void refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [supabase, refresh]);

  const isPro =
    state.status === "named" ? isProActive(state.profile) : false;

  return (
    <AccountContext.Provider
      value={{
        state,
        isPro,
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

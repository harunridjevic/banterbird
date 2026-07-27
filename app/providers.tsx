"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider } from "next-themes";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { ensureAnonymousSession, formatAuthError } from "@/lib/auth/ensure-anonymous-session";
import { OnlinePresenceProvider } from "@/components/presence/OnlinePresenceProvider";
import { ClientErrorReporter } from "@/components/monitoring/ClientErrorReporter";
import { BotSettingsProvider } from "@/lib/ops/bot-settings-provider";
import { AccountProvider } from "@/lib/account/context";
import { AccountModal } from "@/components/account/AccountModal";
import { AuthErrorHandler } from "@/components/auth/AuthErrorHandler";

type SupabaseCtx = {
  client: SupabaseClient;
  ready: boolean;
  authError: string | null;
};

const SupabaseContext = createContext<SupabaseCtx | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const client = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await ensureAnonymousSession(client);
      if (cancelled) return;
      if (!result.ok) {
        setAuthError(formatAuthError(result.error));
        console.error("Anonymous sign-in failed:", result.error);
      } else {
        setAuthError(null);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SupabaseContext.Provider value={{ client, ready, authError }}>
        <BotSettingsProvider>
          <OnlinePresenceProvider>
            <AccountProvider supabase={client}>
              <ClientErrorReporter />
              <AuthErrorHandler />
              <AccountModal />
              {children}
            </AccountProvider>
          </OnlinePresenceProvider>
        </BotSettingsProvider>
      </SupabaseContext.Provider>
    </ThemeProvider>
  );
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within AppProviders");
  return ctx;
}

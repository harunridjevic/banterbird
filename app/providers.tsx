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

type SupabaseCtx = {
  client: SupabaseClient;
  ready: boolean;
};

const SupabaseContext = createContext<SupabaseCtx | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const client = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session) {
        const { error } = await client.auth.signInAnonymously();
        if (error) {
          console.error("Anonymous sign-in failed:", error.message);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SupabaseContext.Provider value={{ client, ready }}>
        {children}
      </SupabaseContext.Provider>
    </ThemeProvider>
  );
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within AppProviders");
  return ctx;
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  BOT_SETTINGS_CHANGED_EVENT,
  DEFAULT_BOT_SETTINGS,
  parseBotSettings,
  type BotSettings,
} from "@/lib/ops/bot-settings";

const BotSettingsContext = createContext<BotSettings>(DEFAULT_BOT_SETTINGS);

const REFRESH_MS = 30_000;

export function BotSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BotSettings>(DEFAULT_BOT_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (!res.ok) return;
        const data = (await res.json()) as { botSettings?: unknown };
        const parsed = parseBotSettings(data.botSettings);
        if (!cancelled && parsed) {
          setSettings(parsed);
          window.dispatchEvent(new CustomEvent(BOT_SETTINGS_CHANGED_EVENT));
        }
      } catch {
        // keep last known settings
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return <BotSettingsContext.Provider value={settings}>{children}</BotSettingsContext.Provider>;
}

export function useGlobalBotSettings(): BotSettings {
  return useContext(BotSettingsContext);
}

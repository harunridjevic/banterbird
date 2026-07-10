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
import {
  DEFAULT_APP_SETTINGS,
  type AgeGateSettings,
} from "@/lib/ops/app-settings";

const BotSettingsContext = createContext<BotSettings | null>(null);
const BotSettingsLoadedContext = createContext<boolean>(false);
const AgeGateContext = createContext<AgeGateSettings>(DEFAULT_APP_SETTINGS.ageGate);

const REFRESH_MS = 30_000;

export function BotSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [ageGate, setAgeGate] = useState<AgeGateSettings>(DEFAULT_APP_SETTINGS.ageGate);
  const [loaded, setLoaded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (!res.ok) return;
        const data = (await res.json()) as {
          botSettings?: unknown;
          ageGate?: Partial<AgeGateSettings>;
        };
        const parsed = parseBotSettings(data.botSettings);
        if (!cancelled && parsed) {
          setSettings(parsed);
          setLoaded(true);
          if (data.ageGate) {
            setAgeGate({
              enabled: data.ageGate.enabled ?? DEFAULT_APP_SETTINGS.ageGate.enabled,
              minimumAge: data.ageGate.minimumAge ?? DEFAULT_APP_SETTINGS.ageGate.minimumAge,
            });
          }
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

  return (
    <BotSettingsLoadedContext.Provider value={loaded}>
      <AgeGateContext.Provider value={ageGate}>
        <BotSettingsContext.Provider value={settings}>{children}</BotSettingsContext.Provider>
      </AgeGateContext.Provider>
    </BotSettingsLoadedContext.Provider>
  );
}

export function useGlobalBotSettings(): BotSettings {
  const settings = useContext(BotSettingsContext);
  return settings ?? DEFAULT_BOT_SETTINGS;
}

export function useGlobalBotSettingsLoaded(): boolean {
  return useContext(BotSettingsLoadedContext);
}

export function useAgeGateSettings(): AgeGateSettings {
  return useContext(AgeGateContext);
}

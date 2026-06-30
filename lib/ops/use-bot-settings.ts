"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BOT_SETTINGS_CHANGED_EVENT,
  DEFAULT_BOT_SETTINGS,
  loadBotSettings,
  saveBotSettings,
  type BotSettings,
} from "@/lib/ops/bot-settings";

export function useBotSettings() {
  const [settings, setSettings] = useState<BotSettings>(DEFAULT_BOT_SETTINGS);

  useEffect(() => {
    setSettings(loadBotSettings());

    const refresh = () => setSettings(loadBotSettings());
    window.addEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", (e) => {
      if (e.key === "banterbird:bot-settings") refresh();
    });
    return () => window.removeEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
  }, []);

  const save = useCallback((next: BotSettings) => {
    setSettings(saveBotSettings(next));
  }, []);

  const reset = useCallback(() => {
    setSettings(saveBotSettings(DEFAULT_BOT_SETTINGS));
  }, []);

  return { settings, save, reset };
}

"use client";

import { useEffect, useState } from "react";
import {
  BOT_SETTINGS_CHANGED_EVENT,
  loadBotSettings,
} from "@/lib/ops/bot-settings";
import {
  computeDisplayOnlineCount,
  msUntilNextDisplayOnlineCount,
} from "@/lib/ops/display-online-count";
import { useOnlineCount } from "@/lib/ops/use-online-count";

export function useDisplayOnlineCount(): number {
  const liveCount = useOnlineCount();
  const [overrideEnabled, setOverrideEnabled] = useState(
    () => loadBotSettings().displayOnlineCountOverride,
  );
  const [settingsTick, setSettingsTick] = useState(0);
  const [displayCount, setDisplayCount] = useState(() => {
    const settings = loadBotSettings();
    return settings.displayOnlineCountOverride
      ? computeDisplayOnlineCount(settings)
      : liveCount;
  });

  useEffect(() => {
    const refresh = () => {
      setOverrideEnabled(loadBotSettings().displayOnlineCountOverride);
      setSettingsTick((tick) => tick + 1);
    };
    refresh();
    window.addEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", (e) => {
      if (e.key === "banterbird:bot-settings") refresh();
    });
    return () => window.removeEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!overrideEnabled) {
      setDisplayCount(liveCount);
      return;
    }

    const sync = () => {
      const settings = loadBotSettings();
      if (!settings.displayOnlineCountOverride) {
        setOverrideEnabled(false);
        setDisplayCount(liveCount);
        return;
      }
      setDisplayCount(computeDisplayOnlineCount(settings));
    };

    sync();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const settings = loadBotSettings();
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        sync();
        scheduleNext();
      }, msUntilNextDisplayOnlineCount(settings));
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [overrideEnabled, liveCount, settingsTick]);

  return displayCount;
}

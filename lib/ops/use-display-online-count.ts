"use client";

import { useEffect, useState } from "react";
import { BOT_SETTINGS_CHANGED_EVENT } from "@/lib/ops/bot-settings";
import { useGlobalBotSettings } from "@/lib/ops/bot-settings-provider";
import {
  computeDisplayOnlineCount,
  msUntilNextDisplayOnlineCount,
} from "@/lib/ops/display-online-count";
import { useOnlineCount } from "@/lib/ops/use-online-count";

export function useDisplayOnlineCount(): number {
  const liveCount = useOnlineCount();
  const globalBotSettings = useGlobalBotSettings();
  const [overrideEnabled, setOverrideEnabled] = useState(
    globalBotSettings.displayOnlineCountOverride,
  );
  const [settingsTick, setSettingsTick] = useState(0);
  const [displayCount, setDisplayCount] = useState(() =>
    globalBotSettings.displayOnlineCountOverride
      ? computeDisplayOnlineCount(globalBotSettings)
      : liveCount,
  );

  useEffect(() => {
    const refresh = () => {
      setOverrideEnabled(globalBotSettings.displayOnlineCountOverride);
      setSettingsTick((tick) => tick + 1);
    };
    refresh();
    window.addEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
  }, [globalBotSettings.displayOnlineCountOverride]);

  useEffect(() => {
    if (!overrideEnabled) {
      setDisplayCount(liveCount);
      return;
    }

    const sync = () => {
      if (!globalBotSettings.displayOnlineCountOverride) {
        setOverrideEnabled(false);
        setDisplayCount(liveCount);
        return;
      }
      setDisplayCount(computeDisplayOnlineCount(globalBotSettings));
    };

    sync();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        sync();
        scheduleNext();
      }, msUntilNextDisplayOnlineCount(globalBotSettings));
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [overrideEnabled, liveCount, settingsTick, globalBotSettings]);

  return displayCount;
}

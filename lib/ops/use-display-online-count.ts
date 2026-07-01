"use client";

import { useEffect, useState } from "react";
import {
  BOT_SETTINGS_CHANGED_EVENT,
  loadBotSettings,
  randomIntInclusive,
} from "@/lib/ops/bot-settings";
import { useOnlineCount } from "@/lib/ops/use-online-count";

function pickDisplayCount(): number {
  const settings = loadBotSettings();
  return randomIntInclusive(settings.displayOnlineCountMin, settings.displayOnlineCountMax);
}

function pickChangeDelayMs(): number {
  const settings = loadBotSettings();
  return randomIntInclusive(settings.displayOnlineCountChangeMinMs, settings.displayOnlineCountChangeMaxMs);
}

export function useDisplayOnlineCount(): number {
  const liveCount = useOnlineCount();
  const [overrideEnabled, setOverrideEnabled] = useState(
    () => loadBotSettings().displayOnlineCountOverride,
  );
  const [settingsTick, setSettingsTick] = useState(0);
  const [displayCount, setDisplayCount] = useState(() =>
    loadBotSettings().displayOnlineCountOverride ? pickDisplayCount() : liveCount,
  );

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

    setDisplayCount(pickDisplayCount());

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const settings = loadBotSettings();
        if (!settings.displayOnlineCountOverride) {
          setOverrideEnabled(false);
          setDisplayCount(liveCount);
          return;
        }
        setDisplayCount(pickDisplayCount());
        scheduleNext();
      }, pickChangeDelayMs());
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [overrideEnabled, liveCount, settingsTick]);

  return displayCount;
}

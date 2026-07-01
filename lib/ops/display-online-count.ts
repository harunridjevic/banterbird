import type { BotSettings } from "@/lib/ops/bot-settings";

/** Deterministic 32-bit hash for a time slot + settings fingerprint. */
function hashSlot(slotIndex: number, settings: BotSettings): number {
  let h =
    slotIndex ^
    Math.imul(settings.displayOnlineCountMin, 0x9e3779b1) ^
    Math.imul(settings.displayOnlineCountMax, 0x85ebca6b) ^
    Math.imul(settings.displayOnlineCountChangeMinMs, 0xc2b2ae35) ^
    Math.imul(settings.displayOnlineCountChangeMaxMs, 0x27d4eb2d);

  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function averageSlotDurationMs(settings: BotSettings): number {
  return Math.max(
    500,
    Math.floor(
      (settings.displayOnlineCountChangeMinMs + settings.displayOnlineCountChangeMaxMs) / 2,
    ),
  );
}

function countForKeyframe(keyframe: number, settings: BotSettings): number {
  const range = settings.displayOnlineCountMax - settings.displayOnlineCountMin;
  if (range <= 0) return settings.displayOnlineCountMin;
  return settings.displayOnlineCountMin + (hashSlot(keyframe, settings) % (range + 1));
}

/**
 * Synthetic online count derived from UTC time and ops settings.
 * Identical settings + time window => same value on every tab, device, and refresh.
 */
export function computeDisplayOnlineCount(
  settings: BotSettings,
  nowMs: number = Date.now(),
): number {
  const slotDuration = averageSlotDurationMs(settings);
  const slotIndex = Math.floor(nowMs / slotDuration);
  const keyframeSize = 4;
  const keyframe = Math.floor(slotIndex / keyframeSize);
  const progress = (slotIndex % keyframeSize) / keyframeSize;

  const start = countForKeyframe(keyframe, settings);
  const end = countForKeyframe(keyframe + 1, settings);
  return Math.round(start + (end - start) * progress);
}

export function msUntilNextDisplayOnlineCount(
  settings: BotSettings,
  nowMs: number = Date.now(),
): number {
  const slotDuration = averageSlotDurationMs(settings);
  const nextBoundary = (Math.floor(nowMs / slotDuration) + 1) * slotDuration;
  return Math.max(250, nextBoundary - nowMs);
}

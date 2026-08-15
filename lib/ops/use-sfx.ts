"use client";
"use client";

/**
 * useSFX — plays sound effects during live VideoPreview playback.
 *
 * Watches elapsedMs and fires each SFX exactly once when its trigger
 * time is crossed. Resets when the script changes (restart).
 */

import { useEffect, useRef } from "react";
import type { VideoScript } from "./video-generator-types";
import { buildTimeline } from "./video-generator-types";
import {
  sfxMessagePop,
  sfxMessageWhoosh,
  sfxChoicesWhoosh,
  sfxPulseHit,
  sfxWinnerReveal,
  sfxConfettiBurst,
  sfxCtaRise,
  sfxTyping,
} from "./sfx";
import type { ChoicePhase } from "@/components/ops/video-gen/ChoicesOverlay";

interface SFXTrigger {
  timeMs: number;
  play: () => void;
  fired: boolean;
}

export function useSFX(
  script: VideoScript,
  elapsedMs: number,
  isPlaying: boolean,
  choicePhase: ChoicePhase,
) {
  const triggersRef = useRef<SFXTrigger[]>([]);
  const prevPhaseRef = useRef<ChoicePhase>("hidden");

  // Rebuild triggers when script changes
  useEffect(() => {
    const tl = buildTimeline(script);

    const t: SFXTrigger[] = [
      // Typing sounds before each stranger message (up to 900ms typing window)
      ...script.strangerMessages.flatMap((_, i) => {
        const msgTime = tl.strangerMessageTimes[i];
        const typingStart = Math.max(0, msgTime - 900);
        const typingDuration = msgTime - typingStart;
        const typingSounds: SFXTrigger[] = [];
        // Add typing clicks every 150ms during the typing period
        for (let offset = 0; offset < typingDuration; offset += 150) {
          typingSounds.push({
            timeMs: typingStart + offset,
            play:   sfxTyping,
            fired:  false,
          });
        }
        return typingSounds;
      }),
      // Each stranger message
      ...script.strangerMessages.map((_, i) => ({
        timeMs: tl.strangerMessageTimes[i],
        play:   sfxMessagePop,
        fired:  false,
      })),
      // Each response message (user's own)
      ...script.responseMessages.map((_, i) => ({
        timeMs: tl.responseMessageTimes[i],
        play:   sfxMessageWhoosh,
        fired:  false,
      })),
      // Choices appear
      { timeMs: tl.choicesAppearTime,  play: sfxChoicesWhoosh, fired: false },
      // Pulse A
      { timeMs: tl.aHighlightTime,     play: sfxPulseHit,      fired: false },
      // Pulse B
      { timeMs: tl.bHighlightTime,     play: sfxPulseHit,      fired: false },
      // Winner reveal
      { timeMs: tl.winnerRevealTime,   play: sfxWinnerReveal,  fired: false },
      // Confetti burst 200ms after winner
      { timeMs: tl.winnerRevealTime + 200, play: sfxConfettiBurst, fired: false },
      // CTA appear
      { timeMs: tl.ctaAppearTime,      play: sfxCtaRise,       fired: false },
    ];

    triggersRef.current = t;
    prevPhaseRef.current = "hidden";
  }, [script]);

  // Fire triggers as elapsedMs advances
  useEffect(() => {
    if (!isPlaying) return;

    for (const t of triggersRef.current) {
      if (!t.fired && elapsedMs >= t.timeMs) {
        t.fired = true;
        try { t.play(); } catch {}
      }
    }
  }, [elapsedMs, isPlaying]);

  // Reset fired flags when playback restarts (elapsedMs goes back to ~0)
  useEffect(() => {
    if (elapsedMs < 50) {
      for (const t of triggersRef.current) {
        t.fired = false;
      }
    }
  }, [elapsedMs]);
}

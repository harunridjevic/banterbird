"use client";

/**
 * VideoPreview
 *
 * Orchestrates the full video playback timeline inside the 9:16 frame.
 * It owns a requestAnimationFrame loop that advances `elapsedMs`, then
 * computes which messages are visible and which choice-phase is active,
 * and passes those down to VideoTemplate / ChoicesOverlay / CTAScreen.
 *
 * The outer div is the ref target used by the MP4 export pipeline
 * (html2canvas will capture it frame-by-frame).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { VideoScript } from "@/lib/ops/video-generator-types";
import { buildTimeline } from "@/lib/ops/video-generator-types";
import { VideoTemplate } from "./VideoTemplate";
import { ChoicesOverlay, type ChoicePhase } from "./ChoicesOverlay";
import { CTAScreen } from "./CTAScreen";
import type { ChatMessage } from "@/lib/ops/video-generator-types";

export interface VideoPreviewHandle {
  /** Start / restart playback from t=0 */
  play: () => void;
  /** Pause at current frame */
  pause: () => void;
  /** Whether playback is currently running */
  isPlaying: boolean;
  /** 0..1 progress ratio */
  progress: number;
  /** Elapsed ms */
  elapsedMs: number;
  /** Total duration ms */
  totalMs: number;
}

interface Props {
  script: VideoScript;
  onEnd?: () => void;
  playbackRate?: number;
  instantTransitions?: boolean;
  /** Multiplies all animation durations — use >1 to slow down for export */
  slowFactor?: number;
}

export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(
  function VideoPreview({ script, onEnd, playbackRate = 1, instantTransitions = false, slowFactor = 1 }, ref) {
    const timeline = buildTimeline(script);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const rafRef = useRef<number | null>(null);
    const startWallRef = useRef<number | null>(null);
    const startElapsedRef = useRef(0);
    const endFiredRef = useRef(false);

    // ── Derived state from elapsed ────────────────────────────────────────

    // Which stranger messages are visible
    const visibleStranger: ChatMessage[] = script.strangerMessages.filter(
      (_, i) => elapsedMs >= timeline.strangerMessageTimes[i]
    );

    // Is stranger typing (before the next message arrives)?
    const nextStrangerIdx = script.strangerMessages.findIndex(
      (_, i) => elapsedMs < timeline.strangerMessageTimes[i]
    );
    const strangerTyping =
      nextStrangerIdx !== -1 &&
      elapsedMs >= (timeline.strangerMessageTimes[nextStrangerIdx] ?? 0) - 900 &&
      elapsedMs < (timeline.strangerMessageTimes[nextStrangerIdx] ?? 0);

    // Which response messages are visible
    const visibleResponse: ChatMessage[] = script.responseMessages.filter(
      (_, i) => elapsedMs >= timeline.responseMessageTimes[i]
    );

    const allMessages = [...visibleStranger, ...visibleResponse];

    // Choice phase
    const choicePhase: ChoicePhase = (() => {
      const { choicesAppearTime, aHighlightTime, bHighlightTime, winnerRevealTime } =
        timeline;
      const winnerSlot = script.choiceConfig.winnerSlot;

      if (elapsedMs < choicesAppearTime) return "hidden";

      const afterWinner =
        winnerRevealTime + script.choiceConfig.winnerHoldMs;

      if (elapsedMs >= afterWinner) return "exit";

      if (elapsedMs >= winnerRevealTime) {
        return winnerSlot === "A" ? "winner-a" : "winner-b";
      }
      if (elapsedMs >= bHighlightTime) return "pulse-b";
      if (elapsedMs >= aHighlightTime) return "pulse-a";
      return "enter";
    })();

    // CTA visible
    const ctaVisible = elapsedMs >= timeline.ctaAppearTime;

    // During export (slowFactor > 1), compute CTA opacity directly from
    // elapsed time so html2canvas captures the correct fade-in value
    // instead of relying on a Framer Motion tween running against wall clock.
    const ctaFadeDuration = 550 * slowFactor; // matches CTAScreen tween duration
    const ctaElapsed = elapsedMs - timeline.ctaAppearTime;
    const ctaExportOpacity = slowFactor > 1
      ? ctaVisible
        ? Math.min(1, Math.max(0, ctaElapsed / ctaFadeDuration))
        : 0
      : undefined;

    // ── Playback loop ─────────────────────────────────────────────────────

    const playbackRateRef = useRef(playbackRate);
    playbackRateRef.current = playbackRate;

    const tick = useCallback(
      (now: number) => {
        if (startWallRef.current === null) {
          startWallRef.current = now;
        }
        const wall = (now - startWallRef.current) * playbackRateRef.current;
        const next = startElapsedRef.current + wall;

        if (next >= timeline.totalDuration) {
          setElapsedMs(timeline.totalDuration);
          setIsPlaying(false);
          if (!endFiredRef.current) {
            endFiredRef.current = true;
            onEnd?.();
          }
          return;
        }

        setElapsedMs(next);
        rafRef.current = requestAnimationFrame(tick);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [timeline.totalDuration, onEnd]
    );

    const play = useCallback(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // If at end, restart from zero
      const startFrom =
        elapsedMs >= timeline.totalDuration ? 0 : elapsedMs;
      if (startFrom === 0) setElapsedMs(0);
      startWallRef.current = null;
      startElapsedRef.current = startFrom;
      endFiredRef.current = false;
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    }, [elapsedMs, timeline.totalDuration, tick]);

    const pause = useCallback(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startWallRef.current = null;
      startElapsedRef.current = elapsedMs;
      setIsPlaying(false);
    }, [elapsedMs]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    // Restart when script changes
    useEffect(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      setElapsedMs(0);
      setIsPlaying(false);
      startWallRef.current = null;
      startElapsedRef.current = 0;
      endFiredRef.current = false;
    }, [script]);

    // ── Export mode: watch data-export-elapsed on the closest ancestor ──
    // The export pipeline sets frameEl.dataset.exportElapsed on the wrapper
    // div in the page. We look up the DOM tree to find it.
    const frameElRef2 = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      const el = frameElRef2.current;
      if (!el) return;

      // The export pipeline sets data-export-elapsed on the closest ancestor
      // that has [data-video-frame] or the immediate parentElement.
      // We observe the parent since the page's frameElRef wraps this component.
      const target =
        el.closest<HTMLElement>("[data-video-export-root]") ??
        el.parentElement ??
        el;

      const obs = new MutationObserver(() => {
        const raw = (target as HTMLElement).dataset.exportElapsed;
        if (raw !== undefined) {
          const val = Number(raw);
          if (!Number.isNaN(val)) {
            if (rafRef.current !== null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            setElapsedMs(val);
            setIsPlaying(false);
            startElapsedRef.current = val;
          }
        }
      });

      obs.observe(target, { attributes: true, attributeFilter: ["data-export-elapsed"] });
      return () => obs.disconnect();
    }, []);

    // Expose handle
    useImperativeHandle(
      ref,
      () => ({
        play,
        pause,
        isPlaying,
        progress:
          timeline.totalDuration > 0 ? elapsedMs / timeline.totalDuration : 0,
        elapsedMs,
        totalMs: timeline.totalDuration,
      }),
      [play, pause, isPlaying, elapsedMs, timeline.totalDuration]
    );

    // ── Render ────────────────────────────────────────────────────────────

    return (
      <div
        ref={frameElRef2}
        data-video-frame
        className="relative h-full w-full overflow-hidden"
        style={{ background: "#0c121c" }}
      >
        <VideoTemplate
          visibleMessages={allMessages}
          strangerTyping={strangerTyping}
          choicesVisible={choicePhase !== "hidden" && choicePhase !== "exit"}
          instantTransitions={instantTransitions}
          slowFactor={slowFactor}
        />

        <ChoicesOverlay
          choices={script.choiceConfig.choices}
          phase={choicePhase}
          instantTransitions={instantTransitions}
          slowFactor={slowFactor}
        />

        <CTAScreen
          headline={script.ctaConfig.headline}
          subline={script.ctaConfig.subline}
          visible={ctaVisible}
          instantTransitions={instantTransitions}
          slowFactor={slowFactor}
          exportOpacity={ctaExportOpacity}
        />
      </div>
    );
  }
);

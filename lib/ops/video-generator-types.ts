/** Types for the BanterBird Reels / TikTok Video Generator */

export type MessageSender = "stranger" | "me";

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  /** base64 data-URL or object-URL for an attached image */
  imageUrl?: string;
  /** ms from video start before this message appears */
  delayMs: number;
}

export interface Choice {
  id: string;
  label: string;
  /** "A" | "B" */
  slot: "A" | "B";
}

export interface ChoiceConfig {
  choices: [Choice, Choice];
  /** Which slot wins */
  winnerSlot: "A" | "B";
  /** ms from video start before the choices appear */
  appearDelayMs: number;
  /** ms each choice pulses before winner reveal */
  pulseEachMs: number;
  /** ms the winner highlight stays before transitioning out */
  winnerHoldMs: number;
}

export interface CTAConfig {
  /** First line - main CTA */
  headline: string;
  /** Second line - subline */
  subline: string;
  /** ms from video start before CTA appears */
  appearDelayMs: number;
  /** How long the CTA is shown (ms) */
  holdMs: number;
}

export interface VideoScript {
  /** Stranger messages (phase 1) */
  strangerMessages: ChatMessage[];
  /** Choices (phase 2) */
  choiceConfig: ChoiceConfig;
  /** User response messages (phase 3) */
  responseMessages: ChatMessage[];
  /** End CTA (phase 4) */
  ctaConfig: CTAConfig;
}

/** The full video template config, serialisable to JSON */
export interface VideoTemplate {
  id: string;
  name: string;
  script: VideoScript;
  /** Target video dimensions */
  width: number;
  height: number;
}

// ─── Default factory ───────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function createDefaultTemplate(): VideoTemplate {
  return {
    id: uid(),
    name: "Untitled reel",
    width: 1080,
    height: 1920,
    script: {
      strangerMessages: [
        {
          id: uid(),
          sender: "stranger",
          text: "hey… are you still there?",
          delayMs: 800,
        },
        {
          id: uid(),
          sender: "stranger",
          text: "I found something about you. You might want to see this 👀",
          delayMs: 2200,
        },
      ],
      choiceConfig: {
        choices: [
          { id: uid(), label: "Ask what it is", slot: "A" },
          { id: uid(), label: "Block them", slot: "B" },
        ],
        winnerSlot: "A",
        appearDelayMs: 5000,
        pulseEachMs: 900,
        winnerHoldMs: 800,
      },
      responseMessages: [
        {
          id: uid(),
          sender: "me",
          text: "What did you find…?",
          delayMs: 200,
        },
        {
          id: uid(),
          sender: "stranger",
          text: "I'll send it tonight. Don't go offline.",
          delayMs: 1400,
        },
      ],
      ctaConfig: {
        headline: "More conversations like this on BanterBird",
        subline: "Speak to strangers. Free. No login.",
        appearDelayMs: 800,
        holdMs: 3000,
      },
    },
  };
}

// ─── Timeline helpers ───────────────────────────────────────────────────────

/** Compute the total video duration in ms from a script */
export function computeDuration(script: VideoScript): number {
  const { strangerMessages, choiceConfig, responseMessages, ctaConfig } = script;

  // Phase 1 ends when last stranger message appears + read time
  const lastStranger = strangerMessages.at(-1);
  const phase1End = lastStranger ? lastStranger.delayMs + 1200 : 0;

  // Phase 2: choices appear, pulse A then B, then winner holds
  const choicesStart = Math.max(phase1End + 400, choiceConfig.appearDelayMs);
  const choicesEnd =
    choicesStart + choiceConfig.pulseEachMs * 2 + choiceConfig.winnerHoldMs + 600;

  // Phase 3: response messages
  const lastResponse = responseMessages.at(-1);
  const phase3End = lastResponse
    ? choicesEnd + lastResponse.delayMs + 1200
    : choicesEnd;

  // Phase 4: CTA
  const ctaStart = phase3End + ctaConfig.appearDelayMs;
  const totalDuration = ctaStart + ctaConfig.holdMs + 600;

  return totalDuration;
}

/** Absolute timestamps for every event in the video */
export interface VideoTimeline {
  strangerMessageTimes: number[];
  choicesAppearTime: number;
  aHighlightTime: number;
  bHighlightTime: number;
  winnerRevealTime: number;
  responseMessageTimes: number[];
  ctaAppearTime: number;
  totalDuration: number;
}

export function buildTimeline(script: VideoScript): VideoTimeline {
  const { strangerMessages, choiceConfig, responseMessages, ctaConfig } = script;

  const strangerMessageTimes = strangerMessages.map((m) => m.delayMs);
  const lastStrangerTime = strangerMessageTimes.at(-1) ?? 0;
  const phase1End = lastStrangerTime + 1200;

  const choicesAppearTime = Math.max(phase1End + 400, choiceConfig.appearDelayMs);
  const aHighlightTime = choicesAppearTime + 300;
  const bHighlightTime = aHighlightTime + choiceConfig.pulseEachMs;
  const winnerRevealTime =
    (choiceConfig.winnerSlot === "A" ? aHighlightTime : bHighlightTime) +
    choiceConfig.pulseEachMs;

  const responseBase = winnerRevealTime + choiceConfig.winnerHoldMs + 600;
  const responseMessageTimes = responseMessages.map((m) => responseBase + m.delayMs);

  const lastResponseTime = responseMessageTimes.at(-1) ?? responseBase;
  const phase3End = lastResponseTime + 1200;

  const ctaAppearTime = phase3End + ctaConfig.appearDelayMs;
  const totalDuration = ctaAppearTime + ctaConfig.holdMs + 600;

  return {
    strangerMessageTimes,
    choicesAppearTime,
    aHighlightTime,
    bHighlightTime,
    winnerRevealTime,
    responseMessageTimes,
    ctaAppearTime,
    totalDuration,
  };
}

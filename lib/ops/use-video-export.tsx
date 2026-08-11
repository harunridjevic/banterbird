"use client";
"use client";

/**
 * useVideoExport — off-screen render + html2canvas-pro
 *
 * Strategy
 * ────────
 * 1. Mount a second VideoPreview React root into a hidden 380×677 px div
 *    (left: -9999 px — fully rendered by the browser but off-screen).
 *    380 px is the same logical width as the live preview, so every CSS
 *    value, font size, padding and border-radius looks identical.
 *
 * 2. Drive its timeline by writing `data-export-elapsed` on the wrapper,
 *    which VideoPreview's MutationObserver picks up as elapsed-ms state.
 *
 * 3. At each frame step, wait 2 rAFs + SETTLE_MS for React and Framer
 *    Motion to finish rendering, then call html2canvas-pro with
 *    scale = 1080 / 380 ≈ 2.842.  This rasterises the 380 px element
 *    at native 1080×1920 — no upscaling artefacts.
 *
 * 4. Encode ImageData[] → H.264 MP4 via WebCodecs + mp4-muxer
 *    (MediaRecorder WebM fallback if WebCodecs unavailable).
 *
 * Why this looks identical to the preview
 * ────────────────────────────────────────
 * The off-screen element uses the exact same component, same CSS, same
 * fonts and same logical width as the live preview.  html2canvas-pro
 * supports all modern CSS color functions (oklch, lab, etc.) used by
 * Tailwind v4.  The only difference is resolution.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { VideoScript } from "./video-generator-types";
import { buildTimeline } from "./video-generator-types";
import { VideoPreview } from "@/components/ops/video-gen/VideoPreview";
import { renderSFXBuffer, type SFXEvent } from "./sfx";

export type ExportStatus =
  | "idle"
  | "rendering"   // scrubbing timeline + capturing frames
  | "encoding"    // WebCodecs / MediaRecorder encode pass
  | "done"
  | "error";

export interface UseVideoExportReturn {
  startExport: (params: {
    script:   VideoScript;
    filename?: string;
  }) => Promise<void>;
  status:       ExportStatus;
  progress:     number;
  errorMessage: string | null;
  canExport:    boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Logical width of the off-screen render container — matches live preview */
const RENDER_W = 380;
const RENDER_H = Math.round(RENDER_W * (16 / 9)); // 677

/** Output resolution */
const OUT_W = 1080;
const OUT_H = 1920;

/** Scale factor passed to html2canvas: renders at OUT_W physical pixels */
const CAPTURE_SCALE = OUT_W / RENDER_W; // ≈ 2.842

const TARGET_FPS = 30;
const MS_PER_FRAME = 1000 / TARGET_FPS;

/** How many times to slow down animations during export */
const EXPORT_SLOW_FACTOR = 3;

/**
 * Video time advanced per captured frame = 1/30s = 33ms.
 * This controls video duration — keep it at MS_PER_FRAME.
 * Animation speed is controlled separately via slowFactor prop.
 */
const VIDEO_MS_PER_STEP = MS_PER_FRAME; // 33ms — keeps video duration correct

/** ms to wait after setting elapsed before capturing */
const SETTLE_MS = 50;

// ─── Utilities ────────────────────────────────────────────────────────────────

function toEven(n: number) { return n % 2 === 0 ? n : n + 1; }

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function waitRaf() {
  return new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r()))
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ─── Off-screen React root ────────────────────────────────────────────────────

interface OffscreenRoot {
  /** Set this to drive the VideoPreview timeline */
  setElapsed: (ms: number) => void;
  /** The element html2canvas should capture */
  frameEl: HTMLDivElement;
  unmount: () => void;
}

function createOffscreenRoot(script: VideoScript): Promise<OffscreenRoot> {
  return new Promise((resolve) => {
    // Shell — off-screen but fully rendered by the browser
    const shell = document.createElement("div");
    shell.style.cssText = [
      "position:fixed",
      `left:-${RENDER_W + 100}px`,
      "top:0",
      `width:${RENDER_W}px`,
      `height:${RENDER_H}px`,
      "overflow:hidden",
      "z-index:-1",
      "pointer-events:none",
    ].join(";");

    // Wrapper carries data-export-elapsed (VideoPreview's MutationObserver watches it)
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-video-export-root", "");
    wrapper.style.cssText =
      `width:${RENDER_W}px;height:${RENDER_H}px;position:relative;overflow:hidden;background:#0c121c;`;

    // Frame element — this is what html2canvas captures
    const frameEl = document.createElement("div");
    frameEl.style.cssText =
      `width:${RENDER_W}px;height:${RENDER_H}px;position:relative;overflow:hidden;`;

    wrapper.appendChild(frameEl);
    shell.appendChild(wrapper);
    document.body.appendChild(shell);

    let root: Root | null = null;

    const setElapsed = (ms: number) => {
      wrapper.dataset.exportElapsed = String(ms);
    };

    const unmount = () => {
      root?.unmount();
      if (document.body.contains(shell)) document.body.removeChild(shell);
    };

    // Mount VideoPreview with 3x slowed animations so each captured frame
    // shows the animation at the correct position for its video timestamp.
    root = createRoot(frameEl);
    root.render(<VideoPreview script={script} slowFactor={EXPORT_SLOW_FACTOR} />);

    // One rAF to let React finish the initial render
    requestAnimationFrame(() => {
      resolve({ setElapsed, frameEl, unmount });
    });
  });
}

// ─── Frame capture ────────────────────────────────────────────────────────────

async function captureFrame(el: HTMLElement): Promise<ImageData> {
  const html2canvas = (await import("html2canvas-pro")).default;

  const raw = await html2canvas(el, {
    useCORS:         true,
    allowTaint:      true,
    backgroundColor: "#0c121c",
    scale:           CAPTURE_SCALE,
    logging:         false,
    width:           RENDER_W,
    height:          RENDER_H,
    windowWidth:     RENDER_W,
    windowHeight:    RENDER_H,
  });

  // Ensure output is exactly OUT_W × OUT_H (handles sub-pixel rounding)
  const w = toEven(OUT_W);
  const h = toEven(OUT_H);

  if (raw.width === w && raw.height === h) {
    return raw.getContext("2d")!.getImageData(0, 0, w, h);
  }

  const out   = document.createElement("canvas");
  out.width   = w;
  out.height  = h;
  const ctx   = out.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(raw, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// ─── WebCodecs encoder ────────────────────────────────────────────────────────

type EncodedChunkWithMeta = {
  chunk: EncodedVideoChunk;
  meta:  EncodedVideoChunkMetadata | undefined;
};

async function encodeWithWebCodecs(
  frames:     ImageData[],
  fps:        number,
  width:      number,
  height:     number,
  audioPcm:   Float32Array,
  sampleRate: number,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const hasAudio = audioPcm.length > 0;
  const target = new ArrayBufferTarget();
  const muxer  = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    ...(hasAudio ? { audio: { codec: "aac", numberOfChannels: 1, sampleRate } } : {}),
    fastStart: "in-memory",
    firstTimestampBehavior: "strict",
  });

  const videoChunks: EncodedChunkWithMeta[] = [];
  let encErr: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => videoChunks.push({ chunk, meta }),
    error:  (e) => { encErr = e; },
  });

  encoder.configure({
    codec:       "avc1.640032",
    width, height,
    bitrate:     8_000_000,
    framerate:   fps,
    latencyMode: "quality",
  });

  for (let i = 0; i < frames.length; i++) {
    if (encErr) throw encErr;
    const timestamp = Math.round((i / fps) * 1_000_000);
    const duration  = Math.round((1 / fps) * 1_000_000);
    const oc = new OffscreenCanvas(width, height);
    oc.getContext("2d")!.putImageData(frames[i], 0, 0);
    const vf = new VideoFrame(oc, { timestamp, duration });
    encoder.encode(vf, { keyFrame: i === 0 || i % (fps * 2) === 0 });
    vf.close();
    if (i % 5 === 4) await sleep(0);
    onProgress((i + 1) / frames.length);
  }

  await encoder.flush();
  if (encErr) throw encErr;
  encoder.close();

  for (const { chunk, meta } of videoChunks) muxer.addVideoChunk(chunk, meta);

  // Mux audio — encode PCM Float32 as raw AAC chunks via AudioEncoder
  if (hasAudio && typeof AudioEncoder !== "undefined") {
    const AUDIO_CHUNK = 1024; // samples per AAC frame
    const audioChunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];
    let audioErr: Error | null = null;

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => audioChunks.push({ chunk, meta }),
      error:  (e) => { audioErr = e; },
    });

    audioEncoder.configure({
      codec:            "mp4a.40.2", // AAC-LC
      sampleRate,
      numberOfChannels: 1,
      bitrate:          128_000,
    });

    // Feed PCM in chunks
    for (let offset = 0; offset < audioPcm.length; offset += AUDIO_CHUNK) {
      if (audioErr) break;
      const slice = audioPcm.slice(offset, offset + AUDIO_CHUNK);
      const timestamp = Math.round((offset / sampleRate) * 1_000_000);
      const buf = new AudioData({
        format:           "f32",
        sampleRate,
        numberOfFrames:   slice.length,
        numberOfChannels: 1,
        timestamp,
        data:             slice,
      });
      audioEncoder.encode(buf);
      buf.close();
    }

    await audioEncoder.flush();
    if (!audioErr) {
      audioEncoder.close();
      for (const { chunk, meta } of audioChunks) {
        muxer.addAudioChunk(chunk, meta);
      }
    }
  }

  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

async function encodeWithMediaRecorder(
  frames:     ImageData[],
  fps:        number,
  width:      number,
  height:     number,
  onProgress: (p: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas  = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx     = canvas.getContext("2d")!;

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9" : "video/webm";

    const recorder = new MediaRecorder(canvas.captureStream(fps),
      { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const parts: Blob[] = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
    recorder.onstop  = () => resolve(new Blob(parts, { type: mime }));
    recorder.onerror = reject;
    recorder.start();

    let i = 0;
    const draw = () => {
      if (i >= frames.length) { recorder.stop(); return; }
      ctx.putImageData(frames[i++], 0, 0);
      onProgress(i / frames.length);
      setTimeout(draw, 1000 / fps);
    };
    draw();
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVideoExport(): UseVideoExportReturn {
  const [status,       setStatus]       = useState<ExportStatus>("idle");
  const [progress,     setProgress]     = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef(false);

  const [canExport, setCanExport] = useState(true);
  useEffect(() => {
    if (typeof MediaRecorder === "undefined") setCanExport(false);
  }, []);

  const startExport = useCallback(async ({
    script,
    filename = "banterbird-reel",
  }: {
    script:    VideoScript;
    filename?: string;
  }) => {
    if (status === "rendering" || status === "encoding") return;

    setStatus("rendering");
    setProgress(0);
    setErrorMessage(null);
    abortRef.current = false;

    const timeline = buildTimeline(script);
    const totalMs  = timeline.totalDuration;

    const offscreen = await createOffscreenRoot(script);
    const frames: ImageData[] = [];

    try {
      // ── Phase 1: Render + capture each frame ──────────────────────────
      // Advance VIDEO_MS_PER_STEP of video time per frame, with SETTLE_MS
      // of real wall time between captures. Because Framer Motion springs
      // run against real time, VIDEO_MS_PER_STEP ≈ SETTLE_MS means
      // animations play at 1:1 speed in the output.
      for (let elapsedMs = 0; elapsedMs <= totalMs; elapsedMs += VIDEO_MS_PER_STEP) {
        if (abortRef.current) break;

        offscreen.setElapsed(Math.min(elapsedMs, totalMs));

        await waitRaf();
        await sleep(SETTLE_MS);

        frames.push(await captureFrame(offscreen.frameEl));
        setProgress((Math.min(elapsedMs, totalMs) / totalMs) * 0.7);
      }

      offscreen.unmount();

      if (abortRef.current || frames.length === 0) {
        setStatus("idle");
        return;
      }

      // ── Phase 2: Render audio + encode ───────────────────────────────
      setStatus("encoding");

      const w = toEven(OUT_W);
      const h = toEven(OUT_H);

      // Build SFX event list from timeline
      const sfxEvents: SFXEvent[] = [
        // Typing sounds before each stranger message (up to 900ms typing window)
        ...script.strangerMessages.flatMap((_, i) => {
          const msgTime = timeline.strangerMessageTimes[i];
          const typingStart = Math.max(0, msgTime - 900);
          const typingDuration = msgTime - typingStart;
          const typingSounds: SFXEvent[] = [];
          // Add typing clicks every 150ms during the typing period
          for (let offset = 0; offset < typingDuration; offset += 150) {
            typingSounds.push({
              timeMs: typingStart + offset,
              sfx: "typing" as const,
            });
          }
          return typingSounds;
        }),
        // Each stranger message
        ...script.strangerMessages.map((_, i) => ({
          timeMs: timeline.strangerMessageTimes[i],
          sfx: "messagePop" as const,
        })),
        // Each response message (user's own)
        ...script.responseMessages.map((_, i) => ({
          timeMs: timeline.responseMessageTimes[i],
          sfx: "messageWhoosh" as const,
        })),
        // Choices appear
        { timeMs: timeline.choicesAppearTime,      sfx: "choicesWhoosh" as const },
        // Pulse A
        { timeMs: timeline.aHighlightTime,          sfx: "pulseHit"      as const },
        // Pulse B
        { timeMs: timeline.bHighlightTime,          sfx: "pulseHit"      as const },
        // Winner reveal
        { timeMs: timeline.winnerRevealTime,        sfx: "winnerReveal"  as const },
        // Confetti burst 200ms after winner
        { timeMs: timeline.winnerRevealTime + 200,  sfx: "confettiBurst" as const },
        // CTA appear
        { timeMs: timeline.ctaAppearTime,           sfx: "ctaRise"       as const },
      ].filter(e => e.timeMs >= 0 && e.timeMs < totalMs);

      const AUDIO_SAMPLE_RATE = 44100;
      const audioPcm = await renderSFXBuffer(sfxEvents, totalMs, AUDIO_SAMPLE_RATE);

      const hasWebCodecs =
        typeof VideoEncoder    !== "undefined" &&
        typeof VideoFrame      !== "undefined" &&
        typeof OffscreenCanvas !== "undefined";

      let blob: Blob;
      let ext: string;

      if (hasWebCodecs) {
        blob = await encodeWithWebCodecs(frames, TARGET_FPS, w, h, audioPcm, AUDIO_SAMPLE_RATE,
          (p) => setProgress(0.7 + p * 0.3));
        ext = "mp4";
      } else {
        blob = await encodeWithMediaRecorder(frames, TARGET_FPS, w, h,
          (p) => setProgress(0.7 + p * 0.3));
        ext = "webm";
      }

      downloadBlob(blob, `${filename.replace(/\s+/g, "-")}.${ext}`);
      setStatus("done");
      setProgress(1);
    } catch (err) {
      offscreen.unmount();
      console.error("[useVideoExport]", err);
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Export failed. See console for details.",
      );
    }
  }, [status]);

  return { startExport, status, progress, errorMessage, canExport };
}

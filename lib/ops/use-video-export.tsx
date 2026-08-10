"use client";

/**
 * useVideoExport — real-time capture
 *
 * Instead of scrubbing the timeline frame-by-frame (which misses animations
 * and causes timing artefacts), we record the preview during *live playback*:
 *
 *   1. Reset + play the VideoPreview from t=0 at normal speed.
 *   2. On every requestAnimationFrame, capture the live element with
 *      html2canvas-pro at CAPTURE_SCALE (4×) and push the ImageData.
 *   3. When onEnd fires (playback finished), stop capturing and encode.
 *
 * Because we capture what the browser actually renders each frame — including
 * every Framer Motion spring, every typing dot, every shimmer — the output
 * is visually identical to what the user sees in the preview.
 *
 * Trade-off: export takes as long as the video itself (real-time). A 15 s
 * video takes ~15 s to capture. This is unavoidable when recording live DOM.
 *
 * Encoding
 *   Primary  : WebCodecs VideoEncoder + mp4-muxer → H.264 MP4  (8 Mbps)
 *   Fallback : MediaRecorder over canvas stream   → WebM       (8 Mbps)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoScript } from "./video-generator-types";
import { buildTimeline } from "./video-generator-types";

export type ExportStatus = "idle" | "capturing" | "encoding" | "done" | "error";

export interface UseVideoExportReturn {
  /**
   * Begin export. Caller must also call `playHandle.play()` immediately after
   * — or pass `autoPlay: true` and provide the play function.
   *
   * @param frameEl   The DOM element wrapping VideoPreview (data-video-export-root)
   * @param script    The video script (used only for duration calculation)
   * @param onReady   Called when capture is set up and the caller should start playback
   * @param filename  Output filename without extension
   */
  startExport: (params: {
    frameEl: HTMLElement;
    script: VideoScript;
    onReady: () => void;
    onPlaybackEnd: () => void;
    filename?: string;
  }) => void;
  /** Call this when VideoPreview fires onEnd during an export */
  finishCapture: () => void;
  status: ExportStatus;
  progress: number;
  errorMessage: string | null;
  canExport: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_FPS = 30;
const MS_PER_FRAME = 1000 / TARGET_FPS;

/** Output resolution */
const OUT_W = 1080;
const OUT_H = 1920;

/**
 * Capture scale — we rasterize the live element at 4× its natural size,
 * then downscale to OUT_W × OUT_H. Gives ~4× pixel density with natural
 * antialiasing on the downscale pass.
 */
const CAPTURE_SCALE = 4;

// ─── Utilities ────────────────────────────────────────────────────────────────

function toEven(n: number) {
  return n % 2 === 0 ? n : n + 1;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Frame capture ────────────────────────────────────────────────────────────

async function captureFrame(
  el: HTMLElement,
  outW: number,
  outH: number
): Promise<ImageData> {
  const html2canvas = (await import("html2canvas-pro")).default;

  const raw = await html2canvas(el, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#0c121c",
    scale: CAPTURE_SCALE,
    logging: false,
    width: el.offsetWidth,
    height: el.offsetHeight,
    windowWidth: el.offsetWidth,
    windowHeight: el.offsetHeight,
  });

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(raw, 0, 0, outW, outH);
  return ctx.getImageData(0, 0, outW, outH);
}

// ─── WebCodecs encoder ────────────────────────────────────────────────────────

type EncodedChunkWithMeta = {
  chunk: EncodedVideoChunk;
  meta: EncodedVideoChunkMetadata | undefined;
};

async function encodeWithWebCodecs(
  frames: ImageData[],
  fps: number,
  width: number,
  height: number,
  onProgress: (p: number) => void
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
    firstTimestampBehavior: "strict",
  });

  const encodedChunks: EncodedChunkWithMeta[] = [];
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output(chunk, meta) { encodedChunks.push({ chunk, meta }); },
    error(e) { encoderError = e; },
  });

  encoder.configure({
    codec: "avc1.640032", // H.264 High Profile 5.0
    width,
    height,
    bitrate: 8_000_000,
    framerate: fps,
    latencyMode: "quality",
  });

  for (let i = 0; i < frames.length; i++) {
    if (encoderError) throw encoderError;

    const timestamp = Math.round((i / fps) * 1_000_000);
    const duration  = Math.round((1 / fps) * 1_000_000);

    const oc  = new OffscreenCanvas(width, height);
    const ctx = oc.getContext("2d")!;
    ctx.putImageData(frames[i], 0, 0);

    const vf    = new VideoFrame(oc, { timestamp, duration });
    const isKey = i === 0 || i % (fps * 2) === 0;
    encoder.encode(vf, { keyFrame: isKey });
    vf.close();

    if (i % 5 === 4) await sleep(0);
    onProgress((i + 1) / frames.length);
  }

  await encoder.flush();
  if (encoderError) throw encoderError;
  encoder.close();

  for (const { chunk, meta } of encodedChunks) muxer.addVideoChunk(chunk, meta);
  muxer.finalize();

  return new Blob([target.buffer], { type: "video/mp4" });
}

// ─── MediaRecorder fallback ───────────────────────────────────────────────────

async function encodeWithMediaRecorder(
  frames: ImageData[],
  fps: number,
  width: number,
  height: number,
  onProgress: (p: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const stream   = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop  = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = reject;
    recorder.start();

    let i = 0;
    function drawNext() {
      if (i >= frames.length) { recorder.stop(); return; }
      ctx.putImageData(frames[i], 0, 0);
      onProgress((i + 1) / frames.length);
      i++;
      setTimeout(drawNext, 1000 / fps);
    }
    drawNext();
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVideoExport(): UseVideoExportReturn {
  const [status,       setStatus]       = useState<ExportStatus>("idle");
  const [progress,     setProgress]     = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [canExport, setCanExport] = useState(true);
  useEffect(() => {
    if (typeof MediaRecorder === "undefined") setCanExport(false);
  }, []);

  // Internal capture state — lives in refs so rAF callbacks don't go stale
  const captureStateRef = useRef<{
    frameEl: HTMLElement;
    frames: ImageData[];
    rafId: number | null;
    totalMs: number;
    startWall: number | null;
    outW: number;
    outH: number;
    filename: string;
    capturing: boolean;
    // resolves when finishCapture() is called
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);

  const setProgressRef = useRef(setProgress);
  setProgressRef.current = setProgress;

  /**
   * rAF loop — runs at the browser's native frame rate during live playback.
   * Captures one html2canvas frame per screen frame (throttled to TARGET_FPS).
   */
  const rafLoop = useCallback(async (now: number) => {
    const s = captureStateRef.current;
    if (!s || !s.capturing) return;

    // Throttle to TARGET_FPS
    if (s.startWall === null) s.startWall = now;
    const wall = now - s.startWall;
    const expectedFrame = Math.floor(wall / MS_PER_FRAME);

    if (expectedFrame <= s.frames.length - 1) {
      // Not yet time for the next frame — keep looping
      s.rafId = requestAnimationFrame(rafLoop);
      return;
    }

    // Time for a new frame — capture it
    try {
      const frame = await captureFrame(s.frameEl, s.outW, s.outH);
      if (!s.capturing) return; // was stopped while we awaited
      s.frames.push(frame);

      // Update progress (capture = 0–60%)
      const captureProgress = Math.min(wall / s.totalMs, 1);
      setProgressRef.current(captureProgress * 0.6);
    } catch (e) {
      if (s.capturing) {
        s.capturing = false;
        s.reject(e instanceof Error ? e : new Error(String(e)));
      }
      return;
    }

    s.rafId = requestAnimationFrame(rafLoop);
  }, []);

  const startExport = useCallback(({
    frameEl,
    script,
    onReady,
    filename = "banterbird-reel",
  }: {
    frameEl: HTMLElement;
    script: VideoScript;
    onReady: () => void;
    onPlaybackEnd: () => void;
    filename?: string;
  }) => {
    if (status === "capturing" || status === "encoding") return;

    if (frameEl.offsetWidth < 10) {
      setStatus("error");
      setErrorMessage("Preview element has no visible dimensions.");
      return;
    }

    const timeline = buildTimeline(script);
    const outW = toEven(OUT_W);
    const outH = toEven(OUT_H);

    setStatus("capturing");
    setProgress(0);
    setErrorMessage(null);

    // Set up capture state — encoding is triggered by finishCapture()
    captureStateRef.current = {
      frameEl,
      frames: [],
      rafId: null,
      totalMs: timeline.totalDuration,
      startWall: null,
      outW,
      outH,
      filename,
      capturing: true,
      resolve: () => {},
      reject: () => {},
    };

    // Start the rAF loop
    captureStateRef.current.rafId = requestAnimationFrame(rafLoop);

    // Tell the caller to start playback
    onReady();
  }, [status, rafLoop]);

  const finishCapture = useCallback(async () => {
    const s = captureStateRef.current;
    if (!s || !s.capturing) return;

    // Stop the rAF loop
    s.capturing = false;
    if (s.rafId !== null) {
      cancelAnimationFrame(s.rafId);
      s.rafId = null;
    }

    const { frames, outW, outH, filename } = s;
    captureStateRef.current = null;

    if (frames.length === 0) {
      setStatus("error");
      setErrorMessage("No frames were captured.");
      return;
    }

    try {
      setStatus("encoding");
      setProgress(0.6);

      const hasWebCodecs =
        typeof VideoEncoder    !== "undefined" &&
        typeof VideoFrame      !== "undefined" &&
        typeof OffscreenCanvas !== "undefined";

      let blob: Blob;
      let ext: string;

      if (hasWebCodecs) {
        blob = await encodeWithWebCodecs(frames, TARGET_FPS, outW, outH,
          (p) => setProgress(0.6 + p * 0.4));
        ext = "mp4";
      } else {
        blob = await encodeWithMediaRecorder(frames, TARGET_FPS, outW, outH,
          (p) => setProgress(0.6 + p * 0.4));
        ext = "webm";
      }

      downloadBlob(blob, `${filename.replace(/\s+/g, "-")}.${ext}`);
      setStatus("done");
      setProgress(1);
    } catch (err) {
      console.error("[useVideoExport]", err);
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Export failed. See console for details."
      );
    }
  }, []);

  return { startExport, finishCapture, status, progress, errorMessage, canExport };
}

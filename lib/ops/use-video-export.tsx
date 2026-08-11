"use client";

"use client";

/**
 * useVideoExport — getDisplayMedia screen-capture, crop to preview
 *
 * Flow
 * ────
 * 1. startExport() calls getDisplayMedia({ preferCurrentTab }) — user clicks
 *    "Share tab" in Chrome's one-click prompt.
 * 2. MediaRecorder starts. onReady() fires — caller starts VideoPreview
 *    playback. The preview stays at its NORMAL small size (no fullscreen).
 *    This keeps all proportions identical to what the user sees.
 * 3. finishCapture() is called when VideoPreview fires onEnd.
 *    We wait for the recorder's final ondataavailable then process.
 * 4. The raw WebM is decoded frame-by-frame via a hidden <video> element,
 *    each frame is cropped to the preview element's exact screen position
 *    and scaled to 1080×1920.
 * 5. Cropped frames are encoded to H.264 MP4 via WebCodecs + mp4-muxer.
 *
 * Why no fullscreen
 * ─────────────────
 * The preview component uses fixed pixel values (text-[15px], px-4, etc.)
 * designed for a ~380 px wide container. When expanded to fullscreen that
 * container becomes ~800+ px wide and the text stays the same size,
 * making everything look proportionally tiny. Keeping the preview at its
 * normal size means the recording looks exactly like the live preview.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoScript } from "./video-generator-types";
import { buildTimeline } from "./video-generator-types";

export type ExportStatus =
  | "idle"
  | "requesting"
  | "capturing"
  | "encoding"
  | "done"
  | "error";

export interface UseVideoExportReturn {
  startExport: (params: {
    frameEl: HTMLElement;
    script: VideoScript;
    onReady: () => void;
    filename?: string;
  }) => Promise<void>;
  finishCapture: () => void;
  status: ExportStatus;
  progress: number;
  errorMessage: string | null;
  canExport: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OUT_W      = 1080;
const OUT_H      = 1920;
const TARGET_FPS = 30;

// ─── Utilities ────────────────────────────────────────────────────────────────

function toEven(n: number) { return n % 2 === 0 ? n : n + 1; }

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

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

// ─── Crop helpers ─────────────────────────────────────────────────────────────

interface CropRect { x: number; y: number; w: number; h: number; }

/**
 * Get the element's position in CSS pixels relative to the viewport.
 * We re-read this at finishCapture time (not startExport time) so we
 * always have the correct position regardless of scroll or layout shifts.
 */
function getCropRect(el: HTMLElement): CropRect {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

// ─── Decode recorded blob → cropped ImageData[] via hidden <video> ───────────

function canvasScrubFrames(
  blob: Blob,
  crop: CropRect,
  viewport: { w: number; h: number },
  outW: number,
  outH: number,
  onProgress: (p: number) => void,
): Promise<ImageData[]> {
  return new Promise((resolve, reject) => {
    const url   = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src         = url;
    video.muted       = true;
    video.playsInline = true;
    video.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(video);

    const cleanup = () => {
      document.body.removeChild(video);
      URL.revokeObjectURL(url);
    };

    video.onerror = () => { cleanup(); reject(new Error("Failed to decode recording.")); };

    video.addEventListener("loadedmetadata", async () => {
      try {
        const vidW = video.videoWidth;
        const vidH = video.videoHeight;

        // Both crop rect and viewport were measured at the same instant
        // (450ms after recording started, after Chrome's recording bar
        // appeared). Using the same-instant viewport as reference means
        // the scale factors correctly account for the bar shrinking innerHeight.
        const sx = vidW / viewport.w;
        const sy = vidH / viewport.h;

        const adjCrop: CropRect = {
          x: Math.max(0, Math.round(crop.x * sx)),
          y: Math.max(0, Math.round(crop.y * sy)),
          w: Math.round(crop.w * sx),
          h: Math.round(crop.h * sy),
        };
        // Clamp to video bounds — but don't shrink h aggressively
        adjCrop.x = Math.min(adjCrop.x, vidW - 1);
        adjCrop.y = Math.min(adjCrop.y, vidH - 1);
        adjCrop.w = Math.min(adjCrop.w, vidW - adjCrop.x);
        adjCrop.h = Math.min(adjCrop.h, vidH - adjCrop.y);

        console.log("[export] video:", vidW, "×", vidH,
          "| viewport used:", viewport.w, "×", viewport.h,
          "| sx:", sx.toFixed(3), "sy:", sy.toFixed(3),
          "| crop CSS: x", crop.x, "y", crop.y, "w", crop.w, "h", crop.h,
          "| adjCrop: x", adjCrop.x, "y", adjCrop.y, "w", adjCrop.w, "h", adjCrop.h,
          "| bottom:", adjCrop.y + adjCrop.h, "/", vidH);

        const rawCanvas  = document.createElement("canvas");
        rawCanvas.width  = vidW;
        rawCanvas.height = vidH;
        const rawCtx = rawCanvas.getContext("2d", { alpha: false })!;

        const extractFrame = (): ImageData => {
          rawCtx.drawImage(video, 0, 0, vidW, vidH);
          const out = document.createElement("canvas");
          out.width  = outW;
          out.height = outH;
          const ctx  = out.getContext("2d", { alpha: false })!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(rawCanvas, adjCrop.x, adjCrop.y, adjCrop.w, adjCrop.h, 0, 0, outW, outH);
          return ctx.getImageData(0, 0, outW, outH);
        };

        const frames: ImageData[] = [];
        const duration = video.duration;
        const hasValidDuration = isFinite(duration) && duration > 0;

        if (hasValidDuration) {
          // ── Strategy A: seekable — scrub frame by frame ─────────────────
          const frameCount = Math.ceil(duration * TARGET_FPS);
          for (let f = 0; f < frameCount; f++) {
            video.currentTime = f / TARGET_FPS;
            await new Promise<void>((res) => {
              const fn = () => { video.removeEventListener("seeked", fn); res(); };
              video.addEventListener("seeked", fn);
            });
            frames.push(extractFrame());
            onProgress((f + 1) / frameCount);
          }
          cleanup();
          resolve(frames);
        } else {
          // ── Strategy B: no duration (MediaRecorder WebM) — play + capture
          // Use requestVideoFrameCallback if available (Chrome 83+), else rAF.
          if ("requestVideoFrameCallback" in video) {
            type RVFC = (now: DOMHighResTimeStamp, meta: { mediaTime: number }) => void;
            const rvfc = video as HTMLVideoElement & { requestVideoFrameCallback: (cb: RVFC) => void };
            let lastMediaTime = -1;
            const frameDuration = 1 / TARGET_FPS;
            const onFrame: RVFC = (_now, meta) => {
              // Only capture if at least one frame-interval has elapsed since
              // the last capture — prevents 2× speed when the WebM was
              // encoded at a higher rate than TARGET_FPS.
              if (meta.mediaTime - lastMediaTime >= frameDuration - 0.001) {
                frames.push(extractFrame());
                onProgress(Math.min(meta.mediaTime / 60, 0.99));
                lastMediaTime = meta.mediaTime;
              }
              if (!video.ended) rvfc.requestVideoFrameCallback(onFrame);
            };
            rvfc.requestVideoFrameCallback(onFrame);
          } else {
            // rAF fallback — throttle to TARGET_FPS
            const vid = video as HTMLVideoElement;
            let lastFrame = -1;
            const loop = () => {
              if (vid.ended || vid.paused) return;
              const f = Math.floor(vid.currentTime * TARGET_FPS);
              if (f > lastFrame) { frames.push(extractFrame()); lastFrame = f; }
              requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
          }

          video.addEventListener("ended", () => {
            cleanup();
            onProgress(1);
            resolve(frames);
          });

          await video.play();
        }
      } catch (e) {
        cleanup();
        reject(e);
      }
    });

    video.load();
  });
}

// ─── Encode ImageData[] → MP4 ────────────────────────────────────────────────

type EncodedChunkWithMeta = {
  chunk: EncodedVideoChunk;
  meta:  EncodedVideoChunkMetadata | undefined;
};

async function encodeWithWebCodecs(
  frames: ImageData[],
  fps:    number,
  width:  number,
  height: number,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer  = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
    firstTimestampBehavior: "strict",
  });

  const chunks: EncodedChunkWithMeta[] = [];
  let encErr: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta }),
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
  for (const { chunk, meta } of chunks) muxer.addVideoChunk(chunk, meta);
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

async function encodeWithMediaRecorder(
  frames: ImageData[],
  fps:    number,
  width:  number,
  height: number,
  onProgress: (p: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas  = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx     = canvas.getContext("2d")!;
    const mime    = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
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

  const [canExport, setCanExport] = useState(true);
  useEffect(() => {
    if (typeof MediaRecorder === "undefined") setCanExport(false);
  }, []);

  const sessionRef = useRef<{
    recorder:      MediaRecorder;
    chunks:        Blob[];
    frameEl:       HTMLElement;
    cropRect:      CropRect | null;
    viewportAtCrop: { w: number; h: number } | null;
    filename:      string;
    mimeType:      string;
    stopPromise:   Promise<Blob>;
    resolveStop:   (b: Blob) => void;
  } | null>(null);

  const setProgressRef = useRef(setProgress);
  setProgressRef.current = setProgress;

  const startExport = useCallback(async ({
    frameEl,
    script,
    onReady,
    filename = "banterbird-reel",
  }: {
    frameEl:   HTMLElement;
    script:    VideoScript;
    onReady:   () => void;
    filename?: string;
  }) => {
    if (status === "capturing" || status === "encoding") return;

    setStatus("requesting");
    setProgress(0);
    setErrorMessage(null);

    // ── 1. Request tab capture ────────────────────────────────────────────
    let stream: MediaStream;
    try {
      stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia(opts?: object): Promise<MediaStream>;
      }).getDisplayMedia({
        video: {
          preferCurrentTab: true,
          frameRate: TARGET_FPS,
          width:  { ideal: window.screen.width },
          height: { ideal: window.screen.height },
        },
        audio: false,
        preferCurrentTab:    true,
        selfBrowserSurface:  "include",
        systemAudio:         "exclude",
      });
    } catch {
      setStatus("idle");
      return;
    }

    void buildTimeline(script); // ensure timeline is valid

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";

    const chunks: Blob[] = [];

    // Create a promise that resolves with the final blob when onstop fires
    let resolveStop!: (b: Blob) => void;
    const stopPromise = new Promise<Blob>((res) => { resolveStop = res; });

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 40_000_000,
    });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      resolveStop(new Blob(chunks, { type: mimeType }));
    };

    sessionRef.current = {
      recorder,
      chunks,
      frameEl,
      cropRect: null,
      viewportAtCrop: null,
      filename,
      mimeType,
      stopPromise,
      resolveStop,
    };

    // ── 2. Start recording ────────────────────────────────────────────────
    recorder.start(200);
    setStatus("capturing");

    onReady();

    // At 450ms the Chrome recording bar has appeared and shifted the layout.
    // Lock both the crop rect AND the viewport size at this exact moment —
    // both must be measured together so the scale factors are consistent.
    setTimeout(() => {
      if (sessionRef.current) {
        sessionRef.current.cropRect      = getCropRect(frameEl);
        sessionRef.current.viewportAtCrop = {
          w: window.innerWidth,
          h: window.innerHeight,
        };
        console.log("[export] locked at 450ms — crop:", sessionRef.current.cropRect,
          "viewport:", sessionRef.current.viewportAtCrop);
      }
    }, 450);
  }, [status]);

  const finishCapture = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;

    // Stop the recorder — triggers final ondataavailable + onstop
    s.recorder.stop();
    s.recorder.stream.getTracks().forEach((t) => t.stop());

    const { stopPromise, frameEl, cropRect: lockedCropRect, viewportAtCrop, filename } = s;

    const cropRect: CropRect  = lockedCropRect  ?? getCropRect(frameEl);
    const viewport = viewportAtCrop ?? { w: window.innerWidth, h: window.innerHeight };
    void (async () => {
      try {
        setStatus("encoding");
        setProgressRef.current(0.2);

        // Wait for ALL chunks to be delivered (onstop fires after last chunk)
        const rawBlob = await stopPromise;

        if (rawBlob.size < 1000) {
          throw new Error("Recording was too short or empty. Make sure the video played fully.");
        }

        const outW = toEven(OUT_W);
        const outH = toEven(OUT_H);

        // ── Decode + crop ─────────────────────────────────────────────────
        const frames = await canvasScrubFrames(
          rawBlob, cropRect, viewport, outW, outH,
          (p) => setProgressRef.current(0.2 + p * 0.55),
        );

        if (frames.length === 0) {
          throw new Error("No frames could be decoded from the recording.");
        }

        // ── Encode → H.264 MP4 ────────────────────────────────────────────
        const hasWebCodecs =
          typeof VideoEncoder    !== "undefined" &&
          typeof VideoFrame      !== "undefined" &&
          typeof OffscreenCanvas !== "undefined";

        let blob: Blob;
        let ext: string;

        if (hasWebCodecs) {
          blob = await encodeWithWebCodecs(frames, TARGET_FPS, outW, outH,
            (p) => setProgressRef.current(0.75 + p * 0.25));
          ext = "mp4";
        } else {
          blob = await encodeWithMediaRecorder(frames, TARGET_FPS, outW, outH,
            (p) => setProgressRef.current(0.75 + p * 0.25));
          ext = "webm";
        }

        downloadBlob(blob, `${filename.replace(/\s+/g, "-")}.${ext}`);
        setStatus("done");
        setProgressRef.current(1);
      } catch (err) {
        console.error("[useVideoExport]", err);
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Export failed. See console for details.",
        );
      }
    })();
  }, []);

  return { startExport, finishCapture, status, progress, errorMessage, canExport };
}

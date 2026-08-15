"use client";

/**
 * useVideoExport
 *
 * Pipeline:
 *   1. Scroll the preview element into view so the whole 9:16 frame is visible.
 *   2. Measure its exact bounding rect (position + size on screen).
 *   3. getDisplayMedia({ preferCurrentTab:true }) — one-click tab share dialog.
 *   4. MediaRecorder records the tab stream while VideoPreview plays from t=0.
 *   5. On playback end → stop recorder.
 *   6. Decode the recorded WebM with a <video> element, seek frame-by-frame,
 *      crop each frame to the saved bounding rect, encode as H.264 MP4.
 *   7. Download the MP4 — exact 9:16 preview content, nothing else.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoScript } from "./video-generator-types";

export type ExportStatus =
  | "idle"
  | "waiting"    // awaiting getDisplayMedia permission
  | "capturing"  // MediaRecorder running
  | "encoding"   // cropping + muxing to MP4
  | "done"
  | "error";

export interface UseVideoExportReturn {
  startExport: (params: {
    frameEl: HTMLElement;
    script: VideoScript;
    onReady: () => void;
    filename?: string;
  }) => void;
  finishCapture: () => void;
  status: ExportStatus;
  progress: number;
  errorMessage: string | null;
  canExport: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toEven(n: number) { return n % 2 === 0 ? n : n - 1; }

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

// ─── Crop + encode ────────────────────────────────────────────────────────────

/**
 * Given a recorded WebM blob and the crop rect (in screen-pixel coordinates
 * relative to the fullscreen video frame), decode every frame, crop it, and
 * re-encode as H.264 MP4.
 *
 * The crop rect is expressed in CSS pixels relative to the fullscreen viewport.
 * When the preview goes fullscreen on a 16:9 monitor the browser letterboxes
 * it — black bars top/bottom. getBoundingClientRect() in fullscreen gives us
 * the exact rendered area including letterbox offset.
 */
async function cropAndEncode(
  webmBlob: Blob,
  crop: { x: number; y: number; w: number; h: number; screenW: number; screenH: number },
  filename: string,
  onProgress: (p: number) => void,
): Promise<void> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const outW = toEven(crop.w);
  const outH = toEven(crop.h);

  // Draw the WebM into a hidden video element and seek frame-by-frame
  // using requestVideoFrameCallback to get every frame.
  const blobUrl = URL.createObjectURL(webmBlob);
  const video = document.createElement("video");
  video.src = blobUrl;
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;";
  document.body.appendChild(video);

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load recorded video for cropping."));
    video.load();
  });

  const duration = video.duration; // seconds
  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);

  // Scale factor: the video track is the screen resolution; the crop rect
  // is in CSS pixels. On HiDPI screens the video track may be 2× the CSS
  // pixels — compute the ratio.
  const vidW = video.videoWidth;
  const vidH = video.videoHeight;
  const scaleX = vidW / crop.screenW;
  const scaleY = vidH / crop.screenH;

  // Crop rect in video-pixel space
  const srcX = Math.round(crop.x * scaleX);
  const srcY = Math.round(crop.y * scaleY);
  const srcW = Math.round(crop.w * scaleX);
  const srcH = Math.round(crop.h * scaleY);

  // Canvas to draw cropped frames into
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const muxTarget = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxTarget,
    video: { codec: "avc", width: outW, height: outH, frameRate: fps },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  const encoded: { chunk: EncodedVideoChunk; meta: EncodedVideoChunkMetadata | undefined }[] = [];
  let encErr: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => encoded.push({ chunk, meta }),
    error: (e) => { encErr = e; },
  });
  encoder.configure({
    codec: "avc1.640032",
    width: outW,
    height: outH,
    bitrate: 12_000_000,
    framerate: fps,
    latencyMode: "quality",
  });

  // Walk through the video frame-by-frame by seeking
  for (let i = 0; i < totalFrames; i++) {
    if (encErr) throw encErr;

    const t = i / fps;
    if (t > duration) break;

    // Seek and wait for the frame to be ready
    video.currentTime = t;
    await new Promise<void>((resolve) => {
      const handler = () => { video.removeEventListener("seeked", handler); resolve(); };
      video.addEventListener("seeked", handler);
    });

    // Draw the cropped region onto our output canvas
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    const timestampUs = Math.round(t * 1_000_000);
    const durationUs  = Math.round(1_000_000 / fps);

    const oc = new OffscreenCanvas(outW, outH);
    oc.getContext("2d")!.drawImage(canvas, 0, 0);
    const vf = new VideoFrame(oc, { timestamp: timestampUs, duration: durationUs });
    encoder.encode(vf, { keyFrame: i === 0 || i % (fps * 2) === 0 });
    vf.close();

    if (i % 10 === 9) await sleep(0);
    onProgress((i + 1) / totalFrames);
  }

  await encoder.flush();
  if (encErr) throw encErr;
  encoder.close();

  document.body.removeChild(video);
  URL.revokeObjectURL(blobUrl);

  for (const { chunk, meta } of encoded) muxer.addVideoChunk(chunk, meta);
  muxer.finalize();

  downloadBlob(
    new Blob([muxTarget.buffer], { type: "video/mp4" }),
    `${filename.replace(/\s+/g, "-")}.mp4`,
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVideoExport(): UseVideoExportReturn {
  const [status, setStatus]           = useState<ExportStatus>("idle");
  const [progress, setProgress]       = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canExport, setCanExport]     = useState(true);

  useEffect(() => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getDisplayMedia)
      setCanExport(false);
  }, []);

  const stateRef = useRef<{
    recorder: MediaRecorder;
    chunks: Blob[];
    stream: MediaStream;
    filename: string;
    crop: { x: number; y: number; w: number; h: number; screenW: number; screenH: number };
    frameEl: HTMLElement;
    capturing: boolean;
  } | null>(null);

  const finishCapture = useCallback(() => {
    const s = stateRef.current;
    if (!s || !s.capturing) return;
    s.capturing = false;

    setStatus("encoding");
    try { s.recorder.stop(); } catch { /* ignore */ }
  }, []);

  const startExport = useCallback(
    ({
      frameEl,
      script: _script,
      onReady,
      filename = "banterbird-reel",
    }: {
      frameEl: HTMLElement;
      script: VideoScript;
      onReady: () => void;
      filename?: string;
    }) => {
      if (status === "waiting" || status === "capturing" || status === "encoding") return;

      setStatus("waiting");
      setProgress(0);
      setErrorMessage(null);

      async function run() {
        try {
          // ── 1. Scroll the preview fully into view ──────────────────────
          frameEl.scrollIntoView({ behavior: "smooth", block: "center" });
          // Wait for smooth scroll to settle
          await sleep(600);

          // ── 2. Measure the preview rect NOW (stable, no fullscreen) ────
          const rect = frameEl.getBoundingClientRect();
          const crop = {
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height,
            screenW: window.innerWidth,
            screenH: window.innerHeight,
          };

          // ── 3. Request tab capture ─────────────────────────────────────
          const constraints: DisplayMediaStreamOptions = {
            video: {
              frameRate: { ideal: 30, max: 60 },
              preferCurrentTab: true,
            } as MediaTrackConstraints,
            audio: false,
          };
          const stream = await navigator.mediaDevices.getDisplayMedia(constraints);

          // ── 4. Set up MediaRecorder ────────────────────────────────────
          const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ? "video/webm;codecs=vp9"
            : "video/webm";

          const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 12_000_000,
          });
          const chunks: Blob[] = [];

          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

          recorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const webmBlob = new Blob(chunks, { type: mimeType });

            try {
              await cropAndEncode(
                webmBlob,
                crop,
                filename,
                (p) => setProgress(p),
              );
              setStatus("done");
              setProgress(1);
            } catch (err) {
              console.error("[useVideoExport] encode error:", err);
              // Fall back: download the raw WebM so nothing is lost
              downloadBlob(webmBlob, `${filename.replace(/\s+/g, "-")}.webm`);
              setStatus("done");
              setProgress(1);
            }
            stateRef.current = null;
          };

          recorder.onerror = () => {
            setStatus("error");
            setErrorMessage("Recording failed.");
            stateRef.current = null;
          };

          // If the user manually stops sharing, treat it as finishCapture
          stream.getVideoTracks()[0]?.addEventListener("ended", () => finishCapture());

          stateRef.current = {
            recorder, chunks, stream, frameEl, filename,
            crop, capturing: true,
          };

          recorder.start(100);
          setStatus("capturing");
          onReady(); // start VideoPreview playback

        } catch (err: unknown) {
          const name = err instanceof Error ? err.name : "";
          const msg  = err instanceof Error ? err.message : String(err);
          if (name === "NotAllowedError" || msg.includes("cancelled")) {
            setStatus("idle");
          } else {
            setStatus("error");
            setErrorMessage(msg);
          }
          stateRef.current = null;
        }
      }

      void run();
    },
    [status, finishCapture],
  );

  return { startExport, finishCapture, status, progress, errorMessage, canExport };
}

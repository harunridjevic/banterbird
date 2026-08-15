"use client";

/**
 * /ops/video-generator
 *
 * BanterBird Reels / TikTok / Shorts Video Generator
 *
 * Layout (two-column on desktop, stacked on mobile):
 *   Left  — Editor panel (script configuration)
 *   Right — 9:16 live preview + playback controls + export
 *
 * The preview is driven by the VideoPreview component via a ref handle.
 * Export is handled by useVideoExport which scrubs an off-screen
 * ExportRenderer (1080×1920) frame-by-frame and encodes to MP4/WebM.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Video,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { OpsBackLink } from "@/components/ops/OpsBackLink";
import { VideoPreview, type VideoPreviewHandle } from "@/components/ops/video-gen/VideoPreview";
import { MessageEditor } from "@/components/ops/video-gen/editors/MessageEditor";
import { ChoicesEditor } from "@/components/ops/video-gen/editors/ChoicesEditor";
import { CTAEditor } from "@/components/ops/video-gen/editors/CTAEditor";
import {
  createDefaultTemplate,
  buildTimeline,
  type VideoScript,
  type VideoTemplate,
} from "@/lib/ops/video-generator-types";
import { useVideoExport, type ExportStatus } from "@/lib/ops/use-video-export";
// ─── Local storage persistence ────────────────────────────────────────────────

const LS_KEY = "banterbird:ops:videoTemplate";

function saveTemplate(t: VideoTemplate) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(t));
  } catch {}
}

function loadTemplate(): VideoTemplate {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as VideoTemplate;
  } catch {}
  return createDefaultTemplate();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const frac = Math.floor((ms % 1000) / 100);
  return `${s}.${frac}s`;
}

function progressBarColor(status: string) {
  if (status === "done") return "bg-emerald-500";
  if (status === "error") return "bg-rose-500";
  return "bg-violet-500";
}

// ─── Section accordion ────────────────────────────────────────────────────────

function Section({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-navy-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-white/3 transition"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-white">{title}</span>
          {badge && (
            <span className="rounded-full bg-violet-600/25 px-2 py-0.5 text-[10px] font-bold text-violet-300">
              {badge}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-navy-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-navy-500" />
        )}
      </button>
      {open && <div className="border-t border-white/10 px-5 py-4">{children}</div>}
    </div>
  );
}

// ─── Progress / status bar ────────────────────────────────────────────────────

function ExportStatus({
  status,
  progress,
  errorMessage,
}: {
  status: ExportStatus;
  progress: number;
  errorMessage: string | null;
}) {
  if (status === "idle") return null;

  const label =
    status === "waiting"
      ? `Pick "This Tab" in the share dialog…`
      : status === "capturing"
      ? "Recording — keep this tab visible…"
      : status === "encoding"
      ? "Encoding to MP4…"
      : status === "done"
      ? "Export complete — check your Downloads"
      : status === "error"
      ? errorMessage ?? "Export failed"
      : "";

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        {status === "waiting" || status === "capturing" || status === "encoding" ? (
          <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
        ) : status === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertCircle className="h-4 w-4 text-rose-400" />
        )}
        <span className="text-sm text-navy-200">{label}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${progressBarColor(status)}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-right text-[11px] text-navy-500">
        {Math.round(progress * 100)}%
      </p>
    </div>
  );
}

// ─── Playback scrubber + controls ─────────────────────────────────────────────

function PlaybackControls({
  isPlaying,
  progress,
  elapsedMs,
  totalMs,
  onPlay,
  onPause,
  onRestart,
}: {
  isPlaying: boolean;
  progress: number;
  elapsedMs: number;
  totalMs: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Scrubber */}
      <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-navy-500">
          {fmtMs(elapsedMs)}
        </span>
        <div className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-violet-500 transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-[11px] tabular-nums text-navy-500">
          {fmtMs(totalMs)}
        </span>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-navy-300 hover:bg-white/10 hover:text-white transition"
          aria-label="Restart preview"
        >
          <RotateCcw className="h-4 w-4" />
          Restart
        </button>

        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition"
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
        >
          {isPlaying ? (
            <><Pause className="h-4 w-4" /> Pause</>
          ) : (
            <><Play className="h-4 w-4" /> Play</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideoGeneratorPage() {
  const [template, setTemplate] = useState<VideoTemplate>(createDefaultTemplate);
  const previewRef = useRef<VideoPreviewHandle | null>(null);
  // The live preview DOM element — captured directly during export
  const frameElRef = useRef<HTMLDivElement | null>(null);

  // Playback state — kept in React state so controls always re-render correctly
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const { startExport, finishCapture, status: exportStatus, progress: exportProgress, errorMessage, canExport } =
    useVideoExport();

  // Load persisted template on mount
  useEffect(() => {
    setTemplate(loadTemplate());
  }, []);

  // Save to localStorage on every change (debounced)
  useEffect(() => {
    const t = setTimeout(() => saveTemplate(template), 400);
    return () => clearTimeout(t);
  }, [template]);

  // Poll the handle at 80 ms to keep scrubber + button state in sync
  useEffect(() => {
    const id = setInterval(() => {
      const h = previewRef.current;
      if (!h) return;
      setIsPlaying(h.isPlaying);
      setProgress(h.progress);
      setElapsedMs(h.elapsedMs);
    }, 80);
    return () => clearInterval(id);
  }, []);

  // Stable ref callback
  const setPreviewRef = useCallback((handle: VideoPreviewHandle | null) => {
    previewRef.current = handle;
  }, []);

  // Derived timeline stats
  const timeline = buildTimeline(template.script);
  const totalMs = timeline.totalDuration;

  function updateScript(patch: Partial<VideoScript>) {
    setTemplate((t) => ({
      ...t,
      script: { ...t.script, ...patch },
    }));
  }

  function handlePlay() {
    previewRef.current?.play();
    setIsPlaying(true);
  }

  function handlePause() {
    previewRef.current?.pause();
    setIsPlaying(false);
  }

  function handleRestart() {
    previewRef.current?.pause();
    setIsPlaying(false);
    setProgress(0);
    setElapsedMs(0);
    // Force VideoPreview to reset by nudging template identity, then play
    setTemplate((t) => ({ ...t }));
    setTimeout(() => {
      previewRef.current?.play();
      setIsPlaying(true);
    }, 50);
  }

  function handleExport() {
    if (!frameElRef.current) return;
    // Reset to t=0 and play — the rAF capture loop starts simultaneously
    previewRef.current?.pause();
    setIsPlaying(false);
    setProgress(0);
    setElapsedMs(0);
    setTemplate((t) => ({ ...t })); // nudge to reset VideoPreview state
    setTimeout(() => {
      startExport({
        frameEl: frameElRef.current!,
        script: template.script,
        filename: template.name,
        onReady: () => {
          previewRef.current?.play();
          setIsPlaying(true);
        },
      });
    }, 80); // brief delay so the reset render flushes before capture starts
  }

  // Stable ref so the onEnd closure always reads the live export status
  const isCapturingRef = useRef(false);
  useEffect(() => {
    isCapturingRef.current = exportStatus === "capturing";
  }, [exportStatus]);

  const isExporting = exportStatus === "waiting" || exportStatus === "capturing" || exportStatus === "encoding";

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-7xl">
        <OpsBackLink />

        {/* Page header */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-600/20 p-2.5 text-violet-300">
                <Video className="h-6 w-6" aria-hidden />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Reels / Video Generator
              </h1>
            </div>
            <p className="mt-2 text-sm text-navy-300">
              Build TikTok, Instagram Reels, and YouTube Shorts from BanterBird conversations.
              Export as MP4.
            </p>
          </div>

          {/* Template name */}
          <input
            type="text"
            value={template.name}
            onChange={(e) => setTemplate((t) => ({ ...t, name: e.target.value }))}
            placeholder="Template name…"
            className="w-56 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition"
          />
        </div>

        {/* Main layout */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">

          {/* ── Left: Editor panel ── */}
          <div className="flex flex-col gap-4">

            {/* Timeline summary */}
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-navy-500" />
              <span className="text-xs text-navy-400">
                Total duration:{" "}
                <strong className="font-semibold text-navy-200">
                  {fmtMs(totalMs)}
                </strong>
              </span>
            </div>

            {/* 1. Stranger messages */}
            <Section
              title="1 · Stranger messages"
              badge={String(template.script.strangerMessages.length)}
              defaultOpen
            >
              <p className="mb-4 text-xs leading-relaxed text-navy-500">
                The opening conversation from the anonymous stranger. Each message appears at
                its configured delay from the video start. Use timing to build suspense.
              </p>
              <MessageEditor
                messages={template.script.strangerMessages}
                sender="stranger"
                onChange={(strangerMessages) => updateScript({ strangerMessages })}
              />
            </Section>

            {/* 2. Choices */}
            <Section title="2 · Choice interaction" defaultOpen>
              <p className="mb-4 text-xs leading-relaxed text-navy-500">
                Two options presented to the viewer. Both pulse in sequence before the winner
                is revealed. Keep labels short and punchy — max ~30 chars each.
              </p>
              <ChoicesEditor
                config={template.script.choiceConfig}
                onChange={(choiceConfig) => updateScript({ choiceConfig })}
              />
            </Section>

            {/* 3. Response messages */}
            <Section
              title="3 · Post-choice conversation"
              badge={String(template.script.responseMessages.length)}
              defaultOpen
            >
              <p className="mb-4 text-xs leading-relaxed text-navy-500">
                The back-and-forth after the choice is made. Each message can be from
                either the user or the stranger — click the pill label to toggle.
                End with a cliffhanger to drive curiosity.
              </p>
              <MessageEditor
                messages={template.script.responseMessages}
                sender="me"
                allowSenderToggle
                onChange={(responseMessages) => updateScript({ responseMessages })}
              />
            </Section>

            {/* 4. CTA */}
            <Section title="4 · End CTA" defaultOpen>
              <p className="mb-4 text-xs leading-relaxed text-navy-500">
                The final screen. Keep the headline direct and the subline short.
              </p>
              <CTAEditor
                config={template.script.ctaConfig}
                onChange={(ctaConfig) => updateScript({ ctaConfig })}
              />
            </Section>
          </div>

          {/* ── Right: Preview + export ── */}
          <div className="flex flex-col gap-4">
            {/* Sticky preview column */}
            <div className="lg:sticky lg:top-8 flex flex-col gap-4">

              {/* 9:16 preview frame */}
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-navy-500">
                  Live preview · 9:16
                </p>

                {/* Outer aspect-ratio shell — scales to available width */}
                <div className="relative w-full" style={{ aspectRatio: "9/16" }}>
                  <div
                    ref={frameElRef}
                    data-video-export-root
                    className="absolute inset-0 overflow-hidden rounded-xl"
                    style={{ background: "#0c121c" }}
                  >
                    <VideoPreview
                      ref={setPreviewRef}
                      script={template.script}
                      onEnd={() => {
                        setIsPlaying(false);
                        setProgress(1);
                        if (isCapturingRef.current) {
                          void finishCapture();
                        }
                      }}
                    />
                  </div>

                  {/* Export overlay — waiting for share dialog or encoding after recording.
                      NOT shown during capture so the recording isn't obscured. */}
                  {(exportStatus === "waiting" || exportStatus === "encoding") && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/70">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                      <p className="text-sm font-semibold text-white">
                        {exportStatus === "waiting" ? `Pick "This Tab" to share…` : "Cropping & encoding…"}
                      </p>
                    </div>
                  )}                </div>
              </div>

              {/* Playback controls */}
              <div className="rounded-xl border border-white/10 bg-navy-900/40 p-4">
                <PlaybackControls
                  isPlaying={isPlaying}
                  progress={progress}
                  elapsedMs={elapsedMs}
                  totalMs={totalMs}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onRestart={handleRestart}
                />
              </div>

              {/* Export */}
              <div className="rounded-xl border border-white/10 bg-navy-900/40 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-400">
                  Export
                </p>

                {!canExport && (
                  <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                    Your browser doesn&apos;t support video export. Use Chrome or Edge for best
                    results.
                  </p>
                )}

                <button
                  type="button"
                  disabled={isExporting || !canExport}
                  onClick={handleExport}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 transition"
                >
                  {isExporting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Exporting…</>
                  ) : (
                    <><Download className="h-4 w-4" /> Export MP4</>
                  )}
                </button>

                <ExportStatus
                  status={exportStatus}
                  progress={exportProgress}
                  errorMessage={errorMessage}
                />

                <p className="mt-3 text-[11px] leading-relaxed text-navy-600">
                  Scrolls the preview into view, records this tab, then crops
                  the output to exactly the preview frame. When prompted, pick{" "}
                  <strong className="text-navy-400">"This Tab"</strong>.
                  Export takes as long as the video itself.
                </p>
              </div>

              {/* Save / reset */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const fresh = createDefaultTemplate();
                    setTemplate(fresh);
                    saveTemplate(fresh);
                  }}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-navy-400 hover:bg-white/10 hover:text-white transition"
                >
                  Reset to default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(template, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${template.name.replace(/\s+/g, "-")}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                  }}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-navy-400 hover:bg-white/10 hover:text-white transition"
                >
                  Export JSON
                </button>
              </div>

              {/* Import JSON */}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs text-navy-500 hover:border-violet-500/30 hover:text-navy-300 transition">
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const parsed = JSON.parse(ev.target?.result as string) as VideoTemplate;
                        setTemplate(parsed);
                      } catch {
                        // invalid JSON — ignore
                      }
                    };
                    reader.readAsText(f);
                    e.target.value = "";
                  }}
                />
                Import template JSON
              </label>
            </div>
          </div>
        </div>

        <p className="mt-12 text-xs text-navy-600">
          Templates auto-save to browser storage. Use &quot;Export JSON&quot; to back up and share templates.
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * /ops/video-generator
 *
 * BanterBird Reels / TikTok / Shorts Video Generator
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
import { useVideoExport } from "@/lib/ops/use-video-export";

// ─── Local storage ────────────────────────────────────────────────────────────

const LS_KEY = "banterbird:ops:videoTemplate";

function saveTemplate(t: VideoTemplate) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(t)); } catch {}
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
  return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}s`;
}

function progressBarColor(status: string) {
  if (status === "done")  return "bg-emerald-500";
  if (status === "error") return "bg-rose-500";
  return "bg-violet-500";
}

// ─── Section accordion ────────────────────────────────────────────────────────

function Section({
  title, badge, children, defaultOpen = true,
}: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean;
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
        {open
          ? <ChevronUp className="h-4 w-4 text-navy-500" />
          : <ChevronDown className="h-4 w-4 text-navy-500" />}
      </button>
      {open && <div className="border-t border-white/10 px-5 py-4">{children}</div>}
    </div>
  );
}

// ─── Export status bar ────────────────────────────────────────────────────────

function ExportStatusBar({
  status, progress, errorMessage,
}: {
  status: string; progress: number; errorMessage: string | null;
}) {
  if (status === "idle") return null;

  const label =
    status === "rendering" ? "Rendering frames…" :
    status === "encoding"  ? "Encoding video…" :
    status === "done"      ? "Export complete — check your Downloads" :
    status === "error"     ? (errorMessage ?? "Export failed") : "";

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        {status === "rendering" || status === "encoding" ? (
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

// ─── Playback controls ────────────────────────────────────────────────────────

function PlaybackControls({
  isPlaying, progress, elapsedMs, totalMs, onPlay, onPause, onRestart,
}: {
  isPlaying: boolean; progress: number; elapsedMs: number; totalMs: number;
  onPlay: () => void; onPause: () => void; onRestart: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
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
      <div className="flex items-center justify-center gap-3">
        <button
          type="button" onClick={onRestart}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-navy-300 hover:bg-white/10 hover:text-white transition"
          aria-label="Restart preview"
        >
          <RotateCcw className="h-4 w-4" /> Restart
        </button>
        <button
          type="button" onClick={isPlaying ? onPause : onPlay}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying
            ? <><Pause className="h-4 w-4" /> Pause</>
            : <><Play  className="h-4 w-4" /> Play</>}
        </button>
      </div>
    </div>
  );
}

// ─── Import JSON (file or paste) ─────────────────────────────────────────────

function ImportJSON({ onImport }: { onImport: (t: VideoTemplate) => void }) {
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  function tryParse(json: string): VideoTemplate | null {
    try {
      const parsed = JSON.parse(json);
      // basic shape check
      if (!parsed || typeof parsed !== "object" || !parsed.script) {
        setError("JSON doesn't look like a VideoTemplate — missing .script");
        return null;
      }
      setError(null);
      return parsed as VideoTemplate;
    } catch (e) {
      setError("Invalid JSON — " + (e instanceof Error ? e.message : String(e)));
      return null;
    }
  }

  function handleApplyPaste() {
    const t = tryParse(raw);
    if (t) { onImport(t); setRaw(""); }
  }

  return (
    <div className="rounded-xl border border-dashed border-white/10 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {(["file", "paste"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(null); }}
            className={`flex-1 py-2 text-xs font-medium transition ${
              tab === t
                ? "bg-white/8 text-white"
                : "text-navy-500 hover:text-navy-300 hover:bg-white/4"
            }`}
          >
            {t === "file" ? "Import file" : "Paste JSON"}
          </button>
        ))}
      </div>

      {tab === "file" && (
        <label className="flex cursor-pointer items-center justify-center gap-2 px-3 py-3 text-xs text-navy-500 hover:text-navy-300 transition">
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const t = tryParse(ev.target?.result as string);
                if (t) onImport(t);
              };
              reader.readAsText(f);
              e.target.value = "";
            }}
          />
          Click to choose a .json file
        </label>
      )}

      {tab === "paste" && (
        <div className="flex flex-col gap-2 p-3">
          <textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setError(null); }}
            placeholder='Paste your template JSON here…'
            rows={6}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-navy-200 placeholder-navy-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition"
          />
          {error && (
            <p className="flex items-start gap-1.5 text-[11px] text-rose-400">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={!raw.trim()}
            onClick={handleApplyPaste}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 transition"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideoGeneratorPage() {
  const [template, setTemplate] = useState<VideoTemplate>(createDefaultTemplate);
  const previewRef = useRef<VideoPreviewHandle | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const { startExport, status: exportStatus, progress: exportProgress, errorMessage, canExport } =
    useVideoExport();

  const isExporting = exportStatus === "rendering" || exportStatus === "encoding";

  // Persist
  useEffect(() => { setTemplate(loadTemplate()); }, []);
  useEffect(() => {
    const t = setTimeout(() => saveTemplate(template), 400);
    return () => clearTimeout(t);
  }, [template]);

  // Sync playback state via rAF for smooth scrubber updates
  useEffect(() => {
    let rafId: number;
    const update = () => {
      const h = previewRef.current;
      if (h) {
        setIsPlaying(h.isPlaying);
        setProgress(h.progress);
        setElapsedMs(h.elapsedMs);
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const setPreviewRef = useCallback((h: VideoPreviewHandle | null) => {
    previewRef.current = h;
  }, []);

  const timeline = buildTimeline(template.script);
  const totalMs  = timeline.totalDuration;

  function updateScript(patch: Partial<VideoScript>) {
    setTemplate((t) => ({ ...t, script: { ...t.script, ...patch } }));
  }

  function handlePlay()    { previewRef.current?.play(); }
  function handlePause()   { previewRef.current?.pause(); }
  function handleRestart() {
    previewRef.current?.pause();
    setTimeout(() => { previewRef.current?.play(); }, 50);
  }

  function handleExport() {
    if (isExporting) return;
    void startExport({
      script: template.script,
      filename: template.name,
      aspectRatio: template.aspectRatio ?? "9:16",
    });
  }

  const isWidescreen = template.aspectRatio === "16:9";

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-7xl">
        <OpsBackLink />

        {/* Header */}
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
          <div className="flex flex-wrap items-center gap-3">
            {/* Aspect Ratio Switcher */}
            <div className="flex items-center rounded-xl border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setTemplate((t) => ({ ...t, aspectRatio: "9:16" }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  !isWidescreen
                    ? "bg-violet-600 text-white shadow"
                    : "text-navy-400 hover:text-white"
                }`}
              >
                9:16 Reel
              </button>
              <button
                type="button"
                onClick={() => setTemplate((t) => ({ ...t, aspectRatio: "16:9" }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isWidescreen
                    ? "bg-violet-600 text-white shadow"
                    : "text-navy-400 hover:text-white"
                }`}
              >
                16:9 Widescreen
              </button>
            </div>

            <input
              type="text"
              value={template.name}
              onChange={(e) => setTemplate((t) => ({ ...t, name: e.target.value }))}
              placeholder="Template name…"
              className="w-52 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition"
            />
          </div>
        </div>

        {/* Layout */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_420px]">

          {/* ── Left: editor ── */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-navy-500" />
              <span className="text-xs text-navy-400">
                Total duration:{" "}
                <strong className="font-semibold text-navy-200">{fmtMs(totalMs)}</strong>
              </span>
            </div>

            <Section title="1 · Stranger messages" badge={String(template.script.strangerMessages.length)} defaultOpen>
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

            <Section title="2 · Choice interaction" defaultOpen>
              <p className="mb-4 text-xs leading-relaxed text-navy-500">
                Two options that pulse before the winner is revealed. Keep labels short and punchy — max ~30 chars each.
              </p>
              <ChoicesEditor
                config={template.script.choiceConfig}
                onChange={(choiceConfig) => updateScript({ choiceConfig })}
              />
            </Section>

            <Section title="3 · Post-choice conversation" badge={String(template.script.responseMessages.length)} defaultOpen>
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

          {/* ── Right: preview + export ── */}
          <div className="flex flex-col gap-4">
            <div className="lg:sticky lg:top-8 flex flex-col gap-4">

              {/* Preview */}
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-navy-400">
                    Live preview · {isWidescreen ? "16:9 Widescreen" : "9:16 Reel"}
                  </p>
                  <span className="rounded bg-violet-600/20 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                    {isWidescreen ? "1920×1080" : "1080×1920"}
                  </span>
                </div>
                <div className="relative w-full">
                  <div className="relative w-full h-full flex items-center justify-center">
                    <div
                      className="relative overflow-hidden rounded-xl"
                      style={{
                        aspectRatio: isWidescreen ? "16/9" : "9/16",
                        width: "100%",
                        maxHeight: "100%",
                        maxWidth: "100%",
                        background: "#0c121c",
                      }}
                    >
                      <VideoPreview
                        ref={setPreviewRef}
                        script={template.script}
                        aspectRatio={template.aspectRatio ?? "9:16"}
                        onEnd={() => { setIsPlaying(false); setProgress(1); }}
                      />

                      {/* Rendering overlay */}
                      {isExporting && (
                        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/75">
                          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                          <p className="text-sm font-semibold text-white">
                            {exportStatus === "rendering" ? "Rendering…" : "Encoding…"}
                          </p>
                          <p className="text-xs text-navy-400">
                            {Math.round(exportProgress * 100)}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
                    Your browser doesn&apos;t support video export. Use Chrome or Edge.
                  </p>
                )}

                <button
                  type="button"
                  disabled={isExporting || !canExport}
                  onClick={handleExport}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 transition"
                >
                  {isExporting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting…</>
                    : <><Download className="h-4 w-4" /> Export MP4 ({isWidescreen ? "16:9" : "9:16"})</>}
                </button>

                <ExportStatusBar
                  status={exportStatus}
                  progress={exportProgress}
                  errorMessage={errorMessage}
                />

                <p className="mt-3 text-[11px] leading-relaxed text-navy-600">
                  Renders every frame off-screen at {isWidescreen ? "1920×1080 (16:9)" : "1080×1920 (9:16)"} then encodes to
                  MP4 (H.264, 8 Mbps). Export takes longer than the video duration.
                  Keep the tab visible while exporting.
                </p>
              </div>

              {/* Save / reset / import */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { const f = createDefaultTemplate(); setTemplate(f); saveTemplate(f); }}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-navy-400 hover:bg-white/10 hover:text-white transition"
                >
                  Reset to default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement("a");
                    a.href     = url;
                    a.download = `${template.name.replace(/\s+/g, "-")}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                  }}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-navy-400 hover:bg-white/10 hover:text-white transition"
                >
                  Export JSON
                </button>
              </div>

              <ImportJSON onImport={(t) => { setTemplate(t); saveTemplate(t); }} />
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

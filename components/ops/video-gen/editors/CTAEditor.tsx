"use client";

/**
 * CTAEditor
 *
 * Edits CTAConfig: headline text, subline text, appear delay, hold duration.
 */

import type { CTAConfig } from "@/lib/ops/video-generator-types";

interface Props {
  config: CTAConfig;
  onChange: (config: CTAConfig) => void;
}

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-navy-500 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition";

const NUM_FIELD =
  "w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white outline-none focus:border-violet-500/50 transition";

export function CTAEditor({ config, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-navy-400">
          Headline
        </label>
        <input
          type="text"
          value={config.headline}
          onChange={(e) => onChange({ ...config, headline: e.target.value })}
          placeholder="More conversations like this on BanterBird"
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-navy-400">
          Subline
        </label>
        <input
          type="text"
          value={config.subline}
          onChange={(e) => onChange({ ...config, subline: e.target.value })}
          placeholder="Speak to strangers. Free. No login."
          className={FIELD}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-400">
          Timing
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-navy-500">Appear delay (ms)</label>
            <input
              type="number"
              min={0}
              max={30000}
              step={100}
              value={config.appearDelayMs}
              onChange={(e) =>
                onChange({ ...config, appearDelayMs: Math.max(0, Number(e.target.value)) })
              }
              className={NUM_FIELD}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-navy-500">Hold duration (ms)</label>
            <input
              type="number"
              min={500}
              max={15000}
              step={100}
              value={config.holdMs}
              onChange={(e) =>
                onChange({ ...config, holdMs: Math.max(500, Number(e.target.value)) })
              }
              className={NUM_FIELD}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

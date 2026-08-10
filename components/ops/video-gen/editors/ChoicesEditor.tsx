"use client";

/**
 * ChoicesEditor
 *
 * Edits ChoiceConfig: the two option labels, which one wins,
 * and the timing values (appear delay, pulse duration, winner hold).
 */

import type { ChoiceConfig } from "@/lib/ops/video-generator-types";

interface Props {
  config: ChoiceConfig;
  onChange: (config: ChoiceConfig) => void;
}

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-navy-500 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition";

const NUM_FIELD =
  "w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white outline-none focus:border-violet-500/50 transition";

export function ChoicesEditor({ config, onChange }: Props) {
  function updateChoiceLabel(slot: "A" | "B", label: string) {
    onChange({
      ...config,
      choices: config.choices.map((c) =>
        c.slot === slot ? { ...c, label } : c
      ) as [typeof config.choices[0], typeof config.choices[1]],
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Choice labels */}
      {config.choices.map((choice) => (
        <div key={choice.id} className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-navy-400">
            Option {choice.slot}
          </label>
          <input
            type="text"
            value={choice.label}
            onChange={(e) => updateChoiceLabel(choice.slot, e.target.value)}
            placeholder={`Option ${choice.slot} label…`}
            className={FIELD}
          />
        </div>
      ))}

      {/* Winner picker */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-navy-400">
          Winning option
        </span>
        <div className="flex gap-3">
          {(["A", "B"] as const).map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => onChange({ ...config, winnerSlot: slot })}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${
                config.winnerSlot === slot
                  ? slot === "A"
                    ? "border-violet-500/60 bg-violet-600/25 text-violet-300"
                    : "border-teal-500/60 bg-teal-600/20 text-teal-300"
                  : "border-white/10 bg-white/5 text-navy-400 hover:bg-white/10"
              }`}
            >
              Option {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Timing */}
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
              max={60000}
              step={100}
              value={config.appearDelayMs}
              onChange={(e) =>
                onChange({ ...config, appearDelayMs: Math.max(0, Number(e.target.value)) })
              }
              className={NUM_FIELD}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-navy-500">Pulse each (ms)</label>
            <input
              type="number"
              min={200}
              max={5000}
              step={100}
              value={config.pulseEachMs}
              onChange={(e) =>
                onChange({ ...config, pulseEachMs: Math.max(200, Number(e.target.value)) })
              }
              className={NUM_FIELD}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-navy-500">Winner hold (ms)</label>
            <input
              type="number"
              min={200}
              max={5000}
              step={100}
              value={config.winnerHoldMs}
              onChange={(e) =>
                onChange({ ...config, winnerHoldMs: Math.max(200, Number(e.target.value)) })
              }
              className={NUM_FIELD}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

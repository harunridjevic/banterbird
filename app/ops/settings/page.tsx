"use client";

import Link from "next/link";
import { useCallback } from "react";
import { type BotSettings } from "@/lib/ops/bot-settings";
import { useBotSettings } from "@/lib/ops/use-bot-settings";

export default function OpsBotSettingsPage() {
  const { settings, save, reset } = useBotSettings();

  const patch = useCallback(
    (partial: Partial<BotSettings>) => {
      save({ ...settings, ...partial });
    },
    [settings, save],
  );

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Bot settings</h1>
            <p className="mt-2 text-sm text-navy-300">
              Changes save automatically and apply to new bot turns while you chat.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-navy-200 hover:bg-white/5"
          >
            Reset defaults
          </button>
        </div>

        <div className="mt-10 space-y-8">
          <Section title="Sexual vibe">
            <SelectField
              label="Disposition"
              value={settings.sexualDisposition}
              onChange={(v) => patch({ sexualDisposition: v as BotSettings["sexualDisposition"] })}
              options={[
                { value: "random", label: "Random (weighted)" },
                { value: "strict", label: "Always strict" },
                { value: "persuadable", label: "Always persuadable" },
                { value: "horny", label: "Always horny" },
              ]}
            />
            {settings.sexualDisposition === "random" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <SliderField
                  label="Strict %"
                  value={settings.strictWeight}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(strictWeight) => patch({ strictWeight })}
                />
                <SliderField
                  label="Persuadable %"
                  value={settings.persuadableWeight}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(persuadableWeight) => patch({ persuadableWeight })}
                />
                <SliderField
                  label="Horny %"
                  value={settings.hornyWeight}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(hornyWeight) => patch({ hornyWeight })}
                />
              </div>
            ) : null}
          </Section>

          <Section title="Writing style">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Writing style"
                value={settings.writingStyle}
                onChange={(v) => patch({ writingStyle: v as BotSettings["writingStyle"] })}
                options={[
                  { value: "random", label: "Random" },
                  { value: "lowercase", label: "Lowercase" },
                  { value: "mixed", label: "Mixed caps" },
                  { value: "casual_proper", label: "Casual proper" },
                ]}
              />
              <SelectField
                label="Message style"
                value={settings.messageStyle}
                onChange={(v) => patch({ messageStyle: v as BotSettings["messageStyle"] })}
                options={[
                  { value: "random", label: "Random" },
                  { value: "single", label: "Single message" },
                  { value: "burst", label: "Burst (2–3 msgs)" },
                  { value: "split", label: "Split thought" },
                ]}
              />
              <SelectField
                label="Typo rate"
                value={settings.typoRate}
                onChange={(v) => patch({ typoRate: v as BotSettings["typoRate"] })}
                options={[
                  { value: "random", label: "Random" },
                  { value: "rare", label: "Rare" },
                  { value: "sometimes", label: "Sometimes" },
                  { value: "often", label: "Often" },
                ]}
              />
            </div>
          </Section>

          <Section title="Response speed">
            <SelectField
              label="Reply speed mode"
              value={settings.replySpeedMode}
              onChange={(v) => patch({ replySpeedMode: v as BotSettings["replySpeedMode"] })}
              options={[
                { value: "random", label: "Random per room" },
                { value: "fixed", label: "Fixed for all rooms" },
              ]}
            />
            {settings.replySpeedMode === "fixed" ? (
              <SliderField
                label="Reply speed"
                hint="0.55 = fast, 1.65 = slow. Affects read delay and typing duration."
                value={settings.replySpeed}
                min={0.55}
                max={1.65}
                step={0.05}
                format={(n) => n.toFixed(2)}
                onChange={(replySpeed) => patch({ replySpeed })}
                className="mt-4"
              />
            ) : null}
          </Section>

          <Section title="Timing (ms)">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Ghost ping (wait for user)"
                value={settings.ghostPingMs}
                min={1000}
                max={120000}
                step={500}
                onChange={(ghostPingMs) => patch({ ghostPingMs })}
              />
              <NumberField
                label="Ghost skip (after ping)"
                value={settings.ghostSkipMs}
                min={1000}
                max={120000}
                step={500}
                onChange={(ghostSkipMs) => patch({ ghostSkipMs })}
              />
              <NumberField
                label="Opener delay"
                value={settings.openerDelayMs}
                min={0}
                max={30000}
                step={100}
                onChange={(openerDelayMs) => patch({ openerDelayMs })}
              />
              <NumberField
                label="AI match delay min"
                value={settings.aiMatchDelayMinMs}
                min={0}
                max={60000}
                step={100}
                onChange={(aiMatchDelayMinMs) => patch({ aiMatchDelayMinMs })}
              />
              <NumberField
                label="AI match delay max"
                value={settings.aiMatchDelayMaxMs}
                min={settings.aiMatchDelayMinMs}
                max={60000}
                step={100}
                onChange={(aiMatchDelayMaxMs) => patch({ aiMatchDelayMaxMs })}
              />
            </div>
          </Section>

          <Section title="Session policy">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Max user turns before skip"
                value={settings.maxUserTurnsBeforeSkip}
                min={1}
                max={50}
                onChange={(maxUserTurnsBeforeSkip) => patch({ maxUserTurnsBeforeSkip })}
              />
              <NumberField
                label="Dry chat skip (min user turns)"
                value={settings.drySkipMinUserTurns}
                min={1}
                max={20}
                onChange={(drySkipMinUserTurns) => patch({ drySkipMinUserTurns })}
              />
              <NumberField
                label="Strict bot sexual msgs before skip"
                value={settings.strictSexualSkipAt}
                min={1}
                max={10}
                onChange={(strictSexualSkipAt) => patch({ strictSexualSkipAt })}
              />
              <NumberField
                label="Long chat skip at (user turns)"
                value={settings.longChatSkipAt}
                min={1}
                max={50}
                onChange={(longChatSkipAt) => patch({ longChatSkipAt })}
              />
              <SliderField
                label="Long chat random skip chance %"
                value={settings.longChatSkipChance}
                min={0}
                max={100}
                step={1}
                onChange={(longChatSkipChance) => patch({ longChatSkipChance })}
              />
              <NumberField
                label="Session hint at (user turns)"
                value={settings.sessionHintAt}
                min={1}
                max={30}
                onChange={(sessionHintAt) => patch({ sessionHintAt })}
              />
            </div>
          </Section>

          <Section title="LLM">
            <div className="grid gap-4 sm:grid-cols-2">
              <SliderField
                label="Temperature"
                value={settings.llmTemperature}
                min={0}
                max={2}
                step={0.01}
                format={(n) => n.toFixed(2)}
                onChange={(llmTemperature) => patch({ llmTemperature })}
              />
              <NumberField
                label="Max output tokens"
                value={settings.maxOutputTokens}
                min={64}
                max={4096}
                step={64}
                onChange={(maxOutputTokens) => patch({ maxOutputTokens })}
              />
              <NumberField
                label="Max tokens (sexual vibe)"
                value={settings.maxOutputTokensSexual}
                min={64}
                max={4096}
                step={64}
                onChange={(maxOutputTokensSexual) => patch({ maxOutputTokensSexual })}
              />
            </div>
          </Section>
        </div>

        <p className="mt-10 text-xs text-navy-500">
          <Link href="/ops" className="text-navy-400 underline-offset-2 hover:text-navy-200 hover:underline">
            ← Ops dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-navy-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-violet-500/40 focus:ring-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-navy-200">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-violet-500/40 focus:ring-2"
      />
    </label>
  );
}

function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  format = (n) => String(n),
  onChange,
  className,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-navy-200">{label}</span>
        <span className="font-mono text-xs text-violet-300">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-violet-500"
      />
      {hint ? <p className="mt-1 text-xs text-navy-400">{hint}</p> : null}
    </label>
  );
}
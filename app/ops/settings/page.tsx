"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_BOT_SETTINGS, type BotSettings } from "@/lib/ops/bot-settings";
import type { AppSettings } from "@/lib/ops/app-settings";

async function loadOpsSettings() {
  const [appRes, botRes] = await Promise.all([
    fetch("/api/ops/app-settings"),
    fetch("/api/ops/bot-settings"),
  ]);
  return {
    appSettings: appRes.ok ? ((await appRes.json()) as AppSettings) : null,
    botSettings: botRes.ok ? ((await botRes.json()) as BotSettings) : null,
  };
}

export default function OpsBotSettingsPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCookie, setIsCheckingCookie] = useState(true);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [botSettings, setBotSettings] = useState<BotSettings | null>(null);
  const [appSettingsSaving, setAppSettingsSaving] = useState(false);
  const [botSettingsSaving, setBotSettingsSaving] = useState(false);

  const unlock = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ops/analytics/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Unlock failed (${res.status})`);
        return;
      }
      setUnlocked(true);
      const loaded = await loadOpsSettings();
      if (loaded.appSettings) setAppSettings(loaded.appSettings);
      if (loaded.botSettings) setBotSettings(loaded.botSettings);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    setIsCheckingCookie(true);
    // Check if cookie exists and is valid by making a test request
    void (async () => {
      try {
        const res = await fetch("/api/ops/analytics/data?period=month&days=30", { method: "GET" });
        if (res.ok) {
          setUnlocked(true);
          const loaded = await loadOpsSettings();
          if (loaded.appSettings) setAppSettings(loaded.appSettings);
          if (loaded.botSettings) setBotSettings(loaded.botSettings);
        }
      } catch {
        // Cookie not valid or network error - stay locked
      } finally {
        setIsCheckingCookie(false);
      }
    })();
  }, []);

  const patchAppSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      if (!appSettings) return;
      const next = {
        ...appSettings,
        ...partial,
        rateLimiting: { ...appSettings.rateLimiting, ...partial.rateLimiting },
        ageGate: { ...appSettings.ageGate, ...partial.ageGate },
      };
      setAppSettings(next);
      setAppSettingsSaving(true);
      try {
        const res = await fetch("/api/ops/app-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (res.ok) setAppSettings((await res.json()) as AppSettings);
      } finally {
        setAppSettingsSaving(false);
      }
    },
    [appSettings],
  );

  const patchBotSettings = useCallback(
    async (partial: Partial<BotSettings>) => {
      if (!botSettings) return;
      const next = { ...botSettings, ...partial };
      setBotSettings(next);
      setBotSettingsSaving(true);
      try {
        const res = await fetch("/api/ops/bot-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (res.ok) setBotSettings((await res.json()) as BotSettings);
      } finally {
        setBotSettingsSaving(false);
      }
    },
    [botSettings],
  );

  const resetBotSettings = useCallback(async () => {
    setBotSettingsSaving(true);
    try {
      const res = await fetch("/api/ops/bot-settings", { method: "DELETE" });
      if (res.ok) setBotSettings((await res.json()) as BotSettings);
      else setBotSettings(DEFAULT_BOT_SETTINGS);
    } finally {
      setBotSettingsSaving(false);
    }
  }, []);

  const patch = useCallback(
    (partial: Partial<BotSettings>) => {
      void patchBotSettings(partial);
    },
    [patchBotSettings],
  );

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Bot settings</h1>
            <p className="mt-2 text-sm text-navy-300">
              Changes save to the server and apply globally for every user and device.
            </p>
          </div>
        </div>

        {isCheckingCookie ? (
          <div className="mt-10 flex items-center justify-center rounded-2xl border border-white/10 bg-navy-900/40 p-6">
            <p className="text-sm text-navy-400">Checking authentication…</p>
          </div>
        ) : !unlocked ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-navy-900/40 p-6">
            <label htmlFor="ops-pw" className="block text-sm font-medium text-navy-200">
              Password
            </label>
            <input
              id="ops-pw"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock();
              }}
              className="mt-2 w-full max-w-sm rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-violet-500/40 focus:ring-2"
            />
            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            <button
              type="button"
              disabled={loading || !password}
              onClick={() => void unlock()}
              className="mt-4 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loading ? "Checking…" : "Unlock"}
            </button>
          </div>
        ) : botSettings ? (
          <>
            <div className="mt-10 flex flex-wrap items-end gap-3">
              <button
                type="button"
                onClick={() => void resetBotSettings()}
                disabled={botSettingsSaving}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-navy-200 hover:bg-white/5 disabled:opacity-50"
              >
                Reset defaults
              </button>
              {botSettingsSaving ? (
                <span className="text-xs text-navy-400">Saving…</span>
              ) : null}
            </div>

        <div className="mt-10 space-y-8">
          {appSettings ? (
            <>
              <Section title="Age confirmation (all users)">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={appSettings.ageGate.enabled}
                    onChange={(e) =>
                      void patchAppSettings({
                        ageGate: { ...appSettings.ageGate, enabled: e.target.checked },
                      })
                    }
                    className="mt-1 accent-violet-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-navy-100">Require age confirmation</span>
                    <span className="mt-1 block text-xs text-navy-400">
                      Users must confirm minimum age before entering match. Saved server-side.
                    </span>
                  </span>
                </label>
                <NumberField
                  label="Minimum age"
                  value={appSettings.ageGate.minimumAge}
                  min={13}
                  max={21}
                  onChange={(minimumAge) =>
                    void patchAppSettings({ ageGate: { ...appSettings.ageGate, minimumAge } })
                  }
                  className="mt-4"
                />
              </Section>

              <Section title="Rate limiting (all users)">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={appSettings.rateLimiting.enabled}
                    onChange={(e) =>
                      void patchAppSettings({
                        rateLimiting: { ...appSettings.rateLimiting, enabled: e.target.checked },
                      })
                    }
                    className="mt-1 accent-violet-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-navy-100">Enable rate limiting</span>
                    <span className="mt-1 block text-xs text-navy-400">
                      Blocks spam by limiting messages and rematches. Restricted users cannot use the app.
                    </span>
                  </span>
                </label>
                {appSettingsSaving ? (
                  <p className="mt-2 text-xs text-violet-300">Saving…</p>
                ) : null}
                {appSettings.rateLimiting.enabled ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <NumberField
                      label="Max messages per minute"
                      value={appSettings.rateLimiting.maxMessagesPerMinute}
                      min={1}
                      max={200}
                      onChange={(maxMessagesPerMinute) =>
                        void patchAppSettings({
                          rateLimiting: { ...appSettings.rateLimiting, maxMessagesPerMinute },
                        })
                      }
                    />
                    <NumberField
                      label="Max messages per 10 seconds"
                      value={appSettings.rateLimiting.maxMessagesPer10Seconds}
                      min={1}
                      max={50}
                      onChange={(maxMessagesPer10Seconds) =>
                        void patchAppSettings({
                          rateLimiting: { ...appSettings.rateLimiting, maxMessagesPer10Seconds },
                        })
                      }
                    />
                    <NumberField
                      label="Max rematches per minute"
                      value={appSettings.rateLimiting.maxRematchesPerMinute}
                      min={1}
                      max={60}
                      onChange={(maxRematchesPerMinute) =>
                        void patchAppSettings({
                          rateLimiting: { ...appSettings.rateLimiting, maxRematchesPerMinute },
                        })
                      }
                    />
                  </div>
                ) : null}
              </Section>
            </>
          ) : null}

          <Section title="Displayed online count">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <input
                type="checkbox"
                checked={botSettings.displayOnlineCountOverride}
                onChange={(e) => patch({ displayOnlineCountOverride: e.target.checked })}
                className="mt-1 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-medium text-navy-100">Override navbar count</span>
                <span className="mt-1 block text-xs text-navy-400">
                  Show a synthetic online number in the app navbar instead of the live presence count.
                  The value is synchronized by time, so it stays stable on refresh and matches across
                  tabs/devices that share these botSettings. It drifts gradually inside your range.
                </span>
              </span>
            </label>
            {botSettings.displayOnlineCountOverride ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Minimum displayed count"
                  value={botSettings.displayOnlineCountMin}
                  min={0}
                  max={botSettings.displayOnlineCountMax}
                  onChange={(displayOnlineCountMin) => patch({ displayOnlineCountMin })}
                />
                <NumberField
                  label="Maximum displayed count"
                  value={botSettings.displayOnlineCountMax}
                  min={botSettings.displayOnlineCountMin}
                  max={99999}
                  onChange={(displayOnlineCountMax) => patch({ displayOnlineCountMax })}
                />
                <NumberField
                  label="Change interval min (ms)"
                  hint={`≈ ${(botSettings.displayOnlineCountChangeMinMs / 1000).toFixed(1)}s`}
                  value={botSettings.displayOnlineCountChangeMinMs}
                  min={500}
                  max={600000}
                  step={100}
                  onChange={(displayOnlineCountChangeMinMs) => patch({ displayOnlineCountChangeMinMs })}
                />
                <NumberField
                  label="Change interval max (ms)"
                  hint={`≈ ${(botSettings.displayOnlineCountChangeMaxMs / 1000).toFixed(1)}s`}
                  value={botSettings.displayOnlineCountChangeMaxMs}
                  min={botSettings.displayOnlineCountChangeMinMs}
                  max={600000}
                  step={100}
                  onChange={(displayOnlineCountChangeMaxMs) => patch({ displayOnlineCountChangeMaxMs })}
                />
              </div>
            ) : null}
          </Section>

          <Section title="Match page">
            <SelectField
              label="Partner matching"
              value={botSettings.matchMode}
              onChange={(v) => patch({ matchMode: v as BotSettings["matchMode"] })}
              options={[
                { value: "user_choice", label: "User chooses (humans only vs humans + bot)" },
                { value: "hidden_bots", label: "Hidden bots (always humans + bot, no bot labels in chat)" },
                { value: "humans_only", label: "Humans only (never offer bot matches)" },
              ]}
            />
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <input
                type="checkbox"
                checked={botSettings.hideGenderFilters}
                onChange={(e) => patch({ hideGenderFilters: e.target.checked })}
                className="mt-1 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-medium text-navy-100">Hide gender filters</span>
                <span className="mt-1 block text-xs text-navy-400">
                  Show a single &quot;Start matching&quot; button instead of gender pickers. Users match anyone
                  online; gender is not shown in chat.
                </span>
              </span>
            </label>
            <p className="mt-2 text-xs text-navy-400">
              Hidden bots keeps practice partners available after a short wait but makes chat look identical to a human match.
            </p>
          </Section>

          <Section title="Sexual vibe">
            <SelectField
              label="Disposition"
              value={botSettings.sexualDisposition}
              onChange={(v) => patch({ sexualDisposition: v as BotSettings["sexualDisposition"] })}
              options={[
                { value: "random", label: "Random (weighted)" },
                { value: "strict", label: "Always strict" },
                { value: "persuadable", label: "Always persuadable" },
                { value: "horny", label: "Always horny" },
              ]}
            />
            {botSettings.sexualDisposition === "random" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <SliderField
                  label="Strict %"
                  value={botSettings.strictWeight}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(strictWeight) => patch({ strictWeight })}
                />
                <SliderField
                  label="Persuadable %"
                  value={botSettings.persuadableWeight}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(persuadableWeight) => patch({ persuadableWeight })}
                />
                <SliderField
                  label="Horny %"
                  value={botSettings.hornyWeight}
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
                value={botSettings.writingStyle}
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
                value={botSettings.messageStyle}
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
                value={botSettings.typoRate}
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
              value={botSettings.replySpeedMode}
              onChange={(v) => patch({ replySpeedMode: v as BotSettings["replySpeedMode"] })}
              options={[
                { value: "random", label: "Random per room" },
                { value: "fixed", label: "Fixed for all rooms" },
              ]}
            />
            {botSettings.replySpeedMode === "fixed" ? (
              <SliderField
                label="Reply speed"
                hint="0.55 = fast, 1.65 = slow. Affects read delay and typing duration."
                value={botSettings.replySpeed}
                min={0.55}
                max={1.65}
                step={0.05}
                format={(n) => n.toFixed(2)}
                onChange={(replySpeed) => patch({ replySpeed })}
                className="mt-4"
              />
            ) : null}
          </Section>

          <Section title="Bot opener (speaks first if user is idle)">
            <SelectField
              label="Opener wait mode"
              value={botSettings.openerDelayMode}
              onChange={(v) => patch({ openerDelayMode: v as BotSettings["openerDelayMode"] })}
              options={[
                { value: "fixed", label: "Fixed delay" },
                { value: "random", label: "Random delay (min–max range)" },
              ]}
            />
            <p className="mt-2 text-xs text-navy-400">
              How long the bot waits before saying hi when the user has not sent a message yet. Cancelled
              immediately if the user types first.
            </p>
            {botSettings.openerDelayMode === "fixed" ? (
              <NumberField
                label="Fixed wait (ms)"
                hint={`≈ ${(botSettings.openerDelayMs / 1000).toFixed(1)}s (e.g. 1000 = 1s, 10000 = 10s)`}
                value={botSettings.openerDelayMs}
                min={0}
                max={60000}
                step={100}
                onChange={(openerDelayMs) => patch({ openerDelayMs })}
                className="mt-4"
              />
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Random wait min (ms)"
                  hint={`≈ ${(botSettings.openerDelayMinMs / 1000).toFixed(1)}s`}
                  value={botSettings.openerDelayMinMs}
                  min={0}
                  max={60000}
                  step={100}
                  onChange={(openerDelayMinMs) => patch({ openerDelayMinMs })}
                />
                <NumberField
                  label="Random wait max (ms)"
                  hint={`≈ ${(botSettings.openerDelayMaxMs / 1000).toFixed(1)}s`}
                  value={botSettings.openerDelayMaxMs}
                  min={botSettings.openerDelayMinMs}
                  max={60000}
                  step={100}
                  onChange={(openerDelayMaxMs) => patch({ openerDelayMaxMs })}
                />
              </div>
            )}
          </Section>

          <Section title="Timing (ms)">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Ghost ping (wait for user)"
                value={botSettings.ghostPingMs}
                min={1000}
                max={120000}
                step={500}
                onChange={(ghostPingMs) => patch({ ghostPingMs })}
              />
              <NumberField
                label="Ghost skip (after ping)"
                value={botSettings.ghostSkipMs}
                min={1000}
                max={120000}
                step={500}
                onChange={(ghostSkipMs) => patch({ ghostSkipMs })}
              />
              <NumberField
                label="AI match delay min"
                value={botSettings.aiMatchDelayMinMs}
                min={0}
                max={60000}
                step={100}
                onChange={(aiMatchDelayMinMs) => patch({ aiMatchDelayMinMs })}
              />
              <NumberField
                label="AI match delay max"
                value={botSettings.aiMatchDelayMaxMs}
                min={botSettings.aiMatchDelayMinMs}
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
                value={botSettings.maxUserTurnsBeforeSkip}
                min={1}
                max={50}
                onChange={(maxUserTurnsBeforeSkip) => patch({ maxUserTurnsBeforeSkip })}
              />
              <NumberField
                label="Dry chat skip (min user turns)"
                value={botSettings.drySkipMinUserTurns}
                min={1}
                max={20}
                onChange={(drySkipMinUserTurns) => patch({ drySkipMinUserTurns })}
              />
              <NumberField
                label="Strict bot sexual msgs before skip"
                value={botSettings.strictSexualSkipAt}
                min={1}
                max={10}
                onChange={(strictSexualSkipAt) => patch({ strictSexualSkipAt })}
              />
              <NumberField
                label="Long chat skip at (user turns)"
                value={botSettings.longChatSkipAt}
                min={1}
                max={50}
                onChange={(longChatSkipAt) => patch({ longChatSkipAt })}
              />
              <SliderField
                label="Long chat random skip chance %"
                value={botSettings.longChatSkipChance}
                min={0}
                max={100}
                step={1}
                onChange={(longChatSkipChance) => patch({ longChatSkipChance })}
              />
              <NumberField
                label="Session hint at (user turns)"
                value={botSettings.sessionHintAt}
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
                value={botSettings.llmTemperature}
                min={0}
                max={2}
                step={0.01}
                format={(n) => n.toFixed(2)}
                onChange={(llmTemperature) => patch({ llmTemperature })}
              />
              <NumberField
                label="Max output tokens"
                value={botSettings.maxOutputTokens}
                min={64}
                max={4096}
                step={32}
                onChange={(maxOutputTokens) => patch({ maxOutputTokens })}
              />
              <NumberField
                label="Max tokens (sexual vibe)"
                value={botSettings.maxOutputTokensSexual}
                min={64}
                max={4096}
                step={32}
                onChange={(maxOutputTokensSexual) => patch({ maxOutputTokensSexual })}
              />
              <NumberField
                label="Max tokens (opener only)"
                value={botSettings.maxOutputTokensOpener}
                min={32}
                max={512}
                step={16}
                onChange={(maxOutputTokensOpener) => patch({ maxOutputTokensOpener })}
              />
              <NumberField
                label="History turns sent to LLM"
                value={botSettings.llmHistoryTurns}
                min={4}
                max={40}
                onChange={(llmHistoryTurns) => patch({ llmHistoryTurns })}
              />
            </div>
          </Section>
        </div>
          </>
        ) : (
          <div className="mt-10 flex items-center justify-center rounded-2xl border border-white/10 bg-navy-900/40 p-6">
            <p className="text-sm text-navy-400">Loading settings…</p>
          </div>
        )}

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
  hint,
  className,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  className?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className={className ?? "block"}>
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
      {hint ? <p className="mt-1 text-xs text-navy-400">{hint}</p> : null}
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
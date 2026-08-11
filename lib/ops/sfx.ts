"use client";

/**
 * SFX — synthesised Web Audio sound effects for the video generator.
 *
 * Live playback  : call sfxXxx() directly — uses a shared AudioContext.
 * Export muxing  : call renderSFXBuffer(events, durationMs) — uses
 *                  OfflineAudioContext and returns a Float32Array PCM buffer
 *                  ready to be encoded as AAC and muxed into the MP4.
 */

// ─── Shared AudioContext ──────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;
function liveCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") _ctx = new AudioContext();
  return _ctx;
}

// ─── Low-level helpers ────────────────────────────────────────────────────────

type AC = AudioContext | OfflineAudioContext;

function mkGain(ac: AC, dest: AudioNode, vol: number, t: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function mkOsc(ac: AC, dest: AudioNode, type: OscillatorType, f0: number, f1: number | undefined, t: number, dur: number) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// ─── Render helper (works with both live and offline contexts) ────────────────

function renderEvents(ac: AC, dest: AudioNode, events: SFXEvent[]) {
  for (const ev of events) {
    const t = ev.timeMs / 1000;
    switch (ev.sfx) {
      case "messagePop": {
        const g  = mkGain(ac, dest, 0.18, t, 0.004, 0.12);
        mkOsc(ac, g, "sine", 820, 460, t, 0.13);
        const g2 = mkGain(ac, dest, 0.07, t, 0.003, 0.09);
        mkOsc(ac, g2, "sine", 1200, 700, t, 0.09);
        break;
      }
      case "messageWhoosh": {
        const g  = mkGain(ac, dest, 0.15, t, 0.003, 0.18);
        mkOsc(ac, g, "sine", 380, 920, t, 0.2);
        const g2 = mkGain(ac, dest, 0.06, t + 0.02, 0.005, 0.15);
        mkOsc(ac, g2, "sine", 560, 1100, t + 0.02, 0.16);
        break;
      }
      case "choicesWhoosh": {
        const g1 = mkGain(ac, dest, 0.3, t, 0.01, 0.4);
        mkOsc(ac, g1, "sawtooth", 80, 200, t, 0.45);
        const g2 = mkGain(ac, dest, 0.15, t + 0.05, 0.01, 0.3);
        mkOsc(ac, g2, "sine", 1600, 2200, t + 0.05, 0.35);
        const g3 = mkGain(ac, dest, 0.4, t + 0.08, 0.005, 0.25);
        mkOsc(ac, g3, "sine", 55, 30, t + 0.08, 0.22);
        break;
      }
      case "pulseHit": {
        const g  = mkGain(ac, dest, 0.22, t, 0.005, 0.2);
        mkOsc(ac, g, "sine", 440, 320, t, 0.22);
        const g2 = mkGain(ac, dest, 0.08, t, 0.005, 0.15);
        mkOsc(ac, g2, "triangle", 880, 660, t, 0.18);
        break;
      }
      case "winnerReveal": {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const g = mkGain(ac, dest, 0.14, t + i * 0.06, 0.01, 0.5);
          mkOsc(ac, g, "sine", freq, undefined, t + i * 0.06, 0.55);
        });
        const gp = mkGain(ac, dest, 0.35, t, 0.003, 0.18);
        mkOsc(ac, gp, "sine", 90, 40, t, 0.2);
        break;
      }
      case "confettiBurst": {
        [1760, 2093, 2637, 1976, 2349, 3136].forEach((freq, i) => {
          const g = mkGain(ac, dest, 0.07, t + i * 0.055, 0.003, 0.18);
          mkOsc(ac, g, "sine", freq, freq * 0.85, t + i * 0.055, 0.2);
        });
        break;
      }
      case "ctaRise": {
        const g1 = mkGain(ac, dest, 0.2, t, 0.02, 0.7);
        mkOsc(ac, g1, "sine", 220, 660, t, 0.75);
        const g2 = mkGain(ac, dest, 0.08, t + 0.1, 0.02, 0.6);
        mkOsc(ac, g2, "sine", 1320, 1760, t + 0.1, 0.65);
        const g3 = mkGain(ac, dest, 0.12, t + 0.05, 0.08, 0.65);
        mkOsc(ac, g3, "triangle", 440, 880, t + 0.05, 0.7);
        break;
      }
      case "typing": {
        // Short click sounds to simulate typing
        const g = mkGain(ac, dest, 0.08, t, 0.001, 0.03);
        mkOsc(ac, g, "square", 1800, 1200, t, 0.035);
        const g2 = mkGain(ac, dest, 0.04, t, 0.001, 0.02);
        mkOsc(ac, g2, "triangle", 2400, 1800, t, 0.025);
        break;
      }
    }
  }
}

// ─── Live SFX (called during preview playback) ────────────────────────────────

export function sfxMessagePop()    { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "messagePop"    }]); }
export function sfxMessageWhoosh() { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "messageWhoosh" }]); }
export function sfxChoicesWhoosh() { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "choicesWhoosh" }]); }
export function sfxPulseHit()      { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "pulseHit"      }]); }
export function sfxWinnerReveal()  { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "winnerReveal"  }]); }
export function sfxConfettiBurst() { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "confettiBurst" }]); }
export function sfxCtaRise()       { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "ctaRise"       }]); }
export function sfxTyping()        { const ac = liveCtx(); renderEvents(ac, ac.destination, [{ timeMs: 0, sfx: "typing"        }]); }

// ─── Export audio rendering ───────────────────────────────────────────────────

export interface SFXEvent {
  timeMs: number;
  sfx: "messagePop" | "messageWhoosh" | "choicesWhoosh" | "pulseHit" | "winnerReveal" | "confettiBurst" | "ctaRise" | "typing";
}

/**
 * Render all SFX events into a mono Float32Array PCM buffer at `sampleRate`.
 * Returns an empty buffer if OfflineAudioContext is unavailable (SSR, old browsers).
 */
export async function renderSFXBuffer(
  events:     SFXEvent[],
  durationMs: number,
  sampleRate  = 44100,
): Promise<Float32Array> {
  if (typeof OfflineAudioContext === "undefined") return new Float32Array(0);

  const numSamples = Math.ceil((durationMs / 1000) * sampleRate);
  const ac = new OfflineAudioContext(1, numSamples, sampleRate);

  // Master gain + compressor so peaks don't clip
  const master = ac.createGain();
  master.gain.value = 0.85;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 6;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.1;
  master.connect(comp);
  comp.connect(ac.destination);

  renderEvents(ac, master, events);

  const buf = await ac.startRendering();
  return buf.getChannelData(0);
}

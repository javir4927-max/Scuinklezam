"use client";

// Web Audio API subtle arcade feedback sound generator
// Synthesized in-browser without external mp3 files

import { getEffectiveVolume } from "./globalVolume";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Acierto: doble tono suave ascendente tipo acorde limpio
 * 523.25 Hz (Do5) -> 659.25 Hz (Mi5) en onda sine/triangle, gain ~ 0.07, duración ~140ms
 */
export function playCorrectSound(customVolume: number = 0.07): void {
  const effectiveVol = getEffectiveVolume();
  if (effectiveVol <= 0) return; // Muted

  const ctx = getAudioContext();
  if (!ctx) return;

  const scaledVolume = customVolume * (effectiveVol / 0.25);
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(scaledVolume, now);
  masterGain.connect(ctx.destination);

  // Tone 1: 523.25 Hz (Do5)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(523.25, now);
  gain1.gain.setValueAtTime(0.7, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc1.connect(gain1);
  gain1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + 0.13);

  // Tone 2: 659.25 Hz (Mi5) slightly delayed
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(659.25, now + 0.05);
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.setValueAtTime(0.85, now + 0.05);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc2.start(now + 0.05);
  osc2.stop(now + 0.19);
}

/**
 * Error: tono grave corto y amortiguado
 * 180 Hz -> 130 Hz en onda triangle, gain ~ 0.06, duración ~160ms con caída rápida
 */
export function playWrongSound(customVolume: number = 0.06): void {
  const effectiveVol = getEffectiveVolume();
  if (effectiveVol <= 0) return; // Muted

  const ctx = getAudioContext();
  if (!ctx) return;

  const scaledVolume = customVolume * (effectiveVol / 0.25);
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(scaledVolume, now);
  masterGain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(130, now + 0.16);

  gain.gain.setValueAtTime(0.8, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.17);
}

// Web Audio API Synthesizer Helper
import { getEffectiveVolume } from "./globalVolume";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playSynthNote(freq: number, duration: number = 0.35, gainValue: number = 0.12) {
  const effectiveVol = getEffectiveVolume();
  if (effectiveVol <= 0) return; // Muted

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const scaledGain = gainValue * (effectiveVol / 0.25);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(scaledGain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // AudioContext might be blocked until user gesture
  }
}

export function playSynthBeat() {
  const notes = [261.63, 329.63, 392.00, 523.25];
  notes.forEach((f, i) => {
    setTimeout(() => playSynthNote(f, 0.28, 0.14), i * 140);
  });
}

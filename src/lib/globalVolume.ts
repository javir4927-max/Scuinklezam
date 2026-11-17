"use client";

import { useState, useEffect } from "react";
import { audioPlayer } from "./audioPlayer";

const STORAGE_KEY_VOLUME = "scuinklezam_volume";
const STORAGE_KEY_MUTED = "scuinklezam_muted";
export const DEFAULT_VOLUME = 0.25;

let inMemoryVolume: number = DEFAULT_VOLUME;
let inMemoryMuted: boolean = false;
let isInitialized: boolean = false;

type VolumeListener = (volume: number, muted: boolean, effectiveVolume: number) => void;
const listeners = new Set<VolumeListener>();

function initFromStorage() {
  if (typeof window === "undefined" || isInitialized) return;
  try {
    const savedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
    if (savedVol !== null) {
      const parsed = parseFloat(savedVol);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        inMemoryVolume = parsed;
      }
    }
    const savedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
    if (savedMuted !== null) {
      inMemoryMuted = savedMuted === "true";
    }
  } catch {
    // Ignore storage errors
  }
  isInitialized = true;
  audioPlayer.setVolume(getEffectiveVolume());
}

/**
 * Returns the raw volume (0.0 to 1.0)
 */
export function getGlobalVolume(): number {
  if (!isInitialized) initFromStorage();
  return inMemoryVolume;
}

/**
 * Returns true if globally muted
 */
export function isGlobalMuted(): boolean {
  if (!isInitialized) initFromStorage();
  return inMemoryMuted;
}

/**
 * Returns 0 if muted, else the current volume
 */
export function getEffectiveVolume(): number {
  if (!isInitialized) initFromStorage();
  return inMemoryMuted ? 0 : inMemoryVolume;
}

/**
 * Updates the global volume and notifies all audio components in real-time
 */
export function setGlobalVolume(volume: number): void {
  initFromStorage();
  const clamped = Math.max(0, Math.min(1, volume));
  inMemoryVolume = clamped;
  if (inMemoryMuted && clamped > 0) {
    inMemoryMuted = false;
  }

  const effective = inMemoryMuted ? 0 : inMemoryVolume;

  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_VOLUME, inMemoryVolume.toString());
      localStorage.setItem(STORAGE_KEY_MUTED, inMemoryMuted.toString());
    }
  } catch {
    // Ignore
  }

  // Update central audio service
  audioPlayer.setVolume(effective);

  // Dispatch global custom event for any independent Audio elements
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("scuinklezam_volume_change", {
        detail: {
          volume: effective,
          rawVolume: inMemoryVolume,
          muted: inMemoryMuted,
        },
      })
    );
  }

  // Notify registered callbacks
  listeners.forEach((fn) => fn(inMemoryVolume, inMemoryMuted, effective));
}

/**
 * Toggles global mute state and restores previous volume upon unmute
 */
export function toggleGlobalMute(): boolean {
  initFromStorage();
  if (inMemoryMuted) {
    inMemoryMuted = false;
    if (inMemoryVolume === 0) {
      inMemoryVolume = DEFAULT_VOLUME;
    }
  } else {
    inMemoryMuted = true;
  }

  const effective = inMemoryMuted ? 0 : inMemoryVolume;

  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_MUTED, inMemoryMuted.toString());
      localStorage.setItem(STORAGE_KEY_VOLUME, inMemoryVolume.toString());
    }
  } catch {
    // Ignore
  }

  audioPlayer.setVolume(effective);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("scuinklezam_volume_change", {
        detail: {
          volume: effective,
          rawVolume: inMemoryVolume,
          muted: inMemoryMuted,
        },
      })
    );
  }

  listeners.forEach((fn) => fn(inMemoryVolume, inMemoryMuted, effective));
  return inMemoryMuted;
}

/**
 * Subscribes to volume changes
 */
export function subscribeGlobalVolume(fn: VolumeListener): () => void {
  initFromStorage();
  listeners.add(fn);
  fn(inMemoryVolume, inMemoryMuted, getEffectiveVolume());
  return () => {
    listeners.delete(fn);
  };
}

/**
 * React hook for consuming and updating global volume reactively
 */
export function useGlobalVolume() {
  const [volume, setVolState] = useState<number>(() => getGlobalVolume());
  const [muted, setMutedState] = useState<boolean>(() => isGlobalMuted());

  useEffect(() => {
    const unsub = subscribeGlobalVolume((newVol, newMuted) => {
      setVolState(newVol);
      setMutedState(newMuted);
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_VOLUME && e.newValue !== null) {
        const val = parseFloat(e.newValue);
        if (!isNaN(val)) setGlobalVolume(val);
      } else if (e.key === STORAGE_KEY_MUTED && e.newValue !== null) {
        if (e.newValue === "true" && !isGlobalMuted()) toggleGlobalMute();
        if (e.newValue === "false" && isGlobalMuted()) toggleGlobalMute();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return {
    volume,
    muted,
    effectiveVolume: muted ? 0 : volume,
    setVolume: setGlobalVolume,
    toggleMute: toggleGlobalMute,
  };
}

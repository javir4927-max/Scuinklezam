"use client";

import { playSynthBeat } from "./audio";

export interface AudioPlayerState {
  isPlaying: boolean;
  isBlocked: boolean;
  url: string | null;
}

type AudioStateListener = (state: AudioPlayerState) => void;

class AudioPlayerService {
  private audioEl: HTMLAudioElement | null = null;
  private preloaderEl: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private currentVolume: number = 0.85;
  private stallTimer: NodeJS.Timeout | null = null;
  private beatInterval: NodeJS.Timeout | null = null;
  private isFallbackBeating: boolean = false;
  private listeners: Set<AudioStateListener> = new Set();
  public isBlocked: boolean = false;
  public isPlaying: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.audioEl = new Audio();
      this.audioEl.crossOrigin = "anonymous";
      this.audioEl.volume = this.currentVolume;

      this.preloaderEl = new Audio();
      this.preloaderEl.preload = "auto";

      this.audioEl.addEventListener("playing", () => {
        this.clearStallTimer();
        this.stopFallbackBeats();
        this.isPlaying = true;
        this.isBlocked = false;
        this.notify();
      });

      this.audioEl.addEventListener("pause", () => {
        this.isPlaying = false;
        this.notify();
      });

      this.audioEl.addEventListener("ended", () => {
        this.isPlaying = false;
        this.notify();
      });

      this.audioEl.addEventListener("error", () => {
        this.handlePlaybackFailure();
      });

      this.audioEl.addEventListener("stalled", () => {
        // Handled by stallTimer
      });
    }
  }

  public subscribe(listener: AudioStateListener) {
    this.listeners.add(listener);
    listener({ isPlaying: this.isPlaying, isBlocked: this.isBlocked, url: this.currentUrl });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state: AudioPlayerState = {
      isPlaying: this.isPlaying,
      isBlocked: this.isBlocked,
      url: this.currentUrl,
    };
    this.listeners.forEach((l) => l(state));
  }

  /**
   * Preloads the next round's audio URL so transitions are instantaneous
   */
  public preloadNext(url?: string | null) {
    if (typeof window === "undefined" || !url || !this.preloaderEl) return;
    try {
      this.preloaderEl.src = url;
      this.preloaderEl.load();
    } catch {
      // Ignore preloader exceptions
    }
  }

  /**
   * Plays a track preview cleanly stopping previous audio immediately.
   */
  public async playTrack(url?: string | null): Promise<boolean> {
    this.stop();

    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      this.handlePlaybackFailure();
      return false;
    }

    if (!this.audioEl) return false;

    this.currentUrl = url;
    this.isBlocked = false;
    this.isPlaying = false;
    this.notify();

    try {
      this.audioEl.src = url;
      this.audioEl.currentTime = 0;
      this.audioEl.volume = this.currentVolume;
      this.audioEl.load();

      // Arm 2000ms safety timer: if playback hasn't started, activate rhythmic Web Audio fallback
      this.clearStallTimer();
      this.stallTimer = setTimeout(() => {
        if (!this.isPlaying) {
          this.handlePlaybackFailure();
        }
      }, 2000);

      const playPromise = this.audioEl.play();
      if (playPromise !== undefined) {
        await playPromise;
        this.clearStallTimer();
        this.stopFallbackBeats();
        this.isPlaying = true;
        this.isBlocked = false;
        this.notify();
        return true;
      }
    } catch (err) {
      console.warn("Audio autoplay blocked or network error:", err);
      this.handlePlaybackFailure();
    }

    return false;
  }

  /**
   * Manual resume on user interaction to unlock audio
   */
  public async resume(): Promise<boolean> {
    this.stopFallbackBeats();
    if (!this.audioEl || !this.currentUrl) return false;

    try {
      await this.audioEl.play();
      this.clearStallTimer();
      this.isPlaying = true;
      this.isBlocked = false;
      this.notify();
      return true;
    } catch (err) {
      console.warn("Manual resume failed:", err);
      this.handlePlaybackFailure();
      return false;
    }
  }

  /**
   * Activates musical synth rhythm as audio fallback when previewUrl stalls or is blocked
   */
  private handlePlaybackFailure() {
    this.isBlocked = true;
    this.isPlaying = false;
    this.notify();

    if (!this.isFallbackBeating) {
      this.isFallbackBeating = true;
      playSynthBeat();
      if (this.beatInterval) clearInterval(this.beatInterval);
      this.beatInterval = setInterval(() => {
        if (this.isFallbackBeating) {
          playSynthBeat();
        }
      }, 1800);
    }
  }

  private stopFallbackBeats() {
    this.isFallbackBeating = false;
    if (this.beatInterval) {
      clearInterval(this.beatInterval);
      this.beatInterval = null;
    }
  }

  private clearStallTimer() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  public stop() {
    this.clearStallTimer();
    this.stopFallbackBeats();
    this.isPlaying = false;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
    this.notify();
  }

  public pause() {
    this.clearStallTimer();
    this.stopFallbackBeats();
    this.isPlaying = false;
    if (this.audioEl) {
      this.audioEl.pause();
    }
    this.notify();
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    if (this.audioEl) {
      this.audioEl.volume = this.currentVolume;
    }
  }
}

export const audioPlayer = new AudioPlayerService();

"use client";

import { playSynthBeat } from "./audio";

export const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

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
  private currentVolume: number = 0.25;
  private beatInterval: NodeJS.Timeout | null = null;
  private isFallbackBeating: boolean = false;
  private listeners: Set<AudioStateListener> = new Set();
  public isBlocked: boolean = false;
  public isPlaying: boolean = false;
  public isUnlocked: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("scuinklezam_volume");
        if (saved !== null) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this.currentVolume = parsed;
          }
        }
      } catch {
        // ignore
      }

      this.audioEl = new Audio();
      // DO NOT set crossOrigin="anonymous": causes CORS failures with Apple CDN (audio-ssl.itunes.apple.com)
      this.audioEl.volume = Math.max(0.05, this.currentVolume);

      this.preloaderEl = new Audio();
      this.preloaderEl.preload = "auto";

      this.audioEl.addEventListener("playing", () => {
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

      this.audioEl.addEventListener("error", (e) => {
        console.warn("[AudioPlayer] Media error event:", e);
        this.handlePlaybackFailure();
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
   * Unlocks audio on first user gesture with silent WAV
   */
  public async unlock(): Promise<boolean> {
    if (typeof window === "undefined" || !this.audioEl) return false;
    try {
      this.audioEl.muted = false;
      this.audioEl.volume = Math.max(0.05, this.currentVolume);
      this.audioEl.src = SILENT_WAV;
      const playPromise = this.audioEl.play();
      if (playPromise !== undefined) {
        await playPromise;
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
        this.isUnlocked = true;
        this.isBlocked = false;
        this.notify();
        return true;
      }
    } catch {
      // Ignored if user hasn't interacted yet
    }
    return false;
  }

  /**
   * Preloads the next round's audio URL so transitions are instantaneous
   */
  public preloadNext(url?: string | null) {
    if (typeof window === "undefined" || !url || !this.preloaderEl) return;
    try {
      this.preloaderEl.src = url;
    } catch {
      // Ignore preloader exceptions
    }
  }

  /**
   * Plays a track preview cleanly stopping previous audio immediately without audio.load()
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
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
      this.audioEl.src = url;
      this.audioEl.volume = Math.max(0.05, this.currentVolume);

      const playPromise = this.audioEl.play();
      if (playPromise !== undefined) {
        await playPromise;
        this.stopFallbackBeats();
        this.isPlaying = true;
        this.isBlocked = false;
        this.notify();
        return true;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // Fast track switch, safe to ignore
        return false;
      }
      if (err?.name === "NotAllowedError") {
        // Real autoplay block
        this.isBlocked = true;
        this.isPlaying = false;
        this.notify();
        return false;
      }
      console.warn("[AudioPlayer] Playback error:", err?.name, url);
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
      this.audioEl.muted = false;
      this.audioEl.volume = Math.max(0.05, this.currentVolume);
      await this.audioEl.play();
      this.isPlaying = true;
      this.isBlocked = false;
      this.notify();
      return true;
    } catch (err) {
      console.warn("[AudioPlayer] Manual resume failed:", err);
      return false;
    }
  }

  /**
   * Activates musical synth rhythm as audio fallback when previewUrl stalls or is blocked
   */
  private handlePlaybackFailure() {
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

  public stop() {
    this.stopFallbackBeats();
    this.isPlaying = false;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
    this.notify();
  }

  public pause() {
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
      this.audioEl.volume = Math.max(0.05, this.currentVolume);
    }
  }

  public getVolume(): number {
    return this.currentVolume;
  }

  public getAudioElement(): HTMLAudioElement | null {
    return this.audioEl;
  }
}

export const audioPlayer = new AudioPlayerService();

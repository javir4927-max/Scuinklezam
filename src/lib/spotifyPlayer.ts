"use client";

import { SpotifyTrackItem } from "./spotifyTypes";
import { getEffectiveVolume } from "./globalVolume";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

class SpotifyPlayerController {
  private audioEl: HTMLAudioElement | null = null;
  private sdkPlayer: any = null;
  private deviceId: string | null = null;
  private isSdkReady: boolean = false;
  private activeToken: string | null = null;
  private roundTimer: NodeJS.Timeout | null = null;
  private currentVolume: number = 0.85;

  constructor() {
    if (typeof window !== "undefined") {
      this.currentVolume = getEffectiveVolume();
      this.audioEl = new Audio();
      this.audioEl.volume = this.currentVolume;

      window.addEventListener("scuinklezam_volume_change", (e: any) => {
        if (e?.detail) {
          this.setVolume(e.detail.volume);
        }
      });
    }
  }

  /**
   * Initializes official Spotify Web Playback SDK if user has Spotify Premium
   */
  public initWebPlaybackSDK(token: string) {
    if (typeof window === "undefined" || !token) return;
    this.activeToken = token;

    if (window.Spotify) {
      this.setupPlayer(token);
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      this.setupPlayer(token);
    };

    if (!document.getElementById("spotify-sdk-script")) {
      const script = document.createElement("script");
      script.id = "spotify-sdk-script";
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }

  private setupPlayer(token: string) {
    if (!window.Spotify) return;

    this.sdkPlayer = new window.Spotify.Player({
      name: "Scuinklezam Web Player",
      getOAuthToken: (cb: (token: string) => void) => {
        cb(token);
      },
      volume: this.currentVolume,
    });

    this.sdkPlayer.addListener("ready", ({ device_id }: { device_id: string }) => {
      this.deviceId = device_id;
      this.isSdkReady = true;
      console.log("Scuinklezam Web Player ready with device ID:", device_id);
    });

    this.sdkPlayer.addListener("not_ready", ({ device_id }: { device_id: string }) => {
      this.isSdkReady = false;
      this.deviceId = null;
    });

    this.sdkPlayer.connect();
  }

  /**
   * Plays a track using Web Playback SDK (if Premium) or fallback preview audio
   */
  public async playTrack(
    track: SpotifyTrackItem,
    isPremium: boolean = false,
    token: string | null = null
  ): Promise<boolean> {
    this.stop();

    // 1. Try Spotify Premium Web Playback SDK if available
    if (isPremium && token && (this.deviceId || this.isSdkReady)) {
      try {
        const targetDeviceId = this.deviceId;
        const url = targetDeviceId
          ? `https://api.spotify.com/v1/me/player/play?device_id=${targetDeviceId}`
          : "https://api.spotify.com/v1/me/player/play";

        const res = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: [track.uri],
            position_ms: 30000, // Jump to 30s chorus!
          }),
        });

        if (res.ok) {
          // Play for 15 seconds during quiz
          this.roundTimer = setTimeout(() => {
            this.pause();
          }, 15000);
          return true;
        }
      } catch (err) {
        console.warn("Spotify Web Playback error, using audio preview:", err);
      }
    }

    // 2. Fallback to native HTML5 audio stream / previewUrl
    if (track.previewUrl && this.audioEl) {
      try {
        this.audioEl.src = track.previewUrl;
        this.audioEl.currentTime = 0;
        this.audioEl.volume = this.currentVolume;
        await this.audioEl.play();

        // 15-second round cutoff
        this.roundTimer = setTimeout(() => {
          this.pause();
        }, 15000);
        return true;
      } catch (err) {
        console.warn("Preview playback failed:", err);
      }
    }

    return false;
  }

  public pause() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    if (this.audioEl) {
      this.audioEl.pause();
    }

    if (this.sdkPlayer && this.isSdkReady) {
      this.sdkPlayer.pause().catch(() => {});
    }
  }

  public stop() {
    this.pause();
    if (this.audioEl) {
      this.audioEl.currentTime = 0;
    }
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    if (this.audioEl) {
      this.audioEl.volume = this.currentVolume;
    }
    if (this.sdkPlayer && this.isSdkReady) {
      this.sdkPlayer.setVolume(this.currentVolume).catch(() => {});
    }
  }
}

export const spotifyPlayer = new SpotifyPlayerController();

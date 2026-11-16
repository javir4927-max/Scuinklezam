"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  SpotifyUserProfile,
  SpotifyUserStats,
  SpotifyPlaylistItem,
} from "@/lib/spotifyTypes";

interface SpotifyAuthContextType {
  isLoading: boolean;
  isConnected: boolean;
  user: SpotifyUserProfile | null;
  stats: SpotifyUserStats | null;
  playlists: SpotifyPlaylistItem[];
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const SpotifyAuthContext = createContext<SpotifyAuthContextType>({
  isLoading: true,
  isConnected: false,
  user: null,
  stats: null,
  playlists: [],
  refreshSession: async () => {},
  logout: async () => {},
});

export function SpotifyAuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [user, setUser] = useState<SpotifyUserProfile | null>(null);
  const [stats, setStats] = useState<SpotifyUserStats | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylistItem[]>([]);

  const fetchSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/spotify/me", { cache: "no-store" });
      if (!res.ok) {
        setIsConnected(false);
        setUser(null);
        setStats(null);
        setPlaylists([]);
        return;
      }
      const data = await res.json();
      if (data.connected && data.user) {
        setIsConnected(true);
        setUser(data.user);
        setStats(data.stats || null);
        setPlaylists(data.playlists || []);
        if (typeof window !== "undefined" && data.user.displayName) {
          localStorage.setItem("scuinklezam_player_name", data.user.displayName);
        }
      } else {
        setIsConnected(false);
        setUser(null);
        setStats(null);
        setPlaylists([]);
      }
    } catch (err) {
      console.warn("Failed to fetch Spotify session:", err);
      setIsConnected(false);
      setUser(null);
      setStats(null);
      setPlaylists([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();

    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("spotify") === "connected") {
        fetchSession();
      }
    }
  }, [fetchSession]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/spotify/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      setIsConnected(false);
      setUser(null);
      setStats(null);
      setPlaylists([]);
    }
  }, []);

  return (
    <SpotifyAuthContext.Provider
      value={{
        isLoading,
        isConnected,
        user,
        stats,
        playlists,
        refreshSession: fetchSession,
        logout,
      }}
    >
      {children}
    </SpotifyAuthContext.Provider>
  );
}

export function useSpotifyAuth() {
  return useContext(SpotifyAuthContext);
}

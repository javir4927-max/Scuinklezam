"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  SpotifyUserProfile,
  SpotifyUserStats,
  SpotifyPlaylistItem,
} from "@/lib/spotifyTypes";

export interface EmailAuthUser {
  id: string;
  email: string;
  nickname: string;
  avatarUrl?: string;
}

interface SpotifyAuthContextType {
  isLoading: boolean;
  isConnected: boolean;
  user: SpotifyUserProfile | null;
  stats: SpotifyUserStats | null;
  playlists: SpotifyPlaylistItem[];
  emailUser: EmailAuthUser | null;
  refreshEmailUser: () => Promise<void>;
  logoutEmailUser: () => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const SpotifyAuthContext = createContext<SpotifyAuthContextType>({
  isLoading: true,
  isConnected: false,
  user: null,
  stats: null,
  playlists: [],
  emailUser: null,
  refreshEmailUser: async () => {},
  logoutEmailUser: async () => {},
  refreshSession: async () => {},
  logout: async () => {},
});

export function SpotifyAuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [user, setUser] = useState<SpotifyUserProfile | null>(null);
  const [stats, setStats] = useState<SpotifyUserStats | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylistItem[]>([]);
  const [emailUser, setEmailUser] = useState<EmailAuthUser | null>(null);

  const fetchEmailUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/user/me", { cache: "no-store" });
      if (!res.ok) {
        setEmailUser(null);
        return;
      }
      const data = await res.json();
      if (data.authenticated && data.user) {
        setEmailUser(data.user);
      } else {
        setEmailUser(null);
      }
    } catch {
      setEmailUser(null);
    }
  }, []);

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
    fetchEmailUser();

    if (typeof window !== "undefined") {
      const handleProfileUpdate = () => {
        fetchEmailUser();
      };
      window.addEventListener("scuinklezam_profile_updated", handleProfileUpdate);
      return () => window.removeEventListener("scuinklezam_profile_updated", handleProfileUpdate);
    }
  }, [fetchSession, fetchEmailUser]);

  const logoutEmailUser = useCallback(async () => {
    try {
      await fetch("/api/auth/user/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      setEmailUser(null);
    }
  }, []);

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
        emailUser,
        refreshEmailUser: fetchEmailUser,
        logoutEmailUser,
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

import { cookies } from "next/headers";
import {
  SpotifyTrackItem,
  SpotifyUserProfile,
  FALLBACK_SPOTIFY_TRACKS,
  getFallbackArtwork,
} from "./spotifyTypes";
import { resolveAudioStream } from "./musicService";

export type { SpotifyTrackItem, SpotifyUserProfile };
export { FALLBACK_SPOTIFY_TRACKS };
export { resolveSpotifyRedirectUri, resolveSpotifyOrigin } from "./spotify";

// Bypass local Windows certificate verification issues for iTunes and Spotify APIs
if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// In-memory token cache for Client Credentials Flow
let cachedAppToken: string | null = null;
let appTokenExpiresAt: number = 0;

/**
 * Gets Spotify App-level token using Client Credentials Flow.
 * Caches in memory to avoid redundant requests.
 */
export async function getSpotifyAppToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  // Check if existing token is valid (with 60-second buffer)
  if (cachedAppToken && Date.now() < appTokenExpiresAt - 60000) {
    return cachedAppToken;
  }

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("Failed to get Spotify App Token:", await response.text());
      return null;
    }

    const data = await response.json();
    cachedAppToken = data.access_token;
    appTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedAppToken;
  } catch (err) {
    console.error("Error obtaining Spotify App Token:", err);
    return null;
  }
}

/**
 * Refreshes user access token using the HTTP-only spotify_refresh_token cookie.
 */
export async function refreshSpotifyUserToken(): Promise<{
  token: string | null;
  expiresIn?: number;
}> {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get("spotify_refresh_token")?.value;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    return { token: null };
  }

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("Failed to refresh Spotify user token, status:", res.status);
      return { token: null };
    }

    const data = await res.json();
    if (data.access_token) {
      try {
        cookieStore.set("spotify_access_token", data.access_token, {
          path: "/",
          maxAge: data.expires_in || 3600,
          sameSite: "lax",
          httpOnly: true,
        });
      } catch {
        // Ignore if cookies() is read-only in some streaming context
      }

      return {
        token: data.access_token,
        expiresIn: data.expires_in || 3600,
      };
    }
  } catch (err) {
    console.error("Error refreshing Spotify user token:", err);
  }

  return { token: null };
}

/**
 * Gets user access token or refreshes it via refresh_token.
 */
export async function getSpotifyUserTokenDetails(): Promise<{
  token: string | null;
  refreshedToken?: string;
  expiresIn?: number;
}> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("spotify_access_token")?.value;
  if (accessToken) return { token: accessToken };

  return await refreshSpotifyUserToken();
}

/**
 * Executes a fetch call to Spotify Web API using the current user token.
 * If Spotify responds with 401 Unauthorized, automatically refreshes the token and retries once.
 */
export async function fetchSpotifyUserAPI(
  url: string,
  options: RequestInit = {}
): Promise<{ res: Response | null; newToken?: string; expiresIn?: number }> {
  let { token } = await getSpotifyUserTokenDetails();
  if (!token) return { res: null };

  const endpoint = url.startsWith("http") ? url : `https://api.spotify.com${url}`;

  let res = await fetch(endpoint, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  // If 401 Unauthorized, automatically refresh token and retry
  if (res.status === 401) {
    console.warn(`[fetchSpotifyUserAPI] Received 401 on ${endpoint}, refreshing token...`);
    const refreshed = await refreshSpotifyUserToken();
    if (refreshed.token) {
      token = refreshed.token;
      res = await fetch(endpoint, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      return { res, newToken: refreshed.token, expiresIn: refreshed.expiresIn };
    }
  }

  return { res };
}

export async function getSpotifyUserToken(): Promise<string | null> {
  const details = await getSpotifyUserTokenDetails();
  return details.token;
}

/**
 * Enriches an array of raw Spotify API tracks in parallel chunks.
 * Prioritizes Spotify preview_url, falling back to iTunes audio snippet if null.
 */
export async function enrichSpotifyTracks(rawTracks: any[]): Promise<SpotifyTrackItem[]> {
  if (!Array.isArray(rawTracks) || rawTracks.length === 0) return [];

  const items: SpotifyTrackItem[] = [];

  for (let i = 0; i < rawTracks.length; i += 6) {
    const chunk = rawTracks.slice(i, i + 6);
    const resolvedChunk = await Promise.all(
      chunk.map(async (t: any) => {
        if (!t || !t.id || !t.name) return null;

        const artists = Array.isArray(t.artists)
          ? t.artists.map((a: any) => a.name).join(", ")
          : t.artists || "Unknown Artist";

        let artworkUrl =
          t.album?.images?.[0]?.url ||
          t.album?.images?.[1]?.url;

        let previewUrl = t.preview_url || null;

        // Background fallback audio stream resolution if preview_url is missing
        if (!previewUrl || !artworkUrl) {
          const resolved = await resolveAudioStream(t.name, artists);
          if (resolved) {
            if (!previewUrl) previewUrl = resolved.previewUrl;
            if (!artworkUrl) artworkUrl = resolved.artworkUrl;
          }
        }

        return {
          id: t.id,
          uri: t.uri || `spotify:track:${t.id}`,
          title: t.name,
          artist: artists,
          album: t.album?.name || "Single",
          artworkUrl: artworkUrl || getFallbackArtwork(t.name, artists),
          spotifyUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
          previewUrl,
          durationMs: t.duration_ms || 30000,
        } as SpotifyTrackItem;
      })
    );

    for (const r of resolvedChunk) {
      if (r) items.push(r);
    }
  }

  return items;
}

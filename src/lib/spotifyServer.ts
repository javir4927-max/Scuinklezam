import { cookies } from "next/headers";
import {
  SpotifyTrackItem,
  SpotifyUserProfile,
  FALLBACK_SPOTIFY_TRACKS,
  getFallbackArtwork,
} from "./spotifyTypes";
import { resolveAudioStream } from "./musicService";
import { getTrackTopic } from "./songMatching";

export type { SpotifyTrackItem, SpotifyUserProfile };
export { FALLBACK_SPOTIFY_TRACKS };
export { resolveSpotifyRedirectUri, resolveSpotifyOrigin } from "./spotify";
export { getSpotifyAppToken } from "./spotifyAppToken";

// Bypass local Windows certificate verification issues for iTunes and Spotify APIs
if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
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
 * Enriches an array of raw Spotify API tracks in controlled parallel chunks (10 at a time).
 * Prioritizes Spotify preview_url, falling back to iTunes & Deezer audio snippets if null.
 * Strictly preserves original Spotify cover art and attaches source provenance.
 */
export async function enrichSpotifyTracks(
  rawTracks: any[],
  sourcePlayerName?: string,
  sourceMode?: string
): Promise<SpotifyTrackItem[]> {
  if (!Array.isArray(rawTracks) || rawTracks.length === 0) return [];

  const items: SpotifyTrackItem[] = [];

  for (let i = 0; i < rawTracks.length; i += 10) {
    const chunk = rawTracks.slice(i, i + 10);
    const resolvedChunk = await Promise.all(
      chunk.map(async (t: any) => {
        if (!t || !t.id || !t.name) return null;

        const artists = Array.isArray(t.artists)
          ? t.artists.map((a: any) => a.name).join(", ")
          : t.artists || "Unknown Artist";

        let artworkUrl =
          t.album?.images?.[0]?.url ||
          t.album?.images?.[1]?.url;

        let previewUrl = (t.preview_url && typeof t.preview_url === "string" && t.preview_url.startsWith("http"))
          ? t.preview_url
          : null;

        // Background fallback audio stream resolution if preview_url is missing
        let detectedGenre: string | undefined = undefined;
        if (!previewUrl || !artworkUrl) {
          const resolved = await resolveAudioStream(t.name, artists);
          if (resolved) {
            if (!previewUrl) previewUrl = resolved.previewUrl;
            if (!artworkUrl) artworkUrl = resolved.artworkUrl;
            detectedGenre = resolved.genre;
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
          sourcePlayerName: sourcePlayerName || t.sourcePlayerName,
          sourceMode: sourceMode || t.sourceMode,
          genre: detectedGenre,
          topic: getTrackTopic({ title: t.name, artist: artists, genre: detectedGenre }),
          spotifyAlbumId: t.album?.id || undefined,
          spotifyArtistId: t.artists?.[0]?.id || undefined,
        } as SpotifyTrackItem;
      })
    );

    for (const r of resolvedChunk) {
      if (r) items.push(r);
    }
  }

  return items;
}

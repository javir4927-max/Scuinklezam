import { NextResponse } from "next/server";
import { fetchSpotifyUserAPI, enrichSpotifyTracks } from "@/lib/spotifyServer";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body.mode || "top_tracks"; // "recently_played" | "top_tracks" | "top_artists" | "liked_songs"

    let rawTracks: any[] = [];
    let modeName = "Canciones de Spotify";
    let topArtists: string[] = [];

    if (mode === "recently_played") {
      modeName = "Escuchadas Recientemente";
      const { res } = await fetchSpotifyUserAPI("/v1/me/player/recently-played?limit=50");
      if (res && res.ok) {
        const data = await res.json();
        rawTracks = (data.items || []).map((i: any) => i.track).filter(Boolean);
      }
    } else if (mode === "top_tracks") {
      modeName = "Más Escuchadas";
      // 1. Try medium_term (top 50)
      let { res } = await fetchSpotifyUserAPI("/v1/me/top/tracks?limit=50&time_range=medium_term");
      if (res && res.ok) {
        const data = await res.json();
        rawTracks = data.items || [];
      }
      // 2. Fallback to long_term if empty
      if (rawTracks.length === 0) {
        const fallbackRes = await fetchSpotifyUserAPI("/v1/me/top/tracks?limit=50&time_range=long_term");
        if (fallbackRes.res && fallbackRes.res.ok) {
          const data = await fallbackRes.res.json();
          rawTracks = data.items || [];
        }
      }
      // 3. Fallback to short_term if still empty
      if (rawTracks.length === 0) {
        const fallbackRes = await fetchSpotifyUserAPI("/v1/me/top/tracks?limit=50&time_range=short_term");
        if (fallbackRes.res && fallbackRes.res.ok) {
          const data = await fallbackRes.res.json();
          rawTracks = data.items || [];
        }
      }
    } else if (mode === "top_artists") {
      modeName = "Tus Artistas Favoritos";
      const { res } = await fetchSpotifyUserAPI("/v1/me/top/artists?limit=15");
      if (res && res.ok) {
        const data = await res.json();
        const artists = data.items || [];
        topArtists = artists.map((a: any) => a.name).filter(Boolean).slice(0, 10);

        // Fetch top tracks for each artist (market=ES)
        const artistTracksPromises = artists.slice(0, 10).map(async (art: any) => {
          const artRes = await fetchSpotifyUserAPI(`/v1/artists/${art.id}/top-tracks?market=ES`);
          if (artRes.res && artRes.res.ok) {
            const artData = await artRes.res.json();
            return (artData.tracks || []).slice(0, 4);
          }
          return [];
        });

        const nested = await Promise.all(artistTracksPromises);
        rawTracks = nested.flat();
      }
    } else if (mode === "liked_songs") {
      modeName = "Canciones Que Te Gustan";
      const { res } = await fetchSpotifyUserAPI("/v1/me/tracks?limit=50");
      if (res && res.ok) {
        const data = await res.json();
        rawTracks = (data.items || []).map((i: any) => i.track).filter(Boolean);
      }
    }

    // Deduplicate raw tracks by id and name
    const seen = new Set<string>();
    const uniqueRawTracks: any[] = [];
    for (const t of rawTracks) {
      if (!t || !t.id || !t.name) continue;
      if (!seen.has(t.id)) {
        seen.add(t.id);
        uniqueRawTracks.push(t);
      }
    }

    // If 0 tracks found on Spotify account for this mode
    if (uniqueRawTracks.length === 0) {
      return NextResponse.json(
        {
          success: true,
          mode,
          modeName,
          count: 0,
          tracks: [],
          artists: [],
          warning: `0 canciones encontradas en el modo "${modeName}" de tu cuenta de Spotify.`,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // Pass through iTunes Search API enricher (resolveAudioStream) to ensure 30s previewUrl and original HD artwork
    const enriched = await enrichSpotifyTracks(uniqueRawTracks);
    const validTracks = enriched.filter(
      (t) => t && t.previewUrl && t.previewUrl.startsWith("http")
    );

    if (topArtists.length === 0) {
      topArtists = Array.from(
        new Set(validTracks.map((t) => t.artist.split(",")[0].trim()).filter(Boolean))
      ).slice(0, 10);
    }

    return NextResponse.json(
      {
        success: true,
        mode,
        modeName,
        count: validTracks.length,
        tracks: validTracks,
        artists: topArtists,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("[/api/spotify/user-tracks] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al obtener canciones de Spotify" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

import { NextResponse } from "next/server";
import { fetchSpotifyUserAPI, enrichSpotifyTracks } from "@/lib/spotifyServer";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";

export const dynamic = "force-dynamic";

// Bypass local Windows certificate verification issues for external music APIs
if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

/**
 * Fisher-Yates shuffle algorithm for true unbiased random ordering
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
      // 1. Get user's Top 5 Artists
      let fetchedArtists: any[] = [];
      const artRes = await fetchSpotifyUserAPI("/v1/me/top/artists?limit=5&time_range=medium_term");
      if (artRes.res && artRes.res.ok) {
        const data = await artRes.res.json();
        fetchedArtists = data.items || [];
      }

      if (fetchedArtists.length === 0) {
        const artLongRes = await fetchSpotifyUserAPI("/v1/me/top/artists?limit=5&time_range=long_term");
        if (artLongRes.res && artLongRes.res.ok) {
          const data = await artLongRes.res.json();
          fetchedArtists = data.items || [];
        }
      }

      // If user has no top artists listed, fallback to artists from top tracks
      if (fetchedArtists.length === 0) {
        const tracksRes = await fetchSpotifyUserAPI("/v1/me/top/tracks?limit=25");
        if (tracksRes.res && tracksRes.res.ok) {
          const tData = await tracksRes.res.json();
          const items = tData.items || [];
          const seenArt = new Set<string>();
          for (const item of items) {
            for (const a of item.artists || []) {
              if (a.name && !seenArt.has(a.name.toLowerCase())) {
                seenArt.add(a.name.toLowerCase());
                fetchedArtists.push({ id: a.id, name: a.name });
                if (fetchedArtists.length >= 5) break;
              }
            }
            if (fetchedArtists.length >= 5) break;
          }
        }
      }

      // Fallback top Spanish/Latin artists if still empty
      if (fetchedArtists.length === 0) {
        fetchedArtists = [
          { name: "Bad Bunny" },
          { name: "Quevedo" },
          { name: "Saiko" },
          { name: "Feid" },
          { name: "Myke Towers" },
        ];
      }

      topArtists = fetchedArtists.map((a: any) => a.name).filter(Boolean).slice(0, 5);

      // 2. Multi-source track search for each of the 5 artists (Spotify Search + iTunes Search API)
      const artistTracksPromises = topArtists.map(async (artistName) => {
        const collected: any[] = [];
        const cleanName = artistName.trim();
        const lowerName = cleanName.toLowerCase();

        // 2a. Spotify Search: /v1/search?q=artist:...&type=track&market=ES&limit=10
        try {
          const sRes = await fetchSpotifyUserAPI(
            `/v1/search?q=artist:${encodeURIComponent(cleanName)}&type=track&market=ES&limit=10`
          );
          if (sRes.res && sRes.res.ok) {
            const sData = await sRes.res.json();
            const items = sData?.tracks?.items || [];
            for (const item of items) {
              const matchesArtist = (item.artists || []).some(
                (a: any) =>
                  a.name.toLowerCase().includes(lowerName) ||
                  lowerName.includes(a.name.toLowerCase())
              );
              if (matchesArtist) {
                collected.push(item);
              }
            }
          }
        } catch (sErr) {
          console.warn(`[top_artists] Spotify search failed for ${cleanName}:`, sErr);
        }

        // 2b. iTunes Search API: entity=song&country=ES&limit=15
        try {
          const itUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanName)}&entity=song&country=ES&limit=15`;
          const itRes = await fetch(itUrl, {
            headers: { "User-Agent": "Scuinklezam/1.0" },
            next: { revalidate: 3600 },
          });
          if (itRes.ok) {
            const itData = await itRes.json();
            for (const itItem of itData?.results || []) {
              if (
                itItem.previewUrl &&
                typeof itItem.previewUrl === "string" &&
                itItem.previewUrl.startsWith("http")
              ) {
                const itArtist = (itItem.artistName || "").toLowerCase();
                if (itArtist.includes(lowerName) || lowerName.includes(itArtist)) {
                  collected.push({
                    id: `it_${itItem.trackId}`,
                    name: itItem.trackName,
                    artists: [{ name: itItem.artistName }],
                    album: {
                      name: itItem.collectionName || "Single",
                      images: [
                        {
                          url: itItem.artworkUrl100
                            ? itItem.artworkUrl100.replace("100x100bb", "600x600bb")
                            : "",
                        },
                      ],
                    },
                    preview_url: itItem.previewUrl,
                    duration_ms: itItem.trackTimeMillis || 30000,
                  });
                }
              }
            }
          }
        } catch (itErr) {
          console.warn(`[top_artists] iTunes search failed for ${cleanName}:`, itErr);
        }

        return collected.slice(0, 10);
      });

      const nested = await Promise.all(artistTracksPromises);
      rawTracks = nested.flat();
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
    const seenNames = new Set<string>();
    const uniqueRawTracks: any[] = [];
    for (const t of rawTracks) {
      if (!t || !t.name) continue;
      const tid = t.id || `${t.name}_${t.artists?.[0]?.name}`;
      const nameKey = `${t.name.toLowerCase().replace(/[^a-z0-9]/g, "")}_${(t.artists?.[0]?.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seen.has(tid) && !seenNames.has(nameKey)) {
        seen.add(tid);
        seenNames.add(nameKey);
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

    // Pass through iTunes Search API enricher to guarantee 30s previewUrl and original HD artwork
    const enriched = await enrichSpotifyTracks(uniqueRawTracks);
    const validTracks = enriched.filter(
      (t) => t && t.previewUrl && t.previewUrl.startsWith("http")
    );

    if (topArtists.length === 0) {
      topArtists = Array.from(
        new Set(validTracks.map((t) => t.artist.split(",")[0].trim()).filter(Boolean))
      ).slice(0, 5);
    }

    // True Fisher-Yates shuffle across the full pool so game selection is 100% unpredictable
    const shuffledTracks = shuffleArray(validTracks);

    return NextResponse.json(
      {
        success: true,
        mode,
        modeName,
        count: shuffledTracks.length,
        tracks: shuffledTracks,
        artists: topArtists.slice(0, 5),
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

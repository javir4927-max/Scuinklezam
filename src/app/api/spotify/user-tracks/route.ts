import { NextResponse } from "next/server";
import { fetchSpotifyUserAPI, enrichSpotifyTracks } from "@/lib/spotifyServer";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";
import { isStrictArtistMatch, hasNonLatinCharacters } from "@/lib/songMatching";

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

    // Retrieve user's display name for attribution badge
    let userDisplayName = "Tú";
    try {
      const meRes = await fetchSpotifyUserAPI("/v1/me");
      if (meRes.res && meRes.res.ok) {
        const meData = await meRes.res.json();
        if (meData?.display_name) {
          userDisplayName = meData.display_name;
        }
      }
    } catch (e) {
      console.warn("[/api/spotify/user-tracks] Could not fetch user display name:", e);
    }

    let rawTracks: any[] = [];
    let modeName = "Canciones de Spotify";
    let topArtists: string[] = [];

    if (mode === "recently_played") {
      modeName = "Escuchadas Recientemente";
      const { res } = await fetchSpotifyUserAPI("/v1/me/player/recently-played?limit=50");
      if (res && res.ok) {
        const data = await res.json();
        const items = data.items || [];
        // Deduplicate consecutive identical tracks
        const deduped: any[] = [];
        let lastId = "";
        for (const i of items) {
          const t = i.track;
          if (t && t.id && t.id !== lastId) {
            deduped.push(t);
            lastId = t.id;
          }
        }
        rawTracks = deduped;
      }
    } else if (mode === "top_tracks") {
      modeName = "Más Escuchadas";
      // Parallel queries across long_term, medium_term, and short_term for exhaustive favorites
      const [longRes, medRes, shortRes] = await Promise.all([
        fetchSpotifyUserAPI("/v1/me/top/tracks?limit=50&time_range=long_term"),
        fetchSpotifyUserAPI("/v1/me/top/tracks?limit=50&time_range=medium_term"),
        fetchSpotifyUserAPI("/v1/me/top/tracks?limit=50&time_range=short_term"),
      ]);

      const gathered: any[] = [];
      if (longRes.res && longRes.res.ok) {
        const d = await longRes.res.json();
        gathered.push(...(d.items || []));
      }
      if (medRes.res && medRes.res.ok) {
        const d = await medRes.res.json();
        gathered.push(...(d.items || []));
      }
      if (shortRes.res && shortRes.res.ok) {
        const d = await shortRes.res.json();
        gathered.push(...(d.items || []));
      }
      rawTracks = gathered;
    } else if (mode === "top_artists") {
      modeName = "Tus Artistas Favoritos";
      // 1. Parallel fetch top artists from long_term and medium_term (up to 10 artists)
      const [artLongRes, artMedRes] = await Promise.all([
        fetchSpotifyUserAPI("/v1/me/top/artists?limit=10&time_range=long_term"),
        fetchSpotifyUserAPI("/v1/me/top/artists?limit=10&time_range=medium_term"),
      ]);

      const seenArtNames = new Set<string>();
      let fetchedArtists: any[] = [];

      for (const aRes of [artLongRes, artMedRes]) {
        if (aRes.res && aRes.res.ok) {
          const d = await aRes.res.json();
          for (const item of d.items || []) {
            const clean = item.name?.trim();
            if (clean && !seenArtNames.has(clean.toLowerCase())) {
              seenArtNames.add(clean.toLowerCase());
              fetchedArtists.push({ id: item.id, name: clean });
            }
          }
        }
      }

      // If user has no top artists listed, fallback to artists from top tracks
      if (fetchedArtists.length === 0) {
        const tracksRes = await fetchSpotifyUserAPI("/v1/me/top/tracks?limit=25");
        if (tracksRes.res && tracksRes.res.ok) {
          const tData = await tracksRes.res.json();
          for (const item of tData.items || []) {
            for (const a of item.artists || []) {
              const clean = a.name?.trim();
              if (clean && !seenArtNames.has(clean.toLowerCase())) {
                seenArtNames.add(clean.toLowerCase());
                fetchedArtists.push({ id: a.id, name: clean });
                if (fetchedArtists.length >= 10) break;
              }
            }
            if (fetchedArtists.length >= 10) break;
          }
        }
      }

      // Fallback top Spanish/Latin artists if user is brand new
      if (fetchedArtists.length === 0) {
        fetchedArtists = [
          { name: "Bad Bunny" },
          { name: "Quevedo" },
          { name: "Saiko" },
          { name: "Feid" },
          { name: "Myke Towers" },
          { name: "Mora" },
          { name: "Rauw Alejandro" },
          { name: "Duki" },
          { name: "Eladio Carrión" },
          { name: "Maikel Delacalle" },
        ];
      }

      topArtists = fetchedArtists.map((a: any) => a.name).filter(Boolean).slice(0, 10);

      // 2. Fetch tracks for each artist via iTunes Search API (country=ES) and Deezer API
      const artistTracksPromises = topArtists.map(async (artistName) => {
        const collected: any[] = [];
        const cleanName = artistName.trim();
        const isLatin = !hasNonLatinCharacters(cleanName);

        // 2a. iTunes Search API (attribute=artistTerm, country=ES, limit=10)
        try {
          const itUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanName)}&entity=song&attribute=artistTerm&country=ES&limit=10`;
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
                if (isLatin && (hasNonLatinCharacters(itItem.trackName || "") || hasNonLatinCharacters(itItem.artistName || ""))) {
                  continue;
                }
                if (isStrictArtistMatch(itItem.artistName, cleanName)) {
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

        // 2b. Deezer API Search (/search/track?q=...&limit=10)
        try {
          const dUrl = `https://api.deezer.com/search/track?q=${encodeURIComponent(cleanName)}&limit=10`;
          const dRes = await fetch(dUrl, {
            headers: { "User-Agent": "Scuinklezam/1.0" },
            next: { revalidate: 3600 },
          });
          if (dRes.ok) {
            const dData = await dRes.json();
            for (const dItem of dData?.data || []) {
              if (dItem.preview && typeof dItem.preview === "string" && dItem.preview.startsWith("http")) {
                if (isLatin && (hasNonLatinCharacters(dItem.title || "") || hasNonLatinCharacters(dItem.artist?.name || ""))) {
                  continue;
                }
                if (isStrictArtistMatch(dItem.artist?.name, cleanName)) {
                  collected.push({
                    id: `dz_${dItem.id}`,
                    name: dItem.title,
                    artists: [{ name: dItem.artist?.name || cleanName }],
                    album: {
                      name: dItem.album?.title || "Single",
                      images: [
                        {
                          url: dItem.album?.cover_xl || dItem.album?.cover_big || "",
                        },
                      ],
                    },
                    preview_url: dItem.preview,
                    duration_ms: (dItem.duration || 30) * 1000,
                  });
                }
              }
            }
          }
        } catch (dErr) {
          console.warn(`[top_artists] Deezer search failed for ${cleanName}:`, dErr);
        }

        // 2c. Spotify Search fallback if available
        try {
          const sRes = await fetchSpotifyUserAPI(
            `/v1/search?q=artist:${encodeURIComponent(cleanName)}&type=track&market=ES&limit=10`
          );
          if (sRes.res && sRes.res.ok) {
            const sData = await sRes.res.json();
            const items = sData?.tracks?.items || [];
            for (const item of items) {
              const matchesArtist = (item.artists || []).some(
                (a: any) => isStrictArtistMatch(a.name, cleanName)
              );
              if (matchesArtist) {
                collected.push(item);
              }
            }
          }
        } catch (sErr) {
          console.warn(`[top_artists] Spotify search failed for ${cleanName}:`, sErr);
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

    // Deduplicate raw tracks by id and normalized name
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
          userDisplayName,
          count: 0,
          tracks: [],
          artists: [],
          warning: `0 canciones encontradas en el modo "${modeName}" de tu cuenta de Spotify.`,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // Pass through parallel enricher (10 at a time) to guarantee 30s previewUrl and original HD artwork
    const enriched = await enrichSpotifyTracks(uniqueRawTracks, userDisplayName, modeName);
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
        userDisplayName,
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

import { NextResponse } from "next/server";
import { searchVerifiedTracks, searchStrictArtistTracks, resolveAudioStream } from "@/lib/musicService";
import { RANKED_CATEGORIES, toArtistSlug, getCanonicalArtistName } from "@/lib/rankedTypes";
import { SpotifyTrackItem, getFallbackArtwork } from "@/lib/spotifyTypes";
import {
  normalizeSongTitle,
  isStrictArtistMatch,
  hasNonLatinCharacters,
  deepNormalize,
  ARTIST_COLLAB_REGEX,
} from "@/lib/songMatching";
import { getSpotifyAppToken } from "@/lib/spotifyAppToken";

export const dynamic = "force-dynamic";

// Bypass local Windows certificate verification issues for external music APIs
if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

// Curated artist pools per thematic category to guarantee 100% authentic music
const THEME_ARTIST_POOLS: Record<string, string[]> = {
  theme_viral_espana: [
    "Quevedo", "Saiko", "JC Reyes", "Omar Montes", "Lucho RK", "La Pantera", "Rels B",
    "Bad Gyal", "Morad", "Lola Indigo", "Cruzzi", "Delaossa", "Hoke", "Recycled J",
    "Cano", "Cyril Kamer", "Ana Mena", "Aitana", "Beny Jr"
  ],
  theme_top_espana: [
    "Quevedo", "Morad", "Aitana", "Lola Indigo", "Rels B", "Cano", "Saiko", "Omar Montes",
    "Ana Mena", "Bad Gyal", "JC Reyes", "Beny Jr", "Cruzzi"
  ],
  theme_under_espana: [
    "Lucho RK", "La Pantera", "Hoke", "Cruzzi", "Ill Pekeño", "Ergo Pro", "Delaossa",
    "Israel B", "Gloosito", "Soto Asa", "Yung Beef", "Kaydy Cain", "Abhir Hathi", "Juicy BAE"
  ],
  theme_reggaeton: [
    "Bad Bunny", "Feid", "Myke Towers", "Mora", "Rauw Alejandro", "Karol G", "Jhayco",
    "Dei V", "Omar Courtz", "Luar La L", "Anuel AA", "Daddy Yankee", "Don Omar"
  ],
  theme_trap_argentino: [
    "Duki", "Bizarrap", "YSY A", "KHEA", "Neo Pistea", "C.R.O", "Tiago PZK",
    "Trueno", "Milo j", "Nicki Nicole", "Emilia"
  ],
  theme_pop_mundial: [
    "The Weeknd", "Taylor Swift", "Dua Lipa", "Billie Eilish", "Bruno Mars",
    "Ariana Grande", "Sabrina Carpenter", "Post Malone", "Travis Scott", "Drake"
  ],
};

function getArtistSearchTerms(artistName: string): { clean: string; slug: string; searchTerms: string[] } {
  const clean = getCanonicalArtistName(
    artistName.split(/[/,&]|(\s+feat\.?\s+)|(\s+ft\.?\s+)/i)[0].trim()
  );
  const slug = toArtistSlug(clean);
  let searchTerms = [clean];
  if (slug === "cruzzi") {
    searchTerms = ["Cruzzi", "Cruz Cafuné", "Cruz Cafune"];
  } else if (slug === "feid") {
    searchTerms = ["Feid", "Ferxxo"];
  } else if (slug === "kanye-west") {
    searchTerms = ["Kanye West", "Ye"];
  } else if (slug === "abhir") {
    searchTerms = ["Abhir", "Abhir Hathi"];
  }
  return { clean, slug, searchTerms };
}

/**
 * Queries a deep pool of 20 to 100 songs for a specific artist combining
 * iTunes Search API (ES + US), Deezer API (top=50 across aliases), and Spotify Catalog (top-tracks + artist search),
 * rescuing missing Spotify preview URLs via resolveAudioStream and filtering strictly by artist match.
 */
async function fetchDeepArtistTrackPool(artistName: string): Promise<SpotifyTrackItem[]> {
  const { clean, searchTerms } = getArtistSearchTerms(artistName);
  const isLatin = !hasNonLatinCharacters(clean);

  // 1. Fetch iTunes Search API limit=80 country=ES and country=US with attribute=artistTerm
  const itunesPromises = searchTerms.flatMap((term) => [
    fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&attribute=artistTerm&country=ES&limit=80`,
      { headers: { "User-Agent": "Scuinklezam/1.0" }, cache: "no-store", signal: AbortSignal.timeout(3500) }
    ).then((r) => (r.ok ? r.json() : { results: [] })).catch(() => ({ results: [] })),
    fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&attribute=artistTerm&country=US&limit=80`,
      { headers: { "User-Agent": "Scuinklezam/1.0" }, cache: "no-store", signal: AbortSignal.timeout(3500) }
    ).then((r) => (r.ok ? r.json() : { results: [] })).catch(() => ({ results: [] })),
  ]);

  // 2. Fetch Deezer Artist Top 50 across ALL searchTerms (accumulating aliases without duplicate artistId)
  const deezerPromise = (async () => {
    const allDzTracks: any[] = [];
    const seenArtistIds = new Set<number | string>();
    try {
      for (const term of searchTerms) {
        const aRes = await fetch(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(term)}&limit=10`,
          {
            headers: { "User-Agent": "Scuinklezam/1.0" },
            cache: "no-store",
            signal: AbortSignal.timeout(3500),
          }
        )
          .then((r) => (r.ok ? r.json() : { data: [] }))
          .catch(() => ({ data: [] }));

        const matchingArtists = (aRes?.data || [])
          .filter((a: any) => isStrictArtistMatch(a.name, term) || isStrictArtistMatch(a.name, clean))
          .sort((a: any, b: any) => (b.nb_fan || 0) - (a.nb_fan || 0));

        const matched = matchingArtists[0];
        const artistId = matched?.id;
        if (artistId && !seenArtistIds.has(artistId)) {
          seenArtistIds.add(artistId);
          const topRes = await fetch(
            `https://api.deezer.com/artist/${artistId}/top?limit=50`,
            {
              headers: { "User-Agent": "Scuinklezam/1.0" },
              cache: "no-store",
              signal: AbortSignal.timeout(3500),
            }
          )
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }));

          if (topRes?.data && Array.isArray(topRes.data) && topRes.data.length > 0) {
            allDzTracks.push(...topRes.data);
          }
        }
      }
    } catch (e) {
      console.warn("[ranked/tracks] Deezer track search failed:", e);
    }
    return allDzTracks;
  })();

  // 3. Fetch Spotify Tracks via App Token (top-tracks AND artist:"..." search in parallel)
  const spotifyPromise = (async () => {
    try {
      const token = await getSpotifyAppToken();
      if (!token) return [];

      let targetArtistId: string | null = null;
      let matchedSpotifyName: string | null = null;
      try {
        const artistSearchResponses = await Promise.all(
          searchTerms.map(async (term) => {
            try {
              const aRes = await fetch(
                `https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=artist&limit=5`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                  cache: "no-store",
                  signal: AbortSignal.timeout(3500),
                }
              );
              if (!aRes.ok) return [];
              const aData = await aRes.json();
              return (aData?.artists?.items || []).filter(
                (a: any) => isStrictArtistMatch(a.name, term) || isStrictArtistMatch(a.name, clean)
              );
            } catch {
              return [];
            }
          })
        );

        const allMatchedArtists = artistSearchResponses
          .flat()
          .sort((a: any, b: any) => (b.followers?.total || 0) - (a.followers?.total || 0));

        if (allMatchedArtists[0]?.id) {
          targetArtistId = allMatchedArtists[0].id;
          matchedSpotifyName = allMatchedArtists[0].name || null;
        }
      } catch {
        // Fallback to direct query below
      }

      const trackSearchTerms = new Set<string>([clean]);
      if (matchedSpotifyName && deepNormalize(matchedSpotifyName) !== deepNormalize(clean)) {
        trackSearchTerms.add(matchedSpotifyName);
      }

      const fetchUrls: string[] = [];
      if (targetArtistId) {
        fetchUrls.push(`https://api.spotify.com/v1/artists/${targetArtistId}/top-tracks?market=ES`);
      }
      for (const ts of Array.from(trackSearchTerms)) {
        fetchUrls.push(
          `https://api.spotify.com/v1/search?q=artist:"${encodeURIComponent(ts)}"&type=track&market=ES&limit=30`
        );
      }

      const responses = await Promise.all(
        fetchUrls.map(async (url) => {
          try {
            const sRes = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
              signal: AbortSignal.timeout(3500),
            });
            if (!sRes.ok) return [];
            const sData = await sRes.json();
            return Array.isArray(sData?.tracks) ? sData.tracks : (sData?.tracks?.items || []);
          } catch {
            return [];
          }
        })
      );

      const mergedSp: any[] = [];
      const seenSpIds = new Set<string>();
      for (const list of responses) {
        for (const item of list) {
          if (!item?.id || seenSpIds.has(item.id)) continue;
          const hasMatchingArtist =
            Array.isArray(item.artists) &&
            item.artists.some((a: any) => isStrictArtistMatch(a.name, clean));
          if (!hasMatchingArtist) continue;
          seenSpIds.add(item.id);
          mergedSp.push(item);
        }
      }
      return mergedSp;
    } catch {
      return [];
    }
  })();

  const [itResults, dzTracks, spTracks] = await Promise.all([
    Promise.all(itunesPromises),
    deezerPromise,
    spotifyPromise,
  ]);

  const pool = new Map<string, SpotifyTrackItem>();

  // Filter and collect iTunes candidates
  const itunesCandidates: any[] = [];
  for (const itData of itResults) {
    for (const it of itData?.results || []) {
      if (!it.previewUrl || typeof it.previewUrl !== "string" || !it.previewUrl.startsWith("http")) continue;
      if (isLatin && (hasNonLatinCharacters(it.trackName || "") || hasNonLatinCharacters(it.artistName || ""))) continue;
      if (!isStrictArtistMatch(it.artistName, clean)) continue;
      const itTit = it.trackName || "";
      if (/karaoke|tribute|cover/i.test(itTit) || /karaoke|tribute/i.test(it.artistName || "")) continue;
      itunesCandidates.push(it);
    }
  }

  // Count solo tracks per artistId grouped by exact normalized name (deepNormalize(it.artistName))
  // so official aliases (e.g. Cruzzi vs Cruz Cafune) are preserved while homonyms get filtered
  const itunesSoloCountByNormName = new Map<string, Map<number | string, number>>();
  for (const it of itunesCandidates) {
    const rawArtistName = it.artistName || "";
    const isSolo =
      Boolean(it.artistId) &&
      !ARTIST_COLLAB_REGEX.test(rawArtistName) &&
      isStrictArtistMatch(rawArtistName, clean);
    if (isSolo) {
      const normName = deepNormalize(rawArtistName);
      if (normName) {
        if (!itunesSoloCountByNormName.has(normName)) {
          itunesSoloCountByNormName.set(normName, new Map());
        }
        const idMap = itunesSoloCountByNormName.get(normName)!;
        idMap.set(it.artistId, (idMap.get(it.artistId) || 0) + 1);
      }
    }
  }

  const itunesMinoritySoloIds = new Set<any>();
  itunesSoloCountByNormName.forEach((idMap) => {
    if (idMap.size > 1) {
      let dominantId: any = null;
      let maxCount = -1;
      idMap.forEach((count, id) => {
        if (count > maxCount) {
          maxCount = count;
          dominantId = id;
        }
      });
      idMap.forEach((_count, id) => {
        if (id !== dominantId) {
          itunesMinoritySoloIds.add(id);
        }
      });
    }
  });

  // Add iTunes tracks (excluding minority homonym artistId)
  for (const it of itunesCandidates) {
    if (it.artistId && itunesMinoritySoloIds.has(it.artistId)) continue;
    const itTit = it.trackName || "";
    const norm = normalizeSongTitle(itTit);
    if (!norm) continue;

    if (!pool.has(norm)) {
      const artwork = it.artworkUrl100
        ? it.artworkUrl100.replace("100x100bb", "600x600bb")
        : getFallbackArtwork(itTit, it.artistName || clean);

      pool.set(norm, {
        id: `it_${it.trackId}`,
        uri: `spotify:track:it_${it.trackId}`,
        title: itTit,
        artist: it.artistName || clean,
        album: it.collectionName || "Single",
        artworkUrl: artwork,
        spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(`${itTit} ${clean}`)}`,
        previewUrl: it.previewUrl,
        durationMs: it.trackTimeMillis || 30000,
      });
    }
  }

  // Add Deezer tracks
  for (const dz of dzTracks) {
    if (!dz.preview || typeof dz.preview !== "string" || !dz.preview.startsWith("http")) continue;
    if (isLatin && (hasNonLatinCharacters(dz.title || "") || hasNonLatinCharacters(dz.artist?.name || ""))) continue;
    if (!isStrictArtistMatch(dz.artist?.name, clean)) continue;
    const dzTit = dz.title || "";
    if (/karaoke|tribute|cover/i.test(dzTit) || /karaoke|tribute/i.test(dz.artist?.name || "")) continue;

    const norm = normalizeSongTitle(dzTit);
    if (!norm) continue;

    if (!pool.has(norm)) {
      const artwork =
        dz.album?.cover_xl ||
        dz.album?.cover_big ||
        dz.album?.cover_medium ||
        getFallbackArtwork(dzTit, clean);

      pool.set(norm, {
        id: `dz_${dz.id}`,
        uri: `spotify:track:dz_${dz.id}`,
        title: dzTit,
        artist: dz.artist?.name || clean,
        album: dz.album?.title || "Single",
        artworkUrl: artwork,
        spotifyUrl: dz.link || `https://open.spotify.com/search/${encodeURIComponent(`${dzTit} ${clean}`)}`,
        previewUrl: dz.preview,
        durationMs: (dz.duration || 30) * 1000,
      });
    }
  }

  // Add Spotify tracks that already have preview_url
  for (const sp of spTracks) {
    if (!sp.preview_url || typeof sp.preview_url !== "string" || !sp.preview_url.startsWith("http")) continue;
    const hasMatchingArtist = sp.artists?.some((a: any) => isStrictArtistMatch(a.name, clean));
    if (!hasMatchingArtist) continue;
    const spTit = sp.name || "";
    if (/karaoke|tribute|cover/i.test(spTit)) continue;
    const artistNames = sp.artists?.map((a: any) => a.name).join(", ") || clean;
    if (isLatin && (hasNonLatinCharacters(spTit) || hasNonLatinCharacters(artistNames))) continue;

    const norm = normalizeSongTitle(spTit);
    if (!norm) continue;

    if (!pool.has(norm)) {
      const artwork = sp.album?.images?.[0]?.url || getFallbackArtwork(spTit, clean);
      pool.set(norm, {
        id: `sp_${sp.id}`,
        uri: sp.uri || `spotify:track:${sp.id}`,
        title: spTit,
        artist: artistNames,
        album: sp.album?.name || "Single",
        artworkUrl: artwork,
        spotifyUrl: sp.external_urls?.spotify || `https://open.spotify.com/track/${sp.id}`,
        previewUrl: sp.preview_url,
        durationMs: sp.duration_ms || 30000,
      });
    }
  }

  // Rescue Spotify tracks when preview_url is null if pool < 20
  if (pool.size < 20 && spTracks.length > 0) {
    const rescueCandidates: Array<{ sp: any; norm: string; artistNames: string }> = [];
    const seenRescueNorms = new Set<string>();

    for (const sp of spTracks) {
      if (rescueCandidates.length >= 15) break;
      if (!sp?.name || !Array.isArray(sp.artists)) continue;
      const hasMatchingArtist = sp.artists.some((a: any) => isStrictArtistMatch(a.name, clean));
      if (!hasMatchingArtist) continue;

      const spTit = sp.name || "";
      if (/karaoke|tribute|cover/i.test(spTit)) continue;
      const artistNames = sp.artists.map((a: any) => a.name).join(", ");
      if (isLatin && (hasNonLatinCharacters(spTit) || hasNonLatinCharacters(artistNames))) continue;

      const norm = normalizeSongTitle(spTit);
      if (!norm || pool.has(norm) || seenRescueNorms.has(norm)) continue;

      seenRescueNorms.add(norm);
      rescueCandidates.push({ sp, norm, artistNames });
    }

    for (let i = 0; i < rescueCandidates.length; i += 5) {
      const batch = rescueCandidates.slice(i, i + 5);
      const resolvedBatch = await Promise.all(
        batch.map(async ({ sp, norm, artistNames }) => {
          try {
            const resolved = await resolveAudioStream(sp.name, artistNames || clean);
            return { sp, norm, artistNames, resolved };
          } catch {
            return { sp, norm, artistNames, resolved: null };
          }
        })
      );

      for (const { sp, norm, artistNames, resolved } of resolvedBatch) {
        if (
          resolved?.previewUrl &&
          resolved.previewUrl.startsWith("http") &&
          !pool.has(norm) &&
          isStrictArtistMatch(artistNames || clean, clean)
        ) {
          const artwork =
            sp.album?.images?.[0]?.url ||
            resolved.artworkUrl ||
            getFallbackArtwork(sp.name, clean);
          pool.set(norm, {
            id: `sp_${sp.id}`,
            uri: sp.uri || `spotify:track:${sp.id}`,
            title: sp.name,
            artist: artistNames || clean,
            album: sp.album?.name || "Single",
            artworkUrl: artwork,
            spotifyUrl: sp.external_urls?.spotify || `https://open.spotify.com/track/${sp.id}`,
            previewUrl: resolved.previewUrl,
            durationMs: sp.duration_ms || 30000,
          });
        }
      }
    }
  }

  return Array.from(pool.values());
}

// Fallback tracks in Spanish so English tracks never leak into Spanish categories
const SPANISH_FALLBACK_TRACKS: SpotifyTrackItem[] = [
  {
    id: "it_es_1",
    uri: "spotify:track:es1",
    title: "Columbia",
    artist: "Quevedo",
    album: "Buenas Noches",
    artworkUrl: "https://cdn-images.dzcdn.net/images/artist/79880cc1b999b15567e332203464c34e/600x600-000000-80-0-0.jpg",
    spotifyUrl: "https://open.spotify.com/artist/52iwsT98xCoGgiGntTiR7K",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/c3/a3/3a/c3a33a10-2f2f-8919-ca6a-d48e89eb6e4a/mzaf_10330105373809605335.plus.aac.p.m4a",
    durationMs: 30000,
  },
  {
    id: "it_es_2",
    uri: "spotify:track:es2",
    title: "Supernova",
    artist: "Saiko",
    album: "Sakura",
    artworkUrl: "https://cdn-images.dzcdn.net/images/artist/38f4945a0ca1b2900d26f5f504b3cae5/600x600-000000-80-0-0.jpg",
    spotifyUrl: "https://open.spotify.com/artist/3WwJ7nOq4lZJ3n57b32q1d",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/4a/1b/c0/4a1bc0cf-2cb7-7f99-e64e-5e364687d3a0/mzaf_13506260195503463876.plus.aac.p.m4a",
    durationMs: 30000,
  },
  {
    id: "it_es_3",
    uri: "spotify:track:es3",
    title: "Monaco",
    artist: "Bad Bunny",
    album: "Nadie Sabe Lo Que Va A Pasar Mañana",
    artworkUrl: "https://cdn-images.dzcdn.net/images/artist/044a3f315b041864887a8dd8709e6926/600x600-000000-80-0-0.jpg",
    spotifyUrl: "https://open.spotify.com/artist/4q3ewBCX7sLwd24euuV69X",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/4a/1b/c0/4a1bc0cf-2cb7-7f99-e64e-5e364687d3a0/mzaf_13506260195503463876.plus.aac.p.m4a",
    durationMs: 30000,
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category") || "artist_bad_bunny";
  const customArtist = searchParams.get("artist");

  const cat = RANKED_CATEGORIES.find((c) => c.id === categoryId);
  const isSpanishTheme =
    categoryId === "theme_viral_espana" ||
    categoryId === "theme_top_espana" ||
    categoryId === "theme_under_espana";

  // 1. Case: Specific Artist (predefined category or custom search)
  // NEVER fall through to thematic pools, searchVerifiedTracks, or SPANISH_FALLBACK_TRACKS
  const artistQuery = customArtist || (cat?.kind === "artist" ? cat.query : "");
  if (artistQuery) {
    const cleanArtist = artistQuery.trim();
    try {
      const deepPool = await fetchDeepArtistTrackPool(cleanArtist);
      const merged: SpotifyTrackItem[] = [...deepPool];

      if (merged.length < 10) {
        const { searchTerms } = getArtistSearchTerms(cleanArtist);
        const termResults = await Promise.all(
          searchTerms.map((term) => searchStrictArtistTracks(term, 35))
        );
        for (const directTracks of termResults) {
          for (const t of directTracks) {
            const norm = normalizeSongTitle(t.title);
            if (
              t.previewUrl &&
              norm &&
              !merged.some((x) => normalizeSongTitle(x.title) === norm)
            ) {
              merged.push(t);
            }
          }
        }
      }

      const strictFiltered = merged.filter(
        (t) =>
          Boolean(t.previewUrl && t.previewUrl.startsWith("http")) &&
          isStrictArtistMatch(t.artist, cleanArtist)
      );

      if (strictFiltered.length >= 4) {
        return NextResponse.json(
          {
            success: true,
            tracks: strictFiltered,
            poolSize: strictFiltered.length,
            artist: cleanArtist,
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: false,
          tracks: [],
          poolSize: 0,
          error: `No se encontraron suficientes canciones con audio disponible para "${cleanArtist}".`,
        },
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    } catch (err) {
      console.warn(`[ranked/tracks] artist track pool failed for ${cleanArtist}:`, err);
      return NextResponse.json(
        {
          success: false,
          tracks: [],
          poolSize: 0,
          error: `No se encontraron suficientes canciones con audio disponible para "${cleanArtist}".`,
        },
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }
  }

  try {

    // 2. Case: Thematic Pool
    if (THEME_ARTIST_POOLS[categoryId]) {
      const pool = THEME_ARTIST_POOLS[categoryId];
      // Pick 6 to 9 random artists from pool
      const selectedArtists = [...pool].sort(() => 0.5 - Math.random()).slice(0, 9);
      const collected: SpotifyTrackItem[] = [];

      for (const artistName of selectedArtists) {
        const itunesTracks = await searchStrictArtistTracks(artistName, 5);
        for (const t of itunesTracks) {
          if (
            t.previewUrl &&
            !collected.some(
              (x) => normalizeSongTitle(x.title) === normalizeSongTitle(t.title)
            )
          ) {
            collected.push(t);
          }
        }
        if (collected.length >= 25) break;
      }

      if (collected.length >= 10) {
        return NextResponse.json(
          { success: true, tracks: collected, poolSize: collected.length },
          { headers: NO_CACHE_HEADERS }
        );
      }
    }

    // 3. Fallback to generic search
    const query = cat ? cat.query : (customArtist || categoryId);
    const tracks = await searchVerifiedTracks(query, 25);
    if (tracks && tracks.length >= 8) {
      return NextResponse.json(
        { success: true, tracks, poolSize: tracks.length },
        { headers: NO_CACHE_HEADERS }
      );
    }
  } catch (err) {
    console.warn(`[ranked/tracks] search failed for ${categoryId}:`, err);
  }

  // Safety return: use Spanish fallbacks
  return NextResponse.json(
    { success: true, tracks: SPANISH_FALLBACK_TRACKS, poolSize: SPANISH_FALLBACK_TRACKS.length },
    { headers: NO_CACHE_HEADERS }
  );
}

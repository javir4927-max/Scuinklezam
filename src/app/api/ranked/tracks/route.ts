import { NextResponse } from "next/server";
import { searchVerifiedTracks, searchItunesCatalog, searchStrictArtistTracks } from "@/lib/musicService";
import { RANKED_CATEGORIES } from "@/lib/rankedTypes";
import { SpotifyTrackItem, getFallbackArtwork } from "@/lib/spotifyTypes";
import { normalizeSongTitle, getTrackTopic, isStrictArtistMatch, hasNonLatinCharacters } from "@/lib/songMatching";
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

/**
 * Queries a deep pool of 60 to 100 songs for a specific artist combining
 * iTunes Search API (ES + US), Deezer API (top=50), and Spotify Catalog (limit=30),
 * filtered by primary artist and verified audio previews, deduplicated by normalized title.
 */
async function fetchDeepArtistTrackPool(artistName: string): Promise<SpotifyTrackItem[]> {
  const clean = artistName.split(/[/,&]|(\s+feat\.?\s+)|(\s+ft\.?\s+)/i)[0].trim();
  const isLatin = !hasNonLatinCharacters(clean);
  const searchTerms = [clean];
  if (clean.toLowerCase() === "cruzzi") {
    searchTerms.push("Cruz Cafune");
  }

  // 1. Fetch iTunes Search API limit=80 country=ES and country=US with attribute=artistTerm
  const itunesPromises = searchTerms.flatMap((term) => [
    fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&attribute=artistTerm&country=ES&limit=80`,
      { headers: { "User-Agent": "Scuinklezam/1.0" }, cache: "no-store" }
    ).then((r) => r.json()).catch(() => ({ results: [] })),
    fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&attribute=artistTerm&country=US&limit=80`,
      { headers: { "User-Agent": "Scuinklezam/1.0" }, cache: "no-store" }
    ).then((r) => r.json()).catch(() => ({ results: [] })),
  ]);

  // 2. Fetch Deezer Artist Top 50 with cache: 'no-store'
  const deezerPromise = (async () => {
    try {
      for (const term of searchTerms) {
        const aRes = await fetch(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(term)}`,
          {
            headers: { "User-Agent": "Scuinklezam/1.0" },
            cache: "no-store",
          }
        ).then((r) => r.json());

        const matched = (aRes?.data || []).find((a: any) =>
          isStrictArtistMatch(a.name, term) || a.name.toLowerCase() === term.toLowerCase()
        ) || aRes?.data?.[0];

        const artistId = matched?.id;
        if (artistId) {
          const topRes = await fetch(
            `https://api.deezer.com/artist/${artistId}/top?limit=50`,
            {
              headers: { "User-Agent": "Scuinklezam/1.0" },
              cache: "no-store",
            }
          ).then((r) => r.json());
          if (topRes?.data && Array.isArray(topRes.data) && topRes.data.length > 0) {
            return topRes.data as any[];
          }
        }
      }
    } catch (e) {
      console.warn("[ranked/tracks] Deezer track search failed:", e);
    }
    return [] as any[];
  })();

  // 3. Fetch Spotify Tracks via App Token
  const spotifyPromise = (async () => {
    try {
      const token = await getSpotifyAppToken();
      if (!token) return [];
      const sRes = await fetch(
        `https://api.spotify.com/v1/search?q=artist:"${encodeURIComponent(clean)}"&type=track&market=ES&limit=30`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      if (!sRes.ok) return [];
      const sData = await sRes.json();
      return (sData?.tracks?.items || []) as any[];
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

  // Add iTunes tracks
  for (const itData of itResults) {
    for (const it of itData?.results || []) {
      if (!it.previewUrl || typeof it.previewUrl !== "string" || !it.previewUrl.startsWith("http")) continue;
      if (isLatin && (hasNonLatinCharacters(it.trackName || "") || hasNonLatinCharacters(it.artistName || ""))) continue;
      if (!isStrictArtistMatch(it.artistName, clean)) continue;
      const itTit = it.trackName || "";
      if (/karaoke|tribute|cover/i.test(itTit) || /karaoke|tribute/i.test(it.artistName || "")) continue;

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

  // Add Spotify tracks (if preview_url is available)
  for (const sp of spTracks) {
    if (!sp.preview_url || typeof sp.preview_url !== "string" || !sp.preview_url.startsWith("http")) continue;
    const mainArt = sp.artists?.[0]?.name || clean;
    if (!isStrictArtistMatch(mainArt, clean)) continue;
    const spTit = sp.name || "";
    if (/karaoke|tribute|cover/i.test(spTit)) continue;

    const norm = normalizeSongTitle(spTit);
    if (!norm) continue;

    if (!pool.has(norm)) {
      const artwork = sp.album?.images?.[0]?.url || getFallbackArtwork(spTit, clean);
      pool.set(norm, {
        id: `sp_${sp.id}`,
        uri: sp.uri || `spotify:track:${sp.id}`,
        title: spTit,
        artist: sp.artists?.map((a: any) => a.name).join(", ") || clean,
        album: sp.album?.name || "Single",
        artworkUrl: artwork,
        spotifyUrl: sp.external_urls?.spotify || `https://open.spotify.com/track/${sp.id}`,
        previewUrl: sp.preview_url,
        durationMs: sp.duration_ms || 30000,
      });
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

  try {
    // 1. Case: Specific Artist (predefined category or custom search)
    const artistQuery = customArtist || (cat?.kind === "artist" ? cat.query : "");
    if (artistQuery) {
      const cleanArtist = artistQuery.trim();
      const deepPool = await fetchDeepArtistTrackPool(cleanArtist);

      if (deepPool.length >= 10) {
        return NextResponse.json(
          {
            success: true,
            tracks: deepPool,
            poolSize: deepPool.length,
            artist: cleanArtist,
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      // Complement with iTunes search if deep pool was small
      const directTracks = await searchStrictArtistTracks(cleanArtist, 35);
      const verified = directTracks.filter((t) => t.previewUrl);
      const merged = [...deepPool];
      for (const t of verified) {
        const norm = normalizeSongTitle(t.title);
        if (!merged.some((x) => normalizeSongTitle(x.title) === norm)) {
          merged.push(t);
        }
      }

      if (merged.length >= 8) {
        return NextResponse.json(
          { success: true, tracks: merged, poolSize: merged.length, artist: cleanArtist },
          { headers: NO_CACHE_HEADERS }
        );
      }
    }

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

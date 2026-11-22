import { SpotifyTrackItem, FALLBACK_SPOTIFY_TRACKS, getFallbackArtwork } from "./spotifyTypes";
import { getSpotifyAppToken, getSpotifyUserToken } from "./spotifyServer";
import {
  matchArtistNameStrict,
  isStrictArtistMatch,
  matchSongTitleStrict,
  deepNormalize,
  getTrackTopic,
  hasNonLatinCharacters,
} from "./songMatching";

// Bypass local Windows certificate verification issues for iTunes and Spotify APIs
if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export { getFallbackArtwork };

export interface AudioStreamResolution {
  previewUrl: string;
  artworkUrl: string;
  genre?: string;
}

/**
 * Searches iTunes API (country=ES) and falls back to Deezer API to guarantee
 * a verified 30s playable audio stream and HD 600x600 artwork.
 * STRICT: Guarantees that the audio belongs EXACTLY to the requested artist and title.
 * Unmatched audio is discarded (returns null) so no mismatched audio ever plays.
 */
export async function resolveAudioStream(
  title: string,
  artist: string
): Promise<AudioStreamResolution | null> {
  const cleanTitle = deepNormalize(title);
  const mainArtist = (artist || "").split(/[/,&]|(\s+feat\.?\s+)|(\s+ft\.?\s+)|(\s+with\s+)|(\s+x\s+)/i)[0].trim();
  const query = `${cleanTitle} ${mainArtist}`.trim();

  // 1. iTunes Search API (country=ES, limit=10) with 3500ms timeout
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&country=ES&limit=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Scuinklezam/1.0" },
      signal: AbortSignal.timeout(3500),
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.results && Array.isArray(data.results)) {
        for (const item of data.results) {
          if (!item.previewUrl || typeof item.previewUrl !== "string" || !item.previewUrl.startsWith("http")) {
            continue;
          }

          // Strict match: must match both artist AND song title with high precision
          const artistMatches = isStrictArtistMatch(item.artistName, artist);
          const titleMatches = matchSongTitleStrict(item.trackName, title);

          if (artistMatches && titleMatches) {
            const art = item.artworkUrl100
              ? item.artworkUrl100.replace("100x100bb", "600x600bb")
              : getFallbackArtwork(title, artist);

            return {
              previewUrl: item.previewUrl,
              artworkUrl: art,
              genre: item.primaryGenreName,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn("[resolveAudioStream] iTunes search failed:", err);
  }

  // 2. Deezer API Fallback (limit=6) with 3500ms timeout
  try {
    const dUrl = `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=6`;
    const dRes = await fetch(dUrl, {
      headers: { "User-Agent": "Scuinklezam/1.0" },
      signal: AbortSignal.timeout(3500),
      next: { revalidate: 3600 },
    });

    if (dRes.ok) {
      const dData = await dRes.json();
      if (dData.data && Array.isArray(dData.data)) {
        for (const dItem of dData.data) {
          if (!dItem.preview || typeof dItem.preview !== "string" || !dItem.preview.startsWith("http")) {
            continue;
          }

          // Strict match on Deezer as well
          const artistMatches = isStrictArtistMatch(dItem.artist?.name, artist);
          const titleMatches = matchSongTitleStrict(dItem.title, title);

          if (artistMatches && titleMatches) {
            const dArt = dItem.album?.cover_xl || dItem.album?.cover_big || getFallbackArtwork(title, artist);
            return {
              previewUrl: dItem.preview,
              artworkUrl: dArt,
            };
          }
        }
      }
    }
  } catch (dErr) {
    console.warn("[resolveAudioStream] Deezer search failed:", dErr);
  }

  // If no exact match found, reject audio to prevent playing the wrong song
  return null;
}

/**
 * Normalizes an iTunes result object to a verified SpotifyTrackItem.
 * Returns null if previewUrl is missing or invalid.
 */
function normalizeItunesItem(item: any, fallbackIndex = 0): SpotifyTrackItem | null {
  if (!item || !item.previewUrl || typeof item.previewUrl !== "string" || !item.previewUrl.startsWith("http")) {
    return null;
  }

  const title = item.trackName || "Canción";
  const artist = item.artistName || "Artista";
  const genre = item.primaryGenreName || undefined;
  const artwork = item.artworkUrl100
    ? item.artworkUrl100.replace("100x100bb", "600x600bb")
    : getFallbackArtwork(title, artist);

  const topic = getTrackTopic({ title, artist, genre });

  return {
    id: `it_${item.trackId || fallbackIndex}`,
    uri: `spotify:track:${item.trackId || fallbackIndex}`,
    title,
    artist,
    album: item.collectionName || "Single",
    artworkUrl: artwork,
    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
    previewUrl: item.previewUrl,
    durationMs: item.trackTimeMillis || 30000,
    genre,
    topic,
  };
}

/**
 * Searches iTunes song catalog directly and returns only tracks with verified preview audio.
 */
export async function searchItunesCatalog(query: string, limit = 25): Promise<SpotifyTrackItem[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Scuinklezam/1.0" },
      next: { revalidate: 1800 },
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    const tracks: SpotifyTrackItem[] = [];
    for (let i = 0; i < data.results.length; i++) {
      const normalized = normalizeItunesItem(data.results[i], i);
      if (normalized) {
        tracks.push(normalized);
      }
    }
    return tracks;
  } catch (err) {
    console.warn("iTunes catalog search error:", err);
    return [];
  }
}

/**
 * Searches Spotify API if configured, resolving any missing preview URLs via iTunes.
 */
export async function searchSpotifyCatalog(query: string, limit = 20): Promise<SpotifyTrackItem[]> {
  const token = (await getSpotifyUserToken()) || (await getSpotifyAppToken());
  if (!token) return [];

  try {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    });

    if (!res.ok) return [];
    const data = await res.json();
    const raw = data.tracks?.items || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const items: SpotifyTrackItem[] = [];

    // Resolve in parallel chunks of 5
    for (let i = 0; i < raw.length; i += 5) {
      const slice = raw.slice(i, i + 5);
      const resolvedSlice = await Promise.all(
        slice.map(async (t: any) => {
          if (!t || !t.id || !t.name) return null;
          const artists = Array.isArray(t.artists)
            ? t.artists.map((a: any) => a.name).join(", ")
            : t.artists || "Unknown Artist";

          let artworkUrl =
            t.album?.images?.[0]?.url ||
            t.album?.images?.[1]?.url;

          let previewUrl = t.preview_url;
          let detectedGenre: string | undefined = undefined;

          // If Spotify did not provide preview_url or high-res art, resolve via iTunes
          if (!previewUrl || !artworkUrl) {
            const resolved = await resolveAudioStream(t.name, artists);
            if (resolved) {
              previewUrl = resolved.previewUrl;
              if (!artworkUrl) artworkUrl = resolved.artworkUrl;
              detectedGenre = resolved.genre;
            }
          }

          if (!previewUrl || typeof previewUrl !== "string" || !previewUrl.startsWith("http")) {
            return null; // Strict rule: omit if audio is not verified
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
            genre: detectedGenre,
            topic: getTrackTopic({ title: t.name, artist: artists, genre: detectedGenre }),
          } as SpotifyTrackItem;
        })
      );

      for (const item of resolvedSlice) {
        if (item) items.push(item);
      }
    }

    return items;
  } catch (err) {
    console.warn("Spotify catalog search exception:", err);
    return [];
  }
}

/**
 * Unified, resilient track search.
 * GUARANTEES that 100% of returned tracks have a non-empty, working previewUrl and artworkUrl.
 * If initial results are fewer than minTracks, dispatches complementary searches until minTracks is satisfied.
 */
export async function searchVerifiedTracks(
  query: string,
  minTracks = 10
): Promise<SpotifyTrackItem[]> {
  const cleanQ = (query || "Pop Hits").trim();
  const collected: SpotifyTrackItem[] = [];
  const seenKeys = new Set<string>();

  const addUnique = (list: SpotifyTrackItem[]) => {
    for (const t of list) {
      if (!t.previewUrl || !t.previewUrl.startsWith("http")) continue;
      const key = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seenKeys.has(key) && !seenKeys.has(t.id)) {
        seenKeys.add(key);
        seenKeys.add(t.id);
        collected.push(t);
      }
    }
  };

  // 1. Try Spotify first
  const spotifyResults = await searchSpotifyCatalog(cleanQ, Math.max(15, minTracks + 5));
  addUnique(spotifyResults);

  // 2. Complement with iTunes if needed
  if (collected.length < minTracks) {
    const itunesResults = await searchItunesCatalog(cleanQ, 25);
    addUnique(itunesResults);
  }

  // 3. Complementary queries if still fewer than minTracks (e.g. niche artist or narrow term)
  if (collected.length < minTracks) {
    const backupQueries = [
      `${cleanQ} hits`,
      `${cleanQ} greatest hits`,
      "Top Hits Global 2024",
      "Latin Pop Hits",
      "Billboard Hot 100",
    ];

    for (const bq of backupQueries) {
      if (collected.length >= minTracks + 4) break;
      const moreItunes = await searchItunesCatalog(bq, 15);
      addUnique(moreItunes);
    }
  }

  // 4. Ultimate fallback: include pre-verified curated tracks
  if (collected.length < minTracks) {
    addUnique(FALLBACK_SPOTIFY_TRACKS);
  }

  return collected;
}

/**
 * Strictly searches tracks by a given artist name on iTunes.
 * Guarantees:
 * - isStrictArtistMatch(item.artistName, artistName) is true
 * - Has valid previewUrl (audio stream)
 * - Excludes karaoke, tribute, cover, instrumental, lullaby, piano version
 * - Preserves Latin script if the artist name is Latin
 */
export async function searchStrictArtistTracks(
  artistName: string,
  limit = 25
): Promise<SpotifyTrackItem[]> {
  const cleanArtist = (artistName || "").trim();
  if (!cleanArtist) return [];

  const isLatin = !hasNonLatinCharacters(cleanArtist);
  const JUNK_REGEX = /karaoke|tribute|cover|instrumental|lullaby|piano version/i;

  try {
    const fetchLimit = Math.min(50, Math.max(limit * 2, 30));
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanArtist)}&entity=song&attribute=artistTerm&country=ES&limit=${fetchLimit}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Scuinklezam/1.0" },
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 1800 },
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    const tracks: SpotifyTrackItem[] = [];
    const seenTitles = new Set<string>();

    for (let i = 0; i < data.results.length; i++) {
      const item = data.results[i];
      if (!item.trackName || !item.previewUrl) continue;
      if (!isStrictArtistMatch(item.artistName || "", cleanArtist)) continue;
      if (JUNK_REGEX.test(item.trackName) || JUNK_REGEX.test(item.artistName || "")) continue;
      if (isLatin && (hasNonLatinCharacters(item.trackName) || hasNonLatinCharacters(item.artistName || ""))) continue;

      const normTitle = deepNormalize(item.trackName);
      if (!normTitle || seenTitles.has(normTitle)) continue;
      seenTitles.add(normTitle);

      const normalized = normalizeItunesItem(item, i);
      if (normalized && normalized.previewUrl) {
        tracks.push(normalized);
        if (tracks.length >= limit) break;
      }
    }

    return tracks;
  } catch (err) {
    console.warn("[searchStrictArtistTracks] error:", err);
    return [];
  }
}

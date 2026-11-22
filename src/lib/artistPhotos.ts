// Bypass local Windows certificate verification issues for external music APIs
if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { getSpotifyAppToken } from "./spotifyAppToken";
import { PRELOADED_ARTIST_PHOTOS } from "./artistPhotosCatalog";
import { isStrictArtistMatch } from "./songMatching";
import { redis } from "./roomStore";

export { PRELOADED_ARTIST_PHOTOS } from "./artistPhotosCatalog";

export const DEEZER_EMPTY_HASH = "d41d8cd98f00b204e9800998ecf8427e";

// Global in-memory cache to avoid redundant network lookups
const inMemoryCache = new Map<string, string>();

/**
 * Resolves the real face photo of an artist with a 4-tier waterfall:
 * 1. Official Spotify Web API in HD (~640x640)
 * 2. Official Deezer API (filtering out empty placeholder hash)
 * 3. Preloaded verified photo catalog
 * 4. DiceBear stylized identicon avatar
 *
 * Caches in memory and in Upstash Redis for 7 days (scuinklezam:artist_photo_sp_v1:${slug}).
 */
export async function getArtistFacePhoto(artistName: string): Promise<string> {
  if (!artistName || !artistName.trim()) return "";
  const clean = artistName.trim();
  const lower = clean.toLowerCase();
  const normalizedKey = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Clean composite names ("Feid / Ferxxo" -> "Feid", "Morad feat. Beny Jr" -> "Morad")
  const primaryName = clean.split(/[/,&]|(\s+feat\.?\s+)|(\s+ft\.?\s+)/i)[0].trim();
  const lowerPrimary = primaryName.toLowerCase();
  const normPrimary = lowerPrimary.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const queryName = primaryName || clean;

  const slug = queryName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const redisKey = `scuinklezam:artist_photo_sp_v1:${slug}`;

  // 0. Check in-memory cache
  if (inMemoryCache.has(lower)) {
    const cached = inMemoryCache.get(lower)!;
    if (!cached.includes(DEEZER_EMPTY_HASH)) return cached;
  }
  if (inMemoryCache.has(normalizedKey)) {
    const cached = inMemoryCache.get(normalizedKey)!;
    if (!cached.includes(DEEZER_EMPTY_HASH)) return cached;
  }
  if (inMemoryCache.has(lowerPrimary)) {
    const cached = inMemoryCache.get(lowerPrimary)!;
    if (!cached.includes(DEEZER_EMPTY_HASH)) return cached;
  }

  // Check Upstash Redis cache (7 days)
  if (redis) {
    try {
      const redisCached = await redis.get<string>(redisKey);
      if (redisCached && typeof redisCached === "string" && !redisCached.includes(DEEZER_EMPTY_HASH)) {
        inMemoryCache.set(lower, redisCached);
        inMemoryCache.set(normalizedKey, redisCached);
        inMemoryCache.set(lowerPrimary, redisCached);
        return redisCached;
      }
    } catch {
      // Redis errors should never block execution
    }
  }

  let finalPhoto = "";

  // 1. Priority 1: Spotify Web API official in HD
  try {
    const token = await getSpotifyAppToken();
    if (token) {
      const sRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(queryName)}&type=artist&limit=5`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 86400 },
        }
      );
      if (sRes.ok) {
        const sData = await sRes.json();
        const items = sData?.artists?.items || [];
        const matching = items.filter((item: any) =>
          isStrictArtistMatch(item.name, queryName) ||
          item.name.toLowerCase() === queryName.toLowerCase() ||
          item.name.toLowerCase() === lower ||
          item.name.toLowerCase() === lowerPrimary
        );
        // Sort matching by follower count descending
        matching.sort((a: any, b: any) => (b.followers?.total || 0) - (a.followers?.total || 0));
        const best = matching[0] || (items[0] && (isStrictArtistMatch(items[0].name, queryName) || isStrictArtistMatch(items[0].name, clean)) ? items[0] : null);
        if (best?.images?.length > 0 && best.images[0]?.url) {
          finalPhoto = best.images[0].url;
        }
      }
    }
  } catch (spotErr) {
    console.warn(`[getArtistFacePhoto] Spotify search failed for ${artistName}:`, spotErr);
  }

  // 2. Priority 2: Deezer API official
  if (!finalPhoto) {
    try {
      const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(queryName)}`, {
        headers: { "User-Agent": "Scuinklezam/1.0" },
        next: { revalidate: 86400 },
      });
      if (res.ok) {
        const data = await res.json();
        const items = data?.data || [];
        const matching = items.filter((artist: any) =>
          isStrictArtistMatch(artist.name, queryName) ||
          artist.name.toLowerCase() === queryName.toLowerCase() ||
          artist.name.toLowerCase() === lower ||
          artist.name.toLowerCase() === lowerPrimary
        );
        const best = matching[0] || items[0];
        if (best) {
          const photo = best.picture_xl || best.picture_big || best.picture_medium;
          if (photo && !photo.includes(DEEZER_EMPTY_HASH)) {
            finalPhoto = photo;
          }
        }
      }
    } catch (err) {
      console.warn(`[getArtistFacePhoto] Deezer search failed for ${artistName}:`, err);
    }
  }

  // 3. Priority 3: PRELOADED_ARTIST_PHOTOS
  if (!finalPhoto) {
    const preloaded =
      PRELOADED_ARTIST_PHOTOS[lower] ||
      PRELOADED_ARTIST_PHOTOS[normalizedKey] ||
      PRELOADED_ARTIST_PHOTOS[lowerPrimary] ||
      PRELOADED_ARTIST_PHOTOS[normPrimary];
    if (preloaded && !preloaded.includes(DEEZER_EMPTY_HASH)) {
      finalPhoto = preloaded;
    }
  }

  // 4. Priority 4: Fallback SVG / DiceBear avatar
  if (!finalPhoto) {
    finalPhoto = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(clean)}&backgroundColor=0B1710`;
  }

  // Save to memory cache
  inMemoryCache.set(lower, finalPhoto);
  inMemoryCache.set(normalizedKey, finalPhoto);
  inMemoryCache.set(lowerPrimary, finalPhoto);

  // Save to Upstash Redis (7 days TTL: 604800 seconds)
  if (redis && finalPhoto && !finalPhoto.includes(DEEZER_EMPTY_HASH)) {
    try {
      await redis.set(redisKey, finalPhoto, { ex: 604800 });
    } catch {
      // Ignore redis write errors
    }
  }

  return finalPhoto;
}

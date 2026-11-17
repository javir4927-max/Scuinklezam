// Bypass local Windows certificate verification issues for external music APIs
if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { getSpotifyAppToken } from "./spotifyAppToken";
import { PRELOADED_ARTIST_PHOTOS } from "./artistPhotosCatalog";

export { PRELOADED_ARTIST_PHOTOS } from "./artistPhotosCatalog";

// Global in-memory cache to avoid redundant network lookups
const inMemoryCache = new Map<string, string>();

/**
 * Resolves the real face photo of an artist via Deezer public API or preloaded map.
 */
export async function getArtistFacePhoto(artistName: string): Promise<string> {
  if (!artistName || !artistName.trim()) return "";
  const clean = artistName.trim();
  const lower = clean.toLowerCase();
  const normalizedKey = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (PRELOADED_ARTIST_PHOTOS[lower]) {
    return PRELOADED_ARTIST_PHOTOS[lower];
  }
  if (PRELOADED_ARTIST_PHOTOS[normalizedKey]) {
    return PRELOADED_ARTIST_PHOTOS[normalizedKey];
  }

  if (inMemoryCache.has(lower)) {
    return inMemoryCache.get(lower)!;
  }
  if (inMemoryCache.has(normalizedKey)) {
    return inMemoryCache.get(normalizedKey)!;
  }

  // 1. Try Deezer API
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(clean)}`, {
      headers: { "User-Agent": "Scuinklezam/1.0" },
      next: { revalidate: 86400 }, // Cache 24 hours
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.data && data.data.length > 0) {
        const artist = data.data[0];
        const photo = artist.picture_xl || artist.picture_big || artist.picture_medium;
        if (photo) {
          inMemoryCache.set(lower, photo);
          inMemoryCache.set(normalizedKey, photo);
          return photo;
        }
      }
    }
  } catch (err) {
    console.warn(`[getArtistFacePhoto] Deezer failed for ${artistName}:`, err);
  }

  // 2. Fallback to Spotify API (server-side with app token)
  try {
    const token = await getSpotifyAppToken();
    if (token) {
      const sRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(clean)}&type=artist&limit=1`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 86400 },
        }
      );
      if (sRes.ok) {
        const sData = await sRes.json();
        const artist = sData?.artists?.items?.[0];
        const sPhoto = artist?.images?.[0]?.url;
        if (sPhoto) {
          inMemoryCache.set(lower, sPhoto);
          inMemoryCache.set(normalizedKey, sPhoto);
          return sPhoto;
        }
      }
    }
  } catch (spotErr) {
    console.warn(`[getArtistFacePhoto] Spotify search failed for ${artistName}:`, spotErr);
  }

  // 3. Fallback to iTunes Search API (single HD artwork 600x600)
  try {
    const itRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=song&limit=3&country=ES`,
      {
        headers: { "User-Agent": "Scuinklezam/1.0" },
        next: { revalidate: 86400 },
      }
    );
    if (itRes.ok) {
      const itData = await itRes.json();
      if (itData?.results?.length > 0) {
        const item = itData.results[0];
        if (item.artworkUrl100) {
          const itPhoto = item.artworkUrl100.replace("100x100bb", "600x600bb");
          inMemoryCache.set(lower, itPhoto);
          inMemoryCache.set(normalizedKey, itPhoto);
          return itPhoto;
        }
      }
    }
  } catch (itErr) {
    console.warn(`[getArtistFacePhoto] iTunes search failed for ${artistName}:`, itErr);
  }

  // 4. Fallback to stylized DiceBear avatar
  const fallback = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(clean)}&backgroundColor=0B1710`;
  inMemoryCache.set(lower, fallback);
  return fallback;
}

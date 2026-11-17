// Known high-res artist face photos directly from Deezer/Spotify CDN
export const PRELOADED_ARTIST_PHOTOS: Record<string, string> = {
  "bad bunny": "https://cdn-images.dzcdn.net/images/artist/044a3f315b041864887a8dd8709e6926/500x500-000000-80-0-0.jpg",
  "quevedo": "https://cdn-images.dzcdn.net/images/artist/574e4c3a7029b935ceba4849615598ae/500x500-000000-80-0-0.jpg",
  "feid": "https://cdn-images.dzcdn.net/images/artist/5bb3ae0e4eb1e66c4ef0a9504c86ee94/500x500-000000-80-0-0.jpg",
  "myke towers": "https://cdn-images.dzcdn.net/images/artist/bf5ae6df8ff39fa1cfc3e55c6544be36/500x500-000000-80-0-0.jpg",
  "duki": "https://cdn-images.dzcdn.net/images/artist/8126b86d1a93883a48e8e788bc59e86c/500x500-000000-80-0-0.jpg",
  "mora": "https://cdn-images.dzcdn.net/images/artist/3ba836bfa57161b97aeb7ff3a31c5bb1/500x500-000000-80-0-0.jpg",
  "rosalía": "https://cdn-images.dzcdn.net/images/artist/0b1d30325d30aa4f31c5efb0e3624e52/500x500-000000-80-0-0.jpg",
  "rosalia": "https://cdn-images.dzcdn.net/images/artist/0b1d30325d30aa4f31c5efb0e3624e52/500x500-000000-80-0-0.jpg",
  "taylor swift": "https://cdn-images.dzcdn.net/images/artist/20c74902148286a111a43a059d0b67cf/500x500-000000-80-0-0.jpg",
  "the weeknd": "https://cdn-images.dzcdn.net/images/artist/561b32bb3da658f8b3fbcf5957388701/500x500-000000-80-0-0.jpg",
  "drake": "https://cdn-images.dzcdn.net/images/artist/5f9c490a597a76572eb0f88fa5384666/500x500-000000-80-0-0.jpg",
  "billie eilish": "https://cdn-images.dzcdn.net/images/artist/1e7c5cb92d21be55c3c0a52f9b8b21ba/500x500-000000-80-0-0.jpg",
  "eminem": "https://cdn-images.dzcdn.net/images/artist/1c93a0b85a3fa088d890b0e52701f530/500x500-000000-80-0-0.jpg",
  "ariana grande": "https://cdn-images.dzcdn.net/images/artist/d1e2bb475fdf915f532a26c99fcf6f34/500x500-000000-80-0-0.jpg",
  "lana del rey": "https://cdn-images.dzcdn.net/images/artist/8121665a3b2b9ceb9cbbfae35058c426/500x500-000000-80-0-0.jpg",
  "olivia rodrigo": "https://cdn-images.dzcdn.net/images/artist/3b5d2753faee1846b9a896d11f5fae2d/500x500-000000-80-0-0.jpg",
  "kendrick lamar": "https://cdn-images.dzcdn.net/images/artist/d90e94bb775c92c57176a6cf38965682/500x500-000000-80-0-0.jpg",
  "bruno mars": "https://cdn-images.dzcdn.net/images/artist/bbdc8ba06616b77ae4b4b27eead9f485/500x500-000000-80-0-0.jpg",
  "frank ocean": "https://cdn-images.dzcdn.net/images/artist/821f9850c90d8a56fa2b0b1ad02e9bc4/500x500-000000-80-0-0.jpg",
  "travis scott": "https://cdn-images.dzcdn.net/images/artist/a895513adbe4910cfab5eeabdb555e09/500x500-000000-80-0-0.jpg",
  "dua lipa": "https://cdn-images.dzcdn.net/images/artist/a1f592186835a63964d4b1a473e6dcf3/500x500-000000-80-0-0.jpg",
  "michael jackson": "https://cdn-images.dzcdn.net/images/artist/2534f590fc3be5b0266e744ec4917ae2/500x500-000000-80-0-0.jpg",
  "juice wrld": "https://cdn-images.dzcdn.net/images/artist/e94fa00bb466ea85eb04d80a15320c1d/500x500-000000-80-0-0.jpg",
  "bizarrap": "https://cdn-images.dzcdn.net/images/artist/d531d2ba5108bb68b3f46f33333342eb/500x500-000000-80-0-0.jpg",
  "rauw alejandro": "https://cdn-images.dzcdn.net/images/artist/3bb0fa84226f31522f281e0507a27eb0/500x500-000000-80-0-0.jpg",
  "anuel aa": "https://cdn-images.dzcdn.net/images/artist/7732a3fc26330ce9a0f4a86f9f688847/500x500-000000-80-0-0.jpg",
  "saiko": "https://cdn-images.dzcdn.net/images/artist/ec6ea717b99335a089bf8d47bfa2b322/500x500-000000-80-0-0.jpg",
};

// Global in-memory cache to avoid redundant network lookups
const inMemoryCache = new Map<string, string>();

/**
 * Resolves the real face photo of an artist via Deezer public API or preloaded map.
 */
export async function getArtistFacePhoto(artistName: string): Promise<string> {
  if (!artistName || !artistName.trim()) return "";
  const clean = artistName.trim();
  const lower = clean.toLowerCase();

  if (PRELOADED_ARTIST_PHOTOS[lower]) {
    return PRELOADED_ARTIST_PHOTOS[lower];
  }

  if (inMemoryCache.has(lower)) {
    return inMemoryCache.get(lower)!;
  }

  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(clean)}`, {
      headers: { "User-Agent": "Scuinklezam/1.0" },
      next: { revalidate: 86400 }, // Cache 24 hours
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.data && data.data.length > 0) {
        const artist = data.data[0];
        const photo = artist.picture_xl || artist.picture_medium || artist.picture_big || artist.picture_small || "";
        if (photo) {
          inMemoryCache.set(lower, photo);
          return photo;
        }
      }
    }
  } catch (err) {
    console.warn(`[getArtistFacePhoto] Failed for ${artistName}:`, err);
  }

  // Fallback to stylized DiceBear avatar
  const fallback = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(clean)}&backgroundColor=0B1710`;
  inMemoryCache.set(lower, fallback);
  return fallback;
}

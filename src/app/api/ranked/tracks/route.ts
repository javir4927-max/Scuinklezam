import { NextResponse } from "next/server";
import { searchVerifiedTracks, searchItunesCatalog } from "@/lib/musicService";
import { RANKED_CATEGORIES } from "@/lib/rankedTypes";
import { SpotifyTrackItem } from "@/lib/spotifyTypes";

export const dynamic = "force-dynamic";

// Curated artist pools per thematic category to guarantee 100% authentic music
const THEME_ARTIST_POOLS: Record<string, string[]> = {
  theme_viral_espana: [
    "Quevedo", "Saiko", "JC Reyes", "Omar Montes", "Lucho RK", "La Pantera", "Rels B",
    "Bad Gyal", "Morad", "Lola Indigo", "Cruz Cafuné", "Delaossa", "Hoke", "Recycled J",
    "Cano", "Cyril Kamer", "Ana Mena", "Aitana", "Beny Jr"
  ],
  theme_top_espana: [
    "Quevedo", "Morad", "Aitana", "Lola Indigo", "Rels B", "Cano", "Saiko", "Omar Montes",
    "Ana Mena", "Bad Gyal", "JC Reyes", "Beny Jr", "Cruz Cafuné"
  ],
  theme_under_espana: [
    "Lucho RK", "La Pantera", "Hoke", "Cruz Cafuné", "Ill Pekeño", "Ergo Pro", "Delaossa",
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
    spotifyUrl: "https://open.spotify.com/artist/5X4LWVGLiB5Qmi0b59bda7",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/bf/f4/1d/bff41d8e-9092-23ef-4f11-209f9fecad69/mzaf_1684347714157053531.plus.aac.p.m4a",
    durationMs: 30000,
  },
  {
    id: "it_es_3",
    uri: "spotify:track:es3",
    title: "RETRICA",
    artist: "Lucho RK",
    album: "Single",
    artworkUrl: "https://cdn-images.dzcdn.net/images/artist/3095312c8ed2248c70c42bab0dd4745b/600x600-000000-80-0-0.jpg",
    spotifyUrl: "https://open.spotify.com/artist/11o5Fk3eD5mE7zWb60k46i",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/a9/4d/97/a94d97ef-4171-ec56-e91b-8fce9765cb84/mzaf_15783515152341258169.plus.aac.p.m4a",
    durationMs: 30000,
  },
  {
    id: "it_es_4",
    uri: "spotify:track:es4",
    title: "Jjjj",
    artist: "Hoke & Cruz Cafuné",
    album: "BBO",
    artworkUrl: "https://cdn-images.dzcdn.net/images/artist/bb773f14fbb13df8c06ec91cb8b936d9/600x600-000000-80-0-0.jpg",
    spotifyUrl: "https://open.spotify.com/artist/3Y60U16E6Zz58E2Hj6o98q",
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
    // 1. Case: Thematic Pool
    if (THEME_ARTIST_POOLS[categoryId]) {
      const pool = THEME_ARTIST_POOLS[categoryId];
      // Pick 5 to 7 random artists from pool
      const selectedArtists = [...pool].sort(() => 0.5 - Math.random()).slice(0, 7);
      const collected: SpotifyTrackItem[] = [];

      for (const artistName of selectedArtists) {
        const itunesTracks = await searchItunesCatalog(artistName, 4);
        itunesTracks.forEach((t) => {
          if (t.previewUrl && !collected.some((x) => x.title === t.title && x.artist === t.artist)) {
            collected.push(t);
          }
        });
        if (collected.length >= 14) break;
      }

      if (collected.length >= 10) {
        const shuffled = collected.sort(() => 0.5 - Math.random()).slice(0, 12);
        return NextResponse.json({ success: true, tracks: shuffled });
      }
    }

    // 2. Case: Specific Artist (predefined or custom search)
    const artistQuery = customArtist || (cat?.kind === "artist" ? cat.query : "");
    if (artistQuery) {
      const cleanArtist = artistQuery.trim();
      const directTracks = await searchItunesCatalog(cleanArtist, 25);
      const verified = directTracks.filter((t) => t.previewUrl);

      if (verified.length >= 10) {
        return NextResponse.json({
          success: true,
          tracks: verified.sort(() => 0.5 - Math.random()).slice(0, 12),
        });
      }

      // Complement with unified search
      const complement = await searchVerifiedTracks(cleanArtist, 12);
      if (complement && complement.length >= 10) {
        return NextResponse.json({ success: true, tracks: complement.slice(0, 12) });
      }
    }

    // 3. Fallback to generic search
    const query = cat ? cat.query : (customArtist || categoryId);
    const tracks = await searchVerifiedTracks(query, 12);
    if (tracks && tracks.length >= 8) {
      return NextResponse.json({ success: true, tracks: tracks.slice(0, 12) });
    }
  } catch (err) {
    console.warn(`[ranked/tracks] search failed for ${categoryId}:`, err);
  }

  // Safety return: use Spanish fallbacks for Spanish themes, never English pop
  const fallback = isSpanishTheme ? SPANISH_FALLBACK_TRACKS : SPANISH_FALLBACK_TRACKS;
  return NextResponse.json({ success: true, tracks: fallback });
}

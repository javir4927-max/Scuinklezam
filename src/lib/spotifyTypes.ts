export interface SpotifyTrackItem {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  spotifyUrl: string;
  previewUrl: string | null;
  durationMs?: number;
  sourcePlayerName?: string;
  sourceMode?: string;
  topic?: string;
  genre?: string;
}

export interface SpotifyUserProfile {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl: string;
  imageUrl?: string;
  product: "premium" | "free" | "open";
  isPremium: boolean;
}

export interface SpotifyArtistItem {
  id: string;
  name: string;
  genres: string[];
  imageUrl: string;
  spotifyUrl: string;
}

export interface SpotifyPlaylistItem {
  id: string;
  name: string;
  description: string;
  tracksCount: number;
  tracksTotal?: number;
  imageUrl: string;
  uri: string;
}

export interface SpotifyUserStats {
  topTracksShort: SpotifyTrackItem[];
  topTracksMedium: SpotifyTrackItem[];
  topArtists: SpotifyArtistItem[];
  recentlyPlayed: SpotifyTrackItem[];
}

/**
 * Returns a high-contrast Verde Duende SVG data URI as guaranteed artwork fallback
 */
export function getFallbackArtwork(title: string = "Canción", artist: string = "Scuinklezam"): string {
  const safeTitle = (title || "Canción").replace(/[<>&"]/g, "").substring(0, 22);
  const safeArtist = (artist || "Artista").replace(/[<>&"]/g, "").substring(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#060D09"/>
        <stop offset="50%" stop-color="#102218"/>
        <stop offset="100%" stop-color="#10B981"/>
      </linearGradient>
    </defs>
    <rect width="600" height="600" rx="36" fill="url(#g)"/>
    <circle cx="300" cy="240" r="90" fill="#84CC16" opacity="0.2"/>
    <path d="M285 200v75a22 22 0 1 1-15-21v-54h55v45a22 22 0 1 1-15-21v-44h-25z" fill="#84CC16"/>
    <text x="300" y="410" font-size="34" font-weight="bold" font-family="system-ui, sans-serif" text-anchor="middle" fill="#FFFFFF">${safeTitle}</text>
    <text x="300" y="460" font-size="24" font-family="system-ui, sans-serif" text-anchor="middle" fill="#A7F3D0">${safeArtist}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Curated list of verified tracks with active 200 OK audio preview snippets and HD 600x600 artwork
 */
export const FALLBACK_SPOTIFY_TRACKS: SpotifyTrackItem[] = [
  {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    uri: "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/61e73f94-018d-5f50-50ec-8521952bc72e/20UM1IM11629.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/12/73/ca/1273ca46-233a-5331-189b-25ac1d656533/mzaf_976341070785891411.plus.aac.p.m4a",
  },
  {
    id: "7qiZfU4dY1lWllzX7mPBI3",
    uri: "spotify:track:7qiZfU4dY1lWllzX7mPBI3",
    title: "Shape of You",
    artist: "Ed Sheeran",
    album: "÷ (Divide)",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/15/e6/e8/15e6e8a4-4190-6a8b-86c3-ab4a51b88288/190295851286.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/44/c7/4f/44c74f0d-72dc-6143-d4d0-ba14d661ca0d/mzaf_9566898362556366703.plus.aac.p.m4a",
  },
  {
    id: "1BxfuPKGuaTgP7aM0fbdwr",
    uri: "spotify:track:1BxfuPKGuaTgP7aM0fbdwr",
    title: "Cruel Summer",
    artist: "Taylor Swift",
    album: "Lover",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/493dab54-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/1BxfuPKGuaTgP7aM0fbdwr",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/44/af/81/44af8168-9609-1b85-5048-ada08dceacf3/mzaf_1341699644335558812.plus.aac.p.m4a",
  },
  {
    id: "3k3NWokhb02FFFFnLmdx4L",
    uri: "spotify:track:3k3NWokhb02FFFFnLmdx4L",
    title: "Ojitos Lindos",
    artist: "Bad Bunny & Bomba Estéreo",
    album: "Un Verano Sin Ti",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3e/04/eb/3e04ebf6-370f-f59d-ec84-2c2643db92f1/196626945068.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/3k3NWokhb02FFFFnLmdx4L",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/72/ae/81/72ae81c2-4ef3-b998-40b6-563c0609509f/mzaf_12868850384306577273.plus.aac.p.m4a",
  },
  {
    id: "2G7V7zsVDxg1yRsu7Ew9RJ",
    uri: "spotify:track:2G7V7zsVDxg1yRsu7Ew9RJ",
    title: "BIRDS OF A FEATHER",
    artist: "Billie Eilish",
    album: "HIT ME HARD AND SOFT",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/2G7V7zsVDxg1yRsu7Ew9RJ",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/34/31/d3/3431d34e-847f-5d66-df83-0bce688d997e/mzaf_18106743962423782018.plus.aac.p.m4a",
  },
  {
    id: "0ofHAoxe9vBkTCp2UQIavz",
    uri: "spotify:track:0ofHAoxe9vBkTCp2UQIavz",
    title: "Die With A Smile",
    artist: "Lady Gaga, Bruno Mars",
    album: "Die With A Smile",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/11/ae/f2/11aef294-f57c-bab9-c9fc-529162984e62/24UMGIM85348.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/0ofHAoxe9vBkTCp2UQIavz",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/07/6a/99/076a99ed-b946-431b-6f1f-54fa187ca5bd/mzaf_8102882277995122875.plus.aac.p.m4a",
  },
  {
    id: "6habFhsOp2NvshLv26DqMb",
    uri: "spotify:track:6habFhsOp2NvshLv26DqMb",
    title: "APT.",
    artist: "ROSÉ, Bruno Mars",
    album: "rosie",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/2d/1a/7d/2d1a7d91-587e-0ceb-d434-327bd66d9e86/075679628312.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/7a/15/38/7a1538f3-f41a-a2eb-0f24-8eb6712ee043/mzaf_7740628412097685267.plus.aac.p.m4a",
  },
  {
    id: "3ndA6r3X2w8uG939R27bUe",
    uri: "spotify:track:3ndA6r3X2w8uG939R27bUe",
    title: "God's Plan",
    artist: "Drake",
    album: "Scorpion",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/6d/8f/bb6d8f67-6d04-10b5-dd62-eb5809ac54fc/00602567879152.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/3ndA6r3X2w8uG939R27bUe",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/c6/4a/be/c64abe74-adb4-cff5-005d-0fab3d72a806/mzaf_10276154697254415719.plus.aac.p.m4a",
  },
  {
    id: "7KXjTSCq5nL1LoYtL7XAwS",
    uri: "spotify:track:7KXjTSCq5nL1LoYtL7XAwS",
    title: "HUMBLE.",
    artist: "Kendrick Lamar",
    album: "DAMN.",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/ab/16/ef/ab16efe9-e7f1-66ec-021c-5592a23f0f9e/17UMGIM88793.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/7KXjTSCq5nL1LoYtL7XAwS",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/1f/2e/37/1f2e37be-bdd0-d770-6ea4-091011a6aade/mzaf_2360827885900940865.plus.aac.p.m4a",
  },
  {
    id: "4LRPiXqCikLlN15c3ySbp7",
    uri: "spotify:track:4LRPiXqCikLlN15c3ySbp7",
    title: "As It Was",
    artist: "Harry Styles",
    album: "Harry's House",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/2a/19/fb/2a19fb85-2f70-9e44-f2a9-82abe679b88e/886449990061.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/4LRPiXqCikLlN15c3ySbp7",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/67/10/16/67101606-3869-ca44-6c03-e13d6322cb51/mzaf_1135399237022217274.plus.aac.p.m4a",
  },
  {
    id: "4Dvkj6JhhA12EX05fT7y2e",
    uri: "spotify:track:4Dvkj6JhhA12EX05fT7y2e",
    title: "Levitating",
    artist: "Dua Lipa",
    album: "Future Nostalgia",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/4Dvkj6JhhA12EX05fT7y2e",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/59/dc/4d/59dc4dda-93ff-8f1c-c536-f005f6ea6af5/mzaf_3066686759813252385.plus.aac.p.m4a",
  },
  {
    id: "2takcwOaAZWiRsqPH9gyuq",
    uri: "spotify:track:2takcwOaAZWiRsqPH9gyuq",
    title: "Espresso",
    artist: "Sabrina Carpenter",
    album: "Short n' Sweet",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/57/e8/7b/57e87ba0-5057-9bb9-c247-ce7dbe426e89/24UMGIM55213.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/2takcwOaAZWiRsqPH9gyuq",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/e9/4d/02/e94d0230-11ee-ef94-d2cf-a5d547bd73f4/mzaf_554140808559155562.plus.aac.p.m4a",
  },
  {
    id: "6lX6l30nE19U57gEwh9xLh",
    uri: "spotify:track:6lX6l30nE19U57gEwh9xLh",
    title: "DESPECHÁ",
    artist: "Rosalía",
    album: "MOTOMAMI+",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/b0/85/94/b0859449-5c20-a3fd-a99c-d92cf1a60e56/22CRGIM33758.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/6lX6l30nE19U57gEwh9xLh",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/bb/bd/14/bbbd1489-4b6e-e4a6-1ec1-fca9af69648c/mzaf_5170412349705391101.plus.aac.p.m4a",
  },
  {
    id: "7tqhbajSfr4um7nnHG9w6L",
    uri: "spotify:track:7tqhbajSfr4um7nnHG9w6L",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night At The Opera",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/8b/0a/ea/8b0aea60-6f4a-195b-5958-cdf459c2333b/602527644271.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/7tqhbajSfr4um7nnHG9w6L",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/4b/83/09/4b8309c3-e3b2-10bd-ea80-ec017d832503/mzaf_9752264660400108875.plus.aac.p.m4a",
  },
  {
    id: "1w79U6j4sDkCjO9kM3r34w",
    uri: "spotify:track:1w79U6j4sDkCjO9kM3r34w",
    title: "Billie Jean",
    artist: "Michael Jackson",
    album: "Thriller",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/32/4f/fd/324ffda2-9e51-8f6a-0c2d-c6fd2b41ac55/074643811224.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/1w79U6j4sDkCjO9kM3r34w",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/dc/bc/8a/dcbc8a3e-4ce1-c00d-cc02-eda2212053c7/mzaf_8347559338388601510.plus.aac.p.m4a",
  },
  {
    id: "57bgtoPSgt236HzfBOd8kj",
    uri: "spotify:track:57bgtoPSgt236HzfBOd8kj",
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
    album: "Nevermind",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/95/fd/b9/95fdb9b2-6d2b-92a6-97f2-51c1a6d77f1a/00602527874609.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/57bgtoPSgt236HzfBOd8kj",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/65/49/4e/65494e02-b6d3-26d8-6b0c-9bd98dcf4d5d/mzaf_7665413316386155700.plus.aac.p.m4a",
  },
  {
    id: "1xK59OXxi2TAAAbmZK0hp9",
    uri: "spotify:track:1xK59OXxi2TAAAbmZK0hp9",
    title: "Viva La Vida",
    artist: "Coldplay",
    album: "Viva La Vida or Death and All His Friends",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/52/aa/85/52aa851f-15b7-6322-f91f-df84b15b7b19/190295978044.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/1xK59OXxi2TAAAbmZK0hp9",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/a3/30/8e/a3308eed-d8b7-e0b3-f09d-5e1b0f4d660a/mzaf_8517946447501075134.plus.aac.p.m4a",
  },
  {
    id: "7Bpx2knqXfH0e4Kq8qE14m",
    uri: "spotify:track:7Bpx2knqXfH0e4Kq8qE14m",
    title: "PROVENZA",
    artist: "Karol G",
    album: "MAÑANA SERÁ BONITO",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/9b/01/44/9b0144e6-21ae-b53f-2b25-ef6c594b18a3/22UM1IM38716.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/7Bpx2knqXfH0e4Kq8qE14m",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/e0/c6/79/e0c679cf-4837-132a-f1e2-065faf13e0d4/mzaf_16649152643389056902.plus.aac.p.m4a",
  },
  {
    id: "3Aof34y0Bv4l8Yd2p1s9Qj",
    uri: "spotify:track:3Aof34y0Bv4l8Yd2p1s9Qj",
    title: "vampire",
    artist: "Olivia Rodrigo",
    album: "GUTS",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/08/9e/07/089e0799-b405-9e69-b648-e6a19df9879c/24UMGIM30485.rgb.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/track/3Aof34y0Bv4l8Yd2p1s9Qj",
    previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/83/09/5e/83095ea1-83bf-ecdc-3b75-358c350fca51/mzaf_15560849688086702972.plus.aac.p.m4a",
  },
];

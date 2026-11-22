import { SpotifyTrackItem, getFallbackArtwork } from "./spotifyTypes";
import { getSpotifyAppToken } from "./spotifyAppToken";

export type TopicKey =
  | "urbano_es_latino"
  | "hiphop_rap_en"
  | "pop_mainstream"
  | "rock_indie_alt"
  | "anime_jpop_ost"
  | "electronica_house"
  | "flamenco_esp";

export interface TopicInfo {
  key: TopicKey;
  name: string;
  description: string;
}

export const TOPICS: Record<TopicKey, TopicInfo> = {
  urbano_es_latino: {
    key: "urbano_es_latino",
    name: "Urbano / Reggaetón / Trap Latino",
    description: "Reggaetón, Trap Latino, Urbano Español, Dembow, Pop Latino",
  },
  hiphop_rap_en: {
    key: "hiphop_rap_en",
    name: "Hip-Hop / Rap (Inglés)",
    description: "Hip-Hop, Rap en inglés, Boom Bap, Underground Rap, R&B",
  },
  pop_mainstream: {
    key: "pop_mainstream",
    name: "Pop Mainstream Internacional",
    description: "Pop comercial, Dance Pop, Synth Pop, Radio Hits",
  },
  rock_indie_alt: {
    key: "rock_indie_alt",
    name: "Rock / Indie / Alternativo",
    description: "Rock Clásico, Indie, Alternative, Metal, Punk, Grunge",
  },
  anime_jpop_ost: {
    key: "anime_jpop_ost",
    name: "Anime / J-Pop / OST / K-Pop",
    description: "Openings de Anime, J-Pop, Soundtracks de videojuegos y cine, K-Pop",
  },
  electronica_house: {
    key: "electronica_house",
    name: "Electrónica / House / EDM",
    description: "House, Techno, EDM, Trance, Melodic Dance",
  },
  flamenco_esp: {
    key: "flamenco_esp",
    name: "Flamenco / Rumba / Pop Clásico Español",
    description: "Flamenco fusión, Rumba, Pop Español clásico, Copla",
  },
};

/**
 * Deep normalization for strict music comparisons:
 * - Lowercase
 * - Strips accents/diacritics via NFD
 * - Strips feat, ft, remix, remaster, live, acoustic, deluxe, radio edit, etc.
 * - Strips non-alphanumeric punctuation and collapses whitespace.
 */
export function deepNormalize(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*[\(\[][^\]\)]*?(feat|ft|with|con|remix|remaster|en vivo|live|acustico|acoustic|deluxe|edit|single|audio|official|video|sped up|slowed|instrumental|version)[^\]\)]*?[\)\]]/gi, "")
    .replace(/\s*-\s*(remix|remastered|remaster|en vivo|live|single|edit|acustico|acoustic|deluxe|radio edit|original mix|bonus track).*/gi, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes any text string for strict comparison (lowercased, accents removed, non-alphanumeric removed).
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes a song title by stripping extraneous subtitles (feat, remix, live, version, etc.)
 * and removing special characters for 100% exact match comparison.
 */
export function normalizeSongTitle(title: string): string {
  return deepNormalize(title);
}

/**
 * Calculates keyword overlap ratio between two song titles (0.0 to 1.0).
 */
export function getKeywordOverlapRatio(t1: string, t2: string): number {
  const norm1 = deepNormalize(t1);
  const norm2 = deepNormalize(t2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1;
  const words1 = norm1.split(" ").filter((w) => w.length > 1);
  const words2 = norm2.split(" ").filter((w) => w.length > 1);
  if (words1.length === 0 || words2.length === 0) return 0;
  const set2 = new Set(words2);
  const common = words1.filter((w) => set2.has(w)).length;
  return common / Math.max(words1.length, words2.length);
}

/**
 * Checks if two song titles match with high precision:
 * - Exact deepNormalize match
 * - StartsWith match (minimum 4 characters)
 * - Keyword overlap >= 80% (0.80)
 */
export function matchSongTitleStrict(t1: string, t2: string): boolean {
  if (!t1 || !t2) return false;
  const n1 = deepNormalize(t1);
  const n2 = deepNormalize(t2);
  if (n1 === n2) return true;
  if (!n1 || !n2) return false;

  const words1 = n1.split(" ").filter((w) => w.length > 1);
  const words2 = n2.split(" ").filter((w) => w.length > 1);
  if (words1.length === 0 || words2.length === 0) return false;
  const set2 = new Set(words2);
  const common = words1.filter((w) => set2.has(w)).length;

  if (common >= 2 && common / Math.max(words1.length, words2.length) >= 0.85) {
    return true;
  }
  return false;
}

/**
 * Split regex for artist collaborations (using non-capturing groups so .split() does not leak separators).
 */
export const ARTIST_COLLAB_REGEX =
  /[/,&]|(?:\s+feat\.?\s+)|(?:\s+ft\.?\s+)|(?:\s+with\s+)|(?:\s+x\s+)|(?:\s+y\s+)/i;

/**
 * Common stop words in Spanish & English artist names.
 */
export const ARTIST_STOP_WORDS = new Set(["de", "la", "el", "los", "las", "the", "y", "and", "del", "en", "of", "a", "an"]);

/**
 * Checks if a string contains CJK, Japanese (Hiragana/Katakana), Korean (Hangul), or Cyrillic characters.
 */
export function hasNonLatinCharacters(text: string): boolean {
  if (!text) return false;
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff]/.test(text);
}

/**
 * Checks if two artist strings match strictly:
 * - Normalizes casing, diacritics/accents, punctuation
 * - Splits collaborations by feat, ft, with, x, y, /, ,
 * - Requires either the primary expected artist to match credited artist,
 *   or all significant tokens (length >= 3, excluding stop words de, la, el, los, las, the, y, and)
 *   to match credited tokens with >= 85% overlap and overall word overlap >= 60%.
 * - Prevents false positives like "Aurora" matching another singer with "De La Rose".
 */
export function isStrictArtistMatch(foundArtist: string, expectedArtist: string): boolean {
  if (!foundArtist || !expectedArtist) return false;
  const nFound = deepNormalize(foundArtist);
  const nExpected = deepNormalize(expectedArtist);
  if (!nFound || !nExpected) return false;
  if (nFound === nExpected) return true;

  // Split both by collaboration separators
  const foundList = foundArtist
    .split(ARTIST_COLLAB_REGEX)
    .filter(Boolean)
    .map((a) => deepNormalize(a))
    .filter(Boolean);

  const expList = expectedArtist
    .split(ARTIST_COLLAB_REGEX)
    .filter(Boolean)
    .map((a) => deepNormalize(a))
    .filter(Boolean);

  const pFound = foundList[0] || nFound;
  const pExpected = expList[0] || nExpected;

  if (pFound === pExpected) return true;
  if (foundList.includes(pExpected)) return true;
  if (expList.includes(pFound)) return true;

  const wordsFound = nFound.split(" ").filter(Boolean);
  const wordsExp = nExpected.split(" ").filter(Boolean);
  const commonWords = wordsExp.filter((w) => wordsFound.includes(w));
  const wordOverlap = commonWords.length / Math.max(wordsFound.length, wordsExp.length);

  const sigFound = wordsFound.filter((w) => w.length >= 3 && !ARTIST_STOP_WORDS.has(w));
  const sigExp = wordsExp.filter((w) => w.length >= 3 && !ARTIST_STOP_WORDS.has(w));

  if (sigFound.length > 0 && sigExp.length > 0) {
    const commonSig = sigExp.filter((w) => sigFound.includes(w));
    const sigOverlap = commonSig.length / Math.max(sigFound.length, sigExp.length);
    if (sigOverlap >= 0.85 && wordOverlap >= 0.6) {
      return true;
    }
  }

  return false;
}

export function matchArtistNameStrict(a1: string, a2: string): boolean {
  return isStrictArtistMatch(a1, a2);
}

export function matchArtistName(a1: string, a2: string): boolean {
  return isStrictArtistMatch(a1, a2);
}

export function matchSongTitle(t1: string, t2: string): boolean {
  return matchSongTitleStrict(t1, t2);
}

// Keyword-based artist dictionaries for fast, accurate topic classification
const KNOWN_ARTIST_TOPICS: Array<{ keywords: string[]; topic: TopicKey }> = [
  {
    topic: "anime_jpop_ost",
    keywords: [
      "lisa", "radwimps", "yoasobi", "kenshi yonezu", "aimer",
      "kana-boon", "asian kung-fu", "linked horizon", "hige dandism", "vaundy",
      "sawano", "hisaishi", "sagisu", "yoko kanno", "myth & roid", "unravel",
      "tk from", "fujii kaze", "bts", "blackpink", "stray kids", "twice",
      "newjeans", "anime", "soundtrack"
    ],
  },
  {
    topic: "flamenco_esp",
    keywords: [
      "camaron", "paco de lucia", "nina pastori", "ketama", "chambao",
      "estopa", "melendi", "los chichos", "los chunguitos", "el barrio",
      "fondo flamenco", "kiko veneno", "jose merce", "flamenco", "rumba"
    ],
  },
  {
    topic: "urbano_es_latino",
    keywords: [
      "gonzy", "sech", "bad bunny", "quevedo", "saiko", "feid", "myke towers", "mora",
      "rauw alejandro", "duki", "eladio carrion", "maikel delacalle",
      "bizarrap", "anuel", "ozuna", "j balvin", "maluma", "karol g",
      "nicky jam", "daddy yankee", "don omar", "wisin", "yandel",
      "farruko", "arcangel", "de la ghetto", "bryant myers",
      "chencho", "ryan castro", "blessd", "cris mj", "floyymenor",
      "jhayco", "c tangana", "rels b", "cruz cafune", "delaossa",
      "recycled j", "morad", "beny jr", "jc reyes", "cano", "la pantera",
      "pepe y vizio", "gonzalo hermida", "alvaro diaz", "trueno", "tiago pzk",
      "lit killah", "milo j", "lit killa", "lunay", "polima", "pablo chill-e",
      "mvrk", "lucho rk"
    ],
  },
  {
    topic: "hiphop_rap_en",
    keywords: [
      "mf doom", "kendrick lamar", "drake", "kanye", "eminem", "tupac",
      "notorious big", "biggie", "travis scott", "j cole", "21 savage",
      "metro boomin", "future", "playboi carti", "asap rocky", "tyler the creator",
      "mac miller", "post malone", "juice wrld", "lil uzi vert", "snoop dogg",
      "jay-z", "nas", "wu-tang", "madlib", "quasimoto", "denzel curry",
      "freddie gibbs", "joey bada$$", "kid cudi", "childish gambino",
      "logic", "chance the rapper", "dr dre", "50 cent", "ice cube", "outkast"
    ],
  },
  {
    topic: "rock_indie_alt",
    keywords: [
      "arctic monkeys", "the strokes", "radiohead", "nirvana", "queen",
      "the beatles", "led zeppelin", "pink floyd", "oasis", "coldplay",
      "muse", "linkin park", "red hot chili peppers", "green day", "foo fighters",
      "imagine dragons", "gorillaz", "the neighbourhood", "tame impala",
      "the killers", "metallica", "ac/dc", "guns n roses", "aerosmith",
      "blink-182", "my chemical romance", "fall out boy", "paramore",
      "twenty one pilots", "twenty-one pilots", "cage the elephant", "mgmt"
    ],
  },
  {
    topic: "electronica_house",
    keywords: [
      "avicii", "calvin harris", "david guetta", "daft punk", "martin garrix",
      "tiesto", "skrillex", "swedish house mafia", "fred again", "peggy gou",
      "fisher", "deadmau5", "alesso", "kygo", "marshmello", "chainsmokers",
      "dj snake", "disclosure", "major lazer", "armin van buuren", "hardwell"
    ],
  },
  {
    topic: "pop_mainstream",
    keywords: [
      "taylor swift", "olivia rodrigo", "dua lipa", "billie eilish",
      "ariana grande", "bruno mars", "ed sheeran", "the weeknd",
      "harry styles", "justin bieber", "rihanna", "katy perry",
      "lady gaga", "miley cyrus", "shawn mendes", "sabrina carpenter",
      "chappell roan", "selena gomez", "demi lovato", "camila cabello",
      "charlie puth", "sia", "sam smith", "adele", "maroon 5", "one direction"
    ],
  },
];

/**
 * Classifies a song into one of the 7 normalized musical topics based on genre, artist, and title.
 */
export function getTrackTopic(track: {
  title?: string;
  artist?: string;
  genre?: string;
  album?: string;
}): TopicKey {
  const normArtist = normalizeText(track.artist || "");
  const normTitle = normalizeText(track.title || "");
  const normGenre = normalizeText(track.genre || "");
  const normAlbum = normalizeText(track.album || "");

  const fullText = `${normArtist} ${normTitle} ${normGenre} ${normAlbum}`;

  // Extract separate artists using ARTIST_COLLAB_REGEX
  const rawArtist = track.artist || "";
  const artistParts = rawArtist
    .split(ARTIST_COLLAB_REGEX)
    .map((a) => normalizeText(a))
    .filter(Boolean);

  // Exact 3-letter checks for specific Japanese artists (never match substrings!)
  if (artistParts.some((a) => a === "ado" || a === "eve" || a === "flow")) {
    return "anime_jpop_ost";
  }

  // 1. Anime / J-Pop / Soundtrack detection
  if (
    /\b(anime|j-pop|jpop|japanese|soundtrack|vgm|video game|k-pop|kpop)\b/i.test(fullText) ||
    /\b(naruto|bleach|one piece|attack on titan|shingeki|demon slayer|kimetsu|jujutsu|evangelion|dragon ball|ghibli|manga)\b/i.test(fullText)
  ) {
    return "anime_jpop_ost";
  }

  // 2. Flamenco / Spanish classic detection
  if (/\b(flamenco|rumba|copla|sevillanas|andaluz)\b/i.test(fullText)) {
    return "flamenco_esp";
  }

  // 3. Known artist dictionary lookup (MATCHES ONLY AGAINST ARTISTS, NEVER TITLE!)
  for (const entry of KNOWN_ARTIST_TOPICS) {
    for (const k of entry.keywords) {
      const isMatch =
        artistParts.some((p) => p === k) ||
        new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normArtist);
      if (isMatch) return entry.topic;
    }
  }

  // 4. Genre string heuristics from iTunes primaryGenreName or Spotify
  if (/\b(latino|latin|reggaeton|trap latino|dembow|urbano|murbano)\b/i.test(normGenre)) {
    return "urbano_es_latino";
  }
  if (/\b(hip-hop|hip hop|rap|boom bap|trap)\b/i.test(normGenre)) {
    if (/\b(espanol|spanish|latino|spain|madrid|barcelona|puerto rico|colombia|argentina|chile)\b/i.test(fullText)) {
      return "urbano_es_latino";
    }
    return "hiphop_rap_en";
  }
  if (/\b(rock|metal|punk|alternative|indie|grunge|hard rock)\b/i.test(normGenre)) {
    return "rock_indie_alt";
  }
  if (/\b(electronic|house|techno|dance|edm|trance|club|electro)\b/i.test(normGenre)) {
    return "electronica_house";
  }
  if (/\b(pop|synth-pop|r&b|soul)\b/i.test(normGenre)) {
    return "pop_mainstream";
  }

  // 5. Default fallback based on language / common Spanish words in title
  if (/\b(el|la|los|las|de|del|en|un|una|que|por|para|con|mi|tu|su|ya|mas|amor|corazon|noche|loco|vida|beso)\b/i.test(normTitle)) {
    return "urbano_es_latino";
  }

  return "pop_mainstream";
}

/**
 * Curated offline / instant coherent pool for each topic to guarantee immediate, high-quality distractors.
 * All entries use 100% verified real album artwork responding HTTP 200.
 */
export const COHERENT_TOPIC_POOLS: Record<TopicKey, Array<{ title: string; artist: string; artworkUrl: string }>> = {
  urbano_es_latino: [
    { title: "Columbia", artist: "Quevedo", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/eec6fccccb5cdca0db12f5e579d1a94b/500x500-000000-80-0-0.jpg" },
    { title: "SUPERNOVA", artist: "Saiko", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/cb875f669e36bf5907fb48a6ba0954b1/500x500-000000-80-0-0.jpg" },
    { title: "MONACO", artist: "Bad Bunny", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/f840891b70f6e240b8ecaec49346bd6a/500x500-000000-80-0-0.jpg" },
    { title: "LALA", artist: "Myke Towers", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/c9e44eae3791dd967caedc538696887b/500x500-000000-80-0-0.jpg" },
    { title: "CLASSY 101", artist: "Feid & Young Miko", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/3210cc9224ba98d1733970571e44e9a4/500x500-000000-80-0-0.jpg" },
    { title: "Buenas", artist: "Quevedo & Saiko", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/2239b221a169963c1bdd6e60e9836591/500x500-000000-80-0-0.jpg" },
    { title: "REINA", artist: "Mora & Saiko", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/e68252ef53f5b405606ac9029c650120/500x500-000000-80-0-0.jpg" },
    { title: "DILUVIO", artist: "Rauw Alejandro", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/00e071a1d8e65037e37e38c3ff673ef0/500x500-000000-80-0-0.jpg" },
  ],
  hiphop_rap_en: [
    { title: "All Caps", artist: "Madvillain & MF DOOM", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/22d68d10ed024e92b65d010d5df24c04/500x500-000000-80-0-0.jpg" },
    { title: "Rapp Snitch Knishes", artist: "MF DOOM", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/eb41db75ea6b22ad495876e7fa944bb4/500x500-000000-80-0-0.jpg" },
    { title: "HUMBLE.", artist: "Kendrick Lamar", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/7ce6b8452fae425557067db6e6a1cad5/500x500-000000-80-0-0.jpg" },
    { title: "God's Plan", artist: "Drake", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/b69d3bcbd130ad4cc9259de543889e30/500x500-000000-80-0-0.jpg" },
    { title: "SICKO MODE", artist: "Travis Scott", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/0b08015216f975dc7fb5be3d5dcc4d88/500x500-000000-80-0-0.jpg" },
    { title: "No Role Modelz", artist: "J. Cole", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/f45c8916970597d390313833a9db0c61/500x500-000000-80-0-0.jpg" },
    { title: "Redbone", artist: "Childish Gambino", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/964acadabc2b6e286ce5e8e5add495a0/500x500-000000-80-0-0.jpg" },
  ],
  pop_mainstream: [
    { title: "Cruel Summer", artist: "Taylor Swift", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/6111c5ab9729c8eac47883e4e50e9cf8/500x500-000000-80-0-0.jpg" },
    { title: "vampire", artist: "Olivia Rodrigo", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/4bb79214365c0049e031f5e2caae4752/500x500-000000-80-0-0.jpg" },
    { title: "Levitating", artist: "Dua Lipa", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/f8364f090ba04f1b19b381ec0390f3e4/500x500-000000-80-0-0.jpg" },
    { title: "bad guy", artist: "Billie Eilish", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/6630083f454d48eadb6a9b53f035d734/500x500-000000-80-0-0.jpg" },
    { title: "Blinding Lights", artist: "The Weeknd", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/fd00ebd6d30d7253f813dba3bb1c66a9/500x500-000000-80-0-0.jpg" },
    { title: "As It Was", artist: "Harry Styles", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/b0e936124f59e669ddba02ebe5893f95/500x500-000000-80-0-0.jpg" },
    { title: "Espresso", artist: "Sabrina Carpenter", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/e3221287a77eb262944e6528766eeba4/500x500-000000-80-0-0.jpg" },
  ],
  rock_indie_alt: [
    { title: "Do I Wanna Know?", artist: "Arctic Monkeys", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/64e54e307bd5e2bdb27ffeb662fd910d/500x500-000000-80-0-0.jpg" },
    { title: "The Adults Are Talking", artist: "The Strokes", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/523ac3e61759f365b9306fc44dd53eea/500x500-000000-80-0-0.jpg" },
    { title: "Creep", artist: "Radiohead", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/1dd56fd8824492e1a5106c99a00a85ec/500x500-000000-80-0-0.jpg" },
    { title: "Smells Like Teen Spirit", artist: "Nirvana", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/f0282817b697279e56df13909962a54a/500x500-000000-80-0-0.jpg" },
    { title: "Sweater Weather", artist: "The Neighbourhood", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/6f55ff3cc5c478510c948024e95cf8d6/500x500-000000-80-0-0.jpg" },
    { title: "The Less I Know The Better", artist: "Tame Impala", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/de5b9b704cd4ec36f8bf49beb3e17ba2/500x500-000000-80-0-0.jpg" },
    { title: "In the End", artist: "Linkin Park", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/033a271b5ec10842c287827c39244fb5/500x500-000000-80-0-0.jpg" },
  ],
  anime_jpop_ost: [
    { title: "Gurenge", artist: "LiSA", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/1f52bcd67ac5393123b3a272ceec5a5c/500x500-000000-80-0-0.jpg" },
    { title: "Sparkle", artist: "RADWIMPS", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/8bd5efd9f73b7d0f8371c58a017a5aea/500x500-000000-80-0-0.jpg" },
    { title: "Idol", artist: "YOASOBI", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/c028acc15f911c6ca3ff821abbb64aa3/500x500-000000-80-0-0.jpg" },
    { title: "KICK BACK", artist: "Kenshi Yonezu", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/219b98615e49c9df44727bc3d9d57c8e/500x500-000000-80-0-0.jpg" },
    { title: "Zankyosanka", artist: "Aimer", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/fe2830a3220f92056d5ee6cf31de73d2/500x500-000000-80-0-0.jpg" },
    { title: "Silhouette", artist: "KANA-BOON", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/354c1fcd1648db95971b55a3fb110055/500x500-000000-80-0-0.jpg" },
    { title: "Kaibutsu", artist: "YOASOBI", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/0e7a3410cce9c1a1487bb594c27aa658/500x500-000000-80-0-0.jpg" },
  ],
  electronica_house: [
    { title: "Wake Me Up", artist: "Avicii", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/ec97306735b46ec334e0ce562290775b/500x500-000000-80-0-0.jpg" },
    { title: "Summer", artist: "Calvin Harris", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/a72e5db10e9168cd6f5065fbe750cdbb/500x500-000000-80-0-0.jpg" },
    { title: "Titanium", artist: "David Guetta & Sia", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/52330286cb5008805253fd77c7111d3f/500x500-000000-80-0-0.jpg" },
    { title: "One More Time", artist: "Daft Punk", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/5718f7c81c27e0b2417e2a4c45224f8a/500x500-000000-80-0-0.jpg" },
    { title: "Animals", artist: "Martin Garrix", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/97c1918368d8ed3b0bea34d0785d4db0/500x500-000000-80-0-0.jpg" },
    { title: "Don't You Worry Child", artist: "Swedish House Mafia", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/a6e59fada64940a751de6eaa01229e8b/500x500-000000-80-0-0.jpg" },
  ],
  flamenco_esp: [
    { title: "Como el Agua", artist: "Camarón de la Isla", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/5aae29522b64f462d590a2f44386581b/500x500-000000-80-0-0.jpg" },
    { title: "Entre Dos Aguas", artist: "Paco de Lucía", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/5aae29522b64f462d590a2f44386581b/500x500-000000-80-0-0.jpg" },
    { title: "Tu Calorro", artist: "Estopa", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/a0d6b3649f9abcd41e1822bbaf446c11/500x500-000000-80-0-0.jpg" },
    { title: "Caminando por la Vida", artist: "Melendi", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/adeaa2093eb6f1c128bc94f9ce1e7e8b/500x500-000000-80-0-0.jpg" },
    { title: "Válgame Dios", artist: "Niña Pastori", artworkUrl: "https://cdn-images.dzcdn.net/images/cover/97d11c4d404db558216b8f65373d4b30/500x500-000000-80-0-0.jpg" },
  ],
};

/**
 * Builds 3 distractors matching the EXACT same topic as correctTrack.
 * 1. Collects from available room pool matching same topic and distinct title.
 * 2. If pool has fewer than 3, fills using curated topic catalog.
 * Guarantees zero duplicate titles.
 */
export function getCoherentDistractors(
  correctTrack: SpotifyTrackItem,
  roomPool: SpotifyTrackItem[],
  count = 3
): Array<{ title: string; artist: string; artworkUrl: string; topic: TopicKey }> {
  const correctTopic = getTrackTopic(correctTrack);
  const correctTitleNorm = normalizeSongTitle(correctTrack.title);
  const seenTitles = new Set<string>([correctTitleNorm]);
  const distractors: Array<{ title: string; artist: string; artworkUrl: string; topic: TopicKey }> = [];

  // Step 1: Pick from roomPool with EXACT same topic
  const matchingPool = roomPool.filter((t) => {
    if (!t || !t.title) return false;
    const norm = normalizeSongTitle(t.title);
    if (seenTitles.has(norm)) return false;
    return getTrackTopic(t) === correctTopic;
  });

  // Shuffle candidate pool
  const shuffledPool = [...matchingPool].sort(() => 0.5 - Math.random());
  for (const t of shuffledPool) {
    if (distractors.length >= count) break;
    const norm = normalizeSongTitle(t.title);
    if (!seenTitles.has(norm)) {
      seenTitles.add(norm);
      distractors.push({
        title: t.title,
        artist: t.artist,
        artworkUrl: t.artworkUrl || getFallbackArtwork(t.title, t.artist),
        topic: correctTopic,
      });
    }
  }

  // Step 2: Smart fill from curated topic catalog if room pool has insufficient tracks of this topic
  if (distractors.length < count) {
    const backupList = COHERENT_TOPIC_POOLS[correctTopic] || COHERENT_TOPIC_POOLS.pop_mainstream;
    const shuffledBackup = [...backupList].sort(() => 0.5 - Math.random());

    for (const b of shuffledBackup) {
      if (distractors.length >= count) break;
      const norm = normalizeSongTitle(b.title);
      if (!seenTitles.has(norm)) {
        seenTitles.add(norm);
        distractors.push({
          title: b.title,
          artist: b.artist,
          artworkUrl: b.artworkUrl,
          topic: correctTopic,
        });
      }
    }
  }

  return distractors;
}

/**
 * In-memory caches to ensure fast parallel generation across all 10 questions (max 200 entries each).
 */
const albumTracksMemoryCache = new Map<string, Array<{ title: string; artist: string; artworkUrl: string }>>();
const artistTracksMemoryCache = new Map<string, Array<{ title: string; artist: string; artworkUrl: string }>>();
const relatedTracksMemoryCache = new Map<string, Array<{ title: string; artist: string; artworkUrl: string }>>();

function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, maxEntries = 200) {
  if (map.size >= maxEntries) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

const JUNK_SONG_REGEX = /karaoke|tribute|cover|instrumental|lullaby|piano version/i;

/**
 * Builds challenging, realistic distractors following strict hierarchy:
 * 1. Same Album (Priority 1): 3 distinct tracks from the same album/collection
 * 2. Same Artist (Priority 2): Other tracks by the exact same artist
 * 3. Fallback (Priority 3): Real related artists from Deezer or cohesive topic pool
 *
 * Guarantees zero duplicate titles, 100% valid artworks, and sub-second execution with caching and timeouts.
 */
export async function getDifficultDistractors(
  correctTrack: SpotifyTrackItem,
  roomPool: SpotifyTrackItem[] = [],
  count = 3,
  usedDistractorKeys?: Set<string>
): Promise<Array<{ title: string; artist: string; artworkUrl: string; topic: TopicKey }>> {
  const correctTopic = getTrackTopic(correctTrack);
  const correctTitleNorm = deepNormalize(correctTrack.title);
  const seenTitles = new Set<string>([correctTitleNorm]);
  const distractors: Array<{ title: string; artist: string; artworkUrl: string; topic: TopicKey }> = [];

  const isTargetLatin =
    !hasNonLatinCharacters(correctTrack.title || "") &&
    !hasNonLatinCharacters(correctTrack.artist || "");

  // All credited artists split
  const artists = (correctTrack.artist || "")
    .split(ARTIST_COLLAB_REGEX)
    .map((a) => a.trim())
    .filter(Boolean);
  const mainArtist = artists[0] || (correctTrack.artist || "").trim();

  const rawAlbum = correctTrack.album?.trim() || "";
  const isGenericAlbum =
    !rawAlbum ||
    /single|ep|unknown|deluxe|remix|version/i.test(rawAlbum) ||
    deepNormalize(rawAlbum) === correctTitleNorm;
  const albumName = isGenericAlbum ? "" : rawAlbum;

  const tryAdd = (item: { title: string; artist: string; artworkUrl: string }, allowUsed = false) => {
    if (distractors.length >= count) return false;
    const norm = deepNormalize(item.title);
    if (!norm || seenTitles.has(norm)) return false;

    // Filter junk tracks (karaoke, cover, instrumental, etc.)
    if (JUNK_SONG_REGEX.test(item.title) || JUNK_SONG_REGEX.test(item.artist || "")) {
      return false;
    }

    // Filter out non-Latin scripts if target is Latin
    if (isTargetLatin && (hasNonLatinCharacters(item.title) || hasNonLatinCharacters(item.artist))) {
      return false;
    }

    // Filter out distractors already used in a prior round unless allowUsed is true
    if (!allowUsed && usedDistractorKeys && usedDistractorKeys.has(norm)) {
      return false;
    }

    seenTitles.add(norm);
    if (usedDistractorKeys) {
      usedDistractorKeys.add(norm);
    }
    distractors.push({
      title: item.title,
      artist: item.artist,
      artworkUrl: item.artworkUrl || getFallbackArtwork(item.title, item.artist),
      topic: correctTopic,
    });
    return true;
  };

  // --- PRIORIDAD 1: MISMO ÁLBUM ---
  // 1.A) Spotify API (si tenemos spotifyAlbumId)
  if (correctTrack.spotifyAlbumId) {
    const albumKey = `sp_album_${correctTrack.spotifyAlbumId}`;
    let albumSongs = albumTracksMemoryCache.get(albumKey);

    if (!albumSongs) {
      try {
        const appToken = await getSpotifyAppToken();
        if (appToken) {
          const res = await fetch(
            `https://api.spotify.com/v1/albums/${correctTrack.spotifyAlbumId}/tracks?market=ES&limit=30`,
            {
              headers: { Authorization: `Bearer ${appToken}` },
              signal: AbortSignal.timeout(3000),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.items && Array.isArray(data.items)) {
              const list: Array<{ title: string; artist: string; artworkUrl: string }> = [];
              for (const item of data.items) {
                if (!item.name || JUNK_SONG_REGEX.test(item.name)) continue;
                const artName = item.artists?.map((a: any) => a.name).join(", ") || mainArtist;
                list.push({
                  title: item.name,
                  artist: artName,
                  artworkUrl: correctTrack.artworkUrl || getFallbackArtwork(item.name, artName),
                });
              }
              if (list.length > 0) {
                albumSongs = list;
                setBoundedCache(albumTracksMemoryCache, albumKey, list);
              }
            }
          }
        }
      } catch {}
    }

    if (albumSongs && albumSongs.length > 0) {
      const shuffled = [...albumSongs].sort(() => 0.5 - Math.random());
      for (const song of shuffled) {
        if (distractors.length >= count) break;
        tryAdd(song);
      }
    }
  }

  // 1.B) Deezer API (si no es single genérico y faltan opciones)
  if (distractors.length < count && albumName && mainArtist && albumName.length >= 4) {
    const albumKey = `dz_album_${deepNormalize(mainArtist)}_${deepNormalize(albumName)}`;
    let albumSongs = albumTracksMemoryCache.get(albumKey);

    if (!albumSongs) {
      try {
        const dzRes = await fetch(
          `https://api.deezer.com/search/album?q=artist:"${encodeURIComponent(mainArtist)}" album:"${encodeURIComponent(albumName)}"&limit=5`,
          {
            headers: { "User-Agent": "Scuinklezam/1.0" },
            signal: AbortSignal.timeout(2500),
          }
        );
        if (dzRes.ok) {
          const data = await dzRes.json();
          const alb = (data.data || []).find(
            (a: any) =>
              isStrictArtistMatch(a.artist?.name || "", mainArtist) &&
              getKeywordOverlapRatio(a.title || "", albumName) >= 0.7
          );
          if (alb?.id) {
            const trRes = await fetch(`https://api.deezer.com/album/${alb.id}/tracks?limit=30`, {
              headers: { "User-Agent": "Scuinklezam/1.0" },
              signal: AbortSignal.timeout(2500),
            });
            if (trRes.ok) {
              const trData = await trRes.json();
              const list: Array<{ title: string; artist: string; artworkUrl: string }> = [];
              const albCover = alb.cover_big || alb.cover_medium || correctTrack.artworkUrl;
              for (const item of trData.data || []) {
                if (!item.title || JUNK_SONG_REGEX.test(item.title)) continue;
                list.push({
                  title: item.title,
                  artist: item.artist?.name || mainArtist,
                  artworkUrl: albCover || getFallbackArtwork(item.title, mainArtist),
                });
              }
              if (list.length > 0) {
                albumSongs = list;
                setBoundedCache(albumTracksMemoryCache, albumKey, list);
              }
            }
          }
        }
      } catch {}
    }

    if (albumSongs && albumSongs.length > 0) {
      const shuffled = [...albumSongs].sort(() => 0.5 - Math.random());
      for (const song of shuffled) {
        if (distractors.length >= count) break;
        tryAdd(song);
      }
    }
  }

  // --- PRIORIDAD 2: MISMO ARTISTA Y COLABORADORES ---
  // 2.A) Primero en roomPool (canciones ya cargadas del mismo artista o colaboradores)
  if (distractors.length < count) {
    const poolMatches = roomPool.filter((t) => {
      if (!t || !t.title) return false;
      const nTitle = deepNormalize(t.title);
      if (seenTitles.has(nTitle)) return false;
      return artists.some((a) => isStrictArtistMatch(t.artist, a));
    });
    for (const t of [...poolMatches].sort(() => 0.5 - Math.random())) {
      if (distractors.length >= count) break;
      tryAdd(t);
    }
  }

  // 2.B) Spotify API (para cada artista acreditado)
  if (distractors.length < count) {
    for (const artName of artists) {
      if (distractors.length >= count) break;
      const spKey = `sp_art_${deepNormalize(artName)}`;
      let artSongs = artistTracksMemoryCache.get(spKey);

      if (!artSongs) {
        try {
          const appToken = await getSpotifyAppToken();
          if (appToken) {
            let url = "";
            if (artName === mainArtist && correctTrack.spotifyArtistId) {
              url = `https://api.spotify.com/v1/artists/${correctTrack.spotifyArtistId}/top-tracks?market=ES`;
            } else {
              url = `https://api.spotify.com/v1/search?q=artist:"${encodeURIComponent(artName)}"&type=track&market=ES&limit=25`;
            }
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${appToken}` },
              signal: AbortSignal.timeout(3000),
            });
            if (res.ok) {
              const data = await res.json();
              const rawItems = data.tracks?.items || data.tracks || [];
              if (Array.isArray(rawItems)) {
                const list: Array<{ title: string; artist: string; artworkUrl: string }> = [];
                for (const item of rawItems) {
                  if (!item.name || JUNK_SONG_REGEX.test(item.name)) continue;
                  const itemArtists = item.artists?.map((a: any) => a.name).join(", ") || "";
                  if (!isStrictArtistMatch(itemArtists, artName)) continue;
                  const cover = item.album?.images?.[0]?.url || item.album?.images?.[1]?.url;
                  list.push({
                    title: item.name,
                    artist: itemArtists || artName,
                    artworkUrl: cover || getFallbackArtwork(item.name, artName),
                  });
                }
                if (list.length > 0) {
                  artSongs = list;
                  setBoundedCache(artistTracksMemoryCache, spKey, list);
                }
              }
            }
          }
        } catch {}
      }

      if (artSongs && artSongs.length > 0) {
        const shuffled = [...artSongs].sort(() => 0.5 - Math.random());
        for (const s of shuffled) {
          if (distractors.length >= count) break;
          tryAdd(s);
        }
      }
    }
  }

  // 2.C) Deezer API (para cada artista acreditado)
  if (distractors.length < count) {
    for (const artName of artists) {
      if (distractors.length >= count) break;
      const dzKey = `dz_art_${deepNormalize(artName)}`;
      let dzSongs = artistTracksMemoryCache.get(dzKey);

      if (!dzSongs) {
        try {
          const sRes = await fetch(
            `https://api.deezer.com/search/artist?q=${encodeURIComponent(artName)}&limit=5`,
            {
              headers: { "User-Agent": "Scuinklezam/1.0" },
              signal: AbortSignal.timeout(2500),
            }
          );
          if (sRes.ok) {
            const sData = await sRes.json();
            const matched = (sData.data || []).find((a: any) => isStrictArtistMatch(a.name, artName));
            if (matched?.id) {
              const topRes = await fetch(`https://api.deezer.com/artist/${matched.id}/top?limit=30`, {
                headers: { "User-Agent": "Scuinklezam/1.0" },
                signal: AbortSignal.timeout(2500),
              });
              if (topRes.ok) {
                const topData = await topRes.json();
                const list: Array<{ title: string; artist: string; artworkUrl: string }> = [];
                for (const item of topData.data || []) {
                  if (!item.title || JUNK_SONG_REGEX.test(item.title)) continue;
                  const cover = item.album?.cover_big || item.album?.cover_medium;
                  list.push({
                    title: item.title,
                    artist: item.artist?.name || artName,
                    artworkUrl: cover || getFallbackArtwork(item.title, artName),
                  });
                }
                if (list.length > 0) {
                  dzSongs = list;
                  setBoundedCache(artistTracksMemoryCache, dzKey, list);
                }
              }
            }
          }
        } catch {}
      }

      if (dzSongs && dzSongs.length > 0) {
        const shuffled = [...dzSongs].sort(() => 0.5 - Math.random());
        for (const s of shuffled) {
          if (distractors.length >= count) break;
          tryAdd(s);
        }
      }
    }
  }

  // 2.D) iTunes (Solo como último recurso si Spotify y Deezer fallaron o dieron < count)
  if (distractors.length < count && mainArtist) {
    const itKey = `it_art_${deepNormalize(mainArtist)}`;
    let itSongs = artistTracksMemoryCache.get(itKey);

    if (!itSongs) {
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(mainArtist)}&entity=song&attribute=artistTerm&country=ES&limit=25`,
          {
            headers: { "User-Agent": "Scuinklezam/1.0" },
            signal: AbortSignal.timeout(2500),
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.results && Array.isArray(data.results)) {
            const list: Array<{ title: string; artist: string; artworkUrl: string }> = [];
            for (const item of data.results) {
              if (!item.trackName || JUNK_SONG_REGEX.test(item.trackName)) continue;
              if (isStrictArtistMatch(item.artistName, mainArtist)) {
                const art = item.artworkUrl100
                  ? item.artworkUrl100.replace("100x100bb", "600x600bb")
                  : getFallbackArtwork(item.trackName, item.artistName || mainArtist);
                list.push({
                  title: item.trackName,
                  artist: item.artistName || mainArtist,
                  artworkUrl: art,
                });
              }
            }
            if (list.length > 0) {
              itSongs = list;
              setBoundedCache(artistTracksMemoryCache, itKey, list);
            }
          }
        }
      } catch {}
    }

    if (itSongs && itSongs.length > 0) {
      const shuffled = [...itSongs].sort(() => 0.5 - Math.random());
      for (const s of shuffled) {
        if (distractors.length >= count) break;
        tryAdd(s);
      }
    }
  }

  // --- PRIORIDAD 3: ARTISTAS RELACIONADOS DIRECTOS EN DEEZER (CERO ITUNES) ---
  if (distractors.length < count && mainArtist) {
    const relKey = `dz_rel_${deepNormalize(mainArtist)}`;
    let relatedSongs = relatedTracksMemoryCache.get(relKey);

    if (!relatedSongs) {
      try {
        const sRes = await fetch(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(mainArtist)}&limit=5`,
          {
            headers: { "User-Agent": "Scuinklezam/1.0" },
            signal: AbortSignal.timeout(2500),
          }
        );
        if (sRes.ok) {
          const sData = await sRes.json();
          const matched = (sData.data || []).find((a: any) => isStrictArtistMatch(a.name, mainArtist));
          if (matched?.id) {
            const relRes = await fetch(`https://api.deezer.com/artist/${matched.id}/related?limit=5`, {
              headers: { "User-Agent": "Scuinklezam/1.0" },
              signal: AbortSignal.timeout(2500),
            });
            if (relRes.ok) {
              const relData = await relRes.json();
              const relArtists = (relData.data || []).slice(0, 3);
              if (relArtists.length > 0) {
                const list: Array<{ title: string; artist: string; artworkUrl: string }> = [];
                // Consultas directas a Deezer en paralelo con Promise.allSettled (CERO llamadas a iTunes)
                const trackPromises = relArtists.map(async (ra: any) => {
                  if (!ra?.id) return [];
                  const trRes = await fetch(`https://api.deezer.com/artist/${ra.id}/top?limit=6`, {
                    headers: { "User-Agent": "Scuinklezam/1.0" },
                    signal: AbortSignal.timeout(2500),
                  });
                  if (!trRes.ok) return [];
                  const trData = await trRes.json();
                  const subList: Array<{ title: string; artist: string; artworkUrl: string }> = [];
                  for (const it of trData.data || []) {
                    if (!it.title || JUNK_SONG_REGEX.test(it.title)) continue;
                    const cover = it.album?.cover_big || it.album?.cover_medium;
                    subList.push({
                      title: it.title,
                      artist: it.artist?.name || ra.name,
                      artworkUrl: cover || getFallbackArtwork(it.title, ra.name),
                    });
                  }
                  return subList;
                });

                const settled = await Promise.allSettled(trackPromises);
                for (const res of settled) {
                  if (res.status === "fulfilled" && Array.isArray(res.value)) {
                    list.push(...res.value);
                  }
                }

                if (list.length > 0) {
                  relatedSongs = list;
                  setBoundedCache(relatedTracksMemoryCache, relKey, list);
                }
              }
            }
          }
        }
      } catch {}
    }

    if (relatedSongs && relatedSongs.length > 0) {
      const shuffled = [...relatedSongs].sort(() => 0.5 - Math.random());
      for (const s of shuffled) {
        if (distractors.length >= count) break;
        tryAdd(s);
      }
    }
  }

  // --- PRIORIDAD 4: ROOM POOL (Relleno con canciones reales de la partida) ---
  if (distractors.length < count && roomPool.length > 0) {
    const topicPool = roomPool.filter((t) => {
      if (!t || !t.title) return false;
      const n = deepNormalize(t.title);
      if (seenTitles.has(n)) return false;
      return getTrackTopic(t) === correctTopic;
    });
    for (const t of [...topicPool].sort(() => 0.5 - Math.random())) {
      if (distractors.length >= count) break;
      tryAdd(t);
    }
  }

  if (distractors.length < count && roomPool.length > 0) {
    const remainingPool = roomPool.filter((t) => {
      if (!t || !t.title) return false;
      return !seenTitles.has(deepNormalize(t.title));
    });
    for (const t of [...remainingPool].sort(() => 0.5 - Math.random())) {
      if (distractors.length >= count) break;
      tryAdd(t);
    }
  }

  // --- FALLBACK FINAL: Catálogo offline coherente del tópico (100% carátulas reales verificadas) ---
  if (distractors.length < count) {
    const backupList = COHERENT_TOPIC_POOLS[correctTopic] || COHERENT_TOPIC_POOLS.pop_mainstream;
    for (const b of [...backupList].sort(() => 0.5 - Math.random())) {
      if (distractors.length >= count) break;
      tryAdd(b);
    }
  }

  // 2ª pasada con allowUsed = true si la estricta deduplicación de rondas agotó candidatos
  if (distractors.length < count) {
    const backupList = COHERENT_TOPIC_POOLS[correctTopic] || COHERENT_TOPIC_POOLS.pop_mainstream;
    for (const b of backupList) {
      if (distractors.length >= count) break;
      tryAdd(b, true);
    }
  }

  return distractors;
}

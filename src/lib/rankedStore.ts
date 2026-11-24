import { redis } from "./roomStore";
import { getArtistFacePhoto } from "./artistPhotos";
import { isStrictArtistMatch } from "./songMatching";
import { getSpotifyAppToken } from "./spotifyAppToken";
import { getCuratedArtistDescription } from "./artistDescriptionsCatalog";
export * from "./rankedTypes";
import {
  RankedTier,
  calculateTier,
  LeaderboardEntry,
  RankedCategory,
  RANKED_CATEGORIES,
  CANONICAL_ARTIST_NAMES,
  toArtistSlug,
  getCanonicalArtistName,
} from "./rankedTypes";

// Global-persisted in-memory fallbacks so HMR / offline Redis stays consistent during dev
declare global {
  var __scuinklezamMemoryScores: Map<string, Map<string, { score: number; nickname: string; avatarUrl: string }>> | undefined;
  var __scuinklezamMemoryPersonalBests: Map<string, Map<string, number>> | undefined;
  var __scuinklezamMemoryStats: Map<string, { totalPlays: number; totalPoints: number }> | undefined;
  var __scuinklezamMemoryHistory: Map<string, Array<any>> | undefined;
  var __scuinklezamMemoryArtistStats:
    | Map<
        string,
        Map<
          string,
          {
            totalPoints: number;
            bestScore: number;
            quizzesPlayed: number;
            nickname: string;
            avatarUrl: string;
          }
        >
      >
    | undefined;
  var __scuinklezamMemoryArtistPopularity: Map<string, { name: string; plays: number }> | undefined;
  var __scuinklezamMemoryArtistsMeta: Map<string, { n: string; d?: string }> | undefined;
  var __scuinklezamMemoryCategoryPlays: Map<string, number> | undefined;
}

if (!global.__scuinklezamMemoryScores) global.__scuinklezamMemoryScores = new Map();
if (!global.__scuinklezamMemoryPersonalBests) global.__scuinklezamMemoryPersonalBests = new Map();
if (!global.__scuinklezamMemoryStats) global.__scuinklezamMemoryStats = new Map();
if (!global.__scuinklezamMemoryHistory) global.__scuinklezamMemoryHistory = new Map();
if (!global.__scuinklezamMemoryArtistStats) global.__scuinklezamMemoryArtistStats = new Map();
if (!global.__scuinklezamMemoryArtistPopularity) global.__scuinklezamMemoryArtistPopularity = new Map();
if (!global.__scuinklezamMemoryArtistsMeta) global.__scuinklezamMemoryArtistsMeta = new Map();
if (!global.__scuinklezamMemoryCategoryPlays) global.__scuinklezamMemoryCategoryPlays = new Map();

const memoryScores = global.__scuinklezamMemoryScores;
const memoryPersonalBests = global.__scuinklezamMemoryPersonalBests;
const memoryStats = global.__scuinklezamMemoryStats;
const memoryHistory = global.__scuinklezamMemoryHistory;
const memoryArtistStats = global.__scuinklezamMemoryArtistStats;
const memoryArtistPopularity = global.__scuinklezamMemoryArtistPopularity;
const memoryArtistsMeta = global.__scuinklezamMemoryArtistsMeta;
const memoryCategoryPlays = global.__scuinklezamMemoryCategoryPlays;

let popularityBackfillDone = false;

/**
 * Safely parses Redis values stored as JSON string or already parsed object.
 */
function safeJsonParse<T = any>(raw: any): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as T;
  return null;
}

/**
 * Parses @upstash/redis zrange(..., { withScores: true }) supporting both:
 * - Object array format: [{ member, score }, ...]
 * - Flat tuple array format: [member1, score1, member2, score2, ...]
 */
function parseZRangeWithScores(raw: any[]): Array<{ member: string; score: number }> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const result: Array<{ member: string; score: number }> = [];
  if (typeof raw[0] === "object" && raw[0] !== null) {
    for (const item of raw) {
      if (item && item.member !== undefined) {
        result.push({
          member: String(item.member),
          score: Math.max(0, Math.round(Number(item.score || 0))),
        });
      }
    }
  } else {
    for (let i = 0; i < raw.length; i += 2) {
      if (raw[i] !== undefined) {
        result.push({
          member: String(raw[i]),
          score: Math.max(0, Math.round(Number(raw[i + 1] || 0))),
        });
      }
    }
  }
  return result;
}

// Thematic clusters to discover 12 related artists with verified HD face photos
const ARTIST_CLUSTERS = [
  // España Urbano & Rap
  [
    "Quevedo", "Saiko", "JC Reyes", "Omar Montes", "Lucho RK", "La Pantera", "Rels B",
    "Bad Gyal", "Morad", "Lola Indigo", "Cruzzi", "Delaossa", "Hoke", "Recycled J",
    "Cano", "Cyril Kamer", "Ana Mena", "Aitana", "Beny Jr", "Ill Pekeño", "Ergo Pro",
    "Israel B", "Gloosito", "Soto Asa", "Yung Beef", "Kaydy Cain", "Abhir", "Juicy BAE"
  ],
  // Reggaetón & Urbano Latino
  [
    "Bad Bunny", "Feid", "Myke Towers", "Mora", "Rauw Alejandro", "Karol G", "Jhayco",
    "Dei V", "Omar Courtz", "Luar La L", "Anuel AA", "Daddy Yankee", "Don Omar", "Bizarrap"
  ],
  // Trap Argentino & Cono Sur
  [
    "Duki", "YSY A", "KHEA", "Neo Pistea", "C.R.O", "Tiago PZK", "Trueno", "Milo J",
    "Nicki Nicole", "Emilia", "Bizarrap"
  ],
  // Pop Mundial & Global
  [
    "The Weeknd", "Taylor Swift", "Dua Lipa", "Billie Eilish", "Bruno Mars",
    "Ariana Grande", "Sabrina Carpenter", "Post Malone", "Travis Scott", "Drake", "Eminem"
  ],
];

const DEEZER_EMPTY_HASH = "d41d8cd98f00b204e9800998ecf8427e";

function capFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatSlugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? capFirst(w) : ""))
    .join(" ");
}

/**
 * Resolves compact artist catalog metadata for Redis.
 * - If present in the static curated catalog (+240 artists), stores ONLY { n: cleanName } (0 description bytes in Redis).
 * - Otherwise fetches 1-2 Spotify genres (timeout 2000ms) or falls back cleanly.
 */
export async function resolveArtistCatalogMeta(
  artistName: string,
  providedSlug?: string
): Promise<{ n: string; d?: string }> {
  const cleanName = getCanonicalArtistName(artistName);
  const slug = providedSlug ? toArtistSlug(providedSlug) : toArtistSlug(cleanName);

  const curated = getCuratedArtistDescription(slug);
  if (curated) {
    return { n: cleanName };
  }

  let genres: string[] = [];
  try {
    const token = await getSpotifyAppToken();
    if (token) {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanName)}&type=artist&limit=3`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(2000),
          cache: "no-store",
        }
      );
      if (res.ok) {
        const data = await res.json();
        const items: any[] = data?.artists?.items || [];
        const matched =
          items
            .filter((a) => isStrictArtistMatch(a.name || "", cleanName))
            .sort((a, b) => (b.followers?.total || 0) - (a.followers?.total || 0))[0] || items[0];
        if (matched && Array.isArray(matched.genres)) {
          genres = matched.genres.filter(Boolean).slice(0, 2);
        }
      }
    }
  } catch {
    // Graceful fallback below
  }

  let generatedDescription: string;
  if (genres.length >= 2) {
    generatedDescription = `${capFirst(genres[0])} y ${genres[1]} · Demuestra cuánto sabes de los temazos de ${cleanName}`;
  } else if (genres.length === 1) {
    generatedDescription = `${capFirst(genres[0])} · Demuestra cuánto sabes de los temazos de ${cleanName}`;
  } else {
    generatedDescription = `Catálogo verificado · Pon a prueba tu oído con todas las eras de ${cleanName}`;
  }

  return { n: cleanName, d: generatedDescription };
}

export async function getDeezerRelatedArtists(
  artistName: string
): Promise<Array<{ name: string; slug: string; imageUrl: string }>> {
  try {
    const clean = getCanonicalArtistName(artistName.split(/[/,&]|(\s+feat\.?\s+)|(\s+ft\.?\s+)/i)[0].trim());
    const searchRes = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(clean)}`,
      {
        headers: { "User-Agent": "Scuinklezam/1.0" },
        next: { revalidate: 86400 },
      }
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const matching = (searchData?.data || []).find((a: any) =>
      isStrictArtistMatch(a.name, clean) || a.name.toLowerCase() === clean.toLowerCase()
    );
    const artistId = matching?.id || searchData?.data?.[0]?.id;
    if (!artistId) return [];

    const relatedRes = await fetch(
      `https://api.deezer.com/artist/${artistId}/related?limit=8`,
      {
        headers: { "User-Agent": "Scuinklezam/1.0" },
        next: { revalidate: 86400 },
      }
    );
    if (!relatedRes.ok) return [];
    const relatedData = await relatedRes.json();
    if (!relatedData?.data || !Array.isArray(relatedData.data)) return [];

    return relatedData.data.slice(0, 8).map((a: any) => {
      let img = a.picture_xl || a.picture_big || a.picture_medium;
      if (img && img.includes(DEEZER_EMPTY_HASH)) {
        img = "";
      }
      const canonicalRelName = getCanonicalArtistName(a.name);
      return {
        name: canonicalRelName,
        slug: toArtistSlug(canonicalRelName),
        imageUrl: img || `/api/artists/photo?name=${encodeURIComponent(canonicalRelName)}`,
      };
    });
  } catch (e) {
    console.warn("[getDeezerRelatedArtists] Failed:", e);
    return [];
  }
}

export function getRelatedArtistsFor(artistName: string): Array<{ name: string; slug: string; imageUrl: string }> {
  const clean = getCanonicalArtistName(artistName).trim().toLowerCase();
  const cleanNorm = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Find primary cluster
  let targetCluster = ARTIST_CLUSTERS.find((cluster) =>
    cluster.some((a) => {
      const lower = a.toLowerCase();
      return lower === clean || lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === cleanNorm;
    })
  );

  if (!targetCluster) {
    targetCluster = ARTIST_CLUSTERS[0];
  }

  const result: Array<{ name: string; slug: string; imageUrl: string }> = [];
  const added = new Set<string>();
  added.add(clean);
  added.add(cleanNorm);

  // 1. Add peers from same cluster
  for (const name of targetCluster) {
    const l = name.toLowerCase();
    const ln = l.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!added.has(l) && !added.has(ln)) {
      added.add(l);
      added.add(ln);
      result.push({
        name,
        slug: toArtistSlug(name),
        imageUrl: `/api/artists/photo?name=${encodeURIComponent(name)}`,
      });
      if (result.length >= 12) break;
    }
  }

  // 2. If fewer than 12, pull from other clusters
  if (result.length < 12) {
    for (const cluster of ARTIST_CLUSTERS) {
      for (const name of cluster) {
        const l = name.toLowerCase();
        const ln = l.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!added.has(l) && !added.has(ln)) {
          added.add(l);
          added.add(ln);
          result.push({
            name,
            slug: toArtistSlug(name),
            imageUrl: `/api/artists/photo?name=${encodeURIComponent(name)}`,
          });
          if (result.length >= 12) break;
        }
      }
      if (result.length >= 12) break;
    }
  }

  return result.slice(0, 12);
}

/**
 * Submits a ranked match score (0..1000) into cumulative category and global leaderboards.
 * Single match score and bestScore stay <= 1000, while ZSET totalPoints accumulates without 1000 cap.
 */
export async function submitRankedScore(
  userId: string,
  nickname: string,
  avatarUrl: string,
  categoryId: string,
  score: number,
  categoryName?: string,
  correctCount?: number
): Promise<{
  success: boolean;
  score: number;
  totalScore: number;
  globalTotal: number;
  rank: number;
  tier: RankedTier;
  globalTier: RankedTier;
  isPersonalBest: boolean;
  persistedInRedis: boolean;
  redisError?: string;
}> {
  const safeScore = Math.min(1000, Math.max(0, Math.round(score)));
  let isPersonalBest = true;
  let newCategoryTotal = safeScore;
  let newGlobalTotal = safeScore;
  let rank = 1;
  let persistedInRedis = false;
  let redisError: string | undefined;

  if (redis) {
    try {
      const catKey = `scuinklezam:ranked:${categoryId}`;

      // 1. Query previous single-game personal best in this category (0..1000)
      const prevBestRaw = await redis.hget<string>(`scuinklezam:user_bests:${userId}`, categoryId);
      const prevBestSingle = Math.min(1000, Number(prevBestRaw || 0));
      isPersonalBest = safeScore > prevBestSingle;
      const newBestSingle = Math.max(prevBestSingle, safeScore);

      // 2. Increment play count in category_plays Hash
      await redis.hincrby("scuinklezam:stats:category_plays", categoryId, 1);

      // 3. Increment cumulative scores in Category ZSET and Global ZSET (no 1000 cap!)
      newCategoryTotal = Number(await redis.zincrby(catKey, safeScore, userId));
      newGlobalTotal = Number(await redis.zincrby("scuinklezam:ranked:global", safeScore, userId));

      // 4. Increment user global stats
      await redis.hincrby(`scuinklezam:user_stats:${userId}`, "totalPlays", 1);
      await redis.hincrby(`scuinklezam:user_stats:${userId}`, "totalPoints", safeScore);

      // 5. Update single-game personal best hash only when beaten (or missing)
      if (isPersonalBest || !prevBestRaw) {
        await redis.hset(`scuinklezam:user_bests:${userId}`, {
          [categoryId]: newBestSingle,
        });
      }

      // 6. Save user profile metadata preserving highest single-game best and updated cumulative totalPoints
      const existingProfRaw = await redis.get<string | any>(`scuinklezam:user_profile:${userId}`);
      const existingProf = typeof existingProfRaw === "string" ? JSON.parse(existingProfRaw) : existingProfRaw;
      const prevGlobalBestSingle = Math.min(1000, Number(existingProf?.bestScore || 0));

      await redis.set(
        `scuinklezam:user_profile:${userId}`,
        JSON.stringify({
          userId,
          nickname,
          avatarUrl,
          totalPoints: newGlobalTotal,
          bestScore: Math.max(prevGlobalBestSingle, safeScore),
          lastPlayed: Date.now(),
        })
      );

      // 7. Push match to user recent history (max 20)
      await redis.lpush(
        `scuinklezam:user_history:${userId}`,
        JSON.stringify({
          categoryId,
          categoryName: categoryName || categoryId,
          score: safeScore,
          correctCount: correctCount ?? Math.round(safeScore / 100),
          timestamp: Date.now(),
        })
      );
      await redis.ltrim(`scuinklezam:user_history:${userId}`, 0, 19);

      // 8. Compute user's real rank in category sorted set
      const rankIdx = await redis.zrevrank(catKey, userId);
      if (rankIdx !== null && rankIdx !== undefined) {
        rank = rankIdx + 1;
      }

      persistedInRedis = true;
    } catch (err: any) {
      redisError = err?.message || String(err);
      console.warn("[submitRankedScore] Redis update error:", err);
    }
  }

  // Always keep in-memory fallback synchronized when Redis is unavailable/offline
  if (!persistedInRedis) {
    memoryCategoryPlays.set(categoryId, (memoryCategoryPlays.get(categoryId) || 0) + 1);

    if (!memoryScores.has(categoryId)) memoryScores.set(categoryId, new Map());
    const catMap = memoryScores.get(categoryId)!;
    const prevCatTotal = catMap.get(userId)?.score || 0;
    newCategoryTotal = prevCatTotal + safeScore;
    catMap.set(userId, { score: newCategoryTotal, nickname, avatarUrl });

    if (!memoryScores.has("global")) memoryScores.set("global", new Map());
    const globalMap = memoryScores.get("global")!;
    const prevGlobalTotal = globalMap.get(userId)?.score || 0;
    newGlobalTotal = prevGlobalTotal + safeScore;
    globalMap.set(userId, { score: newGlobalTotal, nickname, avatarUrl });

    if (!memoryPersonalBests.has(userId)) memoryPersonalBests.set(userId, new Map());
    const userBestsMap = memoryPersonalBests.get(userId)!;
    const prevSingle = Math.min(1000, userBestsMap.get(categoryId) || 0);
    isPersonalBest = safeScore > prevSingle;
    userBestsMap.set(categoryId, Math.max(prevSingle, safeScore));

    const sorted = Array.from(catMap.entries()).sort((a, b) => b[1].score - a[1].score);
    const idx = sorted.findIndex(([uid]) => uid === userId);
    rank = idx !== -1 ? idx + 1 : 1;

    const mStats = memoryStats.get(userId) || { totalPlays: 0, totalPoints: 0 };
    mStats.totalPlays += 1;
    mStats.totalPoints += safeScore;
    memoryStats.set(userId, mStats);

    const mHist = memoryHistory.get(userId) || [];
    mHist.unshift({
      categoryId,
      categoryName: categoryName || categoryId,
      score: safeScore,
      correctCount: correctCount ?? Math.round(safeScore / 100),
      timestamp: Date.now(),
    });
    if (mHist.length > 20) mHist.pop();
    memoryHistory.set(userId, mHist);
  }

  return {
    success: true,
    score: safeScore,
    totalScore: newCategoryTotal,
    globalTotal: newGlobalTotal,
    rank,
    tier: calculateTier(newCategoryTotal),
    globalTier: calculateTier(newGlobalTotal),
    isPersonalBest,
    persistedInRedis,
    redisError,
  };
}

/**
 * Fetches Top 20 cumulative leaderboard for a category (or "global") in 2 Redis commands (zrange + mget).
 */
export async function getCategoryLeaderboard(
  categoryId: string,
  currentUserId?: string
): Promise<{
  categoryId: string;
  entries: LeaderboardEntry[];
  userEntry?: LeaderboardEntry | null;
}> {
  const entries: LeaderboardEntry[] = [];

  if (redis) {
    try {
      const topIds = await redis.zrange<string[]>(`scuinklezam:ranked:${categoryId}`, 0, 19, {
        rev: true,
        withScores: true,
      });

      if (topIds && topIds.length > 0) {
        const memberEntries = parseZRangeWithScores(topIds).map((e) => ({
          userId: e.member,
          score: e.score,
        }));

        const profileKeys = memberEntries.map((m) => `scuinklezam:user_profile:${m.userId}`);
        const profilesRaw = profileKeys.length > 0 ? await redis.mget<any[]>(...profileKeys) : [];

        for (let idx = 0; idx < memberEntries.length; idx++) {
          const m = memberEntries[idx];
          const pRaw = profilesRaw ? profilesRaw[idx] : null;
          const profile = safeJsonParse<any>(pRaw);

          const nick = profile?.nickname || `Jugador #${idx + 1}`;
          const av =
            profile?.avatarUrl ||
            `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nick)}&backgroundColor=0B1710`;

          entries.push({
            userId: m.userId,
            nickname: nick,
            avatarUrl: av,
            score: m.score,
            rank: entries.length + 1,
            tier: calculateTier(m.score),
          });
        }
      }
    } catch (err) {
      console.warn("[getCategoryLeaderboard] Redis read error:", err);
    }
  }

  // Memory fallback if no redis entries
  if (entries.length === 0 && memoryScores.has(categoryId)) {
    const catMap = memoryScores.get(categoryId)!;
    const sorted = Array.from(catMap.entries()).sort((a, b) => b[1].score - a[1].score);
    sorted.slice(0, 20).forEach(([uid, val], idx) => {
      entries.push({
        userId: uid,
        nickname: val.nickname,
        avatarUrl: val.avatarUrl,
        score: val.score,
        rank: idx + 1,
        tier: calculateTier(val.score),
      });
    });
  }

  let userEntry: LeaderboardEntry | null = null;
  if (currentUserId) {
    userEntry = entries.find((e) => e.userId === currentUserId) || null;
    if (!userEntry && redis) {
      try {
        const [uScoreRaw, uRankIdx, uProfRaw] = await Promise.all([
          redis.zscore(`scuinklezam:ranked:${categoryId}`, currentUserId),
          redis.zrevrank(`scuinklezam:ranked:${categoryId}`, currentUserId),
          redis.get<string | any>(`scuinklezam:user_profile:${currentUserId}`),
        ]);
        if (uScoreRaw !== null && uScoreRaw !== undefined) {
          const uScore = Math.max(0, Math.round(Number(uScoreRaw) || 0));
          const uProf = typeof uProfRaw === "string" ? JSON.parse(uProfRaw) : uProfRaw;
          const nick = uProf?.nickname || "Jugador";
          userEntry = {
            userId: currentUserId,
            nickname: nick,
            avatarUrl:
              uProf?.avatarUrl ||
              `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nick)}&backgroundColor=0B1710`,
            score: uScore,
            rank: (uRankIdx ?? entries.length) + 1,
            tier: calculateTier(uScore),
          };
        }
      } catch {}
    } else if (!userEntry && memoryScores.has(categoryId)) {
      const catMap = memoryScores.get(categoryId)!;
      if (catMap.has(currentUserId)) {
        const sorted = Array.from(catMap.entries()).sort((a, b) => b[1].score - a[1].score);
        const idx = sorted.findIndex(([uid]) => uid === currentUserId);
        const uVal = catMap.get(currentUserId)!;
        userEntry = {
          userId: currentUserId,
          nickname: uVal.nickname,
          avatarUrl: uVal.avatarUrl,
          score: uVal.score,
          rank: idx !== -1 ? idx + 1 : entries.length + 1,
          tier: calculateTier(uVal.score),
        };
      }
    }
  }

  return {
    categoryId,
    entries,
    userEntry,
  };
}

export async function getUserProfileData(userId: string) {
  let totalPlays = 0;
  let totalPoints = 0;
  let personalBests: Record<string, number> = {};
  let recentMatches: Array<any> = [];
  let loadedFromRedis = false;

  if (redis) {
    try {
      const stats = await redis.hgetall<Record<string, string>>(`scuinklezam:user_stats:${userId}`);
      if (stats) {
        totalPlays = Number(stats.totalPlays) || 0;
        totalPoints = Number(stats.totalPoints) || 0;
      }

      const bests = await redis.hgetall<Record<string, string>>(`scuinklezam:user_bests:${userId}`);
      if (bests) {
        for (const [k, v] of Object.entries(bests)) {
          personalBests[k] = Math.min(1000, Number(v));
        }
      }

      const historyRaw = await redis.lrange<string[]>(`scuinklezam:user_history:${userId}`, 0, 19);
      if (historyRaw && Array.isArray(historyRaw)) {
        recentMatches = historyRaw.map((raw) => (typeof raw === "string" ? JSON.parse(raw) : raw));
      }
      loadedFromRedis = true;
    } catch (err) {
      console.warn("[getUserProfileData] Redis read error:", err);
    }
  }

  if (!loadedFromRedis) {
    const s = memoryStats.get(userId);
    if (s) {
      totalPlays = s.totalPlays;
      totalPoints = s.totalPoints;
    }
    const uBests = memoryPersonalBests.get(userId);
    if (uBests) {
      uBests.forEach((sc, catId) => {
        personalBests[catId] = Math.min(1000, sc);
      });
    }
    recentMatches = memoryHistory.get(userId) || [];
  }

  const averageScore = totalPlays > 0 ? Math.round(totalPoints / totalPlays) : 0;
  const currentTier = calculateTier(totalPoints);

  // Find best single-match category
  let bestCategoryId = "";
  let bestScore = 0;
  for (const [catId, sc] of Object.entries(personalBests)) {
    const single = Math.min(1000, sc);
    if (single > bestScore) {
      bestScore = single;
      bestCategoryId = catId;
    }
  }

  return {
    totalPlays,
    totalPoints,
    averageScore,
    currentTier,
    bestCategoryId,
    bestScore,
    personalBests,
    recentMatches,
  };
}

/**
 * Submits a ranked quiz run score specifically for an individual artist.
 * Accumulates totalPoints without 1000 cap, keeps bestScore <= 1000,
 * and increments global artist popularity for dynamic catalog sorting.
 */
export async function submitArtistRankedScore(
  userId: string,
  nickname: string,
  avatarUrl: string,
  artistName: string,
  score: number,
  correctCount?: number
): Promise<{
  success: boolean;
  totalPoints: number;
  bestScore: number;
  quizzesPlayed: number;
  userRank: number | null;
  tier: RankedTier;
  persistedInRedis: boolean;
  redisError?: string;
}> {
  const cleanName = getCanonicalArtistName(artistName);
  const slug = toArtistSlug(cleanName);
  const safeScore = Math.min(1000, Math.max(0, Math.round(score)));

  let newTotalPoints = safeScore;
  let finalBestScore = safeScore;
  let newQuizzesPlayed = 1;
  let userRank: number | null = null;
  let persistedInRedis = false;
  let redisError: string | undefined;

  if (redis) {
    try {
      const statsKey = `scuinklezam:artist_user_stats:${slug}:${userId}`;
      const zsetKey = `scuinklezam:ranked:artist:${slug}`;

      // 1. Increment cumulative points and quizzes in Redis hash
      const updatedPoints = await redis.hincrby(statsKey, "totalPoints", safeScore);
      const updatedQuizzes = await redis.hincrby(statsKey, "quizzesPlayed", 1);
      newTotalPoints = Number(updatedPoints || safeScore);
      newQuizzesPlayed = Number(updatedQuizzes || 1);

      // 2. Read previous best score (0..1000) and update personal single best
      const prevBestRaw = await redis.hget<string>(statsKey, "bestScore");
      const prevBest = Math.min(1000, Number(prevBestRaw || 0));
      finalBestScore = Math.min(1000, Math.max(prevBest, safeScore));

      await redis.hset(statsKey, {
        bestScore: finalBestScore,
        nickname,
        avatarUrl,
        lastPlayed: Date.now(),
      });

      // 3. Update artist leaderboard sorted set with CUMULATIVE totalPoints!
      await redis.zadd(zsetKey, {
        score: newTotalPoints,
        member: userId,
      });

      // 4. Update unified artist meta hash for 1-command leaderboard reads
      await redis.hset(`scuinklezam:artist_meta:${slug}`, {
        [userId]: JSON.stringify({
          nickname,
          avatarUrl,
          totalPoints: newTotalPoints,
          bestScore: finalBestScore,
          quizzesPlayed: newQuizzesPlayed,
        }),
      });

      // 5. Increment global artist popularity (+1 total match played) & store compact catalog meta if missing
      await redis.zincrby("scuinklezam:ranked:artists_popularity", 1, slug);
      const metaExists = await redis.hexists("scuinklezam:ranked:artists_meta", slug);
      if (!metaExists) {
        const meta = await resolveArtistCatalogMeta(cleanName, slug);
        await redis.hset("scuinklezam:ranked:artists_meta", {
          [slug]: JSON.stringify(meta),
        });
      }

      // 6. Preserve user_profile without overwriting totalPoints or downgrading bestScore
      const existingProfileRaw = await redis.get<string | any>(`scuinklezam:user_profile:${userId}`);
      const existingProfile =
        typeof existingProfileRaw === "string" ? JSON.parse(existingProfileRaw) : existingProfileRaw;
      const preservedGlobalBest = Math.max(Math.min(1000, Number(existingProfile?.bestScore || 0)), finalBestScore);

      await redis.set(
        `scuinklezam:user_profile:${userId}`,
        JSON.stringify({
          ...(existingProfile || {}),
          userId,
          nickname,
          avatarUrl,
          totalPoints: existingProfile?.totalPoints ?? newTotalPoints,
          bestScore: preservedGlobalBest,
          lastPlayed: Date.now(),
        })
      );

      // 7. Get user's updated rank in artist sorted set
      const rankIdx = await redis.zrevrank(zsetKey, userId);
      if (rankIdx !== null && rankIdx !== undefined) {
        userRank = rankIdx + 1;
      }

      persistedInRedis = true;
    } catch (err: any) {
      redisError = err?.message || String(err);
      console.warn("[submitArtistRankedScore] Redis error:", err);
    }
  }

  if (!persistedInRedis) {
    if (!memoryArtistStats.has(slug)) {
      memoryArtistStats.set(slug, new Map());
    }
    const artistMap = memoryArtistStats.get(slug)!;
    const current = artistMap.get(userId) || {
      totalPoints: 0,
      bestScore: 0,
      quizzesPlayed: 0,
      nickname,
      avatarUrl,
    };

    newTotalPoints = current.totalPoints + safeScore;
    finalBestScore = Math.min(1000, Math.max(Math.min(1000, current.bestScore), safeScore));
    newQuizzesPlayed = current.quizzesPlayed + 1;

    artistMap.set(userId, {
      totalPoints: newTotalPoints,
      bestScore: finalBestScore,
      quizzesPlayed: newQuizzesPlayed,
      nickname,
      avatarUrl,
    });

    memoryArtistPopularity.set(slug, {
      name: cleanName,
      plays: (memoryArtistPopularity.get(slug)?.plays || 0) + 1,
    });
    if (!memoryArtistsMeta.has(slug)) {
      const meta = await resolveArtistCatalogMeta(cleanName, slug);
      memoryArtistsMeta.set(slug, meta);
    }

    const allPlayers = Array.from(artistMap.entries()).sort(
      (a, b) => b[1].totalPoints - a[1].totalPoints || b[1].bestScore - a[1].bestScore
    );
    const idx = allPlayers.findIndex(([uid]) => uid === userId);
    userRank = idx !== -1 ? idx + 1 : 1;
  }

  return {
    success: true,
    totalPoints: newTotalPoints,
    bestScore: finalBestScore,
    quizzesPlayed: newQuizzesPlayed,
    userRank,
    tier: calculateTier(newTotalPoints),
    persistedInRedis,
    redisError,
  };
}

/**
 * Returns complete Ficha de Artista data:
 * canonical artistName/slug, description, user stats, top 50 leaderboard sorted by totalPoints, and 12 related artists.
 */
export async function getArtistProfileAndLeaderboard(
  artistName: string,
  userId?: string
): Promise<{
  artistName: string;
  slug: string;
  description: string;
  photoUrl: string;
  userStats: {
    userRank: number | null;
    totalPlayers: number;
    totalPoints: number;
    quizzesPlayed: number;
    bestScore: number;
    tier: RankedTier;
  };
  leaderboard: Array<{
    rank: number;
    userId: string;
    nickname: string;
    avatarUrl: string;
    totalPoints: number;
    bestScore: number;
    quizzesPlayed: number;
    tier: RankedTier;
    isCurrentUser: boolean;
  }>;
  relatedArtists: Array<{
    name: string;
    slug: string;
    imageUrl: string;
  }>;
}> {
  const cleanName = getCanonicalArtistName(artistName);
  const slug = toArtistSlug(cleanName);
  const photoUrl = await getArtistFacePhoto(cleanName);

  // Resolve artist description cleanly (0 Redis reads if in static catalog!)
  let description = getCuratedArtistDescription(slug) || "";
  if (!description && redis) {
    try {
      const rawMeta = await redis.hget<string | { n?: string; d?: string }>("scuinklezam:ranked:artists_meta", slug);
      const parsed = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;
      if (parsed?.d) description = parsed.d;
    } catch {}
  }
  if (!description) {
    const cachedMemMeta = memoryArtistsMeta.get(slug);
    if (cachedMemMeta?.d) {
      description = cachedMemMeta.d;
    } else {
      const resolvedMeta = await resolveArtistCatalogMeta(cleanName, slug);
      description = resolvedMeta.d || `Catálogo verificado · Pon a prueba tu oído con todas las eras de ${cleanName}`;
      memoryArtistsMeta.set(slug, resolvedMeta);
    }
  }

  let totalPlayers = 0;
  let userRank: number | null = null;
  let userTotalPoints = 0;
  let userQuizzesPlayed = 0;
  let userBestScore = 0;
  const leaderboard: Array<{
    rank: number;
    userId: string;
    nickname: string;
    avatarUrl: string;
    totalPoints: number;
    bestScore: number;
    quizzesPlayed: number;
    tier: RankedTier;
    isCurrentUser: boolean;
  }> = [];

  if (redis) {
    try {
      const zsetKey = `scuinklezam:ranked:artist:${slug}`;
      totalPlayers = (await redis.zcard(zsetKey)) || 0;

      // User stats
      if (userId) {
        const statsKey = `scuinklezam:artist_user_stats:${slug}:${userId}`;
        const uStats = await redis.hgetall<Record<string, string>>(statsKey);
        if (uStats) {
          userTotalPoints = Number(uStats.totalPoints || 0);
          userQuizzesPlayed = Number(uStats.quizzesPlayed || 0);
          userBestScore = Math.min(1000, Number(uStats.bestScore || 0));
        }
        const rankIdx = await redis.zrevrank(zsetKey, userId);
        if (rankIdx !== null && rankIdx !== undefined) {
          userRank = rankIdx + 1;
        }
      }

      // Leaderboard Top 50 sorted descending by totalPoints
      const topIds = await redis.zrange<any[]>(zsetKey, 0, 49, {
        rev: true,
        withScores: true,
      });

      if (topIds && topIds.length > 0) {
        const memberEntries = parseZRangeWithScores(topIds).map((e) => ({
          userId: e.member,
          score: e.score,
        }));

        const memberIds = memberEntries.map((m) => m.userId);
        let metaMap: Record<string, any> | null = null;
        if (memberIds.length > 0) {
          try {
            metaMap = await redis.hmget<Record<string, any>>(`scuinklezam:artist_meta:${slug}`, ...memberIds);
          } catch (e) {
            console.warn("[getArtistProfileAndLeaderboard] hmget error:", e);
          }
        }

        // Batch fallback for any legacy member missing from artist_meta
        const missingIds = memberIds.filter((id) => !metaMap || !metaMap[id]);
        let fallbackProfiles: Record<string, any> = {};
        if (missingIds.length > 0) {
          try {
            const keys = missingIds.map((id) => `scuinklezam:user_profile:${id}`);
            const pRaws = await redis.mget<any[]>(...keys);
            missingIds.forEach((id, idx) => {
              const raw = pRaws ? pRaws[idx] : null;
              fallbackProfiles[id] = safeJsonParse(raw);
            });
          } catch {}
        }

        for (let idx = 0; idx < memberEntries.length; idx++) {
          const { userId: mId, score: mScore } = memberEntries[idx];
          const rawMeta = metaMap ? metaMap[mId] : null;
          const meta = safeJsonParse<any>(rawMeta);
          const fallback = fallbackProfiles[mId];

          const nick = meta?.nickname || fallback?.nickname || `Jugador #${idx + 1}`;
          const av =
            meta?.avatarUrl ||
            fallback?.avatarUrl ||
            `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nick)}&backgroundColor=0B1710`;

          const entryTotal = Math.max(0, Math.round(Number(meta?.totalPoints ?? mScore)));
          const entryBest = Math.min(1000, Math.max(0, Math.round(Number(meta?.bestScore ?? Math.min(1000, mScore)))));

          // Migrate legacy ZSET scores that stored bestScore instead of cumulative totalPoints
          if (entryTotal > mScore) {
            redis.zadd(zsetKey, { score: entryTotal, member: mId }).catch(() => {});
          }

          leaderboard.push({
            rank: leaderboard.length + 1,
            userId: mId,
            nickname: nick,
            avatarUrl: av,
            totalPoints: entryTotal,
            bestScore: entryBest,
            quizzesPlayed: Number(meta?.quizzesPlayed || 1),
            tier: calculateTier(entryTotal),
            isCurrentUser: !!userId && mId === userId,
          });
        }

        leaderboard.sort((a, b) => b.totalPoints - a.totalPoints || b.bestScore - a.bestScore);
        leaderboard.forEach((entry, idx) => {
          entry.rank = idx + 1;
        });

        if (userId) {
          const meInBoard = leaderboard.find((e) => e.userId === userId);
          if (meInBoard) {
            userRank = meInBoard.rank;
            userTotalPoints = meInBoard.totalPoints;
          }
        }
      }
    } catch (err) {
      console.warn("[getArtistProfileAndLeaderboard] Redis read error:", err);
    }
  }

  // Memory fallback if no redis entries
  if (leaderboard.length === 0 && memoryArtistStats.has(slug)) {
    const artistMap = memoryArtistStats.get(slug)!;
    totalPlayers = artistMap.size;
    const sorted = Array.from(artistMap.entries()).sort(
      (a, b) => b[1].totalPoints - a[1].totalPoints || b[1].bestScore - a[1].bestScore
    );

    sorted.slice(0, 50).forEach(([uid, val], idx) => {
      leaderboard.push({
        rank: idx + 1,
        userId: uid,
        nickname: val.nickname,
        avatarUrl: val.avatarUrl,
        totalPoints: val.totalPoints,
        bestScore: val.bestScore,
        quizzesPlayed: val.quizzesPlayed,
        tier: calculateTier(val.totalPoints),
        isCurrentUser: !!userId && uid === userId,
      });
    });

    if (userId && artistMap.has(userId)) {
      const u = artistMap.get(userId)!;
      userTotalPoints = u.totalPoints;
      userQuizzesPlayed = u.quizzesPlayed;
      userBestScore = u.bestScore;
      const idx = sorted.findIndex(([uid]) => uid === userId);
      userRank = idx !== -1 ? idx + 1 : null;
    }
  }

  const relatedArtists = await getDeezerRelatedArtists(cleanName);

  return {
    artistName: cleanName,
    slug,
    description,
    photoUrl,
    userStats: {
      userRank,
      totalPlayers,
      totalPoints: userTotalPoints,
      quizzesPlayed: userQuizzesPlayed,
      bestScore: userBestScore,
      tier: calculateTier(userTotalPoints),
    },
    leaderboard,
    relatedArtists,
  };
}

/**
 * Returns the dynamic Ranked catalog ordered strictly by community popularity (total matches played),
 * using at most 3 Redis commands:
 * 1) ZRANGE scuinklezam:ranked:artists_popularity (Top 30)
 * 2) HMGET scuinklezam:ranked:artists_meta
 * 3) HGETALL scuinklezam:stats:category_plays
 * Clean homepage rule: once >= 12 distinct artists have >= 1 play, base 0-play artists are omitted from the main list.
 */
export async function getDynamicRankedCategories(): Promise<RankedCategory[]> {
  let popEntries: Array<{ slug: string; plays: number }> = [];
  let artistsMetaMap: Record<string, any> | null = null;
  let countsMap: Record<string, string | number> | null = null;
  let loadedFromRedis = false;

  const baseArtists = RANKED_CATEGORIES.filter((c) => c.kind === "artist");
  const baseBySlug = new Map<string, RankedCategory>();
  for (const c of baseArtists) {
    baseBySlug.set(toArtistSlug(c.query || c.name), c);
  }

  if (redis) {
    const client = redis;
    try {
      // Command 1 & 2: Top 50 played artists + theme play counts hash
      const [popRaw, countsRes] = await Promise.all([
        client.zrange<any[]>("scuinklezam:ranked:artists_popularity", 0, 49, {
          rev: true,
          withScores: true,
        }),
        client.hgetall<Record<string, string | number>>("scuinklezam:stats:category_plays"),
      ]);

      countsMap = countsRes;
      popEntries = parseZRangeWithScores(popRaw)
        .map((p) => ({ slug: p.member, plays: Math.max(0, Math.round(p.score)) }))
        .filter((p) => Boolean(p.slug) && p.plays > 0);

      // One-time automatic backfill if artists_popularity is empty (legacy plays)
      if (popEntries.length === 0 && !popularityBackfillDone) {
        popularityBackfillDone = true;
        const alreadyBackfilled = await client.get("scuinklezam:ranked:popularity_backfilled");

        if (!alreadyBackfilled) {
          const backfillPlays = new Map<string, number>();

          if (countsMap) {
            for (const [catId, rawVal] of Object.entries(countsMap)) {
              if (catId.startsWith("artist_")) {
                const rawSlug = catId.slice("artist_".length).replace(/_/g, "-");
                const canonicalSlug = toArtistSlug(rawSlug);
                const plays = Math.max(0, Math.round(Number(rawVal) || 0));
                if (canonicalSlug && plays > 0) {
                  backfillPlays.set(canonicalSlug, (backfillPlays.get(canonicalSlug) || 0) + plays);
                }
              }
            }
          }

          const legacyKeys = await client.keys("scuinklezam:ranked:artist:*");
          if (legacyKeys && legacyKeys.length > 0) {
            const zcardResults = await Promise.all(
              legacyKeys.map(async (key) => ({
                key,
                count: await client.zcard(key),
              }))
            );

            for (const { key, count } of zcardResults) {
              if (count > 0) {
                const rawSlug = key.replace("scuinklezam:ranked:artist:", "");
                const canonicalSlug = toArtistSlug(rawSlug);
                if (canonicalSlug) {
                  backfillPlays.set(canonicalSlug, Math.max(backfillPlays.get(canonicalSlug) || 0, count));
                }
              }
            }
          }

          if (backfillPlays.size > 0) {
            const zaddEntries: Array<{ score: number; member: string }> = [];
            const metaPayload: Record<string, string> = {};

            for (const [slug, plays] of Array.from(backfillPlays.entries())) {
              zaddEntries.push({ score: plays, member: slug });
              popEntries.push({ slug, plays });

              const baseCat = baseBySlug.get(slug);
              const name =
                CANONICAL_ARTIST_NAMES[slug] ||
                baseCat?.name ||
                formatSlugToName(slug);
              const desc = getCuratedArtistDescription(slug) || baseCat?.description || "";
              metaPayload[slug] = JSON.stringify(desc ? { n: name, d: desc } : { n: name });
            }

            popEntries.sort((a, b) => b.plays - a.plays);
            popEntries = popEntries.slice(0, 50);
            artistsMetaMap = metaPayload;

            const [firstEntry, ...restEntries] = zaddEntries;
            await Promise.all([
              client.zadd("scuinklezam:ranked:artists_popularity", firstEntry, ...restEntries),
              client.hset("scuinklezam:ranked:artists_meta", metaPayload),
              client.set("scuinklezam:ranked:popularity_backfilled", "1"),
            ]);
          } else {
            await client.set("scuinklezam:ranked:popularity_backfilled", "1");
          }
        }
      }

      // Command 3: Fetch metadata hash only if played artists exist and weren't just populated by backfill
      const uniqueRawSlugs = Array.from(new Set(popEntries.map((p) => p.slug))).filter(Boolean);
      if (!artistsMetaMap && uniqueRawSlugs.length > 0) {
        artistsMetaMap = await client.hmget<Record<string, any>>(
          "scuinklezam:ranked:artists_meta",
          ...uniqueRawSlugs
        );
      }

      loadedFromRedis = true;
    } catch (err) {
      console.error("[getDynamicRankedCategories] Redis error:", err);
    }
  }

  // Fallback to in-memory popularity & counts if Redis unavailable/failed
  if (!loadedFromRedis) {
    const memMetaObj: Record<string, any> = {};
    memoryArtistsMeta.forEach((val, slug) => {
      memMetaObj[slug] = val;
    });

    memoryArtistPopularity.forEach((val, slug) => {
      if (val.plays > 0) {
        popEntries.push({ slug, plays: val.plays });
        if (val.name && !memMetaObj[slug]) {
          memMetaObj[slug] = { n: val.name };
        }
      }
    });
    popEntries.sort((a, b) => b.plays - a.plays);
    popEntries = popEntries.slice(0, 50);
    artistsMetaMap = memMetaObj;

    const memCountsObj: Record<string, number> = {};
    memoryCategoryPlays.forEach((cnt, id) => {
      memCountsObj[id] = cnt;
    });
    countsMap = memCountsObj;
  }

  // Merge any aliased slugs canonically and build strictly played artist cards (playerCount > 0)
  const mergedPlayedBySlug = new Map<string, { plays: number; rawMeta?: { n?: string; d?: string } }>();
  for (const item of popEntries) {
    if (item.plays <= 0) continue;
    const canonicalSlug = toArtistSlug(item.slug);
    if (!canonicalSlug) continue;

    const rawMetaVal = artistsMetaMap ? artistsMetaMap[item.slug] || artistsMetaMap[canonicalSlug] : null;
    const parsedMeta = safeJsonParse<{ n?: string; d?: string }>(rawMetaVal);

    const prev = mergedPlayedBySlug.get(canonicalSlug);
    if (prev) {
      prev.plays += item.plays;
      if (!prev.rawMeta && parsedMeta) prev.rawMeta = parsedMeta;
    } else {
      mergedPlayedBySlug.set(canonicalSlug, { plays: item.plays, rawMeta: parsedMeta ?? undefined });
    }
  }

  const playedArtists: RankedCategory[] = Array.from(mergedPlayedBySlug.entries())
    .filter(([, info]) => info.plays > 0)
    .sort((a, b) => b[1].plays - a[1].plays)
    .map(([canonicalSlug, info]) => {
      const baseCat = baseBySlug.get(canonicalSlug);
      const name =
        CANONICAL_ARTIST_NAMES[canonicalSlug] ||
        baseCat?.name ||
        info.rawMeta?.n ||
        formatSlugToName(canonicalSlug);

      const description =
        getCuratedArtistDescription(canonicalSlug) ||
        info.rawMeta?.d ||
        baseCat?.description ||
        `Catálogo verificado · Pon a prueba tu oído con todas las eras de ${name}`;

      return {
        id: baseCat?.id || `artist_${canonicalSlug.replace(/-/g, "_")}`,
        name,
        kind: "artist" as const,
        description,
        imageUrl: baseCat?.imageUrl || `/api/artists/photo?name=${encodeURIComponent(name)}`,
        query: name,
        playerCount: info.plays,
      };
    });

  // Themes sorted descending by real plays
  const themes: RankedCategory[] = RANKED_CATEGORIES.filter((c) => c.kind === "theme")
    .map((t) => ({
      ...t,
      playerCount: Number(countsMap?.[t.id] || 0),
    }))
    .sort((a, b) => b.playerCount - a.playerCount);

  return [...playedArtists, ...themes];
}

import { redis } from "./roomStore";
import { getArtistFacePhoto } from "./artistPhotos";
import { isStrictArtistMatch } from "./songMatching";
export * from "./rankedTypes";
import {
  RankedTier,
  calculateTier,
  LeaderboardEntry,
  RANKED_CATEGORIES,
} from "./rankedTypes";

// Helper to normalize artist names to clean URL/Redis slugs
export function toArtistSlug(name: string): string {
  if (!name) return "artist";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artist";
}

// In-memory fallback scores if Redis is unreachable
const memoryScores = new Map<string, Map<string, { score: number; nickname: string; avatarUrl: string }>>();
const memoryStats = new Map<string, { totalPlays: number; totalPoints: number }>();
const memoryHistory = new Map<string, Array<any>>();

// In-memory fallback for artist-specific ranked stats
const memoryArtistStats = new Map<string, Map<string, {
  totalPoints: number;
  bestScore: number;
  quizzesPlayed: number;
  nickname: string;
  avatarUrl: string;
}>>();

// Thematic clusters to discover 12 related artists with verified HD face photos
const ARTIST_CLUSTERS = [
  // España Urbano & Rap
  [
    "Quevedo", "Saiko", "JC Reyes", "Omar Montes", "Lucho RK", "La Pantera", "Rels B",
    "Bad Gyal", "Morad", "Lola Indigo", "Cruzzi", "Delaossa", "Hoke", "Recycled J",
    "Cano", "Cyril Kamer", "Ana Mena", "Aitana", "Beny Jr", "Ill Pekeño", "Ergo Pro",
    "Israel B", "Gloosito", "Soto Asa", "Yung Beef", "Kaydy Cain", "Abhir Hathi", "Juicy BAE"
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

export async function getDeezerRelatedArtists(
  artistName: string
): Promise<Array<{ name: string; slug: string; imageUrl: string }>> {
  try {
    const clean = artistName.split(/[/,&]|(\s+feat\.?\s+)|(\s+ft\.?\s+)/i)[0].trim();
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
      return {
        name: a.name,
        slug: toArtistSlug(a.name),
        imageUrl: img || `/api/artists/photo?name=${encodeURIComponent(a.name)}`,
      };
    });
  } catch (e) {
    console.warn("[getDeezerRelatedArtists] Failed:", e);
    return [];
  }
}

export function getRelatedArtistsFor(artistName: string): Array<{ name: string; slug: string; imageUrl: string }> {
  const clean = artistName.trim().toLowerCase();
  const cleanNorm = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Find primary cluster
  let targetCluster = ARTIST_CLUSTERS.find((cluster) =>
    cluster.some((a) => {
      const lower = a.toLowerCase();
      return lower === clean || lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === cleanNorm;
    })
  );

  if (!targetCluster) {
    // Default to España Urbano
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
  rank: number;
  tier: RankedTier;
  isPersonalBest: boolean;
  persistedInRedis: boolean;
  redisError?: string;
}> {
  const safeScore = Math.min(1000, Math.max(0, Math.round(score)));
  const tier = calculateTier(safeScore);
  let isPersonalBest = true;
  let bestScore = safeScore;
  let persistedInRedis = false;
  let redisError: string | undefined;

  // 1. If Redis is available, query real persistent record first to resist cold starts
  if (redis) {
    try {
      const catKey = `scuinklezam:ranked:${categoryId}`;
      const prevCatScoreRaw = await redis.zscore(catKey, userId);
      const prevCatScore = Math.min(1000, Number(prevCatScoreRaw || 0));

      isPersonalBest = safeScore > prevCatScore;
      bestScore = Math.min(1000, Math.max(prevCatScore, safeScore));

      // 1. Increment real play counts (global + single category_plays hash)
      await redis.incr(`scuinklezam:stats:plays:${categoryId}`).catch(() => {});
      await redis.incr(`scuinklezam:stats:plays:global`).catch(() => {});
      await redis.hincrby("scuinklezam:stats:category_plays", categoryId, 1);
      if (categoryId.startsWith("artist_")) {
        const matchingCanonical = RANKED_CATEGORIES.find((cat) => {
          if (cat.kind !== "artist") return false;
          const catSlug = toArtistSlug(cat.query || cat.name);
          return categoryId === `artist_${catSlug}` || categoryId === cat.id;
        });
        if (matchingCanonical && matchingCanonical.id !== categoryId) {
          await redis.hincrby("scuinklezam:stats:category_plays", matchingCanonical.id, 1);
        }
      }

      // 2. Update category leaderboard (only best score per user in sorted set)
      await redis.zadd(catKey, {
        score: bestScore,
        member: userId,
      });

      // 2.5 Query existing global record to prevent downgrading global personal best
      const prevGlobalRaw = await redis.zscore("scuinklezam:ranked:global", userId);
      const prevGlobal = Math.min(1000, Number(prevGlobalRaw || 0));
      const effectiveGlobalBest = Math.min(1000, Math.max(prevGlobal, bestScore));

      // 3. Save user profile metadata for leaderboard display
      await redis.set(
        `scuinklezam:user_profile:${userId}`,
        JSON.stringify({
          userId,
          nickname,
          avatarUrl,
          bestScore: effectiveGlobalBest,
          lastPlayed: Date.now(),
        })
      );

      // 4. Update user's personal bests hash
      await redis.hset(`scuinklezam:user_bests:${userId}`, {
        [categoryId]: bestScore,
      });

      // 5. Update user global stats
      await redis.hincrby(`scuinklezam:user_stats:${userId}`, "totalPlays", 1);
      await redis.hincrby(`scuinklezam:user_stats:${userId}`, "totalPoints", safeScore);

      // 6. Push match to user recent history
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

      // 7. Global score leaderboard (record max)
      await redis.zadd("scuinklezam:ranked:global", {
        score: effectiveGlobalBest,
        member: userId,
      });

      persistedInRedis = true;
    } catch (err: any) {
      redisError = err?.message || String(err);
      console.warn("[submitRankedScore] Redis update error:", err);
    }
  }

  // In-memory fallback update
  if (!memoryScores.has(categoryId)) {
    memoryScores.set(categoryId, new Map());
  }
  const catMap = memoryScores.get(categoryId)!;
  const current = catMap.get(userId);
  if (!redis) {
    const currentScore = Math.min(1000, current?.score ?? 0);
    isPersonalBest = !current || safeScore > currentScore;
    bestScore = isPersonalBest ? safeScore : (current ? currentScore : safeScore);
  }

  catMap.set(userId, { score: bestScore, nickname, avatarUrl });

  // Update in-memory user stats
  const mStats = memoryStats.get(userId) || { totalPlays: 0, totalPoints: 0 };
  mStats.totalPlays += 1;
  mStats.totalPoints += safeScore;
  memoryStats.set(userId, mStats);

  // Update in-memory history
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

  // Calculate real rank
  const leaderboard = await getCategoryLeaderboard(categoryId, userId);
  const userEntry = leaderboard.entries.find((e) => e.userId === userId);
  const rank = userEntry ? userEntry.rank : 1;

  return {
    success: true,
    score: bestScore,
    rank,
    tier,
    isPersonalBest,
    persistedInRedis,
    redisError,
  };
}

export async function getCategoryLeaderboard(
  categoryId: string,
  currentUserId?: string
): Promise<{
  categoryId: string;
  entries: LeaderboardEntry[];
  userEntry?: LeaderboardEntry | null;
}> {
  const entries: LeaderboardEntry[] = [];

  // Try Redis first
  if (redis) {
    try {
      // Get top 20 members sorted descending (rev)
      const topIds = await redis.zrange<string[]>(`scuinklezam:ranked:${categoryId}`, 0, 19, {
        rev: true,
        withScores: true,
      });

      if (topIds && topIds.length > 0) {
        const memberEntries: Array<{ userId: string; score: number }> = [];
        for (let i = 0; i < topIds.length; i += 2) {
          const mId = typeof topIds[i] === "object" ? (topIds[i] as any).member : topIds[i];
          const rawScore = typeof topIds[i] === "object" ? Number((topIds[i] as any).score) : Number(topIds[i + 1]);
          const mScore = Math.min(1000, Math.max(0, Math.round(rawScore || 0)));

          // Auto-heal any legacy record > 1000 in Redis sorted set
          if (rawScore > 1000) {
            redis.zadd(`scuinklezam:ranked:${categoryId}`, { score: mScore, member: mId }).catch(() => {});
          }

          memberEntries.push({ userId: mId, score: mScore });
        }

        const profileKeys = memberEntries.map((m) => `scuinklezam:user_profile:${m.userId}`);
        const profilesRaw = profileKeys.length > 0 ? await redis.mget<any[]>(...profileKeys) : [];

        for (let idx = 0; idx < memberEntries.length; idx++) {
          const m = memberEntries[idx];
          const pRaw = profilesRaw ? profilesRaw[idx] : null;
          const profile = typeof pRaw === "string" ? JSON.parse(pRaw) : pRaw;

          if (profile && profile.bestScore && Number(profile.bestScore) > 1000) {
            profile.bestScore = 1000;
            redis.set(`scuinklezam:user_profile:${m.userId}`, JSON.stringify(profile)).catch(() => {});
          }

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

  // ZERO fake bots! If empty, entries remain empty.

  let userEntry: LeaderboardEntry | null = null;
  if (currentUserId) {
    userEntry = entries.find((e) => e.userId === currentUserId) || null;
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
    } catch (err) {
      console.warn("[getUserProfileData] Redis read error:", err);
    }
  } else {
    const s = memoryStats.get(userId);
    if (s) {
      totalPlays = s.totalPlays;
      totalPoints = s.totalPoints;
    }
    recentMatches = memoryHistory.get(userId) || [];
  }

  const averageScore = totalPlays > 0 ? Math.round(totalPoints / totalPlays) : 0;
  const currentTier = calculateTier(averageScore || 0);

  // Find best category
  let bestCategoryId = "";
  let bestScore = 0;
  for (const [catId, sc] of Object.entries(personalBests)) {
    if (sc > bestScore) {
      bestScore = sc;
      bestCategoryId = catId;
    }
  }

  return {
    totalPlays,
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
 * Updates the cumulative points, best score, quizzes played and sorted set leaderboard in Redis.
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
  persistedInRedis: boolean;
  redisError?: string;
}> {
  const cleanName = artistName.trim();
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

      // 2. Read previous best score and calculate final best score
      const prevBestRaw = await redis.hget<string>(statsKey, "bestScore");
      const prevBest = Math.min(1000, Number(prevBestRaw || 0));
      finalBestScore = Math.min(1000, Math.max(prevBest, safeScore));

      await redis.hset(statsKey, {
        bestScore: finalBestScore,
        nickname,
        avatarUrl,
        lastPlayed: Date.now(),
      });

      // 3. Update artist leaderboard sorted set with RECORD (finalBestScore), NOT cumulative totalPoints!
      await redis.zadd(zsetKey, {
        score: finalBestScore,
        member: userId,
      });

      // 3.5 Update unified artist meta hash for 1-command leaderboard reads
      await redis.hset(`scuinklezam:artist_meta:${slug}`, {
        [userId]: JSON.stringify({
          nickname,
          avatarUrl,
          bestScore: finalBestScore,
          totalPoints: newTotalPoints,
          quizzesPlayed: newQuizzesPlayed,
        }),
      });

      // 4. Save user profile for global lookups, preserving existing global bestScore
      const existingProfileRaw = await redis.get<string | any>(`scuinklezam:user_profile:${userId}`);
      const existingProfile = typeof existingProfileRaw === "string" ? JSON.parse(existingProfileRaw) : existingProfileRaw;
      const preservedGlobalBest = Math.max(Number(existingProfile?.bestScore || 0), finalBestScore);

      await redis.set(
        `scuinklezam:user_profile:${userId}`,
        JSON.stringify({
          userId,
          nickname,
          avatarUrl,
          bestScore: preservedGlobalBest,
          lastPlayed: Date.now(),
        })
      );

      // 5. Get user's updated rank in artist sorted set (0-indexed descending)
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

  // In-memory update
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

  if (!redis) {
    newTotalPoints = current.totalPoints + safeScore;
    finalBestScore = Math.min(1000, Math.max(Math.min(1000, current.bestScore), safeScore));
    newQuizzesPlayed = current.quizzesPlayed + 1;
  }

  artistMap.set(userId, {
    totalPoints: newTotalPoints,
    bestScore: finalBestScore,
    quizzesPlayed: newQuizzesPlayed,
    nickname,
    avatarUrl,
  });

  if (userRank === null) {
    // In-memory rank calculation sorted by bestScore
    const allPlayers = Array.from(artistMap.entries()).sort(
      (a, b) => b[1].bestScore - a[1].bestScore || b[1].totalPoints - a[1].totalPoints
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
    persistedInRedis,
    redisError,
  };
}

/**
 * Returns complete Ficha de Artista data:
 * user stats, visual podium, top 50 leaderboard, and 12 related artists.
 */
export async function getArtistProfileAndLeaderboard(
  artistName: string,
  userId?: string
): Promise<{
  artistName: string;
  slug: string;
  photoUrl: string;
  userStats: {
    userRank: number | null;
    totalPlayers: number;
    totalPoints: number;
    quizzesPlayed: number;
    bestScore: number;
  };
  leaderboard: Array<{
    rank: number;
    userId: string;
    nickname: string;
    avatarUrl: string;
    totalPoints: number;
    bestScore: number;
    quizzesPlayed: number;
    isCurrentUser: boolean;
  }>;
  relatedArtists: Array<{
    name: string;
    slug: string;
    imageUrl: string;
  }>;
}> {
  const cleanName = artistName.trim();
  const slug = toArtistSlug(cleanName);
  const photoUrl = await getArtistFacePhoto(cleanName);

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

      // Leaderboard Top 50
      const topIds = await redis.zrange<any[]>(zsetKey, 0, 49, {
        rev: true,
        withScores: true,
      });

      if (topIds && topIds.length > 0) {
        const memberEntries: Array<{ userId: string; score: number }> = [];
        for (let i = 0; i < topIds.length; i += 2) {
          const mId = typeof topIds[i] === "object" ? (topIds[i] as any).member : topIds[i];
          const rawScore = typeof topIds[i] === "object" ? Number((topIds[i] as any).score) : Number(topIds[i + 1]);
          const mScore = Math.min(1000, Math.max(0, Math.round(rawScore || 0)));
          memberEntries.push({ userId: mId, score: mScore });
        }

        const memberIds = memberEntries.map((m) => m.userId);
        let metaMap: Record<string, any> | null = null;
        try {
          metaMap = await redis.hmget<Record<string, any>>(`scuinklezam:artist_meta:${slug}`, ...memberIds);
        } catch (e) {
          console.warn("[getArtistProfileAndLeaderboard] hmget error:", e);
        }

        // Identify any members missing from artist_meta for batch fallback
        const missingIds = memberIds.filter((id) => !metaMap || !metaMap[id]);
        let fallbackProfiles: Record<string, any> = {};
        if (missingIds.length > 0) {
          try {
            const keys = missingIds.map((id) => `scuinklezam:user_profile:${id}`);
            const pRaws = await redis.mget<any[]>(...keys);
            missingIds.forEach((id, idx) => {
              const raw = pRaws ? pRaws[idx] : null;
              fallbackProfiles[id] = typeof raw === "string" ? JSON.parse(raw) : raw;
            });
          } catch {}
        }

        for (let idx = 0; idx < memberEntries.length; idx++) {
          const { userId: mId, score: mScore } = memberEntries[idx];
          const rawMeta = metaMap ? metaMap[mId] : null;
          const meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;
          const fallback = fallbackProfiles[mId];

          let nick = meta?.nickname || fallback?.nickname || `Jugador #${idx + 1}`;
          let av = meta?.avatarUrl || fallback?.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nick)}&backgroundColor=0B1710`;

          const rawBest = Number(meta?.bestScore || fallback?.bestScore || 0);
          const entryBest = Math.min(1000, rawBest || Math.min(1000, mScore));
          if (mScore > 1000 || mScore !== entryBest) {
            redis.zadd(zsetKey, { score: entryBest, member: mId }).catch(() => {});
          }

          leaderboard.push({
            rank: leaderboard.length + 1,
            userId: mId,
            nickname: nick,
            avatarUrl: av,
            totalPoints: Number(meta?.totalPoints || mScore),
            bestScore: entryBest,
            quizzesPlayed: Number(meta?.quizzesPlayed || 1),
            isCurrentUser: !!userId && mId === userId,
          });
        }

        leaderboard.sort((a, b) => b.bestScore - a.bestScore || b.totalPoints - a.totalPoints);
        leaderboard.forEach((entry, idx) => {
          entry.rank = idx + 1;
        });

        if (userId) {
          const meInBoard = leaderboard.find((e) => e.userId === userId);
          if (meInBoard) {
            userRank = meInBoard.rank;
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
      (a, b) => b[1].bestScore - a[1].bestScore || b[1].totalPoints - a[1].totalPoints
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
    photoUrl,
    userStats: {
      userRank,
      totalPlayers,
      totalPoints: userTotalPoints,
      quizzesPlayed: userQuizzesPlayed,
      bestScore: userBestScore,
    },
    leaderboard,
    relatedArtists,
  };
}

import { redis } from "./roomStore";
import { PRELOADED_ARTIST_PHOTOS } from "./artistPhotosCatalog";
export * from "./rankedTypes";
import {
  RankedTier,
  calculateTier,
  LeaderboardEntry,
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

// In-memory fallback for artist-specific Tapzz stats
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
    "Bad Gyal", "Morad", "Lola Indigo", "Cruz Cafuné", "Delaossa", "Hoke", "Recycled J",
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
    const artistId = searchData?.data?.[0]?.id;
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

    return relatedData.data.slice(0, 8).map((a: any) => ({
      name: a.name,
      slug: toArtistSlug(a.name),
      imageUrl:
        a.picture_xl ||
        a.picture_big ||
        a.picture_medium ||
        PRELOADED_ARTIST_PHOTOS[a.name.toLowerCase()] ||
        `/api/artists/photo?name=${encodeURIComponent(a.name)}`,
    }));
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
        imageUrl: PRELOADED_ARTIST_PHOTOS[l] || PRELOADED_ARTIST_PHOTOS[ln] || `/api/artists/photo?name=${encodeURIComponent(name)}`,
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
            imageUrl: PRELOADED_ARTIST_PHOTOS[l] || PRELOADED_ARTIST_PHOTOS[ln] || `/api/artists/photo?name=${encodeURIComponent(name)}`,
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
}> {
  const tier = calculateTier(score);

  // In-memory update
  if (!memoryScores.has(categoryId)) {
    memoryScores.set(categoryId, new Map());
  }
  const catMap = memoryScores.get(categoryId)!;
  const current = catMap.get(userId);
  const isPersonalBest = !current || score > current.score;
  const bestScore = isPersonalBest ? score : current.score;

  catMap.set(userId, { score: bestScore, nickname, avatarUrl });

  // Update in-memory user stats
  const mStats = memoryStats.get(userId) || { totalPlays: 0, totalPoints: 0 };
  mStats.totalPlays += 1;
  mStats.totalPoints += score;
  memoryStats.set(userId, mStats);

  // Update in-memory history
  const mHist = memoryHistory.get(userId) || [];
  mHist.unshift({
    categoryId,
    categoryName: categoryName || categoryId,
    score,
    correctCount: correctCount ?? Math.round((score / 100)),
    timestamp: Date.now(),
  });
  if (mHist.length > 20) mHist.pop();
  memoryHistory.set(userId, mHist);

  // Redis updates
  if (redis) {
    try {
      // 1. Increment real play counts
      await redis.incr(`scuinklezam:stats:plays:${categoryId}`);
      await redis.incr(`scuinklezam:stats:plays:global`);

      // 2. Update category leaderboard (only best score per user in sorted set)
      await redis.zadd(`scuinklezam:ranked:${categoryId}`, {
        score: bestScore,
        member: userId,
      });

      // 3. Save user profile metadata for leaderboard display
      await redis.set(
        `scuinklezam:user_profile:${userId}`,
        JSON.stringify({
          userId,
          nickname,
          avatarUrl,
          bestScore,
          lastPlayed: Date.now(),
        })
      );

      // 4. Update user's personal bests hash
      await redis.hset(`scuinklezam:user_bests:${userId}`, {
        [categoryId]: bestScore,
      });

      // 5. Update user global stats
      await redis.hincrby(`scuinklezam:user_stats:${userId}`, "totalPlays", 1);
      await redis.hincrby(`scuinklezam:user_stats:${userId}`, "totalPoints", score);

      // 6. Push match to user recent history
      await redis.lpush(
        `scuinklezam:user_history:${userId}`,
        JSON.stringify({
          categoryId,
          categoryName: categoryName || categoryId,
          score,
          correctCount: correctCount ?? Math.round((score / 100)),
          timestamp: Date.now(),
        })
      );
      await redis.ltrim(`scuinklezam:user_history:${userId}`, 0, 19);

      // 7. Global score leaderboard
      await redis.zadd(`scuinklezam:ranked:global`, {
        score: bestScore,
        member: userId,
      });
    } catch (err) {
      console.warn("[submitRankedScore] Redis update error:", err);
    }
  }

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
        for (let i = 0; i < topIds.length; i += 2) {
          const mId = typeof topIds[i] === "object" ? (topIds[i] as any).member : topIds[i];
          const mScore = typeof topIds[i] === "object" ? Number((topIds[i] as any).score) : Number(topIds[i + 1]);

          const profileRaw = await redis.get<string | any>(`scuinklezam:user_profile:${mId}`);
          const profile = typeof profileRaw === "string" ? JSON.parse(profileRaw) : profileRaw;

          const nick = profile?.nickname || `Jugador #${(i / 2) + 1}`;
          const av =
            profile?.avatarUrl ||
            `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nick)}&backgroundColor=0B1710`;

          entries.push({
            userId: mId,
            nickname: nick,
            avatarUrl: av,
            score: mScore,
            rank: entries.length + 1,
            tier: calculateTier(mScore),
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
          personalBests[k] = Number(v);
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
}> {
  const cleanName = artistName.trim();
  const slug = toArtistSlug(cleanName);

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

  const newTotalPoints = current.totalPoints + score;
  const newBestScore = Math.max(current.bestScore, score);
  const newQuizzesPlayed = current.quizzesPlayed + 1;

  artistMap.set(userId, {
    totalPoints: newTotalPoints,
    bestScore: newBestScore,
    quizzesPlayed: newQuizzesPlayed,
    nickname,
    avatarUrl,
  });

  let userRank: number | null = null;

  if (redis) {
    try {
      const statsKey = `scuinklezam:artist_user_stats:${slug}:${userId}`;
      const zsetKey = `scuinklezam:ranked:artist:${slug}`;

      // 1. Increment cumulative points and quizzes in Redis hash
      await redis.hincrby(statsKey, "totalPoints", score);
      await redis.hincrby(statsKey, "quizzesPlayed", 1);

      // 2. Update best score if higher
      const prevBestRaw = await redis.hget<string>(statsKey, "bestScore");
      const prevBest = Number(prevBestRaw || 0);
      if (score > prevBest) {
        await redis.hset(statsKey, { bestScore: score });
      }

      // 3. Update user metadata in hash
      await redis.hset(statsKey, {
        nickname,
        avatarUrl,
        lastPlayed: Date.now(),
      });

      // 4. Read updated total points from hash to ensure consistency
      const updatedPointsRaw = await redis.hget<string>(statsKey, "totalPoints");
      const updatedTotalPoints = Number(updatedPointsRaw || newTotalPoints);

      // 5. Update artist leaderboard sorted set with cumulative totalPoints
      await redis.zadd(zsetKey, {
        score: updatedTotalPoints,
        member: userId,
      });

      // 6. Save user profile for global lookups
      await redis.set(
        `scuinklezam:user_profile:${userId}`,
        JSON.stringify({
          userId,
          nickname,
          avatarUrl,
          lastPlayed: Date.now(),
        })
      );

      // 7. Get user's updated rank in artist sorted set (0-indexed descending)
      const rankIdx = await redis.zrevrank(zsetKey, userId);
      if (rankIdx !== null && rankIdx !== undefined) {
        userRank = rankIdx + 1;
      }
    } catch (err) {
      console.warn("[submitArtistRankedScore] Redis error:", err);
    }
  }

  if (userRank === null) {
    // In-memory rank calculation
    const allPlayers = Array.from(artistMap.entries()).sort(
      (a, b) => b[1].totalPoints - a[1].totalPoints
    );
    const idx = allPlayers.findIndex(([uid]) => uid === userId);
    userRank = idx !== -1 ? idx + 1 : 1;
  }

  return {
    success: true,
    totalPoints: newTotalPoints,
    bestScore: newBestScore,
    quizzesPlayed: newQuizzesPlayed,
    userRank,
  };
}

/**
 * Returns complete Tapzz-style Ficha de Artista data:
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
  const photoUrl =
    PRELOADED_ARTIST_PHOTOS[cleanName.toLowerCase()] ||
    `/api/artists/photo?name=${encodeURIComponent(cleanName)}`;

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
          userBestScore = Number(uStats.bestScore || 0);
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
        for (let i = 0; i < topIds.length; i += 2) {
          const mId = typeof topIds[i] === "object" ? (topIds[i] as any).member : topIds[i];
          const mScore = typeof topIds[i] === "object" ? Number((topIds[i] as any).score) : Number(topIds[i + 1]);

          const statsKey = `scuinklezam:artist_user_stats:${slug}:${mId}`;
          const uStats = await redis.hgetall<Record<string, string>>(statsKey);
          let nick = uStats?.nickname;
          let av = uStats?.avatarUrl;

          if (!nick) {
            const profileRaw = await redis.get<string | any>(`scuinklezam:user_profile:${mId}`);
            const profile = typeof profileRaw === "string" ? JSON.parse(profileRaw) : profileRaw;
            nick = profile?.nickname;
            av = profile?.avatarUrl;
          }

          nick = nick || `Jugador #${leaderboard.length + 1}`;
          av = av || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nick)}&backgroundColor=0B1710`;

          leaderboard.push({
            rank: leaderboard.length + 1,
            userId: mId,
            nickname: nick,
            avatarUrl: av,
            totalPoints: mScore,
            isCurrentUser: !!userId && mId === userId,
          });
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
      (a, b) => b[1].totalPoints - a[1].totalPoints
    );

    sorted.slice(0, 50).forEach(([uid, val], idx) => {
      leaderboard.push({
        rank: idx + 1,
        userId: uid,
        nickname: val.nickname,
        avatarUrl: val.avatarUrl,
        totalPoints: val.totalPoints,
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

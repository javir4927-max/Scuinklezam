import { redis } from "./roomStore";
export * from "./rankedTypes";
import {
  RankedTier,
  calculateTier,
  LeaderboardEntry,
} from "./rankedTypes";

// In-memory fallback scores if Redis is unreachable
const memoryScores = new Map<string, Map<string, { score: number; nickname: string; avatarUrl: string }>>();
const memoryStats = new Map<string, { totalPlays: number; totalPoints: number }>();
const memoryHistory = new Map<string, Array<any>>();

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

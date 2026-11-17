import { redis } from "./roomStore";
export * from "./rankedTypes";
import {
  RankedTier,
  RANKED_TIERS,
  calculateTier,
  RankedCategory,
  RANKED_CATEGORIES,
  LeaderboardEntry,
} from "./rankedTypes";

// In-memory fallback scores
const memoryScores = new Map<string, Map<string, { score: number; nickname: string; avatarUrl: string }>>();

// Seed baseline leaderboard competitors so the ladder is lively
const INITIAL_BOT_COMPETITORS = [
  { nickname: "AlexBeat", baseScore: 17450, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=AlexBeat&backgroundColor=0B1710" },
  { nickname: "SaraMusic", baseScore: 15820, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=SaraMusic&backgroundColor=0B1710" },
  { nickname: "DaniFlow", baseScore: 14210, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=DaniFlow&backgroundColor=0B1710" },
  { nickname: "ElenaTrap", baseScore: 12900, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=ElenaTrap&backgroundColor=0B1710" },
  { nickname: "CarlosV", baseScore: 11450, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=CarlosV&backgroundColor=0B1710" },
  { nickname: "LuciaSong", baseScore: 9800, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=LuciaSong&backgroundColor=0B1710" },
  { nickname: "MarcosBass", baseScore: 8400, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=MarcosBass&backgroundColor=0B1710" },
  { nickname: "PaulaSwift", baseScore: 7200, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=PaulaSwift&backgroundColor=0B1710" },
  { nickname: "JaviFerxxo", baseScore: 5900, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=JaviFerxxo&backgroundColor=0B1710" },
  { nickname: "LauraHit", baseScore: 4300, avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=LauraHit&backgroundColor=0B1710" },
];

export async function submitRankedScore(
  userId: string,
  nickname: string,
  avatarUrl: string,
  categoryId: string,
  score: number
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

  // Redis Sorted Set update
  if (redis) {
    try {
      await redis.zadd(`scuinklezam:ranked:${categoryId}`, {
        score: bestScore,
        member: userId,
      });

      // Save user profile metadata for leaderboard display
      await redis.set(
        `scuinklezam:user_profile:${userId}`,
        JSON.stringify({
          userId,
          nickname,
          avatarUrl,
          bestScore,
        })
      );

      // Global score
      await redis.zadd(`scuinklezam:ranked:global`, {
        score: bestScore,
        member: userId,
      });
    } catch (err) {
      console.warn("[submitRankedScore] Redis zadd error:", err);
    }
  }

  // Calculate rank
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
        // topIds is alternating [id, score, id, score] or objects depending on client version
        for (let i = 0; i < topIds.length; i += 2) {
          const mId = typeof topIds[i] === "object" ? (topIds[i] as any).member : topIds[i];
          const mScore = typeof topIds[i] === "object" ? Number((topIds[i] as any).score) : Number(topIds[i + 1]);

          const profileRaw = await redis.get<string | any>(`scuinklezam:user_profile:${mId}`);
          const profile = typeof profileRaw === "string" ? JSON.parse(profileRaw) : profileRaw;

          const nick = profile?.nickname || `Jugador #${(i / 2) + 1}`;
          const av = profile?.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(nick)}&backgroundColor=0B1710`;

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

  // If empty or fewer than 5 entries, seed with realistic competitors
  if (entries.length < 5) {
    INITIAL_BOT_COMPETITORS.forEach((b, idx) => {
      // Jitter score slightly per category for authenticity
      const score = Math.round(b.baseScore * (0.95 + (idx % 3) * 0.03));
      entries.push({
        userId: `bot_${idx}_${b.nickname}`,
        nickname: b.nickname,
        avatarUrl: b.avatar,
        score,
        rank: entries.length + 1,
        tier: calculateTier(score),
      });
    });

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, idx) => {
      e.rank = idx + 1;
    });
  }

  let userEntry: LeaderboardEntry | null = null;
  if (currentUserId) {
    userEntry = entries.find((e) => e.userId === currentUserId) || null;
  }

  return {
    categoryId,
    entries: entries.slice(0, 20),
    userEntry,
  };
}

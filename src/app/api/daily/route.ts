import { NextResponse } from "next/server";
import { redis, ensureVerifiedTrackAudio } from "@/lib/roomStore";
import { searchStrictArtistTracks } from "@/lib/musicService";
import { getDifficultDistractors } from "@/lib/songMatching";
import { getSessionUser } from "@/lib/userAuth";
import type { SpotifyTrackItem } from "@/lib/spotifyTypes";

export const dynamic = "force-dynamic";

// Bypass local Windows certificate issues for external APIs
if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// Global in-memory fallback
declare global {
  // eslint-disable-next-line no-var
  var __scuinklezamDailyChallenges: Map<string, any[]> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamDailyUsers: Map<string, any> | undefined;
}

if (!global.__scuinklezamDailyChallenges) {
  global.__scuinklezamDailyChallenges = new Map<string, any[]>();
}
if (!global.__scuinklezamDailyUsers) {
  global.__scuinklezamDailyUsers = new Map<string, any>();
}

const memoryChallenges = global.__scuinklezamDailyChallenges;
const memoryDailyUsers = global.__scuinklezamDailyUsers;

const DAILY_ARTISTS_CATALOG = [
  "Bad Bunny", "Rosalía", "Quevedo", "Duki", "Rauw Alejandro",
  "Aitana", "Bizarrap", "Feid", "Morat", "C. Tangana",
  "Mora", "Myke Towers", "Lola Indigo", "Saiko", "Melendi",
  "Dua Lipa", "The Weeknd", "Taylor Swift", "Coldplay", "Billie Eilish",
  "Harry Styles", "Estopa", "Eladio Carrión", "Anuel AA", "Karol G",
  "Rels B", "Bad Gyal", "Morad", "JC Reyes", "Cruzzi",
  "Delaossa", "Manuel Carrasco", "Sebastián Yatra", "Camilo", "Pablo Alborán"
];

function getMadridDateInfo() {
  const now = new Date();
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
  const [y, m, d] = dateKey.split("-").map(Number);
  const todayEpoch = Date.UTC(y, m - 1, d);
  const startEpoch = Date.UTC(2026, 0, 1);
  const dayNumber = Math.max(1, Math.floor((todayEpoch - startEpoch) / (24 * 60 * 60 * 1000)) + 1);

  const yesterdayDate = new Date(todayEpoch - 24 * 60 * 60 * 1000);
  const yesterdayDateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(yesterdayDate);

  return { dateKey, dayNumber, todayEpoch, yesterdayDateKey };
}

export interface DailyRoundOption {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  isCorrect: boolean;
}

export interface DailyRound {
  roundNumber: number;
  trackId: string;
  previewUrl: string;
  correctTitle: string;
  correctArtist: string;
  artworkUrl: string;
  options: DailyRoundOption[];
}

export async function GET() {
  const { dateKey, dayNumber, yesterdayDateKey } = getMadridDateInfo();

  try {
    // 1. Check if challenge already exists for dateKey
    let rounds: DailyRound[] | null = null;

    if (redis) {
      try {
        const raw = await redis.get<string | DailyRound[]>(`scuinklezam:daily:challenge:${dateKey}`);
        if (raw) {
          rounds = typeof raw === "string" ? JSON.parse(raw) : raw;
        }
      } catch (err) {
        console.warn("[GET /api/daily] Redis get challenge error:", err);
      }
    }

    if (!rounds && memoryChallenges.has(dateKey)) {
      rounds = memoryChallenges.get(dateKey)!;
    }

    // 2. If not generated, create 5 verified rounds
    if (!rounds || rounds.length < 5) {
      const generatedRounds: DailyRound[] = [];
      const usedTrackKeys = new Set<string>();
      const usedDistractorKeys = new Set<string>();

      // Deterministically pick 5 distinct artists based on dayNumber
      const chosenArtists: string[] = [];
      const len = DAILY_ARTISTS_CATALOG.length;
      for (let i = 0; i < len; i++) {
        const idx = (dayNumber * 7 + i * 3) % len;
        const candidate = DAILY_ARTISTS_CATALOG[idx];
        if (!chosenArtists.includes(candidate)) {
          chosenArtists.push(candidate);
        }
        if (chosenArtists.length >= 8) break; // Extra candidates in case some audio fails
      }

      for (const artist of chosenArtists) {
        if (generatedRounds.length >= 5) break;

        try {
          const artistTracks = await searchStrictArtistTracks(artist, 8);
          // Find first track with verified audio
          let verifiedTarget: SpotifyTrackItem | null = null;
          for (const tr of artistTracks) {
            const key = `${tr.title.toLowerCase()}_${tr.artist.toLowerCase()}`;
            if (usedTrackKeys.has(key)) continue;
            const checked = await ensureVerifiedTrackAudio(tr);
            if (checked && checked.previewUrl && checked.artworkUrl) {
              verifiedTarget = checked;
              usedTrackKeys.add(key);
              break;
            }
          }

          if (!verifiedTarget) continue;

          // Generate 3 distractors
          const distractors = await getDifficultDistractors(
            verifiedTarget,
            artistTracks,
            3,
            usedDistractorKeys
          );

          // Build 4 options and shuffle
          const options: DailyRoundOption[] = [
            {
              id: `correct_${verifiedTarget.id}`,
              title: verifiedTarget.title,
              artist: verifiedTarget.artist,
              artworkUrl: verifiedTarget.artworkUrl,
              isCorrect: true,
            },
            ...distractors.map((d, dIdx) => ({
              id: `dist_${dIdx}_${d.title}`,
              title: d.title,
              artist: d.artist,
              artworkUrl: d.artworkUrl,
              isCorrect: false,
            })),
          ];

          // Fisher-Yates shuffle
          for (let k = options.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [options[k], options[j]] = [options[j], options[k]];
          }

          generatedRounds.push({
            roundNumber: generatedRounds.length + 1,
            trackId: verifiedTarget.id,
            previewUrl: verifiedTarget.previewUrl || "",
            correctTitle: verifiedTarget.title,
            correctArtist: verifiedTarget.artist,
            artworkUrl: verifiedTarget.artworkUrl || "",
            options,
          });
        } catch (err) {
          console.warn(`[GET /api/daily] Error generating round for ${artist}:`, err);
        }
      }

      rounds = generatedRounds;

      // Save to Redis (TTL: 7 days = 604800s) & Memory
      if (rounds.length >= 5) {
        memoryChallenges.set(dateKey, rounds);
        if (redis) {
          try {
            await redis.set(`scuinklezam:daily:challenge:${dateKey}`, JSON.stringify(rounds), {
              ex: 604800,
            });
          } catch (err) {
            console.warn("[GET /api/daily] Redis set challenge error:", err);
          }
        }
      }
    }

    // 3. User Daily State if authenticated
    let userDailyState: any = null;
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      let rawUserDaily: any = null;
      if (redis) {
        try {
          rawUserDaily = await redis.get<string | any>(`scuinklezam:daily:user:${sessionUser.id}`);
          if (rawUserDaily && typeof rawUserDaily === "string") {
            rawUserDaily = JSON.parse(rawUserDaily);
          }
        } catch (err) {
          console.warn("[GET /api/daily] Redis get user daily error:", err);
        }
      }

      if (!rawUserDaily && memoryDailyUsers.has(sessionUser.id)) {
        rawUserDaily = memoryDailyUsers.get(sessionUser.id);
      }

      if (rawUserDaily) {
        const completedToday = rawUserDaily.lastPlayedDate === dateKey;
        // If streak was broken (last played before yesterday and not today)
        let activeStreak = rawUserDaily.currentStreak || 0;
        if (
          rawUserDaily.lastPlayedDate &&
          rawUserDaily.lastPlayedDate !== dateKey &&
          rawUserDaily.lastPlayedDate !== yesterdayDateKey
        ) {
          activeStreak = 0;
        }

        userDailyState = {
          currentStreak: activeStreak,
          bestStreak: rawUserDaily.bestStreak || 0,
          totalDaysPlayed: rawUserDaily.totalDaysPlayed || 0,
          completedToday,
          todayResult: completedToday ? rawUserDaily.todayResult : null,
        };
      } else {
        userDailyState = {
          currentStreak: 0,
          bestStreak: 0,
          totalDaysPlayed: 0,
          completedToday: false,
          todayResult: null,
        };
      }
    }

    return NextResponse.json({
      success: true,
      dateKey,
      dayNumber,
      rounds: rounds || [],
      userDailyState,
    });
  } catch (err: any) {
    console.error("[GET /api/daily] Handler error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Error al cargar reto diario" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const { dateKey, dayNumber, yesterdayDateKey } = getMadridDateInfo();

  try {
    const body = await req.json();
    const { dateKey: reqDateKey, score, results, answers } = body;

    const targetDateKey = reqDateKey || dateKey;
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      // Guest played: return calculated transient result
      return NextResponse.json({
        success: true,
        currentStreak: 1,
        bestStreak: 1,
        totalDaysPlayed: 1,
        guest: true,
      });
    }

    // Read existing user daily record
    let record: any = null;
    if (redis) {
      try {
        const raw = await redis.get<string | any>(`scuinklezam:daily:user:${sessionUser.id}`);
        if (raw) {
          record = typeof raw === "string" ? JSON.parse(raw) : raw;
        }
      } catch (err) {
        console.warn("[POST /api/daily] Redis get user daily error:", err);
      }
    }

    if (!record && memoryDailyUsers.has(sessionUser.id)) {
      record = memoryDailyUsers.get(sessionUser.id);
    }

    if (!record) {
      record = {
        currentStreak: 0,
        bestStreak: 0,
        totalDaysPlayed: 0,
      };
    }

    // If already played today, don't re-score or increment streak again
    if (record.lastPlayedDate === targetDateKey) {
      return NextResponse.json({
        success: true,
        currentStreak: record.currentStreak || 1,
        bestStreak: record.bestStreak || 1,
        totalDaysPlayed: record.totalDaysPlayed || 1,
        alreadyCompleted: true,
        todayResult: record.todayResult,
      });
    }

    // Calculate updated streak
    if (record.lastPlayedDate === yesterdayDateKey) {
      record.currentStreak = (record.currentStreak || 0) + 1;
    } else {
      record.currentStreak = 1;
    }

    record.bestStreak = Math.max(record.bestStreak || 0, record.currentStreak);
    record.totalDaysPlayed = (record.totalDaysPlayed || 0) + 1;
    record.lastPlayedDate = targetDateKey;
    record.todayResult = {
      dateKey: targetDateKey,
      dayNumber,
      score: Number(score) || 0,
      results: Array.isArray(results) ? results : [],
      answers: Array.isArray(answers) ? answers : [],
      playedAt: Date.now(),
    };

    // Save to memory
    memoryDailyUsers.set(sessionUser.id, record);

    // Save to Redis (persistent)
    if (redis) {
      try {
        await redis.set(`scuinklezam:daily:user:${sessionUser.id}`, JSON.stringify(record));
      } catch (err) {
        console.warn("[POST /api/daily] Redis set user daily error:", err);
      }
    }

    return NextResponse.json({
      success: true,
      currentStreak: record.currentStreak,
      bestStreak: record.bestStreak,
      totalDaysPlayed: record.totalDaysPlayed,
      todayResult: record.todayResult,
    });
  } catch (err: any) {
    console.error("[POST /api/daily] Error saving daily score:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Error al registrar reto diario" },
      { status: 500 }
    );
  }
}

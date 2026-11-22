if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { Redis } from "@upstash/redis";
import { SpotifyTrackItem, FALLBACK_SPOTIFY_TRACKS, getFallbackArtwork } from "./spotifyTypes";
import { searchVerifiedTracks, resolveAudioStream } from "./musicService";
import {
  getTrackTopic,
  getCoherentDistractors,
  getDifficultDistractors,
  normalizeSongTitle,
  deepNormalize,
  matchSongTitleStrict,
  isStrictArtistMatch,
  matchArtistNameStrict,
  hasNonLatinCharacters,
} from "./songMatching";
import {
  ROUND_DURATION_SEC,
  REVEAL_DURATION_MS,
  calculateRoundPoints,
  getSurvivalRoundDuration,
  getSurvivalPhaseInfo,
} from "./scoring";

export type GameMode =
  | "blend"
  | "top50"
  | "vote"
  | "random"
  | "who_listens"
  | "survival";

export type GuessType = "song" | "artist" | "both";

export interface PlayerAnswerRecord {
  roundIndex: number;
  optionIndex: number;
  timeMs: number;
  pointsEarned: number;
  isCorrect: boolean;
  guessedFriendId?: string;
  selectedTitle?: string;
  optionId?: string;
}

export interface Player {
  id: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  isConnected?: boolean;
  joinedAt?: number;
  lastSeen: number;
  favoriteArtists: string[];
  spotifyConnected: boolean;
  spotifyBadge?: string;
  injectedTracks?: SpotifyTrackItem[];
  injectedModeName?: string;
  injectedTracksCount?: number;
  injectedTracksSample?: string[];
  score: number;
  streak: number;
  maxStreak: number;
  lives: number;
  maxLives: number;
  isEliminated: boolean;
  eliminatedAtRound: number | null;
  healedThisRound?: boolean;
  lostLifeThisRound?: boolean;
  currentAnswer: PlayerAnswerRecord | null;
  answersByRound?: Record<number, PlayerAnswerRecord>;
  votedTheme: string | null;
}

export interface VotingCandidate {
  id: string;
  name: string;
  description: string;
  query: string;
  icon: string;
  votes: string[];
}

export interface ThemeProposal {
  id: string;
  label: string;
  proposedBy: string;
  votes: string[];
}

export interface RoundOption {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  topic?: string;
}

export interface RoundData {
  roundNumber: number;
  targetTrack: SpotifyTrackItem;
  options: (RoundOption | string)[];
  correctIndex: number;
  correctOptionId?: string;
  correctTrackId: string;
  correctTitle: string;
  topic?: string;
  contributedByPlayerId?: string;
  contributedByPlayerName?: string;
  sourceMode?: string;
}

export interface RoomPlaylist {
  id: string;
  name: string;
  imageUrl?: string;
  trackCount: number;
  addedByPlayerId: string;
  addedByPlayerName?: string;
  tracks: SpotifyTrackItem[];
}

export interface RoomState {
  code: string;
  hostId: string;
  name: string;
  status: "lobby" | "countdown" | "voting" | "playing" | "round_reveal" | "finished";
  gameMode: GameMode;
  guessType: GuessType;
  totalRounds: number;
  currentRound: number;
  roundDuration?: number;
  roundStartTime: number;
  roundEndsAt?: number;
  revealStartTime?: number;
  revealEndsAt?: number;
  countdownStartTime?: number;
  countdownEndsAt?: number;
  votingStartTime?: number;
  votingEndsAt?: number;
  votingCandidates?: VotingCandidate[];
  candidateRounds?: Record<string, RoundData[]>;
  winningTheme?: string;
  players: Player[];
  themeProposals: ThemeProposal[];
  rounds: RoundData[];
  playlists?: RoomPlaylist[];
  kickedPlayerIds: string[];
  usedTrackKeys?: string[];
  initialPlayerCount?: number;
  createdAt: number;
  lastActive: number;
  answersByRound?: Record<number, Record<string, PlayerAnswerRecord>>;
}

// Global in-memory storage fallback
declare global {
  // eslint-disable-next-line no-var
  var __scuinklezamRooms: Map<string, RoomState> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamHeartbeats: Map<string, Map<string, number>> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamLocks: Map<string, Promise<any>> | undefined;
}

if (!global.__scuinklezamRooms) {
  global.__scuinklezamRooms = new Map<string, RoomState>();
}
if (!global.__scuinklezamHeartbeats) {
  global.__scuinklezamHeartbeats = new Map<string, Map<string, number>>();
}
if (!global.__scuinklezamLocks) {
  global.__scuinklezamLocks = new Map<string, Promise<any>>();
}

const rooms = global.__scuinklezamRooms;
const inMemoryHeartbeats = global.__scuinklezamHeartbeats;
const inMemoryLocks = global.__scuinklezamLocks;

// Upstash Redis configuration
const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

export const redis =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : null;

const ROOM_KEY_PREFIX = "scuinklezam:room:";
const ROOM_TTL_SECONDS = 7200; // 2 hours expiration

/**
 * In-memory FIFO queue mutex lock fallback when Redis is not configured.
 */
async function acquireInMemoryLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
  const upperCode = code.toUpperCase().trim();
  while (inMemoryLocks.has(upperCode)) {
    try {
      await inMemoryLocks.get(upperCode);
    } catch {}
  }
  let resolveLock!: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  inMemoryLocks.set(upperCode, lockPromise);
  try {
    return await fn();
  } finally {
    inMemoryLocks.delete(upperCode);
    resolveLock();
  }
}

/**
 * Distributed mutex lock on Upstash Redis: lock:room:${code}
 * with 4000ms TTL, retry loop every 40ms up to 3000ms, and atomic release via Lua script.
 * Fallback to in-memory FIFO queue when Redis is null.
 */
export async function withRoomLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
  const upperCode = code.toUpperCase().trim();
  if (!redis) {
    return await acquireInMemoryLock(upperCode, fn);
  }

  const lockKey = `lock:room:${upperCode}`;
  const token = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const lockTimeoutMs = 4000;
  const maxWaitMs = 3000;
  const retryIntervalMs = 40;

  const startTime = Date.now();
  let acquired = false;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await redis.set(lockKey, token, { nx: true, px: lockTimeoutMs });
      if (res === "OK" || (res as unknown) === true) {
        acquired = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, retryIntervalMs));
  }

  if (!acquired) {
    console.warn(`[withRoomLock] Timeout acquiring lock for room ${upperCode}, proceeding to prevent deadlock.`);
  }

  try {
    return await fn();
  } finally {
    if (acquired && redis) {
      try {
        const luaScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await redis.eval(luaScript, [lockKey], [token]).catch(async () => {
          const val = await redis.get<string>(lockKey);
          if (val === token) {
            await redis.del(lockKey);
          }
        });
      } catch (err) {
        console.warn(`[withRoomLock] Error releasing lock for ${upperCode}:`, err);
      }
    }
  }
}

/**
 * Updates player heartbeat in separate Redis Hash room:${code}:heartbeats (3h expiration).
 */
export async function updatePlayerHeartbeat(code: string, playerId: string): Promise<void> {
  const upperCode = code.toUpperCase().trim();
  const now = Date.now();

  if (redis) {
    try {
      const hbKey = `room:${upperCode}:heartbeats`;
      await redis.hset(hbKey, { [playerId]: now });
      await redis.expire(hbKey, 10800); // 3 hours
    } catch (e) {
      console.warn(`[updatePlayerHeartbeat] Redis error for ${upperCode}:`, e);
    }
  }

  if (!inMemoryHeartbeats.has(upperCode)) {
    inMemoryHeartbeats.set(upperCode, new Map());
  }
  inMemoryHeartbeats.get(upperCode)!.set(playerId, now);
}

/**
 * Removes a player's heartbeat from the Hash when leaving the room.
 */
export async function removePlayerHeartbeat(code: string, playerId: string): Promise<void> {
  const upperCode = code.toUpperCase().trim();
  if (redis) {
    try {
      const hbKey = `room:${upperCode}:heartbeats`;
      await redis.hdel(hbKey, playerId);
    } catch {}
  }
  if (inMemoryHeartbeats.has(upperCode)) {
    inMemoryHeartbeats.get(upperCode)!.delete(playerId);
  }
}

/**
 * Reads all player heartbeats for a room.
 */
export async function getPlayerHeartbeats(code: string): Promise<Record<string, number>> {
  const upperCode = code.toUpperCase().trim();
  const result: Record<string, number> = {};

  if (redis) {
    try {
      const hbKey = `room:${upperCode}:heartbeats`;
      const data = await redis.hgetall<Record<string, number | string>>(hbKey);
      if (data && typeof data === "object") {
        for (const [k, v] of Object.entries(data)) {
          result[k] = Number(v);
        }
      }
    } catch (e) {
      console.warn(`[getPlayerHeartbeats] Redis error for ${upperCode}:`, e);
    }
  }

  const mem = inMemoryHeartbeats.get(upperCode);
  if (mem) {
    mem.forEach((v, k) => {
      if (!result[k] || v > result[k]) {
        result[k] = v;
      }
    });
  }

  return result;
}

export const DEMOCRATIC_VOTING_CATALOG = [
  {
    id: "top50_es",
    name: "Top 50 España",
    description: "Los mayores éxitos sonando ahora mismo en las listas españolas",
    query: "Quevedo Saiko JC Reyes Lucho RK Bad Gyal Omar Montes Morad Aitana Lola Indigo",
    icon: "Flame",
  },
  {
    id: "virales_2026",
    name: "Virales 2026",
    description: "Los himnos más virales y pegadizos del panorama actual",
    query: "Top Hits 2026 Virales España",
    icon: "Zap",
  },
  {
    id: "virales_2025",
    name: "Virales 2025",
    description: "Los temas que rompieron las redes y no pudiste parar de cantar",
    query: "Gata Only Si Antes Te Hubiera Conocido Espresso",
    icon: "Sparkles",
  },
  {
    id: "virales_2024",
    name: "Virales 2024",
    description: "El año de Columbia, Holanda y los grandes bombazos urbanos",
    query: "Columbia Quevedo Holanda Jhayco LALA Myke Towers",
    icon: "Trophy",
  },
  {
    id: "hits_mundial",
    name: "Hits Mundial",
    description: "Los números 1 del planeta que arrasan en todos los festivales",
    query: "The Weeknd Dua Lipa Bruno Mars Billie Eilish",
    icon: "Globe",
  },
  {
    id: "reggaeton",
    name: "Reggaetón",
    description: "Puro perreo duro y clásicos del reggaetón desde PR para el mundo",
    query: "Bad Bunny Feid Daddy Yankee Don Omar",
    icon: "Flame",
  },
  {
    id: "pop_actual",
    name: "Pop Actual",
    description: "Las estrellas del pop global que dominan las listas mundiales",
    query: "Olivia Rodrigo Taylor Swift Sabrina Carpenter Ariana Grande",
    icon: "Heart",
  },
  {
    id: "popular_mainstream",
    name: "Popular / Mainstream",
    description: "Las canciones que todo el mundo conoce de principio a fin",
    query: "Rosalía C. Tangana Bizarrap Manuel Turizo",
    icon: "Crown",
  },
  {
    id: "under_urbano",
    name: "Under / Urbano",
    description: "El sonido de culto de las islas y la calle con barras infinitas",
    query: "Cruz Cafune Delaossa Hoke Lucho RK Soto Asa Gloosito Ill Pekeno Ergo Pro",
    icon: "Headphones",
  },
  {
    id: "rap_hiphop",
    name: "Rap / Hip-Hop",
    description: "Los titanes del rap mundial y beats legendarios",
    query: "Kendrick Lamar Eminem Drake Travis Scott",
    icon: "Skull",
  },
  {
    id: "trap_espanol",
    name: "Trap En Español",
    description: "El movimiento que revolucionó la música hispana a golpe de 808",
    query: "Duki Khea Neo Pistea Ysy A Eladio Carrión",
    icon: "Zap",
  },
  {
    id: "clasicos_2010s",
    name: "Clásicos 2010s",
    description: "Nostalgia pura con los temazos que marcaron una década inolvidable",
    query: "Avicii David Guetta Calvin Harris Rihanna Pitbull",
    icon: "RotateCcw",
  },
  {
    id: "electronica_club",
    name: "Electrónica / Club",
    description: "Beats enérgicos, house bailable y ritmos de pista para no parar",
    query: "Fred Again Peggy Gou Fisher Bizarrap Club",
    icon: "Music2",
  },
  {
    id: "rnb_afro",
    name: "R&B / Afro",
    description: "Groove sedoso, afrobeats caribeños y vibras envolventes",
    query: "Rema Burna Boy Ayra Starr SZA Frank Ocean",
    icon: "Sparkles",
  },
];

/**
 * True Fisher-Yates (Knuth) shuffle algorithm for uniform, unbiased random ordering
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Fast HEAD validation for audio URLs (2s timeout).
 * Returns true if status is 200 or 206 (partial content streaming).
 */
export async function validateAudioUrl(url: string | null | undefined): Promise<boolean> {
  if (!url || typeof url !== "string" || !url.startsWith("https://")) return false;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    return res.status === 200 || res.status === 206 || res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensures a track has a valid, working audio preview URL.
 * Prioritizes Apple iTunes permanent URLs, validates with HEAD,
 * and falls back to resolveAudioStream if stalled or broken.
 */
export async function ensureVerifiedTrackAudio(track: SpotifyTrackItem): Promise<SpotifyTrackItem> {
  const result = { ...track };

  // 1. If not iTunes permanent link, resolve fresh Apple stream
  if (!result.previewUrl || !result.previewUrl.includes("apple.com")) {
    try {
      const fresh = await resolveAudioStream(result.title, result.artist);
      if (fresh?.previewUrl && fresh.previewUrl.includes("apple.com")) {
        result.previewUrl = fresh.previewUrl;
        if (fresh.artworkUrl) result.artworkUrl = fresh.artworkUrl;
      }
    } catch {}
  }

  // 2. Validate URL via fast HEAD check
  const isValid = await validateAudioUrl(result.previewUrl);
  if (!isValid) {
    try {
      const fresh = await resolveAudioStream(result.title, result.artist);
      if (fresh?.previewUrl) {
        result.previewUrl = fresh.previewUrl;
        if (fresh.artworkUrl) result.artworkUrl = fresh.artworkUrl;
      }
    } catch {}
  }

  return result;
}

/**
 * Generates an infinite batch of coherent, audio-verified rounds for Survival mode.
 * Excludes already played tracks (using room.usedTrackKeys).
 * Guarantees unique option IDs and tracks usedDistractorKeys across rounds.
 */
export async function generateSurvivalBatch(room: RoomState, count: number = 10): Promise<RoundData[]> {
  const usedKeys = new Set<string>(room.usedTrackKeys || []);
  const usedDistractorKeys = new Set<string>();
  const startRoundNumber = room.rounds.length + 1;

  // 1. Gather candidates from player injected tracks and favorites
  const candidatePool: SpotifyTrackItem[] = [];

  room.players.forEach((p) => {
    if (p.injectedTracks && p.injectedTracks.length > 0) {
      candidatePool.push(...p.injectedTracks);
    }
  });

  const playerArtists = Array.from(
    new Set(room.players.flatMap((p) => p.favoriteArtists).filter((a) => a && a.trim().length > 0))
  );

  // If candidatePool has few unused tracks, search iTunes for player artists
  const unusedFromPool = candidatePool.filter((t) => {
    const key = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    return !usedKeys.has(key);
  });

  if (unusedFromPool.length < count * 2 && playerArtists.length > 0) {
    for (const artist of playerArtists.slice(0, 6)) {
      try {
        const found = await searchVerifiedTracks(artist, 6);
        candidatePool.push(...found);
      } catch {}
    }
  }

  if (candidatePool.length < count * 2) {
    candidatePool.push(...FALLBACK_SPOTIFY_TRACKS);
  }

  // Filter valid audio tracks
  const availableTracks = candidatePool.filter((t) => {
    if (!t || !t.previewUrl || !t.previewUrl.startsWith("http") || !t.artworkUrl) return false;
    const key = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    return !usedKeys.has(key);
  });

  // If pool exhausted, reset used keys to cycle gracefully
  if (availableTracks.length < count) {
    usedKeys.clear();
    for (const t of candidatePool) {
      if (t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl) {
        availableTracks.push(t);
      }
    }
  }

  const shuffledTargets = fisherYatesShuffle(availableTracks).slice(0, count);

  const newRounds: RoundData[] = [];
  for (let i = 0; i < shuffledTargets.length; i++) {
    const rawTarget = shuffledTargets[i];
    const target = await ensureVerifiedTrackAudio(rawTarget);
    const targetTopic = getTrackTopic(target);
    const roundNumber = startRoundNumber + i;

    const correctOptId = `opt_${roundNumber}_c_${Math.random().toString(36).substring(2, 7)}`;
    const correctOption: RoundOption = {
      id: correctOptId,
      title: target.title,
      artist: target.artist,
      artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
      topic: targetTopic,
    };

    const distractors = await getDifficultDistractors(target, candidatePool, 3, usedDistractorKeys);
    const distractorOptions: RoundOption[] = distractors.map((d, dIdx) => ({
      id: `opt_${roundNumber}_d${dIdx}_${Math.random().toString(36).substring(2, 7)}`,
      title: d.title,
      artist: d.artist,
      artworkUrl: d.artworkUrl,
      topic: d.topic,
    }));

    const options: RoundOption[] = fisherYatesShuffle([correctOption, ...distractorOptions]);
    const correctIndex = options.findIndex((opt) => opt.id === correctOption.id);

    const key = `${target.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${target.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    usedKeys.add(key);

    newRounds.push({
      roundNumber,
      targetTrack: {
        ...target,
        artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
        topic: targetTopic,
      },
      options,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      correctOptionId: correctOption.id,
      correctTrackId: target.id,
      correctTitle: target.title,
      topic: targetTopic,
    });
  }

  room.usedTrackKeys = Array.from(usedKeys);
  return newRounds;
}

export async function buildRoundsFromTracks(tracks: SpotifyTrackItem[], totalRounds: number): Promise<RoundData[]> {
  const valid = tracks.filter((t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl);
  const catalog = valid.length >= 4 ? valid : FALLBACK_SPOTIFY_TRACKS;
  const shuffled = fisherYatesShuffle(catalog);
  const count = Math.min(totalRounds, shuffled.length);
  const usedDistractorKeys = new Set<string>();

  const rounds: RoundData[] = [];
  for (let i = 0; i < count; i++) {
    const rawTarget = shuffled[i];
    const target = { ...rawTarget };
    if (!target.previewUrl || !target.previewUrl.includes("apple.com")) {
      try {
        const fresh = await resolveAudioStream(target.title, target.artist);
        if (fresh?.previewUrl && fresh.previewUrl.includes("apple.com")) {
          target.previewUrl = fresh.previewUrl;
          if (fresh.artworkUrl) target.artworkUrl = fresh.artworkUrl;
        }
      } catch {}
    }

    const targetTopic = getTrackTopic(target);
    const roundNumber = i + 1;
    const correctOptId = `opt_${roundNumber}_c_${Math.random().toString(36).substring(2, 7)}`;

    const correctOption: RoundOption = {
      id: correctOptId,
      title: target.title,
      artist: target.artist,
      artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
      topic: targetTopic,
    };

    const distractors = await getDifficultDistractors(target, catalog, 3, usedDistractorKeys);
    const distractorOptions: RoundOption[] = distractors.map((d, dIdx) => ({
      id: `opt_${roundNumber}_d${dIdx}_${Math.random().toString(36).substring(2, 7)}`,
      title: d.title,
      artist: d.artist,
      artworkUrl: d.artworkUrl,
      topic: d.topic,
    }));

    const options: RoundOption[] = fisherYatesShuffle([correctOption, ...distractorOptions]);
    const correctIndex = options.findIndex((o) => o.id === correctOption.id);

    rounds.push({
      roundNumber,
      targetTrack: {
        ...target,
        artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
        topic: targetTopic,
      },
      options,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      correctOptionId: correctOption.id,
      correctTrackId: target.id,
      correctTitle: target.title,
      topic: targetTopic,
    });
  }

  return rounds;
}

/**
 * Persists room state in Upstash Redis and in-memory cache.
 */
export async function saveRoom(room: RoomState): Promise<void> {
  const code = room.code.toUpperCase();
  rooms.set(code, room);
  if (redis) {
    try {
      await redis.set(`${ROOM_KEY_PREFIX}${code}`, room, { ex: ROOM_TTL_SECONDS });
    } catch (err) {
      console.error(`[Upstash Redis] Error saving room ${code}:`, err);
    }
  }
}

/**
 * Deletes room state from Upstash Redis and in-memory cache.
 */
export async function deleteRoom(code: string): Promise<void> {
  const upperCode = code.toUpperCase();
  rooms.delete(upperCode);
  if (redis) {
    try {
      await redis.del(`${ROOM_KEY_PREFIX}${upperCode}`);
      await redis.del(`lock:room:${upperCode}`);
      await redis.del(`room:${upperCode}:heartbeats`);
    } catch (err) {
      console.error(`[Upstash Redis] Error deleting room ${upperCode}:`, err);
    }
  }
}

// Helper to generate 4-character room codes (like K7QP)
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Default proposals for lobby voting
const DEFAULT_THEME_PROPOSALS: ThemeProposal[] = [
  { id: "p1", label: "Éxitos Globales 2024", proposedBy: "Scuinklezam", votes: [] },
  { id: "p2", label: "Reggaeton & Urbano Latino", proposedBy: "Scuinklezam", votes: [] },
  { id: "p3", label: "Clásicos del Pop & 2000s", proposedBy: "Scuinklezam", votes: [] },
  { id: "p4", label: "Rock Internacional & Hits", proposedBy: "Scuinklezam", votes: [] },
];

/**
 * Retrieves the raw room object without mutating or saving it.
 */
export async function getRawRoom(code: string): Promise<RoomState | null> {
  const upperCode = code.toUpperCase().trim();
  if (redis) {
    try {
      const remote = await redis.get<RoomState>(`${ROOM_KEY_PREFIX}${upperCode}`);
      if (remote) return remote;
      const alt = await redis.get<RoomState>(`room:${upperCode}`);
      if (alt) return alt;
    } catch (err) {
      console.error(`[Upstash Redis] Error retrieving raw room ${upperCode}:`, err);
    }
  }
  return rooms.get(upperCode) || null;
}

/**
 * Creates a new room with host player.
 */
export async function createRoom(
  hostName: string,
  hostId: string,
  roomName?: string,
  initialArtists?: string[]
): Promise<RoomState> {
  let code = generateRoomCode();
  let existing = await getRawRoom(code);
  while (existing) {
    code = generateRoomCode();
    existing = await getRawRoom(code);
  }

  const cleanHostName = hostName.trim() || "Anfitrión";

  const hostPlayer: Player = {
    id: hostId,
    name: cleanHostName,
    avatarColor: "#10B981",
    isHost: true,
    isReady: true,
    isOnline: true,
    isConnected: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    favoriteArtists:
      initialArtists && initialArtists.length > 0
        ? initialArtists.slice(0, 3)
        : [],
    spotifyConnected: false,
    score: 0,
    streak: 0,
    maxStreak: 0,
    lives: 3,
    maxLives: 3,
    isEliminated: false,
    eliminatedAtRound: null,
    healedThisRound: false,
    lostLifeThisRound: false,
    currentAnswer: null,
    votedTheme: null,
  };

  const newRoom: RoomState = {
    code,
    hostId,
    name: roomName ? roomName.trim() : `Sala de ${cleanHostName}`,
    status: "lobby",
    gameMode: "blend",
    guessType: "song",
    totalRounds: 10,
    currentRound: 1,
    roundDuration: ROUND_DURATION_SEC,
    roundStartTime: 0,
    players: [hostPlayer],
    themeProposals: [...DEFAULT_THEME_PROPOSALS],
    rounds: [],
    playlists: [],
    kickedPlayerIds: [],
    usedTrackKeys: [],
    initialPlayerCount: 1,
    createdAt: Date.now(),
    lastActive: Date.now(),
    answersByRound: { 1: {} },
  };

  await saveRoom(newRoom);
  await updatePlayerHeartbeat(code, hostId);
  return newRoom;
}

/**
 * Gets a room by code and marks player connectivity.
 * ROUTINE GET POLLING DOES NOT WRITE TO REDIS.
 * Only if a server timer expired or lobby cleanup is required, it locks and advances state atomically.
 */
export async function getRoom(code: string, activePlayerId?: string): Promise<RoomState | null> {
  const upperCode = code.toUpperCase().trim();

  // 1. Update heartbeat in independent Redis Hash without modifying room:${code}
  if (activePlayerId) {
    await updatePlayerHeartbeat(upperCode, activePlayerId);
  }

  // 2. Read room state read-only
  const room = await getRawRoom(upperCode);
  if (!room) return null;

  const now = Date.now();
  const heartbeats = await getPlayerHeartbeats(upperCode);

  // 3. Mark player connectivity (<= 12000ms is connected)
  let anyDisconnectedInLobby = false;
  room.players.forEach((p) => {
    const hb = Number(heartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
    p.isConnected = (now - hb) <= 12000;
    p.isOnline = p.isConnected;
    if (room.status === "lobby" && !p.isConnected) {
      anyDisconnectedInLobby = true;
    }
  });

  // 4. Check if any server timer expired
  const timerExpired =
    (room.status === "countdown" && room.countdownEndsAt && now >= room.countdownEndsAt) ||
    (room.status === "voting" && room.votingEndsAt && now >= room.votingEndsAt) ||
    (room.status === "playing" && room.roundEndsAt && now >= room.roundEndsAt) ||
    (room.status === "round_reveal" && room.revealEndsAt && now >= room.revealEndsAt) ||
    anyDisconnectedInLobby;

  // 5. ONLY enter withRoomLock if server timer expired or lobby cleanup is required
  if (timerExpired) {
    return await withRoomLock(upperCode, async () => {
      const freshRoom = await getRawRoom(upperCode);
      if (!freshRoom) return null;

      const freshHeartbeats = await getPlayerHeartbeats(upperCode);
      freshRoom.players.forEach((p) => {
        const hb = Number(freshHeartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
        p.isConnected = (now - hb) <= 12000;
        p.isOnline = p.isConnected;
      });

      const progressed = checkRoomStateProgression(freshRoom, freshHeartbeats);
      if (progressed) {
        freshRoom.lastActive = Date.now();
        await saveRoom(freshRoom);
      }
      return freshRoom;
    });
  }

  // Pure read: NEVER writes room to Redis on normal polling!
  return room;
}

/**
 * Progresses room state authoritatively based on timestamps and player responses.
 * Strictly guarantees rooms NEVER loop back to "lobby" automatically.
 */
export function checkRoomStateProgression(room: RoomState, heartbeats?: Record<string, number>): boolean {
  const now = Date.now();
  let changed = false;

  // Sync isConnected if heartbeats provided
  if (heartbeats) {
    room.players.forEach((p) => {
      const hb = Number(heartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
      p.isConnected = (now - hb) <= 12000;
      p.isOnline = p.isConnected;
    });
  }

  // LOBBY: prune disconnected players (>12s)
  if (room.status === "lobby") {
    const beforeCount = room.players.length;
    room.players = room.players.filter((p) => p.isConnected !== false);
    if (room.players.length !== beforeCount) {
      changed = true;
      if (!room.players.some((p) => p.id === room.hostId) && room.players.length > 0) {
        room.players[0].isHost = true;
        room.hostId = room.players[0].id;
      }
    }
  }

  // 0. VOTING -> COUNTDOWN
  if (room.status === "voting") {
    const endsAt = room.votingEndsAt || (room.votingStartTime ? room.votingStartTime + 10000 : now);
    const activePlayers = room.players.filter((p) => p.isConnected !== false && p.isOnline !== false);
    const allVoted = activePlayers.length > 0 && activePlayers.every((p) => p.votedTheme !== null);

    if (now >= endsAt || allVoted) {
      let winningCandidate = room.votingCandidates?.[0];
      if (room.votingCandidates && room.votingCandidates.length > 0) {
        const sorted = [...room.votingCandidates].sort((a, b) => b.votes.length - a.votes.length);
        const maxVotes = sorted[0].votes.length;
        const topTied = sorted.filter((c) => c.votes.length === maxVotes);
        winningCandidate = topTied[Math.floor(Math.random() * topTied.length)];
      }

      const winnerName = winningCandidate?.name || "Top 50 España";
      room.winningTheme = winnerName;

      if (winningCandidate && room.candidateRounds && room.candidateRounds[winningCandidate.id]) {
        room.rounds = room.candidateRounds[winningCandidate.id];
      }

      room.status = "countdown";
      room.countdownStartTime = now;
      room.countdownEndsAt = now + 3500;
      room.votingStartTime = undefined;
      room.votingEndsAt = undefined;
      room.currentRound = 1;
      changed = true;
    }
  }

  // 1. COUNTDOWN -> PLAYING (Round 1)
  if (room.status === "countdown") {
    const endsAt = room.countdownEndsAt || (room.countdownStartTime ? room.countdownStartTime + 3500 : now);
    if (now >= endsAt) {
      room.status = "playing";
      room.roundStartTime = now;
      room.roundEndsAt = now + (room.roundDuration || ROUND_DURATION_SEC) * 1000;
      room.countdownStartTime = undefined;
      room.countdownEndsAt = undefined;

      if (!room.answersByRound) room.answersByRound = {};
      room.answersByRound[room.currentRound] = {};

      room.players.forEach((p) => {
        p.currentAnswer = null;
        p.healedThisRound = false;
        p.lostLifeThisRound = false;
      });
      changed = true;
    }
  }

  // 2. PLAYING -> ROUND_REVEAL
  if (room.status === "playing") {
    const endsAt = room.roundEndsAt || (room.roundStartTime ? room.roundStartTime + (ROUND_DURATION_SEC * 1000) : now);
    const activeEligiblePlayers =
      room.gameMode === "survival"
        ? room.players.filter((p) => p.isConnected !== false && p.isOnline !== false && !p.isEliminated)
        : room.players.filter((p) => p.isConnected !== false && p.isOnline !== false);

    const roundAnswers = room.answersByRound?.[room.currentRound] || {};
    const allAnswered =
      activeEligiblePlayers.length > 0 &&
      activeEligiblePlayers.every(
        (p) => p.currentAnswer !== null || Boolean(roundAnswers[p.id])
      );

    if (now >= endsAt || allAnswered) {
      room.status = "round_reveal";
      room.revealStartTime = now;
      room.revealEndsAt = now + REVEAL_DURATION_MS;
      room.roundStartTime = 0;
      room.roundEndsAt = undefined;

      // Score any player who didn't answer before reveal
      const currentRoundData = room.rounds[room.currentRound - 1];
      if (currentRoundData) {
        room.players.forEach((p) => {
          if (!p.currentAnswer && !roundAnswers[p.id]) {
            p.streak = 0;
            if (room.gameMode === "survival" && !p.isEliminated) {
              p.lives = Math.max(0, p.lives - 1);
              p.lostLifeThisRound = true;
              p.healedThisRound = false;
              if (p.lives === 0) {
                p.isEliminated = true;
                p.eliminatedAtRound = room.currentRound;
              }
            }
          }
        });
      }
      changed = true;
    }
  }

  // 3. ROUND_REVEAL -> NEXT ROUND or FINISHED
  if (room.status === "round_reveal") {
    const endsAt = room.revealEndsAt || (room.revealStartTime ? room.revealStartTime + REVEAL_DURATION_MS : now);
    if (endsAt && now >= endsAt) {
      room.revealStartTime = undefined;
      room.revealEndsAt = undefined;

      if (room.gameMode === "survival") {
        const initialCount = room.initialPlayerCount || room.players.length;
        const alivePlayers = room.players.filter((p) => !p.isEliminated);
        const shouldFinish = initialCount >= 2 ? alivePlayers.length <= 1 : alivePlayers.length === 0;

        if (shouldFinish) {
          room.status = "finished";
        } else {
          room.currentRound += 1;
          room.status = "playing";
          room.roundStartTime = now;
          room.roundDuration = getSurvivalRoundDuration(room.currentRound - 1);
          room.roundEndsAt = now + room.roundDuration * 1000;

          if (!room.answersByRound) room.answersByRound = {};
          room.answersByRound[room.currentRound] = {};

          room.players.forEach((p) => {
            p.currentAnswer = null;
            p.healedThisRound = false;
            p.lostLifeThisRound = false;
          });
        }
      } else {
        if (room.currentRound < room.rounds.length) {
          room.currentRound += 1;
          room.status = "playing";
          room.roundStartTime = now;
          room.roundEndsAt = now + (room.roundDuration || ROUND_DURATION_SEC) * 1000;

          if (!room.answersByRound) room.answersByRound = {};
          room.answersByRound[room.currentRound] = {};

          room.players.forEach((p) => {
            p.currentAnswer = null;
          });
        } else {
          room.status = "finished";
        }
      }
      changed = true;
    }
  }

  return changed;
}

/**
 * Joins an existing room (atomically wrapped in withRoomLock).
 */
export async function joinRoom(
  code: string,
  playerData: {
    id: string;
    name: string;
    avatarColor?: string;
    favoriteArtists?: string[];
    spotifyConnected?: boolean;
  }
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) {
      return { success: false, error: "La sala no existe o ha expirado." };
    }

    if (room.kickedPlayerIds && room.kickedPlayerIds.includes(playerData.id)) {
      return { success: false, error: "Has sido expulsado de esta sala por el anfitrión." };
    }

    await updatePlayerHeartbeat(code, playerData.id);

    const existingIndex = room.players.findIndex((p) => p.id === playerData.id);
    const colors = ["#10B981", "#84CC16", "#F59E0B", "#06B6D4", "#EC4899", "#8B5CF6", "#14B8A6"];
    const chosenColor =
      playerData.avatarColor ||
      colors[room.players.length % colors.length];

    if (existingIndex >= 0) {
      room.players[existingIndex].name = playerData.name.trim() || room.players[existingIndex].name;
      room.players[existingIndex].isOnline = true;
      room.players[existingIndex].isConnected = true;
      room.players[existingIndex].lastSeen = Date.now();
      if (playerData.favoriteArtists && playerData.favoriteArtists.length > 0) {
        room.players[existingIndex].favoriteArtists = playerData.favoriteArtists.slice(0, 5);
      }
    } else {
      if (room.players.length >= 12) {
        return { success: false, error: "La sala está llena (máximo 12 jugadores)." };
      }

      const newPlayer: Player = {
        id: playerData.id,
        name: playerData.name.trim() || "Jugador",
        avatarColor: chosenColor,
        isHost: false,
        isReady: true,
        isOnline: true,
        isConnected: true,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        favoriteArtists: playerData.favoriteArtists ? playerData.favoriteArtists.slice(0, 5) : [],
        spotifyConnected: Boolean(playerData.spotifyConnected),
        score: 0,
        streak: 0,
        maxStreak: 0,
        lives: 3,
        maxLives: 3,
        isEliminated: false,
        eliminatedAtRound: null,
        healedThisRound: false,
        lostLifeThisRound: false,
        currentAnswer: null,
        votedTheme: null,
      };

      room.players.push(newPlayer);
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Handles explicit player exit (button or sendBeacon).
 * In lobby: removes player immediately (and transfers host / deletes empty room).
 * In game: marks eliminated/disconnected and removes heartbeat so game progresses without delay.
 */
export async function leaveRoom(
  code: string,
  playerId: string
): Promise<{ success: boolean; room?: RoomState | null }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, room: null };

    await removePlayerHeartbeat(code, playerId);

    if (room.status === "lobby") {
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length === 0) {
        await deleteRoom(code);
        return { success: true, room: null };
      }
      if (room.hostId === playerId) {
        room.players[0].isHost = true;
        room.hostId = room.players[0].id;
      }
    } else {
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        player.isConnected = false;
        player.isOnline = false;
        player.isEliminated = true;
        if (player.eliminatedAtRound === null) {
          player.eliminatedAtRound = room.currentRound;
        }
      }

      // Check if all remaining connected players have answered
      const activeEligible = room.players.filter(
        (p) => p.isConnected !== false && p.isOnline !== false && !p.isEliminated
      );
      const roundMap = room.answersByRound?.[room.currentRound] || {};
      const allAnswered =
        activeEligible.length > 0 &&
        activeEligible.every((p) => p.currentAnswer !== null || Boolean(roundMap[p.id]));

      if (room.status === "playing" && allAnswered) {
        const now = Date.now();
        room.status = "round_reveal";
        room.revealStartTime = now;
        room.revealEndsAt = now + REVEAL_DURATION_MS;
      }
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Updates a player's contributed musical taste (artists/genres).
 */
export async function updatePlayerTaste(
  code: string,
  playerId: string,
  favoriteArtists: string[]
): Promise<boolean> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return false;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;

    player.favoriteArtists = favoriteArtists.filter((a) => a.trim().length > 0).slice(0, 5);
    room.lastActive = Date.now();
    await saveRoom(room);
    return true;
  });
}

/**
 * Injects verified Spotify tracks and sets player's Spotify analyzed badge.
 */
export async function injectSpotifyTracksToRoom(
  code: string,
  playerId: string,
  tracks: SpotifyTrackItem[],
  artists?: string[],
  label?: string,
  modeName?: string
): Promise<boolean> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return false;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;

    player.spotifyConnected = true;

    const validTracks = (tracks || []).filter(
      (t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl
    );
    player.injectedTracks = validTracks;
    player.injectedModeName = modeName || label || "Spotify";
    player.injectedTracksCount = validTracks.length;
    player.injectedTracksSample = validTracks.slice(0, 3).map((t) => `"${t.title} - ${t.artist}"`);

    if (artists && artists.length > 0) {
      player.favoriteArtists = artists.filter((a) => a.trim().length > 0).slice(0, 5);
    } else if (validTracks.length > 0) {
      const extracted = Array.from(new Set(validTracks.map((t) => t.artist.split(",")[0].trim()).filter(Boolean))).slice(0, 5);
      if (extracted.length > 0) {
        player.favoriteArtists = extracted;
      }
    }

    const badgeTitle = label ? label.trim() : (artists && artists.length > 0 ? `Top: ${artists.slice(0, 2).join(", ")}` : "Spotify");
    player.spotifyBadge = validTracks.length > 0
      ? `${badgeTitle} (${validTracks.length} canciones)`
      : "Spotify Conectado";

    room.lastActive = Date.now();
    await saveRoom(room);
    return true;
  });
}

/**
 * Renames a player in the room (and updates room name if host).
 */
export async function renamePlayer(
  code: string,
  playerId: string,
  newName: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };

    const cleanName = newName.trim();
    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." };
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Jugador no encontrado en la sala." };

    player.name = cleanName.slice(0, 24);

    if (player.isHost && (room.name.startsWith("Sala de ") || !room.name)) {
      room.name = `Sala de ${player.name}`;
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Updates player profile details (name and/or avatar) in real time.
 */
export async function updatePlayerProfile(
  code: string,
  playerId: string,
  profile: { name?: string; avatarColor?: string }
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Jugador no encontrado en la sala." };

    if (profile.name) {
      const clean = profile.name.trim();
      if (clean.length >= 2) {
        player.name = clean.slice(0, 24);
        if (player.isHost && (room.name.startsWith("Sala de ") || !room.name)) {
          room.name = `Sala de ${player.name}`;
        }
      }
    }

    if (profile.avatarColor && /^#[0-9A-Fa-f]{6}$/.test(profile.avatarColor)) {
      player.avatarColor = profile.avatarColor;
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Adds an imported playlist to the room's shared catalog.
 */
export async function addPlaylistToRoom(
  code: string,
  playerId: string,
  playlist: RoomPlaylist
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Jugador no encontrado en la sala." };

    if (!room.playlists) room.playlists = [];
    room.playlists = room.playlists.filter((p) => p.id !== playlist.id);

    const validTracks = (playlist.tracks || [])
      .map((t) => {
        let art = t.artworkUrl;
        if (!art || (playlist.imageUrl && art === playlist.imageUrl)) {
          art = getFallbackArtwork(t.title, t.artist);
        }
        return {
          ...t,
          artworkUrl: art,
        };
      })
      .filter(
        (t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl
      );

    const newPlaylist: RoomPlaylist = {
      id: playlist.id,
      name: playlist.name || "Playlist de Spotify",
      imageUrl: playlist.imageUrl,
      trackCount: validTracks.length > 0 ? validTracks.length : (playlist.trackCount || 0),
      addedByPlayerId: playerId,
      addedByPlayerName: player.name,
      tracks: validTracks,
    };

    room.playlists.push(newPlaylist);
    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Removes an imported playlist from the room.
 */
export async function removePlaylistFromRoom(
  code: string,
  playerId: string,
  playlistId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };

    if (!room.playlists) room.playlists = [];

    const targetPlaylist = room.playlists.find((p) => p.id === playlistId);
    if (!targetPlaylist) return { success: true, room };

    const isHost = room.hostId === playerId;
    if (!isHost && targetPlaylist.addedByPlayerId !== playerId) {
      return { success: false, error: "No tienes permiso para eliminar esta playlist." };
    }

    room.playlists = room.playlists.filter((p) => p.id !== playlistId);
    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Proposes a new theme/genre for the lobby vote.
 */
export async function proposeTheme(code: string, playerId: string, label: string): Promise<boolean> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return false;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;

    const cleanLabel = label.trim();
    if (!cleanLabel) return false;

    const newProposal: ThemeProposal = {
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      label: cleanLabel,
      proposedBy: player.name,
      votes: [playerId],
    };

    room.themeProposals.forEach((tp) => {
      tp.votes = tp.votes.filter((vid) => vid !== playerId);
    });

    player.votedTheme = newProposal.id;
    room.themeProposals.push(newProposal);
    room.lastActive = Date.now();
    await saveRoom(room);
    return true;
  });
}

/**
 * Casts a vote for a theme in the lobby.
 */
export async function voteTheme(code: string, playerId: string, proposalId: string): Promise<boolean> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return false;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;

    room.themeProposals.forEach((p) => {
      p.votes = p.votes.filter((id) => id !== playerId);
    });

    const target = room.themeProposals.find((p) => p.id === proposalId);
    if (target) {
      target.votes.push(playerId);
      player.votedTheme = proposalId;
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return true;
  });
}

/**
 * Casts a vote for democratic theme candidate.
 */
export async function castVote(code: string, playerId: string, themeId: string): Promise<{ success: boolean; room?: RoomState }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false };

    const player = room.players.find((p) => p.id === playerId);
    if (player) {
      player.votedTheme = themeId;
    }

    if (room.votingCandidates) {
      room.votingCandidates.forEach((c) => {
        c.votes = c.votes.filter((id) => id !== playerId);
        if (c.id === themeId) {
          c.votes.push(playerId);
        }
      });
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Changes room game settings (Host only).
 */
export async function changeRoomSettings(
  code: string,
  hostId: string,
  settings: {
    gameMode?: GameMode;
    guessType?: GuessType;
    totalRounds?: number;
    name?: string;
  }
): Promise<boolean> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room || room.hostId !== hostId) return false;

    if (settings.gameMode) room.gameMode = settings.gameMode;
    if (settings.guessType) room.guessType = settings.guessType;
    if (settings.totalRounds) room.totalRounds = settings.totalRounds;
    if (settings.name) room.name = settings.name.trim();

    room.lastActive = Date.now();
    await saveRoom(room);
    return true;
  });
}

/**
 * Starts game with full atomic lock and distinct round distractors.
 */
export async function startRoomGame(
  code: string,
  hostId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede iniciar la partida." };

    // Synchronize heartbeats
    const heartbeats = await getPlayerHeartbeats(code);
    const now = Date.now();
    room.players.forEach((p) => {
      const hb = Number(heartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
      p.isConnected = (now - hb) <= 12000;
      p.isOnline = p.isConnected;
    });

    const connectedPlayers = room.players.filter((p) => p.isConnected !== false);
    if (connectedPlayers.length === 0) {
      return { success: false, error: "No hay jugadores conectados en la sala." };
    }

    // 1. Collect candidate tracks from player taste, injected playlists, and catalogs
    const candidateTracks: Array<{ track: SpotifyTrackItem; playerId?: string; playerName?: string }> = [];

    // Injected Spotify tracks
    room.players.forEach((p) => {
      if (p.injectedTracks && p.injectedTracks.length > 0) {
        p.injectedTracks.forEach((t) => {
          candidateTracks.push({
            track: t,
            playerId: p.id,
            playerName: p.name,
          });
        });
      }
    });

    // Custom Room Playlists
    if (room.playlists && room.playlists.length > 0) {
      room.playlists.forEach((pl) => {
        (pl.tracks || []).forEach((t) => {
          candidateTracks.push({
            track: t,
            playerId: pl.addedByPlayerId,
            playerName: pl.addedByPlayerName,
          });
        });
      });
    }

    // Deduplicate pool
    const seenUris = new Set<string>();
    const validUniquePool: Array<{ track: SpotifyTrackItem; playerId?: string; playerName?: string }> = [];

    for (const item of candidateTracks) {
      const key = `${item.track.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${item.track.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seenUris.has(key) && !seenUris.has(item.track.id)) {
        seenUris.add(key);
        seenUris.add(item.track.id);
        validUniquePool.push(item);
      }
    }

    // If pool is small, search tracks for player artists
    const playerArtists = Array.from(
      new Set(room.players.flatMap((p) => p.favoriteArtists).filter((a) => a && a.trim().length > 0))
    );

    if (validUniquePool.length < room.totalRounds * 2 && playerArtists.length > 0) {
      for (const artist of playerArtists.slice(0, 8)) {
        try {
          const found = await searchVerifiedTracks(artist, 5);
          found.forEach((t) => {
            const key = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
            if (!seenUris.has(key) && !seenUris.has(t.id)) {
              seenUris.add(key);
              seenUris.add(t.id);
              validUniquePool.push({ track: t });
            }
          });
        } catch {}
      }
    }

    // Fallback tracks if pool is still insufficient
    if (validUniquePool.length < room.totalRounds) {
      FALLBACK_SPOTIFY_TRACKS.forEach((t) => {
        const key = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        if (!seenUris.has(key) && !seenUris.has(t.id)) {
          seenUris.add(key);
          seenUris.add(t.id);
          validUniquePool.push({ track: t });
        }
      });
    }

    const randomizedTargets = fisherYatesShuffle(validUniquePool);

    let rounds: RoundData[] = [];

    if (room.gameMode === "survival") {
      room.usedTrackKeys = [];
      room.initialPlayerCount = room.players.length;
      rounds = await generateSurvivalBatch(room, 12);
      room.totalRounds = rounds.length;
      room.roundDuration = getSurvivalRoundDuration(0);
    } else {
      const roundsToGenerate = Math.min(room.totalRounds, randomizedTargets.length);
      const poolTracks = validUniquePool.map((u) => u.track);
      const usedDistractorKeys = new Set<string>();

      for (let i = 0; i < roundsToGenerate; i++) {
        const item = randomizedTargets[i];
        const target = await ensureVerifiedTrackAudio(item.track);
        const targetTopic = getTrackTopic(target);
        const roundNumber = i + 1;

        const correctOptId = `opt_${roundNumber}_c_${Math.random().toString(36).substring(2, 7)}`;
        const correctOption: RoundOption = {
          id: correctOptId,
          title: target.title,
          artist: target.artist,
          artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
          topic: targetTopic,
        };

        const distractors = await getDifficultDistractors(target, poolTracks, 3, usedDistractorKeys);
        const distractorOptions: RoundOption[] = distractors.map((d, dIdx) => ({
          id: `opt_${roundNumber}_d${dIdx}_${Math.random().toString(36).substring(2, 7)}`,
          title: d.title,
          artist: d.artist,
          artworkUrl: d.artworkUrl,
          topic: d.topic,
        }));

        const options: RoundOption[] = fisherYatesShuffle([correctOption, ...distractorOptions]);
        const correctIndex = options.findIndex((opt) => opt.id === correctOption.id);

        const playerSource = item.playerId ? room.players.find((p) => p.id === item.playerId) : undefined;

        rounds.push({
          roundNumber,
          targetTrack: {
            ...target,
            artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
            topic: targetTopic,
          },
          options,
          correctIndex: correctIndex >= 0 ? correctIndex : 0,
          correctOptionId: correctOption.id,
          correctTrackId: target.id,
          correctTitle: target.title,
          topic: targetTopic,
          contributedByPlayerId: item.playerId,
          contributedByPlayerName: item.playerName || target.sourcePlayerName || playerSource?.name,
          sourceMode: target.sourceMode || playerSource?.injectedModeName,
        });
      }
      room.roundDuration = ROUND_DURATION_SEC;
    }

    // Reset players for new match
    room.players.forEach((p) => {
      p.score = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.lives = 3;
      p.maxLives = 3;
      p.isEliminated = false;
      p.eliminatedAtRound = null;
      p.healedThisRound = false;
      p.lostLifeThisRound = false;
      p.currentAnswer = null;
      p.answersByRound = {};
    });

    room.rounds = rounds;
    room.currentRound = 1;
    room.status = "countdown";
    room.countdownStartTime = now;
    room.countdownEndsAt = now + 3500;
    room.roundStartTime = 0;
    room.roundEndsAt = undefined;
    room.revealStartTime = undefined;
    room.revealEndsAt = undefined;
    room.answersByRound = { 1: {} };
    room.lastActive = now;

    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Submits an answer for a player (atomically protected by withRoomLock).
 * Validates match with optionId === correctOptionId, title strict match, or correctIndex.
 * Guarantees pointsEarned >= 10 for correct answers, and idempotent submission.
 */
export async function submitPlayerAnswer(
  roomOrCode: RoomState | string,
  playerId: string,
  optionIndex: number,
  timeMs: number,
  guessedFriendId?: string,
  roundIndex?: number,
  selectedTitle?: string,
  optionId?: string
): Promise<{ success: boolean; pointsEarned: number; isCorrect: boolean; room?: RoomState }> {
  const code = typeof roomOrCode === "string" ? roomOrCode : roomOrCode.code;

  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) {
      return { success: false, pointsEarned: 0, isCorrect: false };
    }

    if (room.status !== "playing") {
      return { success: false, pointsEarned: 0, isCorrect: false, room };
    }

    // Strict round matching: rejects if roundIndex does not match currentRound
    if (typeof roundIndex === "number" && roundIndex !== room.currentRound) {
      return { success: false, pointsEarned: 0, isCorrect: false, room };
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      return { success: false, pointsEarned: 0, isCorrect: false, room };
    }

    if (player.isEliminated) {
      return { success: false, pointsEarned: 0, isCorrect: false, room };
    }

    if (!room.answersByRound) {
      room.answersByRound = {};
    }
    if (!room.answersByRound[room.currentRound]) {
      room.answersByRound[room.currentRound] = {};
    }
    if (!player.answersByRound) {
      player.answersByRound = {};
    }

    // Idempotent duplicate check
    const existingAnswer =
      room.answersByRound[room.currentRound][playerId] || player.answersByRound[room.currentRound];
    if (existingAnswer) {
      return {
        success: true,
        pointsEarned: existingAnswer.pointsEarned,
        isCorrect: existingAnswer.isCorrect,
        room,
      };
    }

    const round = room.rounds[room.currentRound - 1];
    if (!round) {
      return { success: false, pointsEarned: 0, isCorrect: false, room };
    }

    // 1) optionId === correctOptionId, 2) matchSongTitleStrict, 3) optionIndex === correctIndex
    let isCorrect = false;
    if (optionId && round.correctOptionId && optionId === round.correctOptionId) {
      isCorrect = true;
    } else if (selectedTitle && typeof selectedTitle === "string" && round.correctTitle) {
      isCorrect = matchSongTitleStrict(selectedTitle, round.correctTitle);
    } else {
      isCorrect = optionIndex === round.correctIndex;
    }

    let points = 0;
    const duration =
      room.roundDuration ||
      (room.gameMode === "survival" ? getSurvivalRoundDuration(room.currentRound - 1) : ROUND_DURATION_SEC);

    if (isCorrect) {
      const elapsedSec = Math.max(0, timeMs / 1000);
      let basePoints = calculateRoundPoints(true, elapsedSec, duration);
      // Guarantee pointsEarned >= 10 on correct answer
      if (basePoints < 10) {
        basePoints = 10;
      }

      if (room.gameMode === "survival" && room.currentRound - 1 >= 9) {
        basePoints = Math.round(basePoints * 1.5);
      }

      let friendBonus = 0;
      if (
        room.gameMode === "who_listens" &&
        guessedFriendId &&
        round.contributedByPlayerId &&
        guessedFriendId === round.contributedByPlayerId
      ) {
        friendBonus = 50;
      }

      points = basePoints + friendBonus;
      player.score += points;
      player.streak += 1;
      player.maxStreak = Math.max(player.maxStreak || 0, player.streak);

      if (room.gameMode === "survival") {
        player.lostLifeThisRound = false;
        if (player.streak > 0 && player.streak % 3 === 0 && player.lives < 3) {
          player.lives = Math.min(3, player.lives + 1);
          player.healedThisRound = true;
        } else {
          player.healedThisRound = false;
        }
      }
    } else {
      player.streak = 0;
      if (room.gameMode === "survival") {
        player.lives = Math.max(0, player.lives - 1);
        player.lostLifeThisRound = true;
        player.healedThisRound = false;
        if (player.lives === 0) {
          player.isEliminated = true;
          player.eliminatedAtRound = room.currentRound;
        }
      }
    }

    const answerRecord: PlayerAnswerRecord = {
      roundIndex: room.currentRound,
      optionIndex,
      timeMs,
      pointsEarned: points,
      isCorrect,
      guessedFriendId,
      selectedTitle,
      optionId,
    };

    player.currentAnswer = answerRecord;
    player.answersByRound[room.currentRound] = answerRecord;
    room.answersByRound[room.currentRound][playerId] = answerRecord;

    // Check if all active connected eligible players have answered
    const activeEligiblePlayers =
      room.gameMode === "survival"
        ? room.players.filter((p) => p.isConnected !== false && p.isOnline !== false && !p.isEliminated)
        : room.players.filter((p) => p.isConnected !== false && p.isOnline !== false);

    const roundMap = room.answersByRound[room.currentRound];
    const allAnswered =
      activeEligiblePlayers.length > 0 &&
      activeEligiblePlayers.every((p) => p.currentAnswer !== null || Boolean(roundMap[p.id]));

    if (allAnswered) {
      const now = Date.now();
      room.status = "round_reveal";
      room.revealStartTime = now;
      room.revealEndsAt = now + REVEAL_DURATION_MS;
      room.roundStartTime = 0;
      room.roundEndsAt = undefined;
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, pointsEarned: points, isCorrect, room };
  });
}

/**
 * Authoritatively advances the room to the next round or finishes the game (withRoomLock).
 */
export async function advanceRoomRound(
  code: string,
  playerId: string,
  expectedRoundIndex: number
): Promise<{ success: boolean; room?: RoomState }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false };

    if (room.status !== "round_reveal") {
      return { success: true, room };
    }

    if (room.currentRound !== expectedRoundIndex) {
      return { success: true, room };
    }

    const now = Date.now();
    room.revealStartTime = undefined;
    room.revealEndsAt = undefined;

    if (room.gameMode === "survival") {
      const initialCount = room.initialPlayerCount || room.players.length;
      const alivePlayers = room.players.filter((p) => !p.isEliminated);
      const shouldFinish = initialCount >= 2 ? alivePlayers.length <= 1 : alivePlayers.length === 0;

      if (shouldFinish) {
        room.status = "finished";
      } else {
        if (room.rounds.length - room.currentRound <= 4) {
          try {
            const nextBatch = await generateSurvivalBatch(room, 10);
            room.rounds.push(...nextBatch);
            room.totalRounds = room.rounds.length;
          } catch (err) {
            console.error("[Survival] Error generating next batch:", err);
          }
        }

        room.currentRound += 1;
        room.status = "playing";
        room.roundStartTime = now;
        room.roundDuration = getSurvivalRoundDuration(room.currentRound - 1);
        room.roundEndsAt = now + room.roundDuration * 1000;

        if (!room.answersByRound) room.answersByRound = {};
        room.answersByRound[room.currentRound] = {};

        room.players.forEach((p) => {
          p.currentAnswer = null;
          p.healedThisRound = false;
          p.lostLifeThisRound = false;
        });
      }
    } else {
      if (room.currentRound < room.rounds.length) {
        room.currentRound += 1;
        room.status = "playing";
        room.roundStartTime = now;
        room.roundEndsAt = now + (room.roundDuration || ROUND_DURATION_SEC) * 1000;

        if (!room.answersByRound) room.answersByRound = {};
        room.answersByRound[room.currentRound] = {};

        room.players.forEach((p) => {
          p.currentAnswer = null;
        });
      } else {
        room.status = "finished";
      }
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Resets the room back to lobby for another game with the same players.
 */
export async function resetRoomToLobby(code: string, hostId: string): Promise<boolean> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room || room.hostId !== hostId) return false;

    room.status = "lobby";
    room.currentRound = 1;
    room.rounds = [];
    room.roundStartTime = 0;
    room.roundEndsAt = undefined;
    room.revealStartTime = undefined;
    room.revealEndsAt = undefined;
    room.countdownStartTime = undefined;
    room.countdownEndsAt = undefined;
    room.answersByRound = { 1: {} };

    room.players.forEach((p) => {
      p.score = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.lives = 3;
      p.maxLives = 3;
      p.isEliminated = false;
      p.eliminatedAtRound = null;
      p.healedThisRound = false;
      p.lostLifeThisRound = false;
      p.currentAnswer = null;
      p.answersByRound = {};
      p.votedTheme = null;
    });

    room.lastActive = Date.now();
    await saveRoom(room);
    return true;
  });
}

/**
 * Kicks a player from the room and adds to kicked list (Host only).
 */
export async function kickPlayer(
  code: string,
  hostId: string,
  targetPlayerId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede expulsar jugadores." };
    if (targetPlayerId === hostId) return { success: false, error: "El anfitrión no puede expulsarse a sí mismo." };

    await removePlayerHeartbeat(code, targetPlayerId);

    if (!room.kickedPlayerIds) room.kickedPlayerIds = [];
    if (!room.kickedPlayerIds.includes(targetPlayerId)) {
      room.kickedPlayerIds.push(targetPlayerId);
    }

    room.players = room.players.filter((p) => p.id !== targetPlayerId);

    if (room.status === "playing") {
      const activePlayers = room.players.filter((p) => p.isConnected !== false && p.isOnline !== false);
      const allAnswered =
        activePlayers.length > 0 &&
        activePlayers.every((p) => p.currentAnswer !== null);
      if (allAnswered) {
        room.status = "round_reveal";
        room.revealStartTime = Date.now();
        room.revealEndsAt = Date.now() + REVEAL_DURATION_MS;
      }
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Transfers host leadership to another player in the room (Host only).
 */
export async function transferHost(
  code: string,
  hostId: string,
  targetPlayerId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede transferir la sala." };

    const target = room.players.find((p) => p.id === targetPlayerId);
    if (!target) return { success: false, error: "Jugador no encontrado en la sala." };

    const prevHost = room.players.find((p) => p.id === hostId);
    if (prevHost) prevHost.isHost = false;

    target.isHost = true;
    room.hostId = targetPlayerId;

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

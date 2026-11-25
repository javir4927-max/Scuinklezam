if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { Redis } from "@upstash/redis";
import { SpotifyTrackItem, FALLBACK_SPOTIFY_TRACKS, getFallbackArtwork } from "./spotifyTypes";
import { searchVerifiedTracks, searchStrictArtistTracks, resolveAudioStream } from "./musicService";
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
  | "survival"
  | "speed_chaos"
  | "buzzer"
  | "intro_flash";

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
  avatarUrl?: string;
  rankTier?: string;
  equippedTitle?: string;
  wins?: number;
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
  playbackRate?: number;
  speedEffect?: "sped_up" | "slowed";
  speedLabel?: string;
  buzzerWinnerId?: string;
  buzzerWinnerName?: string;
}

export interface RoomPlaylist {
  id: string;
  name: string;
  imageUrl?: string;
  type?: "playlist" | "album" | "artist";
  trackCount: number;
  addedByPlayerId: string;
  addedByPlayerName?: string;
  tracks: SpotifyTrackItem[];
}

export interface RoomState {
  code: string;
  hostId: string;
  name: string;
  version: number;
  status: "lobby" | "countdown" | "voting" | "playing" | "round_reveal" | "finished";
  gameMode: GameMode;
  guessType: GuessType;
  blindMode?: boolean;
  matchWinnerAwarded?: boolean;
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
  themeVotes?: Record<string, string>;
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

export interface RoomPoolData {
  injectedByPlayer: Record<string, SpotifyTrackItem[]>;
  playlistTracksById: Record<string, SpotifyTrackItem[]>;
  usedTrackKeys: string[];
}

export interface RoomMeta {
  v: number;
  s: RoomState["status"];
  end: number;
}

// Global in-memory storage fallback
declare global {
  // eslint-disable-next-line no-var
  var __scuinklezamRooms: Map<string, RoomState> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamHeartbeats: Map<string, Map<string, number>> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamLocks: Map<string, Promise<any>> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamRoomPools: Map<string, RoomPoolData> | undefined;
  // eslint-disable-next-line no-var
  var __scuinklezamRoomMetas: Map<string, RoomMeta> | undefined;
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
if (!global.__scuinklezamRoomPools) {
  global.__scuinklezamRoomPools = new Map<string, RoomPoolData>();
}
if (!global.__scuinklezamRoomMetas) {
  global.__scuinklezamRoomMetas = new Map<string, RoomMeta>();
}

const rooms = global.__scuinklezamRooms;
const inMemoryHeartbeats = global.__scuinklezamHeartbeats;
const inMemoryLocks = global.__scuinklezamLocks;
const inMemoryRoomPools = global.__scuinklezamRoomPools;
const inMemoryRoomMetas = global.__scuinklezamRoomMetas;

export async function getRoomPool(code: string): Promise<RoomPoolData> {
  const upperCode = code.toUpperCase().trim();
  if (redis) {
    try {
      const data = await redis.get<RoomPoolData>(`scuinklezam:room_pool:${upperCode}`);
      if (data) {
        return {
          injectedByPlayer: data.injectedByPlayer || {},
          playlistTracksById: data.playlistTracksById || {},
          usedTrackKeys: Array.isArray(data.usedTrackKeys) ? data.usedTrackKeys : [],
        };
      }
    } catch (e) {
      console.error("[getRoomPool] Redis error:", e);
    }
  }
  const mem = inMemoryRoomPools.get(upperCode);
  return {
    injectedByPlayer: mem?.injectedByPlayer ? { ...mem.injectedByPlayer } : {},
    playlistTracksById: mem?.playlistTracksById ? { ...mem.playlistTracksById } : {},
    usedTrackKeys: mem?.usedTrackKeys ? [...mem.usedTrackKeys] : [],
  };
}

export async function saveRoomPool(code: string, pool: RoomPoolData): Promise<void> {
  const upperCode = code.toUpperCase().trim();
  const sanitized: RoomPoolData = {
    injectedByPlayer: pool.injectedByPlayer || {},
    playlistTracksById: pool.playlistTracksById || {},
    usedTrackKeys: Array.isArray(pool.usedTrackKeys) ? pool.usedTrackKeys.slice(-600) : [],
  };
  inMemoryRoomPools.set(upperCode, sanitized);
  if (redis) {
    try {
      await redis.set(`scuinklezam:room_pool:${upperCode}`, sanitized, { ex: 7200 });
    } catch (e) {
      console.error("[saveRoomPool] Redis error:", e);
    }
  }
}

export async function checkRoomUnchanged(
  code: string,
  clientVersion: number,
  activePlayerId?: string,
  touchHeartbeat = false
): Promise<{ unchanged: boolean; notFound?: boolean; version?: number }> {
  const upperCode = code.toUpperCase().trim();

  let meta: RoomMeta | null | undefined = null;
  if (redis) {
    try {
      meta = await redis.get<RoomMeta>(`scuinklezam:room_meta:${upperCode}`);
      if (meta) {
        inMemoryRoomMetas.set(upperCode, meta);
      }
    } catch (e) {
      console.error("[checkRoomUnchanged] Redis error reading room_meta:", e);
      meta = inMemoryRoomMetas.get(upperCode);
    }
  } else {
    meta = inMemoryRoomMetas.get(upperCode);
  }

  if (!meta) {
    return { unchanged: false, notFound: true };
  }

  if (touchHeartbeat && activePlayerId && meta.s !== "finished") {
    await updatePlayerHeartbeat(upperCode, activePlayerId).catch(() => {});
  }

  if (clientVersion > 0 && meta.v === clientVersion && (meta.end === 0 || Date.now() < meta.end)) {
    return { unchanged: true, version: meta.v };
  }
  return { unchanged: false, version: meta.v };
}

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
  const lockTimeoutMs = 8000;
  const maxWaitMs = 5000;
  const retryIntervalMs = 150;

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
 * Helper to process items in parallel chunks to prevent CDN rate limits
 */
async function processInChunks<T, R>(items: T[], chunkSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

const lastRedisHbWrite = new Map<string, number>();

/**
 * Updates player heartbeat in separate Redis Hash room:${code}:heartbeats (3h expiration).
 * Throttles Redis hset writes to at most once per 4000ms per player unless force=true.
 */
export async function updatePlayerHeartbeat(code: string, playerId: string, force = false): Promise<void> {
  const upperCode = code.toUpperCase().trim();
  const now = Date.now();
  const throttleKey = `${upperCode}:${playerId}`;
  const lastWrite = lastRedisHbWrite.get(throttleKey) || 0;

  if (redis && (force || now - lastWrite >= 12000)) {
    lastRedisHbWrite.set(throttleKey, now);
    try {
      const hbKey = `room:${upperCode}:heartbeats`;
      await redis.hset(hbKey, { [playerId]: now });
      if (force) {
        await redis.expire(hbKey, 10800); // 3 hours
      }
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

export const CHAOS_SPEED_PRESETS = [
  { rate: 0.5, label: "ULTRA LENTA x0.5", effect: "slowed" as const },
  { rate: 0.65, label: "MODO DEMONIO x0.65", effect: "slowed" as const },
  { rate: 0.78, label: "LENTA x0.78", effect: "slowed" as const },
  { rate: 1.35, label: "ACELERADA x1.35", effect: "sped_up" as const },
  { rate: 1.65, label: "TURBO x1.65", effect: "sped_up" as const },
  { rate: 2.0, label: "DOBLE x2.0", effect: "sped_up" as const },
  { rate: 2.5, label: "ARDILLA x2.5", effect: "sped_up" as const },
  { rate: 3.0, label: "HIPERVELOCIDAD x3.0", effect: "sped_up" as const },
];

export function modeRequiresPlayerMusic(gameMode: GameMode): boolean {
  return gameMode !== "top50" && gameMode !== "vote" && gameMode !== "random";
}

export function hasPlayerContributedMusic(player: Player, playlists?: RoomPlaylist[]): boolean {
  const hasArtists = Array.isArray(player.favoriteArtists) && player.favoriteArtists.some((a) => a.trim().length > 0);
  const hasSpotifyTracks =
    (Array.isArray(player.injectedTracks) && player.injectedTracks.length > 0) ||
    (player.injectedTracksCount || 0) > 0;
  const hasPlaylist =
    Array.isArray(playlists) &&
    playlists.some(
      (pl) =>
        pl.addedByPlayerId === player.id &&
        ((Array.isArray(pl.tracks) && pl.tracks.length > 0) || (pl.trackCount || 0) > 0)
    );
  return hasArtists || hasSpotifyTracks || hasPlaylist;
}

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
 * Fast stream validation for audio URLs (2s timeout) using HTTP GET with Range: bytes=0-1.
 * Confirms real bytes download and excludes text/html error pages.
 * Returns true if status is 200 or 206 and content-type is not text/html.
 */
export async function validateAudioUrl(url: string | null | undefined): Promise<boolean> {
  if (!url || typeof url !== "string" || !url.startsWith("http")) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1", "User-Agent": "Scuinklezam/1.0" },
      signal: AbortSignal.timeout(2000),
    });
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) return false;
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

/**
 * Ensures a track has a valid, working audio preview URL.
 * Validates with Range: bytes=0-1. If broken or missing, refreshes via resolveAudioStream.
 * Returns null if after all attempts the audio cannot be verified with 200/206.
 */
export async function ensureVerifiedTrackAudio(track: SpotifyTrackItem): Promise<SpotifyTrackItem | null> {
  if (!track || !track.title) return null;
  const result = { ...track };

  // 1. If track already has previewUrl, validate it with real stream test
  if (result.previewUrl && typeof result.previewUrl === "string" && result.previewUrl.startsWith("http")) {
    const isValid = await validateAudioUrl(result.previewUrl);
    if (isValid) {
      return result;
    }
  }

  // 2. If missing or invalid, resolve fresh stream via resolveAudioStream (iTunes ES/US + Deezer no-store)
  try {
    const fresh = await resolveAudioStream(result.title, result.artist);
    if (fresh?.previewUrl) {
      const isValid = await validateAudioUrl(fresh.previewUrl);
      if (isValid) {
        result.previewUrl = fresh.previewUrl;
        if (fresh.artworkUrl) result.artworkUrl = fresh.artworkUrl;
        return result;
      }
    }
  } catch {}

  // If audio cannot be verified, strictly discard by returning null
  return null;
}

/**
 * Iterates through candidate pool in batches of 5 and collects tracks with 100% verified live audio.
 * Discards any candidate whose audio fails, automatically pulling the next candidate until
 * neededCount is satisfied or pool is exhausted.
 */
export async function collectVerifiedTargets(
  candidates: SpotifyTrackItem[],
  neededCount: number,
  fallbackPool: SpotifyTrackItem[] = FALLBACK_SPOTIFY_TRACKS
): Promise<SpotifyTrackItem[]> {
  const verified: SpotifyTrackItem[] = [];
  const seenKeys = new Set<string>();

  const pool = [...candidates];
  for (const fb of fallbackPool) {
    pool.push(fb);
  }

  const batchSize = 5;
  let index = 0;

  while (verified.length < neededCount && index < pool.length) {
    const chunk = pool.slice(index, index + batchSize);
    index += batchSize;

    const validatedChunk = await Promise.all(
      chunk.map(async (t) => {
        if (!t || !t.title) return null;
        const key = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${(t.artist || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        if (seenKeys.has(key)) return null;
        const checked = await ensureVerifiedTrackAudio(t);
        if (checked) {
          seenKeys.add(key);
          return checked;
        }
        return null;
      })
    );

    for (const item of validatedChunk) {
      if (item && verified.length < neededCount) {
        verified.push(item);
      }
    }
  }

  return verified;
}

/**
 * Iterates through candidate target objects in batches of 5 and collects items with 100% verified live audio.
 * Preserves metadata such as playerId, playerName, etc.
 */
export async function collectVerifiedTargetObjects<T extends { track: SpotifyTrackItem }>(
  candidates: T[],
  neededCount: number,
  fallbackPool: SpotifyTrackItem[] = FALLBACK_SPOTIFY_TRACKS
): Promise<T[]> {
  const verified: T[] = [];
  const seenKeys = new Set<string>();

  const pool = [...candidates];
  for (const fb of fallbackPool) {
    pool.push({ track: fb } as T);
  }

  const batchSize = 5;
  let index = 0;

  while (verified.length < neededCount && index < pool.length) {
    const chunk = pool.slice(index, index + batchSize);
    index += batchSize;

    const validatedChunk = await Promise.all(
      chunk.map(async (item) => {
        const t = item?.track;
        if (!t || !t.title) return null;
        const key = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${(t.artist || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        if (seenKeys.has(key)) return null;
        const checked = await ensureVerifiedTrackAudio(t);
        if (checked) {
          seenKeys.add(key);
          return { ...item, track: checked };
        }
        return null;
      })
    );

    for (const validItem of validatedChunk) {
      if (validItem && verified.length < neededCount) {
        verified.push(validItem);
      }
    }
  }

  return verified;
}

/**
 * Builds coherent, audio-verified rounds for a specified theme/artist query.
 */
export async function buildRoundsForTheme(
  themeQuery: string,
  totalRounds = 10,
  usedTrackKeysInput?: Set<string> | string[]
): Promise<RoundData[]> {
  const candidatePool: SpotifyTrackItem[] = [];
  const searchPromises: Promise<SpotifyTrackItem[]>[] = [
    searchVerifiedTracks(themeQuery, 20),
  ];

  // Also query specific artist terms if query has multiple words
  const terms = themeQuery.split(/\s+/).filter((w) => w.length > 2).slice(0, 5);
  for (const term of terms) {
    searchPromises.push(searchStrictArtistTracks(term, 8));
  }

  const settled = await Promise.allSettled(searchPromises);
  for (const res of settled) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      candidatePool.push(...res.value);
    }
  }

  const seen = new Set<string>();
  const uniquePool: SpotifyTrackItem[] = [];
  for (const t of candidatePool) {
    if (!t || !t.previewUrl || !t.previewUrl.startsWith("http") || !t.artworkUrl) continue;
    const key = getTrackKey(t);
    if (!seen.has(key) && !seen.has(t.id)) {
      seen.add(key);
      seen.add(t.id);
      uniquePool.push(t);
    }
  }

  if (uniquePool.length < totalRounds) {
    for (const fb of FALLBACK_SPOTIFY_TRACKS) {
      const key = getTrackKey(fb);
      if (!seen.has(key) && !seen.has(fb.id)) {
        seen.add(key);
        seen.add(fb.id);
        uniquePool.push(fb);
      }
    }
  }

  const usedKeysList: string[] = Array.isArray(usedTrackKeysInput)
    ? usedTrackKeysInput
    : usedTrackKeysInput instanceof Set
    ? Array.from(usedTrackKeysInput)
    : [];

  const targetCandidates = orderPoolBySessionMemory(
    uniquePool,
    (t) => getTrackKey(t),
    usedKeysList
  );

  const verifiedTargets = await collectVerifiedTargets(targetCandidates, totalRounds, uniquePool);

  const usedDistractorKeys = new Set<string>();
  const rounds: RoundData[] = await Promise.all(
    verifiedTargets.map(async (target, i) => {
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

      const distractors = await getDifficultDistractors(target, uniquePool, 3, usedDistractorKeys);
      const distractorOptions: RoundOption[] = distractors.map((d, dIdx) => ({
        id: `opt_${roundNumber}_d${dIdx}_${Math.random().toString(36).substring(2, 7)}`,
        title: d.title,
        artist: d.artist,
        artworkUrl: d.artworkUrl,
        topic: d.topic,
      }));

      const options = fisherYatesShuffle([correctOption, ...distractorOptions]);
      const correctIndex = options.findIndex((opt) => opt.id === correctOption.id);

      return {
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
      };
    })
  );

  return rounds;
}

export interface PlayerCandidateTrack {
  track: SpotifyTrackItem;
  playerId?: string;
  playerName?: string;
  sourceMode?: string;
}

function getTrackKey(t: SpotifyTrackItem): string {
  const normTitle = (t?.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normArtist = (t?.artist || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${normTitle}_${normArtist}`;
}

/**
 * Records played tracks from completed rounds into pool.usedTrackKeys (LRU up to 600 items).
 * Removes prior appearance and appends to end so latest played is at the back.
 */
export function recordPlayedTracksInRoom(room: RoomState, rounds?: RoundData[], pool?: RoomPoolData): void {
  const playedRounds = rounds || (room.rounds ? room.rounds.slice(0, Math.min(room.currentRound, room.rounds.length)) : []);
  if (!playedRounds || playedRounds.length === 0) return;

  const currentUsed = pool?.usedTrackKeys || room.usedTrackKeys || [];
  const history = Array.isArray(currentUsed) ? [...currentUsed] : [];
  for (const r of playedRounds) {
    if (!r?.targetTrack) continue;
    const key = getTrackKey(r.targetTrack);
    const existingIdx = history.indexOf(key);
    if (existingIdx !== -1) {
      history.splice(existingIdx, 1);
    }
    history.push(key);
  }

  const updatedHistory = history.slice(-600);
  if (pool) {
    pool.usedTrackKeys = updatedHistory;
  }
  room.usedTrackKeys = undefined;
}

/**
 * Orders a pool of candidate items strictly prioritizing unplayed items:
 * [unplayed shuffled -> played ordered from oldest played to most recent].
 * Does NOT re-shuffle the combined list to ensure unplayed items are exhausted first.
 */
export function orderPoolBySessionMemory<T>(
  items: T[],
  getKey: (item: T) => string,
  usedTrackKeys: string[] = []
): T[] {
  if (!items || items.length === 0) return [];
  const usedIndexMap = new Map<string, number>();
  usedTrackKeys.forEach((k, idx) => {
    usedIndexMap.set(k, idx);
  });

  const unplayed: T[] = [];
  const played: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (usedIndexMap.has(key)) {
      played.push(item);
    } else {
      unplayed.push(item);
    }
  }

  // Shuffle unplayed tracks
  const shuffledUnplayed = fisherYatesShuffle(unplayed);

  // Sort played from least recent to most recent (lowest index in usedTrackKeys = played longer ago)
  played.sort((a, b) => {
    const idxA = usedIndexMap.get(getKey(a)) ?? 0;
    const idxB = usedIndexMap.get(getKey(b)) ?? 0;
    return idxA - idxB;
  });

  // Soft shuffle in small blocks of 5-6 to avoid rigid repetition while preserving LRU tiers
  const blockSize = 5;
  const chunkedPlayed: T[] = [];
  for (let i = 0; i < played.length; i += blockSize) {
    const chunk = played.slice(i, i + blockSize);
    chunkedPlayed.push(...fisherYatesShuffle(chunk));
  }

  return [...shuffledUnplayed, ...chunkedPlayed];
}

/**
 * Builds isolated, balanced candidate buckets per player in the room.
 * Ensures fair manual artist track fetching per player, fair deduplication, and
 * session memory ordering [unplayed -> LRU played] per player bucket.
 */
export async function buildPlayerTrackBuckets(
  room: RoomState,
  usedTrackKeysInput?: Set<string> | string[],
  poolInput?: RoomPoolData
): Promise<{
  buckets: Map<string, PlayerCandidateTrack[]>;
  allPoolTracks: SpotifyTrackItem[];
}> {
  const pool = poolInput || (await getRoomPool(room.code));
  const usedKeysList: string[] = Array.isArray(usedTrackKeysInput)
    ? usedTrackKeysInput
    : usedTrackKeysInput instanceof Set
    ? Array.from(usedTrackKeysInput)
    : Array.isArray(pool.usedTrackKeys)
    ? pool.usedTrackKeys
    : Array.isArray(room.usedTrackKeys)
    ? room.usedTrackKeys
    : [];
  const usedKeysSet = new Set<string>(usedKeysList);

  const buckets = new Map<string, PlayerCandidateTrack[]>();
  room.players.forEach((p) => {
    buckets.set(p.id, []);
  });

  // 1. Injected tracks and custom playlists per player
  room.players.forEach((p) => {
    const pBucket = buckets.get(p.id)!;
    const seenPKeys = new Set<string>();

    const addTrack = (t: SpotifyTrackItem, src: string) => {
      if (!t || !t.previewUrl || !t.previewUrl.startsWith("http") || !t.artworkUrl) return;
      const k = getTrackKey(t);
      const id = t.id || k;
      if (seenPKeys.has(k) || seenPKeys.has(id)) return;
      seenPKeys.add(k);
      seenPKeys.add(id);
      pBucket.push({
        track: t,
        playerId: p.id,
        playerName: p.name,
        sourceMode: t.sourceMode || src,
      });
    };

    const injectedTracks = pool.injectedByPlayer[p.id] || p.injectedTracks || [];
    if (injectedTracks.length > 0) {
      injectedTracks.forEach((t) => addTrack(t, p.injectedModeName || "Spotify"));
    }

    if (room.playlists && room.playlists.length > 0) {
      room.playlists.forEach((pl) => {
        if (pl.addedByPlayerId === p.id) {
          const plTracks = pool.playlistTracksById[pl.id] || pl.tracks || [];
          if (plTracks.length > 0) {
            plTracks.forEach((t) => addTrack(t, pl.name || "Playlist"));
          }
        }
      });
    }
  });

  // 2. Fix de artistas manuales por jugador (en paralelo por cada jugador si canciones inéditas < 12)
  await Promise.all(
    room.players.map(async (p) => {
      const pBucket = buckets.get(p.id) || [];
      const artists = (p.favoriteArtists || []).filter((a) => a && a.trim().length > 0);
      if (artists.length === 0) return;

      const unplayedCount = pBucket.filter((item) => {
        const k = getTrackKey(item.track);
        return !usedKeysSet.has(item.track.id) && !usedKeysSet.has(k);
      }).length;

      if (unplayedCount < 12) {
        const searchPromises = artists.slice(0, 6).map((artist) => searchStrictArtistTracks(artist, 12));
        const results = await Promise.allSettled(searchPromises);

        const seenPKeys = new Set<string>();
        pBucket.forEach((item) => {
          seenPKeys.add(getTrackKey(item.track));
          if (item.track.id) seenPKeys.add(item.track.id);
        });

        for (const res of results) {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            for (const t of res.value) {
              if (t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl) {
                const k = getTrackKey(t);
                const id = t.id || k;
                if (!seenPKeys.has(k) && !seenPKeys.has(id)) {
                  seenPKeys.add(k);
                  seenPKeys.add(id);
                  pBucket.push({
                    track: t,
                    playerId: p.id,
                    playerName: p.name,
                    sourceMode: "Artistas favoritos",
                  });
                }
              }
            }
          }
        }
      }
    })
  );

  // 3. Deduplicación justa entre jugadores
  const trackOwners = new Map<string, Array<{ playerId: string; item: PlayerCandidateTrack }>>();
  buckets.forEach((tracks, playerId) => {
    tracks.forEach((item) => {
      const k = getTrackKey(item.track);
      if (!trackOwners.has(k)) {
        trackOwners.set(k, []);
      }
      trackOwners.get(k)!.push({ playerId, item });
    });
  });

  const chosenPlayerPerTrackKey = new Map<string, string>();
  trackOwners.forEach((owners, key) => {
    if (owners.length === 1) {
      chosenPlayerPerTrackKey.set(key, owners[0].playerId);
    } else {
      const randomIdx = Math.floor(Math.random() * owners.length);
      chosenPlayerPerTrackKey.set(key, owners[randomIdx].playerId);
    }
  });

  // 4. Ordena cada cubeta de forma aislada: [inéditas barajadas -> jugadas LRU]
  buckets.forEach((tracks, playerId) => {
    const deduplicated = tracks.filter((item) => {
      const k = getTrackKey(item.track);
      return chosenPlayerPerTrackKey.get(k) === playerId;
    });
    const ordered = orderPoolBySessionMemory(
      deduplicated,
      (item) => getTrackKey(item.track),
      usedKeysList
    );
    buckets.set(playerId, ordered);
  });

  // 5. Gather allPoolTracks
  const allPoolTracksMap = new Map<string, SpotifyTrackItem>();
  buckets.forEach((tracks) => {
    tracks.forEach((item) => {
      const k = getTrackKey(item.track);
      if (!allPoolTracksMap.has(k)) {
        allPoolTracksMap.set(k, item.track);
      }
    });
  });

  // Fallback si la sala entera no tenía ninguna canción cargada por ningún jugador
  if (allPoolTracksMap.size === 0) {
    const fallbackArtists = ["Quevedo", "Bad Bunny", "Duki", "Aitana", "Saiko", "Feid"];
    const fallbackResults = await Promise.allSettled(
      fallbackArtists.map((artist) => searchStrictArtistTracks(artist, 12))
    );
    for (const res of fallbackResults) {
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        for (const t of res.value) {
          if (t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl) {
            allPoolTracksMap.set(getTrackKey(t), t);
          }
        }
      }
    }
    for (const fb of FALLBACK_SPOTIFY_TRACKS) {
      allPoolTracksMap.set(getTrackKey(fb), fb);
    }

    const fallbackList = Array.from(allPoolTracksMap.values());
    if (room.players.length > 0) {
      let pIdx = 0;
      for (const t of fallbackList) {
        const p = room.players[pIdx % room.players.length];
        const pBucket = buckets.get(p.id) || [];
        pBucket.push({
          track: t,
          playerId: p.id,
          playerName: p.name,
          sourceMode: "Éxitos recomendados",
        });
        buckets.set(p.id, pBucket);
        pIdx++;
      }
      buckets.forEach((tracks, playerId) => {
        const ordered = orderPoolBySessionMemory(
          tracks,
          (item) => getTrackKey(item.track),
          usedKeysList
        );
        buckets.set(playerId, ordered);
      });
    }
  }

  const allPoolTracks = Array.from(allPoolTracksMap.values());
  return { buckets, allPoolTracks };
}

/**
 * Interleaves songs fairly in round-robin shuffled cycles.
 * Prevents streaks between cycles.
 */
export function interleavePlayerBucketsFairly(
  buckets: Map<string, PlayerCandidateTrack[]>,
  lastPlayerId?: string
): PlayerCandidateTrack[] {
  const queues = new Map<string, PlayerCandidateTrack[]>();
  buckets.forEach((tracks, playerId) => {
    queues.set(playerId, [...tracks]);
  });

  const result: PlayerCandidateTrack[] = [];
  let previousPlayerId: string | undefined = lastPlayerId;

  while (true) {
    const activePlayerIds = Array.from(queues.keys()).filter(
      (pid) => (queues.get(pid)?.length || 0) > 0
    );
    if (activePlayerIds.length === 0) break;

    const cycleIds = fisherYatesShuffle(activePlayerIds);

    // Anti-streak rule between cycles:
    // If >= 2 players available and cycleIds[0] === previousPlayerId,
    // swap cycleIds[0] with another player in cycleIds[1..n]
    if (cycleIds.length >= 2 && cycleIds[0] === previousPlayerId) {
      const swapIndex = 1 + Math.floor(Math.random() * (cycleIds.length - 1));
      const temp = cycleIds[0];
      cycleIds[0] = cycleIds[swapIndex];
      cycleIds[swapIndex] = temp;
    }

    for (const pid of cycleIds) {
      const q = queues.get(pid);
      if (q && q.length > 0) {
        const item = q.shift()!;
        result.push(item);
        previousPlayerId = pid;
      }
    }
  }

  return result;
}

/**
 * Post-verification smoother that eliminates adjacent tracks by the same player.
 */
export function smoothVerifiedOrder<T extends { playerId?: string }>(
  items: T[],
  lastPlayerId?: string
): T[] {
  const result = [...items];
  let prevId = lastPlayerId;

  for (let i = 0; i < result.length; i++) {
    const currentId = result[i].playerId;
    if (currentId && prevId && currentId === prevId) {
      const swapIdx = result.findIndex(
        (item, idx) => idx > i && item.playerId && item.playerId !== prevId
      );
      if (swapIdx !== -1) {
        const temp = result[i];
        result[i] = result[swapIdx];
        result[swapIdx] = temp;
      }
    }
    prevId = result[i].playerId;
  }

  return result;
}

/**
 * Generates an infinite batch of coherent, audio-verified rounds for Survival mode.
 * Excludes already played tracks (using room.usedTrackKeys).
 * Guarantees unique option IDs and tracks usedDistractorKeys across rounds.
 */
export async function generateSurvivalBatch(room: RoomState, count: number = 10): Promise<RoundData[]> {
  const pool = await getRoomPool(room.code);
  const usedKeys = new Set<string>(pool.usedTrackKeys || room.usedTrackKeys || []);
  const usedDistractorKeys = new Set<string>();
  const startRoundNumber = room.rounds.length + 1;

  const lastRound = room.rounds[room.rounds.length - 1];
  const lastPlayerId = lastRound?.contributedByPlayerId;

  const { buckets, allPoolTracks } = await buildPlayerTrackBuckets(room, usedKeys, pool);
  const interleaved = interleavePlayerBucketsFairly(buckets, lastPlayerId);

  const poolTracks = allPoolTracks.length >= count * 2
    ? allPoolTracks
    : [...allPoolTracks, ...FALLBACK_SPOTIFY_TRACKS];

  const verifiedTargetObjects = await collectVerifiedTargetObjects(
    interleaved,
    count,
    poolTracks
  );
  const smoothedTargets = smoothVerifiedOrder(verifiedTargetObjects, lastPlayerId);

  const newRounds: RoundData[] = await Promise.all(
    smoothedTargets.map(async (item, i) => {
      const target = item.track;
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

      const distractors = await getDifficultDistractors(
        target,
        poolTracks,
        3,
        usedDistractorKeys
      );
      const distractorOptions: RoundOption[] = distractors.map((d, dIdx) => ({
        id: `opt_${roundNumber}_d${dIdx}_${Math.random().toString(36).substring(2, 7)}`,
        title: d.title,
        artist: d.artist,
        artworkUrl: d.artworkUrl,
        topic: d.topic,
      }));

      const options: RoundOption[] = fisherYatesShuffle([correctOption, ...distractorOptions]);
      const correctIndex = options.findIndex((opt) => opt.id === correctOption.id);

      const key = getTrackKey(target);
      usedKeys.add(key);
      if (target.id) usedKeys.add(target.id);

      const playerSource = item.playerId ? room.players.find((p) => p.id === item.playerId) : undefined;

      return {
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
        contributedByPlayerName: item.playerName || target.sourcePlayerName || playerSource?.name || "Scuinklezam",
        sourceMode: item.sourceMode || target.sourceMode || playerSource?.injectedModeName || "Spotify",
      };
    })
  );

  pool.usedTrackKeys = Array.from(usedKeys).slice(-600);
  await saveRoomPool(room.code, pool);
  return newRounds;
}

export async function buildRoundsFromTracks(tracks: SpotifyTrackItem[], totalRounds: number): Promise<RoundData[]> {
  const valid = tracks.filter((t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl);
  const catalog = valid.length >= 4 ? valid : FALLBACK_SPOTIFY_TRACKS;
  const shuffled = fisherYatesShuffle(catalog);

  const verifiedTargets = await collectVerifiedTargets(shuffled, totalRounds, catalog);
  const usedDistractorKeys = new Set<string>();

  const rounds: RoundData[] = await Promise.all(
    verifiedTargets.map(async (target, i) => {
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

      return {
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
      };
    })
  );

  return rounds;
}

/**
 * Persists room state in Upstash Redis and in-memory cache with monotonic version increment,
 * saving an ultra-compact ~50 bytes room_meta for lightweight polling and ensuring heavy
 * track arrays (injectedTracks, playlists[].tracks, usedTrackKeys) never bloat the room object.
 */
export async function saveRoom(room: RoomState): Promise<void> {
  room.version = (room.version || 0) + 1;
  const code = room.code.toUpperCase().trim();

  // 1. Calculate next active timer deadline for ultra-fast polling check
  let nextDeadline = 0;
  if (room.status === "countdown" && room.countdownEndsAt) nextDeadline = room.countdownEndsAt;
  else if (room.status === "voting" && room.votingEndsAt) nextDeadline = room.votingEndsAt;
  else if (room.status === "playing" && room.roundEndsAt) nextDeadline = room.roundEndsAt;
  else if (room.status === "round_reveal" && room.revealEndsAt) nextDeadline = room.revealEndsAt;

  const meta: RoomMeta = {
    v: room.version,
    s: room.status,
    end: nextDeadline,
  };
  inMemoryRoomMetas.set(code, meta);

  // 2. Safety net: strip heavy track arrays and oversize avatars before saving to Redis
  if (Array.isArray(room.players)) {
    for (const p of room.players) {
      if (p.injectedTracks !== undefined) {
        if (!p.injectedTracksCount && Array.isArray(p.injectedTracks)) {
          p.injectedTracksCount = p.injectedTracks.length;
        }
        p.injectedTracks = undefined;
      }
      if (p.avatarUrl && p.avatarUrl.startsWith("data:image/") && p.avatarUrl.length > 2048) {
        p.avatarUrl = `/api/user/avatar?uid=${encodeURIComponent(p.id)}`;
      }
    }
  }

  if (Array.isArray(room.playlists)) {
    for (const pl of room.playlists) {
      if (Array.isArray(pl.tracks) && pl.tracks.length > 0) {
        if (!pl.trackCount) pl.trackCount = pl.tracks.length;
        pl.tracks = [];
      }
    }
  }

  room.usedTrackKeys = undefined;

  rooms.set(code, room);
  if (redis) {
    try {
      await Promise.all([
        redis.set(`${ROOM_KEY_PREFIX}${code}`, room, { ex: ROOM_TTL_SECONDS }),
        redis.set(`scuinklezam:room_meta:${code}`, meta, { ex: ROOM_TTL_SECONDS }),
      ]);
    } catch (err) {
      console.error(`[Upstash Redis] Error saving room ${code}:`, err);
    }
  }
}

/**
 * Deletes room state, isolated track pools, and metadata from Upstash Redis and in-memory cache.
 */
export async function deleteRoom(code: string): Promise<void> {
  const upperCode = code.toUpperCase().trim();
  rooms.delete(upperCode);
  inMemoryRoomPools.delete(upperCode);
  inMemoryRoomMetas.delete(upperCode);
  if (redis) {
    try {
      await Promise.all([
        redis.del(`${ROOM_KEY_PREFIX}${upperCode}`),
        redis.del(`scuinklezam:room_pool:${upperCode}`),
        redis.del(`scuinklezam:room_meta:${upperCode}`),
        redis.del(`lock:room:${upperCode}`),
        redis.del(`room:${upperCode}:heartbeats`),
      ]);
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
    } catch (err) {
      console.error(`[Upstash Redis] Error retrieving raw room ${upperCode}:`, err);
    }
  }
  return rooms.get(upperCode) || null;
}

/**
 * Creates a new room with host player and version 1.
 */
export async function createRoom(
  hostName: string,
  hostId: string,
  roomName?: string,
  initialArtists?: string[],
  hostCustomization?: { avatarUrl?: string; rankTier?: string; equippedTitle?: string }
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
    avatarUrl:
      hostCustomization?.avatarUrl && hostCustomization.avatarUrl.startsWith("data:image/") && hostCustomization.avatarUrl.length > 2048
        ? `/api/user/avatar?uid=${encodeURIComponent(hostId)}`
        : hostCustomization?.avatarUrl,
    rankTier: hostCustomization?.rankTier,
    equippedTitle: hostCustomization?.equippedTitle,
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
    wins: 0,
  };

  const newRoom: RoomState = {
    code,
    hostId,
    name: roomName ? roomName.trim() : `Sala de ${cleanHostName}`,
    version: 0,
    status: "lobby",
    gameMode: "blend",
    guessType: "song",
    blindMode: false,
    matchWinnerAwarded: false,
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
  await updatePlayerHeartbeat(code, hostId, true);
  return newRoom;
}

/**
 * Gets a room by code and marks player connectivity.
 * ROUTINE GET POLLING DOES NOT WRITE TO REDIS.
 * Only if a server timer expired or lobby cleanup is required, it locks and advances state atomically.
 */
export async function getRoom(code: string, activePlayerId?: string): Promise<RoomState | null> {
  const upperCode = code.toUpperCase().trim();

  // 1. Read room state read-only first so 404/finished rooms never trigger heartbeat writes
  const room = await getRawRoom(upperCode);
  if (!room) return null;

  // 2. Update heartbeat in independent Redis Hash only when requested and match is not finished
  if (activePlayerId && room.status !== "finished") {
    await updatePlayerHeartbeat(upperCode, activePlayerId);
  }

  const now = Date.now();
  const heartbeats = await getPlayerHeartbeats(upperCode);

  // 3. Mark player connectivity (<= 35000ms is connected, lobby prune threshold 75000ms)
  let anyDisconnectedInLobby = false;
  room.players.forEach((p) => {
    const hb = Number(heartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
    p.isConnected = (now - hb) <= 35000;
    p.isOnline = p.isConnected;
    if (room.status === "lobby" && (now - hb) > 75000) {
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
        p.isConnected = (now - hb) <= 35000;
        p.isOnline = p.isConnected;
      });

      const progressed = await checkRoomStateProgression(freshRoom, freshHeartbeats);
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
 * Authoritatively marks a match as finished, trims played rounds,
 * and increments room wins for the match leader(s) once with idempotency.
 */
export async function finalizeRoomMatch(room: RoomState): Promise<void> {
  room.status = "finished";
  room.rounds = room.rounds.slice(0, Math.min(room.currentRound, room.rounds.length));
  room.totalRounds = room.rounds.length;

  recordPlayedTracksInRoom(room);
  try {
    const pool = await getRoomPool(room.code);
    recordPlayedTracksInRoom(room, room.rounds, pool);
    await saveRoomPool(room.code, pool);
  } catch (err) {
    console.error("[finalizeRoomMatch] Error saving pool used keys:", err);
  }

  if (!room.matchWinnerAwarded && room.players.length > 0) {
    const isSurvival = room.gameMode === "survival";
    const ranked = [...room.players].sort((a, b) => {
      if (isSurvival) {
        if (!a.isEliminated && b.isEliminated) return -1;
        if (a.isEliminated && !b.isEliminated) return 1;
        if (a.isEliminated && b.isEliminated) {
          const roundA = a.eliminatedAtRound ?? 0;
          const roundB = b.eliminatedAtRound ?? 0;
          if (roundB !== roundA) return roundB - roundA;
        }
      }
      return b.score - a.score;
    });

    const top = ranked[0];
    const topHasWon = top && (top.score > 0 || (isSurvival && !top.isEliminated));

    if (topHasWon) {
      const winners = ranked.filter((p) => {
        if (isSurvival) {
          return (
            p.isEliminated === top.isEliminated &&
            p.eliminatedAtRound === top.eliminatedAtRound &&
            p.score === top.score
          );
        }
        return p.score === top.score;
      });

      const winnerIds = new Set(winners.map((w) => w.id));
      room.players.forEach((p) => {
        if (winnerIds.has(p.id)) {
          p.wins = (p.wins || 0) + 1;
        }
      });
    }

    room.matchWinnerAwarded = true;
  }
}

/**
 * Resets all per-match player stats cleanly for a brand-new game or rematch.
 */
function resetRoomPlayersForNewMatch(room: RoomState): void {
  room.matchWinnerAwarded = false;
  room.initialPlayerCount = room.players.length;
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
}

/**
 * Returns true when a survival match should end (last player standing in >=2-player rooms, or 0 alive solo).
 */
function shouldFinishSurvivalMatch(room: RoomState): boolean {
  const initialCount = Math.max(room.initialPlayerCount || 0, room.players.length);
  const alivePlayers = room.players.filter((p) => !p.isEliminated);
  return initialCount >= 2 ? alivePlayers.length <= 1 : alivePlayers.length === 0;
}

/**
 * Configures democratic voting state with 4 random candidates and 10s timer.
 */
function initializeVotingPhase(room: RoomState, now: number): void {
  const candidates: VotingCandidate[] = fisherYatesShuffle(DEMOCRATIC_VOTING_CATALOG)
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      query: item.query,
      icon: item.icon,
      votes: [],
    }));

  room.votingCandidates = candidates;
  room.candidateRounds = {};
  room.status = "voting";
  room.votingStartTime = now;
  room.votingEndsAt = now + 10000;
  room.currentRound = 1;
  room.rounds = [];
  room.answersByRound = { 1: {} };
  room.lastActive = now;
}

/**
 * Progresses room state authoritatively based on timestamps and player responses.
 * Strictly guarantees rooms NEVER loop back to "lobby" automatically.
 */
export async function checkRoomStateProgression(room: RoomState, heartbeats?: Record<string, number>): Promise<boolean> {
  const now = Date.now();
  let changed = false;

  // Sync isConnected if heartbeats provided
  if (heartbeats) {
    room.players.forEach((p) => {
      const hb = Number(heartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
      p.isConnected = (now - hb) <= 35000;
      p.isOnline = p.isConnected;
    });
  }

  // LOBBY: prune disconnected players (>75s)
  if (room.status === "lobby") {
    const beforeCount = room.players.length;
    room.players = room.players.filter((p) => {
      const hb = Number(heartbeats?.[p.id] || p.lastSeen || p.joinedAt || 0);
      return (now - hb) <= 75000;
    });
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
        const sorted = [...room.votingCandidates].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
        const maxVotes = sorted[0].votes?.length || 0;
        const topTied = sorted.filter((c) => (c.votes?.length || 0) === maxVotes);
        winningCandidate = topTied[Math.floor(Math.random() * topTied.length)];
      }

      const winnerName = winningCandidate?.name || "Top 50 España";
      room.winningTheme = winnerName;

      if (winningCandidate && room.candidateRounds && room.candidateRounds[winningCandidate.id] && room.candidateRounds[winningCandidate.id].length > 0) {
        room.rounds = room.candidateRounds[winningCandidate.id];
      } else if (winningCandidate) {
        const pool = await getRoomPool(room.code);
        room.rounds = await buildRoundsForTheme(
          winningCandidate.query || winningCandidate.name,
          room.totalRounds || 10,
          pool.usedTrackKeys || []
        );
      }

      room.candidateRounds = undefined;
      room.status = "countdown";
      room.countdownStartTime = now;
      room.countdownEndsAt = now + 5000; // 5s countdown
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
        const shouldFinish = shouldFinishSurvivalMatch(room);

        if (shouldFinish) {
          await finalizeRoomMatch(room);
        } else {
          // Continuous infinite survival generation
          if (room.rounds.length - room.currentRound <= 4) {
            try {
              const nextBatch = await generateSurvivalBatch(room, 10);
              room.rounds.push(...nextBatch);
              room.totalRounds = room.rounds.length;
            } catch (err) {
              console.error("[Survival progression] Error generating next batch:", err);
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
          await finalizeRoomMatch(room);
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
    avatarUrl?: string;
    rankTier?: string;
    equippedTitle?: string;
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

    await updatePlayerHeartbeat(code, playerData.id, true);

    const existingIndex = room.players.findIndex((p) => p.id === playerData.id);
    const colors = ["#10B981", "#84CC16", "#F59E0B", "#06B6D4", "#EC4899", "#8B5CF6", "#14B8A6"];
    const chosenColor =
      playerData.avatarColor ||
      colors[room.players.length % colors.length];

    const sanitizedAvatar =
      playerData.avatarUrl && playerData.avatarUrl.startsWith("data:image/") && playerData.avatarUrl.length > 2048
        ? `/api/user/avatar?uid=${encodeURIComponent(playerData.id)}`
        : playerData.avatarUrl;

    if (existingIndex >= 0) {
      room.players[existingIndex].name = playerData.name.trim() || room.players[existingIndex].name;
      room.players[existingIndex].isOnline = true;
      room.players[existingIndex].isConnected = true;
      room.players[existingIndex].lastSeen = Date.now();
      if (playerData.avatarUrl !== undefined) room.players[existingIndex].avatarUrl = sanitizedAvatar;
      if (playerData.rankTier !== undefined) room.players[existingIndex].rankTier = playerData.rankTier;
      if (playerData.equippedTitle !== undefined) room.players[existingIndex].equippedTitle = playerData.equippedTitle;
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
        avatarUrl: sanitizedAvatar,
        rankTier: playerData.rankTier,
        equippedTitle: playerData.equippedTitle,
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
        wins: 0,
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
 * Reconnection is preserved for classic modes (only survival marks isEliminated = true).
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
        // Only mark eliminated in survival mode
        if (room.gameMode === "survival") {
          player.isEliminated = true;
          if (player.eliminatedAtRound === null) {
            player.eliminatedAtRound = room.currentRound;
          }
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

      const survivalLastStanding =
        room.gameMode === "survival" &&
        Math.max(room.initialPlayerCount || 0, room.players.length) >= 2 &&
        room.players.filter((p) => !p.isEliminated).length <= 1;

      if (room.status === "playing" && (allAnswered || survivalLastStanding)) {
        const now = Date.now();
        room.status = "round_reveal";
        room.revealStartTime = now;
        room.revealEndsAt = now + REVEAL_DURATION_MS;
        room.roundStartTime = 0;
        room.roundEndsAt = undefined;
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
): Promise<{ success: boolean; room?: RoomState | null; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Jugador no encontrado." };

    player.favoriteArtists = favoriteArtists.filter((a) => a.trim().length > 0).slice(0, 5);
    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
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
): Promise<{ success: boolean; room?: RoomState | null; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Jugador no encontrado." };

    player.spotifyConnected = true;

    const validTracks = (tracks || []).filter(
      (t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl
    );

    // Save heavy tracks into isolated room_pool
    const pool = await getRoomPool(code);
    pool.injectedByPlayer[playerId] = validTracks;
    await saveRoomPool(code, pool);

    player.injectedTracks = undefined;
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
    return { success: true, room };
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
  profile: {
    name?: string;
    avatarColor?: string;
    avatarUrl?: string;
    rankTier?: string;
    equippedTitle?: string;
  }
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
    if (profile.avatarUrl !== undefined) {
      if (profile.avatarUrl && profile.avatarUrl.startsWith("data:image/") && profile.avatarUrl.length > 2048) {
        player.avatarUrl = `/api/user/avatar?uid=${encodeURIComponent(playerId)}`;
      } else {
        player.avatarUrl = profile.avatarUrl;
      }
    }
    if (profile.rankTier !== undefined) {
      player.rankTier = profile.rankTier;
    }
    if (profile.equippedTitle !== undefined) {
      player.equippedTitle = profile.equippedTitle;
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
        if (!art || (playlist.type !== "album" && playlist.imageUrl && art === playlist.imageUrl)) {
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

    // Save heavy tracks in isolated room_pool
    const pool = await getRoomPool(code);
    pool.playlistTracksById[playlist.id] = validTracks;
    await saveRoomPool(code, pool);

    const newPlaylist: RoomPlaylist = {
      id: playlist.id,
      name: playlist.name || (playlist.type === "album" ? "Álbum de Spotify" : "Playlist de Spotify"),
      imageUrl: playlist.imageUrl,
      type: playlist.type,
      trackCount: validTracks.length > 0 ? validTracks.length : (playlist.trackCount || 0),
      addedByPlayerId: playerId,
      addedByPlayerName: player.name,
      tracks: [],
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

    // Remove from isolated room_pool
    const pool = await getRoomPool(code);
    if (pool.playlistTracksById[playlistId]) {
      delete pool.playlistTracksById[playlistId];
      await saveRoomPool(code, pool);
    }
    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Proposes a new theme/genre for the lobby vote.
 */
export async function proposeTheme(code: string, playerId: string, label: string): Promise<{ success: boolean; room?: RoomState | null; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Jugador no encontrado." };

    const cleanLabel = label.trim();
    if (!cleanLabel) return { success: false, error: "Tema no válido." };

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
    return { success: true, room };
  });
}

/**
 * Casts a vote for a theme in the lobby.
 */
export async function voteTheme(code: string, playerId: string, proposalId: string): Promise<{ success: boolean; room?: RoomState | null; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Jugador no encontrado." };

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
    return { success: true, room };
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
        c.votes = (c.votes || []).filter((id) => id !== playerId);
        if (c.id === themeId) {
          c.votes.push(playerId);
        }
      });
    }

    if (!room.themeVotes) room.themeVotes = {};
    room.themeVotes[playerId] = themeId;

    // Check if all active players have voted
    const activePlayers = room.players.filter((p) => p.isConnected !== false && p.isOnline !== false);
    const allVoted = activePlayers.length > 0 && activePlayers.every((p) => p.votedTheme !== null);

    if (allVoted) {
      await checkRoomStateProgression(room);
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
    blindMode?: boolean;
  }
): Promise<{ success: boolean; room?: RoomState | null; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    if (room.hostId !== hostId) return { success: false, error: "No autorizado." };

    if (settings.gameMode) room.gameMode = settings.gameMode;
    if (settings.guessType) room.guessType = settings.guessType;
    if (settings.totalRounds) room.totalRounds = settings.totalRounds;
    if (settings.name) room.name = settings.name.trim();
    if (typeof settings.blindMode === "boolean") room.blindMode = settings.blindMode;

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Generates rounds and determines duration for a room snapshot.
 * Safe to run outside of critical locks.
 */
export async function generateRoundsForRoom(
  room: RoomState
): Promise<{ rounds: RoundData[]; roundDuration: number }> {
  const pool = await getRoomPool(room.code);
  const usedKeys = pool.usedTrackKeys || room.usedTrackKeys || [];

  // 1. GAME MODE: VOTE
  if (room.gameMode === "vote") {
    const theme = room.winningTheme || "Top 50 España";
    const rounds = await buildRoundsForTheme(theme, room.totalRounds || 10, usedKeys);
    return { rounds, roundDuration: ROUND_DURATION_SEC };
  }

  // 2. GAME MODE: TOP 50
  if (room.gameMode === "top50") {
    const topArtists = ["Quevedo", "Saiko", "Bad Bunny", "Feid", "Morad", "Aitana", "Lola Indigo", "Myke Towers", "Mora", "Rauw Alejandro"];
    const trackPromises = topArtists.map((a) => searchStrictArtistTracks(a, 6));
    const results = await Promise.allSettled(trackPromises);
    const topPool: SpotifyTrackItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        topPool.push(...r.value);
      }
    }
    const validPool = topPool.length >= room.totalRounds ? topPool : [...topPool, ...FALLBACK_SPOTIFY_TRACKS];
    const targetCandidates = orderPoolBySessionMemory(validPool, (t) => getTrackKey(t), usedKeys);
    const verifiedTargets = await collectVerifiedTargets(targetCandidates, room.totalRounds, validPool);
    const usedDistractorKeys = new Set<string>();

    const rounds: RoundData[] = await Promise.all(
      verifiedTargets.map(async (target, i) => {
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
        const distractors = await getDifficultDistractors(target, validPool, 3, usedDistractorKeys);
        const distractorOptions: RoundOption[] = distractors.map((d, dIdx) => ({
          id: `opt_${roundNumber}_d${dIdx}_${Math.random().toString(36).substring(2, 7)}`,
          title: d.title,
          artist: d.artist,
          artworkUrl: d.artworkUrl,
          topic: d.topic,
        }));
        const options = fisherYatesShuffle([correctOption, ...distractorOptions]);
        const correctIndex = options.findIndex((opt) => opt.id === correctOption.id);
        return {
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
        };
      })
    );

    return { rounds, roundDuration: ROUND_DURATION_SEC };
  }

  // 3. GAME MODE: RANDOM
  if (room.gameMode === "random") {
    const randomArtists = ["The Weeknd", "Daft Punk", "Billie Eilish", "Coldplay", "Duki", "Rosalía", "Eminem", "Arctic Monkeys", "Bad Bunny", "Avicii"];
    const trackPromises = randomArtists.map((a) => searchStrictArtistTracks(a, 6));
    const results = await Promise.allSettled(trackPromises);
    const randomPool: SpotifyTrackItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        randomPool.push(...r.value);
      }
    }
    const validPool = randomPool.length >= room.totalRounds ? randomPool : [...randomPool, ...FALLBACK_SPOTIFY_TRACKS];
    const targetCandidates = orderPoolBySessionMemory(validPool, (t) => getTrackKey(t), usedKeys);
    const verifiedTargets = await collectVerifiedTargets(targetCandidates, room.totalRounds, validPool);
    const usedDistractorKeys = new Set<string>();

    const rounds: RoundData[] = await Promise.all(
      verifiedTargets.map(async (target, i) => {
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
        const distractors = await getDifficultDistractors(target, validPool, 3, usedDistractorKeys);
        const distractorOptions: RoundOption[] = distractors.map((d, dIdx) => ({
          id: `opt_${roundNumber}_d${dIdx}_${Math.random().toString(36).substring(2, 7)}`,
          title: d.title,
          artist: d.artist,
          artworkUrl: d.artworkUrl,
          topic: d.topic,
        }));
        const options = fisherYatesShuffle([correctOption, ...distractorOptions]);
        const correctIndex = options.findIndex((opt) => opt.id === correctOption.id);
        return {
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
        };
      })
    );

    return { rounds, roundDuration: ROUND_DURATION_SEC };
  }

  // 4. GAME MODE: SURVIVAL
  if (room.gameMode === "survival") {
    const rounds = await generateSurvivalBatch(room, 12);
    return { rounds, roundDuration: getSurvivalRoundDuration(0) };
  }

  // 5. GAME MODE: BLEND / WHO_LISTENS / SPEED_CHAOS / BUZZER / INTRO_FLASH
  const { buckets, allPoolTracks } = await buildPlayerTrackBuckets(room, usedKeys, pool);
  const interleaved = interleavePlayerBucketsFairly(buckets);

  const poolTracks = allPoolTracks.length >= room.totalRounds
    ? allPoolTracks
    : [...allPoolTracks, ...FALLBACK_SPOTIFY_TRACKS];

  const verifiedTargetObjects = await collectVerifiedTargetObjects(
    interleaved,
    room.totalRounds,
    poolTracks
  );
  const smoothedTargets = smoothVerifiedOrder(verifiedTargetObjects);
  const usedDistractorKeys = new Set<string>();

  let chaosSpeeds: typeof CHAOS_SPEED_PRESETS = [];
  if (room.gameMode === "speed_chaos") {
    let lastRate: number | null = null;
    for (let i = 0; i < smoothedTargets.length; i++) {
      const available = CHAOS_SPEED_PRESETS.filter((p) => p.rate !== lastRate);
      const chosen = available[Math.floor(Math.random() * available.length)] || CHAOS_SPEED_PRESETS[0];
      chaosSpeeds.push(chosen);
      lastRate = chosen.rate;
    }
  }

  const rounds: RoundData[] = await Promise.all(
    smoothedTargets.map(async (item, i) => {
      const target = item.track;
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

      let playbackRate: number | undefined;
      let speedEffect: "sped_up" | "slowed" | undefined;
      let speedLabel: string | undefined;
      if (room.gameMode === "speed_chaos") {
        const chosen = chaosSpeeds[i] || CHAOS_SPEED_PRESETS[0];
        playbackRate = chosen.rate;
        speedEffect = chosen.effect;
        speedLabel = chosen.label;
      }

      return {
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
        contributedByPlayerName: item.playerName || target.sourcePlayerName || playerSource?.name || "Scuinklezam",
        sourceMode: item.sourceMode || target.sourceMode || playerSource?.injectedModeName || "Spotify",
        playbackRate,
        speedEffect,
        speedLabel,
      };
    })
  );

  const roundDuration = room.gameMode === "intro_flash" ? 12 : ROUND_DURATION_SEC;
  return { rounds, roundDuration };
}

/**
 * Starts game with 3-phase flow: fast validation, unblocked generation, fast atomic write.
 */
export async function startRoomGame(
  code: string,
  hostId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  // Phase 1: Fast validation and state prep inside lock (<50ms)
  const prepResult = await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede iniciar la partida." };

    // Synchronize heartbeats
    const heartbeats = await getPlayerHeartbeats(code);
    const now = Date.now();
    room.players.forEach((p) => {
      const hb = Number(heartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
      p.isConnected = (now - hb) <= 35000;
      p.isOnline = p.isConnected;
    });

    const connectedPlayers = room.players.filter((p) => p.isConnected !== false);
    if (connectedPlayers.length === 0) {
      return { success: false, error: "No hay jugadores conectados en la sala." };
    }

    if (modeRequiresPlayerMusic(room.gameMode)) {
      const allReady = connectedPlayers.every((p) => hasPlayerContributedMusic(p, room.playlists));
      if (!allReady) {
        return {
          success: false,
          error: "Todos los jugadores deben cargar al menos un artista, playlist o modo de Spotify para estar listos.",
        };
      }
    }

    // Reset players and initialPlayerCount for new match (snapshot & vote mode)
    resetRoomPlayersForNewMatch(room);

    // 1. GAME MODE: VOTE
    if (room.gameMode === "vote") {
      initializeVotingPhase(room, now);
      await saveRoom(room);
      return { success: true, room, isVoting: true };
    }

    room.lastActive = now;
    // Snapshot room configuration to generate rounds outside mutex
    const snapshotRoom: RoomState = JSON.parse(JSON.stringify(room));
    return { success: true, snapshotRoom };
  });

  if (!prepResult.success) {
    return { success: false, error: prepResult.error };
  }
  if (prepResult.isVoting) {
    return { success: true, room: prepResult.room };
  }

  // Phase 2: Generate rounds outside lock (audio verification, Spotify search, etc.)
  const { rounds, roundDuration } = await generateRoundsForRoom(prepResult.snapshotRoom!);

  // Phase 3: Fast atomic state write (<50ms)
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada tras generar rondas." };

    // Guarantee atomic persisted reset after re-reading room from Redis
    resetRoomPlayersForNewMatch(room);

    room.rounds = rounds;
    room.roundDuration = roundDuration;
    if (room.gameMode === "survival") {
      room.totalRounds = rounds.length;
    }
    room.currentRound = 1;
    room.status = "countdown";
    const now = Date.now();
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

    // Refresh heartbeats and connectivity (skip HGETALL in 1-player rooms)
    await updatePlayerHeartbeat(code, playerId);
    const now = Date.now();
    const heartbeats = room.players.length > 1 ? await getPlayerHeartbeats(code) : null;

    room.players.forEach((p) => {
      if (p.id === playerId) {
        p.isConnected = true;
        p.isOnline = true;
        p.lastSeen = now;
      } else {
        const hb = Number(heartbeats?.[p.id] || p.lastSeen || p.joinedAt || 0);
        p.isConnected = (now - hb) <= 35000;
        p.isOnline = p.isConnected;
      }
    });

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

    if (room.gameMode === "buzzer") {
      if (isCorrect) {
        if (round.buzzerWinnerId) {
          // Another player already won this buzzer round
          points = 0;
        } else {
          points = 100;
          round.buzzerWinnerId = player.id;
          round.buzzerWinnerName = player.name;
          player.score += points;
          player.streak += 1;
          player.maxStreak = Math.max(player.maxStreak || 0, player.streak);
        }
      } else {
        points = 0;
        player.streak = 0;
      }
    } else if (isCorrect) {
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

    const isBuzzerWon = room.gameMode === "buzzer" && isCorrect && round.buzzerWinnerId === player.id;

    if (isBuzzerWon || allAnswered) {
      room.status = "round_reveal";
      room.revealStartTime = now;
      room.revealEndsAt = now + REVEAL_DURATION_MS;
      room.roundStartTime = 0;
      room.roundEndsAt = undefined;

      // Penalize any alive player who did not answer (e.g. disconnected in survival mode)
      if (room.gameMode === "survival") {
        room.players.forEach((p) => {
          if (!p.isEliminated && !p.currentAnswer && !roundMap[p.id]) {
            p.streak = 0;
            p.lives = Math.max(0, p.lives - 1);
            p.lostLifeThisRound = true;
            p.healedThisRound = false;
            if (p.lives === 0) {
              p.isEliminated = true;
              p.eliminatedAtRound = room.currentRound;
            }
          }
        });
      }
    }

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, pointsEarned: points, isCorrect, room };
  });
}

/**
 * Authoritatively advances the room to the next round or finishes the game (withRoomLock).
 * Prevents fast client clocks from skipping the reveal prematurely.
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

    // Stop clients with fast clocks from skipping reveal prematurely
    if (room.revealEndsAt && Date.now() < room.revealEndsAt - 300) {
      return { success: true, room };
    }

    const now = Date.now();
    room.revealStartTime = undefined;
    room.revealEndsAt = undefined;

    if (room.gameMode === "survival") {
      const shouldFinish = shouldFinishSurvivalMatch(room);

      if (shouldFinish) {
        await finalizeRoomMatch(room);
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
        await finalizeRoomMatch(room);
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
export async function resetRoomToLobby(code: string, hostId: string): Promise<{ success: boolean; room?: RoomState | null; error?: string }> {
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede reiniciar la sala." };

    const pool = await getRoomPool(code);
    if (room.rounds && room.rounds.length > 0) {
      recordPlayedTracksInRoom(room, room.rounds, pool);
      await saveRoomPool(code, pool);
    }

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

    resetRoomPlayersForNewMatch(room);

    room.lastActive = Date.now();
    await saveRoom(room);
    return { success: true, room };
  });
}

/**
 * Restarts a finished room game immediately (rematch) with the same settings,
 * prioritizing tracks from the pool that were not played in the previous game.
 * Uses 3-phase flow to prevent holding Redis mutex during track generation.
 */
export async function rematchRoomGame(
  code: string,
  hostId: string
): Promise<{ success: boolean; room?: RoomState | null; error?: string }> {
  // Phase 1: Fast preparation inside lock (<50ms)
  const prepResult = await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada." };
    if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede reiniciar la partida." };

    // Record played tracks in room LRU memory
    const pool = await getRoomPool(code);
    if (room.rounds && room.rounds.length > 0) {
      recordPlayedTracksInRoom(room, room.rounds, pool);
      await saveRoomPool(code, pool);
    }

    // Sync heartbeats and reset players/initialPlayerCount for rematch
    const heartbeats = await getPlayerHeartbeats(code);
    const now = Date.now();
    room.players.forEach((p) => {
      const hb = Number(heartbeats[p.id] || p.lastSeen || p.joinedAt || 0);
      p.isConnected = (now - hb) <= 35000;
      p.isOnline = p.isConnected;
    });

    const connectedPlayers = room.players.filter((p) => p.isConnected !== false);
    if (connectedPlayers.length === 0) {
      return { success: false, error: "No hay jugadores conectados en la sala." };
    }

    resetRoomPlayersForNewMatch(room);

    // Rematch in vote mode starts a fresh democratic voting phase
    if (room.gameMode === "vote") {
      initializeVotingPhase(room, now);
      await saveRoom(room);
      return { success: true, room, isVoting: true };
    }

    room.lastActive = now;
    const snapshotRoom: RoomState = JSON.parse(JSON.stringify(room));
    return { success: true, snapshotRoom };
  });

  if (!prepResult.success) {
    return { success: false, error: prepResult.error };
  }
  if (prepResult.isVoting) {
    return { success: true, room: prepResult.room };
  }

  // Phase 2: Generate rounds outside lock
  const { rounds, roundDuration } = await generateRoundsForRoom(prepResult.snapshotRoom!);

  // Phase 3: Fast atomic state write (<50ms)
  return await withRoomLock(code, async () => {
    const room = await getRawRoom(code);
    if (!room) return { success: false, error: "Sala no encontrada tras generar rondas." };

    // Guarantee atomic persisted reset after re-reading room from Redis
    resetRoomPlayersForNewMatch(room);

    room.rounds = rounds;
    room.roundDuration = roundDuration;
    if (room.gameMode === "survival") {
      room.totalRounds = rounds.length;
    }
    room.currentRound = 1;
    room.status = "countdown";
    const now = Date.now();
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

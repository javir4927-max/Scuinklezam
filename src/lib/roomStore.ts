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
  matchArtistNameStrict,
} from "./songMatching";
import { ROUND_DURATION_SEC, REVEAL_DURATION_MS, calculateRoundPoints } from "./scoring";

export type GameMode =
  | "blend"
  | "top50"
  | "vote"
  | "random"
  | "who_listens"
  | "survival"
  | "tv_party";

export type GuessType = "song" | "artist" | "both";

export interface PlayerAnswerRecord {
  roundIndex: number;
  optionIndex: number;
  timeMs: number;
  pointsEarned: number;
  isCorrect: boolean;
  guessedFriendId?: string;
  selectedTitle?: string;
}

export interface Player {
  id: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
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
  lives: number;
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
  id?: string;
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
  createdAt: number;
  lastActive: number;
}

// Global in-memory storage fallback
declare global {
  // eslint-disable-next-line no-var
  var __scuinklezamRooms: Map<string, RoomState> | undefined;
}

if (!global.__scuinklezamRooms) {
  global.__scuinklezamRooms = new Map<string, RoomState>();
}

const rooms = global.__scuinklezamRooms;

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

export async function buildRoundsFromTracks(tracks: SpotifyTrackItem[], totalRounds: number): Promise<RoundData[]> {
  const valid = tracks.filter((t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl);
  const catalog = valid.length >= 4 ? valid : FALLBACK_SPOTIFY_TRACKS;
  const shuffled = fisherYatesShuffle(catalog);
  const count = Math.min(totalRounds, shuffled.length);

  const rounds: RoundData[] = await Promise.all(
    shuffled.slice(0, count).map(async (rawTarget, i) => {
      const target = { ...rawTarget };
      // Prioritize permanent iTunes preview URLs over Deezer/ephemeral URLs
      if (!target.previewUrl || !target.previewUrl.includes("apple.com")) {
        try {
          const fresh = await resolveAudioStream(target.title, target.artist);
          if (fresh?.previewUrl && fresh.previewUrl.includes("apple.com")) {
            target.previewUrl = fresh.previewUrl;
            if (fresh.artworkUrl) target.artworkUrl = fresh.artworkUrl;
          }
        } catch {
          // keep original
        }
      }

      const targetTopic = getTrackTopic(target);

      const correctOption: RoundOption = {
        id: target.id,
        title: target.title,
        artist: target.artist,
        artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
        topic: targetTopic,
      };

      // Difficult distractors: same album > same artist > related/topic
      const distractors = await getDifficultDistractors(target, catalog, 3);
      const options: RoundOption[] = fisherYatesShuffle([correctOption, ...distractors]);
      const correctIndex = options.findIndex(
        (o) => deepNormalize(o.title) === deepNormalize(correctOption.title)
      );

      return {
        roundNumber: i + 1,
        targetTrack: {
          ...target,
          artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
          topic: targetTopic,
        },
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        correctTrackId: target.id,
        correctTitle: target.title,
        topic: targetTopic,
      };
    })
  );

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
 * Creates a new room with host player.
 */
export async function createRoom(
  hostName: string,
  hostId: string,
  roomName?: string,
  initialArtists?: string[]
): Promise<RoomState> {
  let code = generateRoomCode();
  let existing = await getRoom(code);
  while (existing) {
    code = generateRoomCode();
    existing = await getRoom(code);
  }

  const cleanHostName = hostName.trim() || "Anfitrión";

  const hostPlayer: Player = {
    id: hostId,
    name: cleanHostName,
    avatarColor: "#10B981",
    isHost: true,
    isReady: true,
    isOnline: true,
    lastSeen: Date.now(),
    favoriteArtists:
      initialArtists && initialArtists.length > 0
        ? initialArtists.slice(0, 3)
        : [],
    spotifyConnected: false,
    score: 0,
    streak: 0,
    lives: 3,
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
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  await saveRoom(newRoom);
  return newRoom;
}

/**
 * Gets a room by code and cleans up timed-out players/advances auto states.
 * Strictly read-only for room players (never adds, renames, or kicks during polling).
 * Rutinary GET polling updates in-memory state and ONLY saves to Redis if phase actually progressed.
 */
export async function getRoom(code: string, activePlayerId?: string): Promise<RoomState | null> {
  const upperCode = code.toUpperCase().trim();
  let room: RoomState | null = null;

  // 100% Upstash Redis first when configured (zero stale memory reads in serverless)
  if (redis) {
    try {
      const remote = await redis.get<RoomState>(`${ROOM_KEY_PREFIX}${upperCode}`);
      if (remote) {
        room = remote;
      }
    } catch (err) {
      console.error(`[Upstash Redis] Error retrieving room ${upperCode}:`, err);
    }
  } else {
    // Fallback to local memory ONLY if Redis is not configured
    room = rooms.get(upperCode) || null;
  }

  if (!room) return null;

  const now = Date.now();
  room.lastActive = now;

  // Heartbeat update in-memory for active player
  if (activePlayerId) {
    const player = room.players.find((p) => p.id === activePlayerId);
    if (player) {
      player.lastSeen = now;
      player.isOnline = true;
    }
  }

  // Update online status in-memory: offline if no heartbeat in 45s
  room.players.forEach((p) => {
    if (now - p.lastSeen > 45000 && p.isOnline) {
      p.isOnline = false;
    }
  });

  // State machine progression check
  const progressed = checkRoomStateProgression(room);
  // Strictly only persist to Redis if state machine advanced phases
  if (progressed) {
    await saveRoom(room);
  }

  return room;
}

/**
 * Progresses room state authoritatively based on timestamps and player responses.
 * Strictly guarantees rooms NEVER loop back to "lobby" automatically.
 */
export function checkRoomStateProgression(room: RoomState): boolean {
  const now = Date.now();
  let changed = false;

  // 0. VOTING -> COUNTDOWN (when now >= votingEndsAt OR all active players voted)
  if (room.status === "voting") {
    const endsAt = room.votingEndsAt || (room.votingStartTime ? room.votingStartTime + 10000 : now);
    const activePlayers = room.players.filter((p) => p.isOnline);
    const allVoted =
      activePlayers.length > 0 &&
      activePlayers.every((p) => p.votedTheme !== null);

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

  // 1. COUNTDOWN -> PLAYING (when now >= countdownEndsAt)
  if (room.status === "countdown") {
    const endsAt = room.countdownEndsAt || (room.countdownStartTime ? room.countdownStartTime + 3500 : now);
    if (now >= endsAt) {
      room.status = "playing";
      room.roundStartTime = now;
      room.roundEndsAt = now + (room.roundDuration || ROUND_DURATION_SEC) * 1000;
      room.countdownStartTime = undefined;
      room.countdownEndsAt = undefined;
      // Reset players currentAnswer for round
      room.players.forEach((p) => {
        p.currentAnswer = null;
      });
      changed = true;
    }
  }

  // 2. PLAYING -> ROUND_REVEAL (when now >= roundEndsAt OR all active players answered)
  if (room.status === "playing") {
    const endsAt = room.roundEndsAt || (room.roundStartTime ? room.roundStartTime + (ROUND_DURATION_SEC * 1000 + 500) : now);
    const activePlayers = room.players.filter((p) => p.isOnline);
    const allAnswered =
      activePlayers.length > 0 &&
      activePlayers.every((p) => p.currentAnswer !== null);

    if (now >= endsAt || allAnswered) {
      room.status = "round_reveal";
      room.revealStartTime = now;
      room.revealEndsAt = now + REVEAL_DURATION_MS;
      room.roundStartTime = 0;
      room.roundEndsAt = undefined;

      // Score any player who didn't answer before time ran out
      const currentRoundData = room.rounds[room.currentRound - 1];
      if (currentRoundData) {
        room.players.forEach((p) => {
          if (!p.currentAnswer) {
            p.streak = 0;
            if (room.gameMode === "survival") {
              p.lives = Math.max(0, p.lives - 1);
            }
          }
        });
      }
      changed = true;
    }
  }

  // 3. ROUND_REVEAL -> NEXT ROUND or FINISHED (when now >= revealEndsAt, at least REVEAL_DURATION_MS)
  if (room.status === "round_reveal") {
    const endsAt = room.revealEndsAt || (room.revealStartTime ? room.revealStartTime + REVEAL_DURATION_MS : undefined);
    if (endsAt && now >= endsAt) {
      room.revealStartTime = undefined;
      room.revealEndsAt = undefined;

      if (room.currentRound < room.rounds.length) {
        room.currentRound += 1;
        room.status = "playing";
        room.roundStartTime = now;
        room.roundEndsAt = now + (room.roundDuration || ROUND_DURATION_SEC) * 1000;
        room.players.forEach((p) => {
          p.currentAnswer = null;
        });
      } else {
        room.status = "finished";
      }
      changed = true;
    }
  }

  return changed;
}

/**
 * Joins an existing room.
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
  const room = await getRoom(code);
  if (!room) {
    return { success: false, error: "La sala no existe o ha expirado." };
  }

  // Check if player was kicked
  if (room.kickedPlayerIds && room.kickedPlayerIds.includes(playerData.id)) {
    return { success: false, error: "Has sido expulsado de esta sala por el anfitrión." };
  }

  // Check if player is already in room
  const existingIndex = room.players.findIndex((p) => p.id === playerData.id);
  const colors = ["#10B981", "#84CC16", "#F59E0B", "#06B6D4", "#EC4899", "#8B5CF6", "#14B8A6"];
  const chosenColor =
    playerData.avatarColor ||
    colors[room.players.length % colors.length];

  if (existingIndex >= 0) {
    // Reconnection
    room.players[existingIndex].name = playerData.name.trim() || room.players[existingIndex].name;
    room.players[existingIndex].isOnline = true;
    room.players[existingIndex].lastSeen = Date.now();
    if (playerData.favoriteArtists && playerData.favoriteArtists.length > 0) {
      room.players[existingIndex].favoriteArtists = playerData.favoriteArtists.slice(0, 5);
    }
  } else {
    // New player
    if (room.players.length >= 12) {
      return { success: false, error: "La sala está llena (máximo 12 jugadores)." };
    }

    const newPlayer: Player = {
      id: playerData.id,
      name: playerData.name.trim() || `Invitado ${room.players.length + 1}`,
      avatarColor: chosenColor,
      isHost: false,
      isReady: true,
      isOnline: true,
      lastSeen: Date.now(),
      favoriteArtists:
        playerData.favoriteArtists && playerData.favoriteArtists.length > 0
          ? playerData.favoriteArtists.slice(0, 5)
          : [],
      spotifyConnected: !!playerData.spotifyConnected,
      score: 0,
      streak: 0,
      lives: 3,
      currentAnswer: null,
      votedTheme: null,
    };

    room.players.push(newPlayer);
  }

  await saveRoom(room);
  return { success: true, room };
}

/**
 * Updates a player's contributed musical taste (artists/genres).
 */
export async function updatePlayerTaste(code: string, playerId: string, favoriteArtists: string[]): Promise<boolean> {
  const room = await getRoom(code);
  if (!room) return false;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;

  player.favoriteArtists = favoriteArtists.filter((a) => a.trim().length > 0).slice(0, 5);
  await saveRoom(room);
  return true;
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
  const room = await getRoom(code);
  if (!room) return false;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;

  player.spotifyConnected = true;

  // Filter valid tracks with audio preview & artwork
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

  await saveRoom(room);
  return true;
}

/**
 * Renames a player in the room (and updates room name if host).
 */
export async function renamePlayer(
  code: string,
  playerId: string,
  newName: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };

  const cleanName = newName.trim();
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "El nombre debe tener al menos 2 caracteres." };
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { success: false, error: "Jugador no encontrado en la sala." };

  player.name = cleanName.slice(0, 24);

  // If host and room name is default pattern, update room name as well
  if (player.isHost && (room.name.startsWith("Sala de ") || !room.name)) {
    room.name = `Sala de ${player.name}`;
  }

  await saveRoom(room);
  return { success: true, room };
}

/**
 * Updates player profile details (name and/or avatar) in real time.
 */
export async function updatePlayerProfile(
  code: string,
  playerId: string,
  profile: { name?: string; avatarColor?: string }
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  const room = await getRoom(code);
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
  if (profile.avatarColor) {
    player.avatarColor = profile.avatarColor;
  }

  await saveRoom(room);
  return { success: true, room };
}

/**
 * Adds an imported playlist to the room's music collection.
 */
export async function addPlaylistToRoom(
  code: string,
  playerId: string,
  playlist: {
    id: string;
    name: string;
    imageUrl?: string;
    trackCount?: number;
    tracks: SpotifyTrackItem[];
  }
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { success: false, error: "Jugador no encontrado." };

  if (!room.playlists) room.playlists = [];

  // Filter out any duplicate playlist id
  room.playlists = room.playlists.filter((p) => p.id !== playlist.id);

  // Filter valid tracks and ensure song artwork never inherits playlist cover
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
  await saveRoom(room);
  return { success: true, room };
}

/**
 * Removes an imported playlist from the room.
 */
export async function removePlaylistFromRoom(
  code: string,
  playerId: string,
  playlistId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };

  if (!room.playlists) room.playlists = [];

  const targetPlaylist = room.playlists.find((p) => p.id === playlistId);
  if (!targetPlaylist) return { success: true, room };

  // Host can remove any playlist; otherwise player can only remove their own
  const isHost = room.hostId === playerId;
  if (!isHost && targetPlaylist.addedByPlayerId !== playerId) {
    return { success: false, error: "No tienes permiso para eliminar esta playlist." };
  }

  room.playlists = room.playlists.filter((p) => p.id !== playlistId);
  await saveRoom(room);
  return { success: true, room };
}

/**
 * Proposes a new theme/genre for the lobby vote.
 */
export async function proposeTheme(code: string, playerId: string, label: string): Promise<boolean> {
  const room = await getRoom(code);
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

  // Switch player's vote
  room.themeProposals.forEach((tp) => {
    tp.votes = tp.votes.filter((vid) => vid !== playerId);
  });

  player.votedTheme = newProposal.id;
  room.themeProposals.push(newProposal);
  await saveRoom(room);
  return true;
}

/**
 * Casts a vote for a theme in the lobby.
 */
export async function voteTheme(code: string, playerId: string, proposalId: string): Promise<boolean> {
  const room = await getRoom(code);
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

  await saveRoom(room);
  return true;
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
  const room = await getRoom(code);
  if (!room || room.hostId !== hostId) return false;

  if (settings.gameMode) room.gameMode = settings.gameMode;
  if (settings.guessType) room.guessType = settings.guessType;
  if (settings.totalRounds) room.totalRounds = settings.totalRounds;
  if (settings.name) room.name = settings.name.trim();

  await saveRoom(room);
  return true;
}

/**
 * Starts the game: builds balanced rounds, initializes players, starts countdown.
 * GUARANTEES 100% of rounds have verified audio preview and artwork.
 */
export async function startRoomGame(code: string, hostId: string): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };
  if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede iniciar la partida." };

  // If already active or started, return current room state idempotently without resetting
  if (room.status !== "lobby") {
    return { success: true, room };
  }

  // DEMOCRATIC VOTING MODE: Launch 10-second live voting phase
  if (room.gameMode === "vote") {
    const shuffledCatalog = fisherYatesShuffle(DEMOCRATIC_VOTING_CATALOG);
    const candidates: VotingCandidate[] = shuffledCatalog.slice(0, 4).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      query: c.query,
      icon: c.icon,
      votes: [],
    }));

    // Pre-fetch and assemble verified rounds for all 4 candidate themes in parallel
    const candidateRounds: Record<string, RoundData[]> = {};
    await Promise.all(
      candidates.map(async (cand) => {
        try {
          const tracks = await searchVerifiedTracks(cand.query, room.totalRounds + 6);
          candidateRounds[cand.id] = await buildRoundsFromTracks(tracks, room.totalRounds);
        } catch {
          candidateRounds[cand.id] = await buildRoundsFromTracks(FALLBACK_SPOTIFY_TRACKS, room.totalRounds);
        }
      })
    );

    const now = Date.now();
    room.status = "voting";
    room.votingStartTime = now;
    room.votingEndsAt = now + 10000; // 10 seconds!
    room.votingCandidates = candidates;
    room.candidateRounds = candidateRounds;
    room.winningTheme = undefined;
    room.currentRound = 1;
    room.roundDuration = ROUND_DURATION_SEC;
    room.players.forEach((p) => {
      p.score = 0;
      p.streak = 0;
      p.lives = 3;
      p.currentAnswer = null;
      p.votedTheme = null;
    });

    await saveRoom(room);
    return { success: true, room };
  }

  const pool: Array<{ track: SpotifyTrackItem; playerId?: string; playerName?: string }> = [];

  // Structures for balanced round selection
  const injectedByPlayer = new Map<string, Array<{ track: SpotifyTrackItem; playerId: string; playerName: string }>>();
  const artistBuckets = new Map<string, Array<{ track: SpotifyTrackItem; playerId: string; playerName: string }>>();

  // 1. Gather tracks from room's imported playlists (Fisher-Yates shuffled)
  if (room.playlists && room.playlists.length > 0) {
    for (const pl of room.playlists) {
      if (pl.tracks && pl.tracks.length > 0) {
        const shuffledTracks = fisherYatesShuffle(pl.tracks);
        shuffledTracks.forEach((track) => {
          let art = track.artworkUrl;
          if (!art || (pl.imageUrl && art === pl.imageUrl)) {
            art = getFallbackArtwork(track.title, track.artist);
          }
          const item = {
            track: {
              ...track,
              artworkUrl: art,
            },
            playerId: pl.addedByPlayerId,
            playerName: pl.addedByPlayerName,
          };
          pool.push(item);
        });
      }
    }
  }

  // 2. CRITICAL: Strictly collect player injected Spotify tracks across ALL game modes
  for (const player of room.players) {
    if (player.injectedTracks && player.injectedTracks.length > 0) {
      const validInjected = player.injectedTracks
        .filter((t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl)
        .map((track) => ({ track, playerId: player.id, playerName: player.name }));

      if (validInjected.length > 0) {
        injectedByPlayer.set(player.id, fisherYatesShuffle(validInjected));
        validInjected.forEach((item) => pool.push(item));
      }
    }
  }

  // 3. Fallback or additional tracks based on Game Mode ONLY if pool is empty or blend/who_listens needs variety
  if (room.gameMode === "blend" || room.gameMode === "who_listens") {
    // Collect all unique artists across players if pool needs more songs
    if (pool.length < room.totalRounds * 2) {
      const allArtistsWithPlayers: Array<{ artist: string; playerId: string; playerName: string }> = [];
      const seenArtistNames = new Set<string>();

      for (const player of room.players) {
        if (player.favoriteArtists && player.favoriteArtists.length > 0) {
          for (const art of player.favoriteArtists.slice(0, 5)) {
            const clean = art.trim();
            if (clean && !seenArtistNames.has(clean.toLowerCase())) {
              seenArtistNames.add(clean.toLowerCase());
              allArtistsWithPlayers.push({ artist: clean, playerId: player.id, playerName: player.name });
            }
          }
        }
      }

      // Fetch verified tracks for each artist in parallel
      if (allArtistsWithPlayers.length > 0) {
        const artistResults = await Promise.all(
          allArtistsWithPlayers.map(async ({ artist, playerId, playerName }) => {
            const found = await searchVerifiedTracks(artist, 4);
            return {
              artist,
              items: found.map((track) => ({ track, playerId, playerName })),
            };
          })
        );

        for (const res of artistResults) {
          if (res.items.length > 0) {
            artistBuckets.set(res.artist, fisherYatesShuffle(res.items));
            res.items.forEach((item) => pool.push(item));
          }
        }
      }
    }

    // If 0 artists and 0 injected tracks were found across all players, generate from Top Hits Global
    if (pool.length === 0) {
      const globalHits = await searchVerifiedTracks("Top Hits Global", room.totalRounds + 6);
      globalHits.forEach((track) => pool.push({ track }));
    }
  } else if (room.gameMode === "top50") {
    // Only fetch generic Top 50 if room players didn't provide any Spotify tracks
    if (pool.length === 0) {
      const found = await searchVerifiedTracks("Global Top 50 Hits", room.totalRounds + 8);
      found.forEach((track) => pool.push({ track }));
    }
  } else {
    // Random / Survival / TV Party: Only populate if pool is empty
    if (pool.length === 0) {
      const genres = ["Pop Hits", "Rock Classics", "Latin Hits", "Hip Hop Hits", "80s Hits", "Electronic Hits"];
      for (const g of genres) {
        const found = await searchVerifiedTracks(g, 5);
        found.forEach((track) => pool.push({ track }));
      }
    }
  }

  // Deduplicate and strictly filter only tracks with valid previewUrl & artworkUrl
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const validUniquePool: Array<{ track: SpotifyTrackItem; playerId?: string; playerName?: string }> = [];

  for (const item of pool) {
    const t = item.track;
    if (!t || !t.previewUrl || !t.previewUrl.startsWith("http") || !t.artworkUrl || !t.artworkUrl.startsWith("http")) {
      continue;
    }
    const titleKey = `${t.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    if (!seenIds.has(t.id) && !seenTitles.has(titleKey)) {
      seenIds.add(t.id);
      seenTitles.add(titleKey);
      validUniquePool.push(item);
    }
  }

  // Emergency fallback ONLY if the total pool has fewer than 4 tracks (needed to build 4 quiz options)
  if (validUniquePool.length < 4) {
    const needed = Math.max(4 - validUniquePool.length, room.totalRounds);
    const emergencyTracks = await searchVerifiedTracks("Top Hits Global", needed + 4);
    for (const et of emergencyTracks) {
      const titleKey = `${et.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${et.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seenIds.has(et.id) && !seenTitles.has(titleKey)) {
        seenIds.add(et.id);
        seenTitles.add(titleKey);
        validUniquePool.push({ track: et });
      }
    }
  }

  // Build target tracks prioritizing player injected Spotify tracks and balancing across artists
  const selectedTargets: Array<{ track: SpotifyTrackItem; playerId?: string; playerName?: string }> = [];
  const selectedTargetIds = new Set<string>();

  // 1. Gather all injected queues and artist queues
  const injectedQueues = Array.from(injectedByPlayer.values());
  const artistQueues = Array.from(artistBuckets.values());

  while (
    selectedTargets.length < room.totalRounds &&
    (injectedQueues.some((q) => q.length > 0) || artistQueues.some((q) => q.length > 0))
  ) {
    // Round-robin through players' real Spotify tracks
    for (const q of injectedQueues) {
      if (selectedTargets.length >= room.totalRounds) break;
      const item = q.shift();
      if (item && !selectedTargetIds.has(item.track.id)) {
        selectedTargetIds.add(item.track.id);
        selectedTargets.push(item);
      }
    }

    // Round-robin evenly across all added artists
    for (const q of artistQueues) {
      if (selectedTargets.length >= room.totalRounds) break;
      const item = q.shift();
      if (item && !selectedTargetIds.has(item.track.id)) {
        selectedTargetIds.add(item.track.id);
        selectedTargets.push(item);
      }
    }
  }

  // If still under totalRounds, fill from remainder of pool (without adding generic hits if validUniquePool has items)
  const remainderShuffled = fisherYatesShuffle(validUniquePool);
  for (const item of remainderShuffled) {
    if (selectedTargets.length >= room.totalRounds) break;
    if (!selectedTargetIds.has(item.track.id)) {
      selectedTargetIds.add(item.track.id);
      selectedTargets.push(item);
    }
  }

  // If totalRounds > unique songs (e.g. user selected 10 rounds but only has 8 songs), cycle songs from pool
  if (selectedTargets.length < room.totalRounds && validUniquePool.length > 0) {
    while (selectedTargets.length < room.totalRounds) {
      const cycleItem = remainderShuffled[selectedTargets.length % remainderShuffled.length];
      selectedTargets.push(cycleItem);
    }
  }

  // True Fisher-Yates shuffle across target tracks so round progression is 100% unpredictable
  const randomizedTargets = fisherYatesShuffle(selectedTargets);

  // Assemble rounds in parallel with difficult distractors
  const roundsToGenerate = Math.min(room.totalRounds, randomizedTargets.length);
  const poolTracks = validUniquePool.map((u) => u.track);

  const rounds: RoundData[] = await Promise.all(
    randomizedTargets.slice(0, roundsToGenerate).map(async (item, i) => {
      const target = { ...item.track };
      // Prioritize permanent iTunes preview URLs over Deezer/ephemeral URLs
      if (!target.previewUrl || !target.previewUrl.includes("apple.com")) {
        try {
          const fresh = await resolveAudioStream(target.title, target.artist);
          if (fresh?.previewUrl && fresh.previewUrl.includes("apple.com")) {
            target.previewUrl = fresh.previewUrl;
            if (fresh.artworkUrl) target.artworkUrl = fresh.artworkUrl;
          }
        } catch {
          // keep original
        }
      }

      const targetTopic = getTrackTopic(target);

      const correctOption: RoundOption = {
        id: target.id,
        title: target.title,
        artist: target.artist,
        artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
        topic: targetTopic,
      };

      // Challenging distractors: same album > same artist > related artists/topic
      const distractors = await getDifficultDistractors(target, poolTracks, 3);

      // Merge & shuffle options with Fisher-Yates
      const options: RoundOption[] = fisherYatesShuffle([correctOption, ...distractors]);
      const correctIndex = options.findIndex(
        (opt) => deepNormalize(opt.title) === deepNormalize(correctOption.title)
      );

      const playerSource = item.playerId ? room.players.find((p) => p.id === item.playerId) : undefined;

      return {
        roundNumber: i + 1,
        targetTrack: {
          ...target,
          artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
          topic: targetTopic,
        },
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        correctTrackId: target.id,
        correctTitle: target.title,
        topic: targetTopic,
        contributedByPlayerId: item.playerId,
        contributedByPlayerName: item.playerName || target.sourcePlayerName || playerSource?.name,
        sourceMode: target.sourceMode || playerSource?.injectedModeName,
      };
    })
  );

  // Reset players for new match
  room.players.forEach((p) => {
    p.score = 0;
    p.streak = 0;
    p.lives = 3;
    p.currentAnswer = null;
    p.answersByRound = {};
  });

  const now = Date.now();
  room.rounds = rounds;
  room.currentRound = 1;
  room.roundDuration = ROUND_DURATION_SEC;
  room.status = "countdown";
  room.countdownStartTime = now;
  room.countdownEndsAt = now + 3500;
  room.roundStartTime = 0;
  room.roundEndsAt = undefined;
  room.revealStartTime = undefined;
  room.revealEndsAt = undefined;

  await saveRoom(room);
  return { success: true, room };
}

/**
 * Submits an answer for a player.
 * Immediately saves answer to Redis. When all online players answer, transitions
 * to round_reveal for 4.5s (REVEAL_DURATION_MS) without jumping to the next question.
 */
export async function submitPlayerAnswer(
  roomOrCode: RoomState | string,
  playerId: string,
  optionIndex: number,
  timeMs: number,
  guessedFriendId?: string,
  roundIndex?: number,
  selectedTitle?: string
): Promise<{ success: boolean; pointsEarned: number; isCorrect: boolean; room?: RoomState }> {
  const room = typeof roomOrCode === "string" ? await getRoom(roomOrCode) : roomOrCode;
  if (!room) {
    return { success: false, pointsEarned: 0, isCorrect: false };
  }

  if (room.status !== "playing") {
    return { success: false, pointsEarned: 0, isCorrect: false, room };
  }

  // Guard against late / mismatched submissions from previous or desynced rounds
  if (typeof roundIndex !== "number" || roundIndex !== room.currentRound) {
    return { success: false, pointsEarned: 0, isCorrect: false, room };
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    return { success: false, pointsEarned: 0, isCorrect: false, room };
  }

  if (!player.answersByRound) {
    player.answersByRound = {};
  }

  // Strict check: already answered this round
  if (player.answersByRound[room.currentRound] || player.currentAnswer !== null) {
    return { success: false, pointsEarned: 0, isCorrect: false, room };
  }

  const round = room.rounds[room.currentRound - 1];
  if (!round) return { success: false, pointsEarned: 0, isCorrect: false, room };

  // Match answer by normalized title if provided, otherwise by option index
  let isCorrect = false;
  if (selectedTitle && typeof selectedTitle === "string") {
    const targetTitle = round.correctTitle || round.targetTrack?.title || "";
    isCorrect = matchSongTitleStrict(selectedTitle, targetTitle);
  } else {
    isCorrect = optionIndex === round.correctIndex;
  }

  let points = 0;

  if (isCorrect) {
    // Speed points calculated via official exponential curve (up to 20s, max 100 points)
    const elapsedSec = Math.max(0, timeMs / 1000);
    const basePoints = calculateRoundPoints(true, elapsedSec);

    // Who Listens mode bonus for correctly guessing friend
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
  } else {
    player.streak = 0;
    if (room.gameMode === "survival") {
      player.lives = Math.max(0, player.lives - 1);
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
  };

  player.currentAnswer = answerRecord;
  player.answersByRound[room.currentRound] = answerRecord;

  // Check if all active online players have answered:
  // If so, transition to round_reveal for 4.5s (REVEAL_DURATION_MS).
  // DO NOT jump to next round immediately!
  const activePlayers = room.players.filter((p) => p.isOnline);
  const allAnswered =
    activePlayers.length > 0 &&
    activePlayers.every((p) => p.currentAnswer !== null);

  if (allAnswered) {
    const now = Date.now();
    room.status = "round_reveal";
    room.revealStartTime = now;
    room.revealEndsAt = now + REVEAL_DURATION_MS;
    room.roundStartTime = 0;
    room.roundEndsAt = undefined;
  }

  await saveRoom(room);
  return { success: true, pointsEarned: points, isCorrect, room };
}

/**
 * Authoritatively advances the room to the next round or finishes the game.
 * Uses expectedRoundIndex for strict idempotency across multiple simultaneous calls.
 */
export async function advanceRoomRound(
  code: string,
  playerId: string,
  expectedRoundIndex: number
): Promise<{ success: boolean; room?: RoomState }> {
  const room = await getRoom(code);
  if (!room) return { success: false };

  // Idempotency: only advance if currently revealing that specific round
  if (room.status !== "round_reveal") {
    return { success: true, room };
  }

  if (room.currentRound !== expectedRoundIndex) {
    return { success: true, room };
  }

  const now = Date.now();
  room.revealStartTime = undefined;
  room.revealEndsAt = undefined;

  if (room.currentRound < room.rounds.length) {
    room.currentRound += 1;
    room.status = "playing";
    room.roundStartTime = now;
    room.roundEndsAt = now + (room.roundDuration || ROUND_DURATION_SEC) * 1000;
    room.players.forEach((p) => {
      p.currentAnswer = null;
    });
  } else {
    room.status = "finished";
  }

  await saveRoom(room);
  return { success: true, room };
}

/**
 * Resets the room back to lobby for another game with the same players.
 */
export async function resetRoomToLobby(code: string, hostId: string): Promise<boolean> {
  const room = await getRoom(code);
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

  room.players.forEach((p) => {
    p.score = 0;
    p.streak = 0;
    p.lives = 3;
    p.currentAnswer = null;
    p.votedTheme = null;
  });

  await saveRoom(room);
  return true;
}

/**
 * Kicks a player from the room and adds to kicked list (Host only).
 */
export async function kickPlayer(
  code: string,
  hostId: string,
  targetPlayerId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };
  if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede expulsar jugadores." };
  if (targetPlayerId === hostId) return { success: false, error: "El anfitrión no puede expulsarse a sí mismo." };

  if (!room.kickedPlayerIds) room.kickedPlayerIds = [];
  if (!room.kickedPlayerIds.includes(targetPlayerId)) {
    room.kickedPlayerIds.push(targetPlayerId);
  }

  room.players = room.players.filter((p) => p.id !== targetPlayerId);

  // If in playing mode and all remaining players have answered, progress round
  if (room.status === "playing") {
    const activePlayers = room.players.filter((p) => p.isOnline);
    const allAnswered =
      activePlayers.length > 0 &&
      activePlayers.every((p) => p.currentAnswer !== null);
    if (allAnswered) {
      room.status = "round_reveal";
      room.revealStartTime = Date.now();
    }
  }

  await saveRoom(room);
  return { success: true, room };
}

/**
 * Transfers host leadership to another player in the room (Host only).
 */
export async function transferHost(
  code: string,
  hostId: string,
  targetPlayerId: string
): Promise<{ success: boolean; room?: RoomState; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };
  if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede transferir la sala." };

  const target = room.players.find((p) => p.id === targetPlayerId);
  if (!target) return { success: false, error: "Jugador no encontrado en la sala." };

  const prevHost = room.players.find((p) => p.id === hostId);
  if (prevHost) prevHost.isHost = false;

  target.isHost = true;
  room.hostId = targetPlayerId;

  await saveRoom(room);
  return { success: true, room };
}

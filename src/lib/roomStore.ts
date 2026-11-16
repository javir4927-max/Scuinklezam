import { Redis } from "@upstash/redis";
import { SpotifyTrackItem, FALLBACK_SPOTIFY_TRACKS, getFallbackArtwork } from "./spotifyTypes";
import { searchVerifiedTracks } from "./musicService";

export type GameMode =
  | "blend"
  | "top50"
  | "vote"
  | "random"
  | "who_listens"
  | "survival"
  | "tv_party";

export type GuessType = "song" | "artist" | "both";

export interface Player {
  id: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  isBot?: boolean;
  lastSeen: number;
  favoriteArtists: string[];
  spotifyConnected: boolean;
  spotifyBadge?: string;
  injectedTracks?: SpotifyTrackItem[];
  score: number;
  streak: number;
  lives: number;
  currentAnswer: {
    optionIndex: number;
    timeMs: number;
    pointsEarned: number;
    isCorrect: boolean;
    guessedFriendId?: string;
  } | null;
  votedTheme: string | null;
}

export interface ThemeProposal {
  id: string;
  label: string;
  proposedBy: string;
  votes: string[];
}

export interface RoundData {
  roundNumber: number;
  targetTrack: SpotifyTrackItem;
  options: string[];
  correctIndex: number;
  contributedByPlayerId?: string;
  contributedByPlayerName?: string;
}

export interface RoomState {
  code: string;
  hostId: string;
  name: string;
  status: "lobby" | "countdown" | "playing" | "round_reveal" | "finished";
  gameMode: GameMode;
  guessType: GuessType;
  totalRounds: number;
  currentRound: number;
  roundStartTime: number;
  revealStartTime?: number;
  countdownStartTime?: number;
  players: Player[];
  themeProposals: ThemeProposal[];
  rounds: RoundData[];
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

// Pre-defined bot personalities with distinct music tastes
export const BOT_CATALOG = [
  {
    name: "Maya",
    avatarColor: "#10B981", // Emerald
    favoriteArtists: ["Billie Eilish", "Dua Lipa", "Olivia Rodrigo"],
  },
  {
    name: "Leo",
    avatarColor: "#84CC16", // Lime
    favoriteArtists: ["The Weeknd", "Drake", "Kendrick Lamar"],
  },
  {
    name: "Zoé",
    avatarColor: "#F59E0B", // Amber
    favoriteArtists: ["Taylor Swift", "Sabrina Carpenter", "Rosalía"],
  },
  {
    name: "Mateo",
    avatarColor: "#06B6D4", // Cyan
    favoriteArtists: ["Bad Bunny", "Feid", "Bizarrap"],
  },
  {
    name: "Nora",
    avatarColor: "#EC4899", // Pink
    favoriteArtists: ["Lady Gaga", "Bruno Mars", "Coldplay"],
  },
];

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

  const hostPlayer: Player = {
    id: hostId,
    name: hostName.trim() || "Lucas",
    avatarColor: "#10B981",
    isHost: true,
    isReady: true,
    isOnline: true,
    isBot: false,
    lastSeen: Date.now(),
    favoriteArtists:
      initialArtists && initialArtists.length > 0
        ? initialArtists.slice(0, 3)
        : ["Bad Bunny", "The Weeknd", "Dua Lipa"],
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
    name: roomName ? roomName.trim() : `Sala de ${hostPlayer.name}`,
    status: "lobby",
    gameMode: "blend",
    guessType: "song",
    totalRounds: 10,
    currentRound: 1,
    roundStartTime: 0,
    players: [hostPlayer],
    themeProposals: [...DEFAULT_THEME_PROPOSALS],
    rounds: [],
    kickedPlayerIds: [],
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  await saveRoom(newRoom);
  return newRoom;
}

/**
 * Gets a room by code and cleans up timed-out players/advances auto states.
 */
export async function getRoom(code: string, activePlayerId?: string): Promise<RoomState | null> {
  const upperCode = code.toUpperCase().trim();
  let room = rooms.get(upperCode) || null;

  // If not found in memory, check Upstash Redis
  if (!room && redis) {
    try {
      const remote = await redis.get<RoomState>(`${ROOM_KEY_PREFIX}${upperCode}`);
      if (remote) {
        room = remote;
        rooms.set(upperCode, remote);
      }
    } catch (err) {
      console.error(`[Upstash Redis] Error retrieving room ${upperCode}:`, err);
    }
  }

  // Auto-seed canonical K7QP demo room if requested and not yet present
  if (!room && upperCode === "K7QP") {
    room = {
      code: "K7QP",
      hostId: "host_lucas",
      name: "Sala Ranked Pro",
      status: "lobby",
      gameMode: "blend",
      guessType: "song",
      totalRounds: 10,
      currentRound: 1,
      roundStartTime: 0,
      players: [
        {
          id: "host_lucas",
          name: "Lucas",
          avatarColor: "#10B981",
          isHost: true,
          isReady: true,
          isOnline: true,
          isBot: false,
          lastSeen: Date.now(),
          favoriteArtists: ["Bad Bunny", "The Weeknd", "Dua Lipa"],
          spotifyConnected: false,
          score: 0,
          streak: 0,
          lives: 3,
          currentAnswer: null,
          votedTheme: null,
        },
        {
          id: "bot_maya",
          name: "Maya",
          avatarColor: "#10B981",
          isHost: false,
          isReady: true,
          isOnline: true,
          isBot: true,
          lastSeen: Date.now(),
          favoriteArtists: ["Billie Eilish", "Dua Lipa", "Olivia Rodrigo"],
          spotifyConnected: false,
          score: 0,
          streak: 0,
          lives: 3,
          currentAnswer: null,
          votedTheme: null,
        },
        {
          id: "bot_leo",
          name: "Leo",
          avatarColor: "#F59E0B",
          isHost: false,
          isReady: true,
          isOnline: true,
          isBot: true,
          lastSeen: Date.now(),
          favoriteArtists: ["Drake", "Kendrick Lamar", "Travis Scott"],
          spotifyConnected: false,
          score: 0,
          streak: 0,
          lives: 3,
          currentAnswer: null,
          votedTheme: null,
        },
      ],
      themeProposals: [...DEFAULT_THEME_PROPOSALS],
      rounds: [],
      kickedPlayerIds: [],
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    await saveRoom(room);
  }

  if (!room) return null;

  const now = Date.now();
  let changed = false;

  if (now - room.lastActive > 1000) {
    room.lastActive = now;
    changed = true;
  }

  // Heartbeat update for active player
  if (activePlayerId) {
    const player = room.players.find((p) => p.id === activePlayerId);
    if (player) {
      if (player.lastSeen !== now || !player.isOnline) {
        player.lastSeen = now;
        player.isOnline = true;
        changed = true;
      }
    }
  }

  // Update online status: offline if no heartbeat in 45s (except bots)
  room.players.forEach((p) => {
    if (!p.isBot && now - p.lastSeen > 45000 && p.isOnline) {
      p.isOnline = false;
      changed = true;
    }
  });

  // State machine progression check
  const progressed = checkRoomStateProgression(room);
  if (progressed || changed) {
    await saveRoom(room);
  }

  return room;
}

/**
 * Progresses room state based on timers and player responses.
 */
function checkRoomStateProgression(room: RoomState): boolean {
  const now = Date.now();
  let changed = false;

  // 1. COUNTDOWN -> PLAYING (3.5 seconds)
  if (room.status === "countdown" && room.countdownStartTime) {
    if (now - room.countdownStartTime >= 3500) {
      room.status = "playing";
      room.roundStartTime = now;
      room.countdownStartTime = undefined;
      // Reset players currentAnswer for round 1
      room.players.forEach((p) => {
        p.currentAnswer = null;
      });
      // Trigger bot answers
      scheduleBotAnswers(room);
      changed = true;
    }
  }

  // 2. PLAYING -> ROUND_REVEAL (15 seconds elapsed OR all online players answered)
  if (room.status === "playing" && room.roundStartTime) {
    const elapsed = now - room.roundStartTime;
    const activePlayers = room.players.filter((p) => p.isOnline || p.isBot);
    const allAnswered =
      activePlayers.length > 0 &&
      activePlayers.every((p) => p.currentAnswer !== null);

    if (elapsed >= 15500 || allAnswered) {
      room.status = "round_reveal";
      room.revealStartTime = now;

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

  // 3. ROUND_REVEAL -> NEXT ROUND or FINISHED (4 seconds)
  if (room.status === "round_reveal" && room.revealStartTime) {
    if (now - room.revealStartTime >= 4000) {
      room.revealStartTime = undefined;
      if (room.currentRound < room.rounds.length) {
        room.currentRound += 1;
        room.status = "playing";
        room.roundStartTime = now;
        room.players.forEach((p) => {
          p.currentAnswer = null;
        });
        scheduleBotAnswers(room);
      } else {
        room.status = "finished";
      }
      changed = true;
    }
  }

  return changed;
}

/**
 * Simulates intelligent bot answer submissions with human-like delays.
 */
function scheduleBotAnswers(room: RoomState): void {
  const currentRoundData = room.rounds[room.currentRound - 1];
  if (!currentRoundData) return;

  const bots = room.players.filter((p) => p.isBot && p.currentAnswer === null);

  bots.forEach((bot) => {
    // Determine bot accuracy (70-85% accurate)
    const isAccurate = Math.random() < 0.78;
    let selectedOption = currentRoundData.correctIndex;

    if (!isAccurate) {
      // Pick random wrong option
      const wrongOptions = [0, 1, 2, 3].filter((i) => i !== currentRoundData.correctIndex);
      selectedOption = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    }

    // Delay between 2.8s and 9.5s
    const delayMs = Math.floor(2800 + Math.random() * 6700);

    // Friend guess for who_listens mode
    let guessedFriendId: string | undefined;
    if (room.gameMode === "who_listens") {
      const otherPlayers = room.players.filter((p) => p.id !== bot.id);
      if (otherPlayers.length > 0) {
        guessedFriendId = otherPlayers[Math.floor(Math.random() * otherPlayers.length)].id;
      }
    }

    setTimeout(async () => {
      // Check if room and round are still valid
      if (room.status === "playing" && !bot.currentAnswer) {
        await submitPlayerAnswer(room, bot.id, selectedOption, delayMs, guessedFriendId);
      }
    }, delayMs);
  });
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

  // If canonical demo room K7QP host is still placeholder "host_lucas", claim it for the first human visitor
  if (code === "K7QP" && room.hostId === "host_lucas") {
    const hostIdx = room.players.findIndex((p) => p.id === "host_lucas");
    if (hostIdx >= 0) {
      room.players[hostIdx].id = playerData.id;
      room.players[hostIdx].name = playerData.name.trim() || "Lucas";
      room.players[hostIdx].lastSeen = Date.now();
      room.hostId = playerData.id;
      await saveRoom(room);
      return { success: true, room };
    }
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
      room.players[existingIndex].favoriteArtists = playerData.favoriteArtists.slice(0, 3);
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
      isBot: false,
      lastSeen: Date.now(),
      favoriteArtists:
        playerData.favoriteArtists && playerData.favoriteArtists.length > 0
          ? playerData.favoriteArtists.slice(0, 3)
          : ["Taylor Swift", "Coldplay", "Bad Bunny"],
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
 * Adds an intelligent bot player to the room.
 */
export async function addBotToRoom(code: string): Promise<{ success: boolean; room?: RoomState; bot?: Player; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };

  if (room.players.length >= 12) {
    return { success: false, error: "La sala está llena (máximo 12 jugadores)." };
  }

  // Pick an unused bot from catalog or generate one
  const existingNames = new Set(room.players.map((p) => p.name.toLowerCase()));
  const availableBot = BOT_CATALOG.find((b) => !existingNames.has(b.name.toLowerCase()));

  const botName = availableBot ? availableBot.name : `Bot ${room.players.length + 1}`;
  const botColor = availableBot ? availableBot.avatarColor : "#84CC16";
  const botTastes = availableBot ? availableBot.favoriteArtists : ["The Weeknd", "Rosalía", "Queen"];

  const botPlayer: Player = {
    id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: botName,
    avatarColor: botColor,
    isHost: false,
    isReady: true,
    isOnline: true,
    isBot: true,
    lastSeen: Date.now(),
    favoriteArtists: botTastes,
    spotifyConnected: false,
    score: 0,
    streak: 0,
    lives: 3,
    currentAnswer: null,
    votedTheme: null,
  };

  room.players.push(botPlayer);
  await saveRoom(room);
  return { success: true, room, bot: botPlayer };
}

/**
 * Updates a player's contributed musical taste (artists/genres).
 */
export async function updatePlayerTaste(code: string, playerId: string, favoriteArtists: string[]): Promise<boolean> {
  const room = await getRoom(code);
  if (!room) return false;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;

  player.favoriteArtists = favoriteArtists.filter((a) => a.trim().length > 0).slice(0, 3);
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
  artists?: string[]
): Promise<boolean> {
  const room = await getRoom(code);
  if (!room) return false;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;

  player.spotifyConnected = true;

  if (artists && artists.length > 0) {
    player.favoriteArtists = artists.filter((a) => a.trim().length > 0).slice(0, 3);
    player.spotifyBadge = `Spotify Analizado · Top: ${artists.slice(0, 2).join(", ")}`;
  } else if (tracks && tracks.length > 0) {
    const extracted = Array.from(new Set(tracks.map((t) => t.artist.split(",")[0].trim()).filter(Boolean))).slice(0, 3);
    if (extracted.length > 0) {
      player.favoriteArtists = extracted;
      player.spotifyBadge = `Spotify Analizado · Top: ${extracted.slice(0, 2).join(", ")}`;
    } else {
      player.spotifyBadge = "Spotify Analizado";
    }
  } else {
    player.spotifyBadge = "Spotify Analizado";
  }

  // Filter valid tracks with audio preview & artwork
  const validTracks = (tracks || []).filter(
    (t) => t && t.previewUrl && t.previewUrl.startsWith("http") && t.artworkUrl
  );
  player.injectedTracks = validTracks;

  await saveRoom(room);
  return true;
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
export async function startRoomGame(code: string, hostId: string): Promise<{ success: boolean; error?: string }> {
  const room = await getRoom(code);
  if (!room) return { success: false, error: "Sala no encontrada." };
  if (room.hostId !== hostId) return { success: false, error: "Solo el anfitrión puede iniciar la partida." };

  const pool: Array<{ track: SpotifyTrackItem; playerId?: string; playerName?: string }> = [];

  // Build song pool based on Game Mode
  if (room.gameMode === "blend" || room.gameMode === "who_listens") {
    // Taste Blend: Gather from all players equally
    for (const player of room.players) {
      // Prioritize directly injected Spotify tracks if available
      if (player.injectedTracks && player.injectedTracks.length > 0) {
        player.injectedTracks.forEach((track) => {
          pool.push({
            track,
            playerId: player.id,
            playerName: player.name,
          });
        });
      }

      const tastes = player.favoriteArtists.length > 0 ? player.favoriteArtists : ["Pop Hits"];
      for (const artist of tastes) {
        const found = await searchVerifiedTracks(artist, 6);
        found.forEach((track) => {
          pool.push({
            track,
            playerId: player.id,
            playerName: player.name,
          });
        });
      }
    }
  } else if (room.gameMode === "vote") {
    // Highest voted theme
    let bestProposal = room.themeProposals[0];
    let maxVotes = -1;
    for (const prop of room.themeProposals) {
      if (prop.votes.length > maxVotes) {
        maxVotes = prop.votes.length;
        bestProposal = prop;
      }
    }
    const found = await searchVerifiedTracks(bestProposal?.label || "Pop Hits", room.totalRounds + 4);
    found.forEach((track) => pool.push({ track }));
  } else if (room.gameMode === "top50") {
    const found = await searchVerifiedTracks("Global Top 50 Hits", room.totalRounds + 4);
    found.forEach((track) => pool.push({ track }));
  } else {
    // Random chaos / Survival / TV Party
    const genres = ["Pop Hits", "Rock Classics", "Latin Hits", "Hip Hop Hits", "80s Hits", "Electronic Hits"];
    for (const g of genres) {
      const found = await searchVerifiedTracks(g, 5);
      found.forEach((track) => pool.push({ track }));
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

  // Minimum required pool: totalRounds + 4
  const minRequired = room.totalRounds + 4;
  if (validUniquePool.length < minRequired) {
    const emergencyTracks = await searchVerifiedTracks("Top Hits 2024", minRequired - validUniquePool.length + 5);
    for (const et of emergencyTracks) {
      if (validUniquePool.length >= minRequired) break;
      const titleKey = `${et.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${et.artist.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      if (!seenIds.has(et.id) && !seenTitles.has(titleKey)) {
        seenIds.add(et.id);
        seenTitles.add(titleKey);
        validUniquePool.push({ track: et });
      }
    }
  }

  // Fallback to FALLBACK_SPOTIFY_TRACKS if still under minRequired
  if (validUniquePool.length < minRequired) {
    for (const ft of FALLBACK_SPOTIFY_TRACKS) {
      if (validUniquePool.length >= minRequired) break;
      if (!seenIds.has(ft.id)) {
        seenIds.add(ft.id);
        validUniquePool.push({ track: ft });
      }
    }
  }

  // Shuffle pool
  const shuffledPool = [...validUniquePool].sort(() => 0.5 - Math.random());

  // Assemble rounds
  const roundsToGenerate = Math.min(room.totalRounds, shuffledPool.length);
  const rounds: RoundData[] = [];

  for (let i = 0; i < roundsToGenerate; i++) {
    const item = shuffledPool[i];
    const target = item.track;

    // Distractors
    const otherTracks = shuffledPool.filter((u) => u.track.id !== target.id);
    const shuffledOthers = [...otherTracks].sort(() => 0.5 - Math.random()).slice(0, 3);

    // Option text depends on guessType
    let correctText = target.title;
    let distractorTexts = shuffledOthers.map((o) => o.track.title);

    if (room.guessType === "artist") {
      correctText = target.artist;
      distractorTexts = shuffledOthers.map((o) => o.track.artist);
    } else if (room.guessType === "both") {
      correctText = `${target.title} — ${target.artist}`;
      distractorTexts = shuffledOthers.map((o) => `${o.track.title} — ${o.track.artist}`);
    }

    // Merge & shuffle options
    const options = [correctText, ...distractorTexts].sort(() => 0.5 - Math.random());
    const correctIndex = options.indexOf(correctText);

    rounds.push({
      roundNumber: i + 1,
      targetTrack: {
        ...target,
        artworkUrl: target.artworkUrl || getFallbackArtwork(target.title, target.artist),
      },
      options,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      contributedByPlayerId: item.playerId,
      contributedByPlayerName: item.playerName,
    });
  }

  // Reset players for new match
  room.players.forEach((p) => {
    p.score = 0;
    p.streak = 0;
    p.lives = 3;
    p.currentAnswer = null;
  });

  room.rounds = rounds;
  room.currentRound = 1;
  room.status = "countdown";
  room.countdownStartTime = Date.now();

  await saveRoom(room);
  return { success: true };
}

/**
 * Submits an answer for a player.
 */
export async function submitPlayerAnswer(
  room: RoomState,
  playerId: string,
  optionIndex: number,
  timeMs: number,
  guessedFriendId?: string
): Promise<{ success: boolean; pointsEarned: number; isCorrect: boolean }> {
  if (room.status !== "playing") {
    return { success: false, pointsEarned: 0, isCorrect: false };
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.currentAnswer !== null) {
    return { success: false, pointsEarned: 0, isCorrect: false };
  }

  const round = room.rounds[room.currentRound - 1];
  if (!round) return { success: false, pointsEarned: 0, isCorrect: false };

  const isCorrect = optionIndex === round.correctIndex;
  let points = 0;

  if (isCorrect) {
    // Speed bonus: max 100 points, decreasing by response time
    const timeSec = Math.min(15, Math.max(0, timeMs / 1000));
    const speedRatio = Math.max(0, (15 - timeSec) / 15);
    const speedPoints = Math.round(50 + speedRatio * 50); // 50 to 100

    // Streak bonus
    const streakBonus = Math.min(30, player.streak * 5);

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

    points = speedPoints + streakBonus + friendBonus;
    player.score += points;
    player.streak += 1;
  } else {
    player.streak = 0;
    if (room.gameMode === "survival") {
      player.lives = Math.max(0, player.lives - 1);
    }
  }

  player.currentAnswer = {
    optionIndex,
    timeMs,
    pointsEarned: points,
    isCorrect,
    guessedFriendId,
  };

  // Check if all active players have answered to immediately transition to round_reveal
  checkRoomStateProgression(room);

  await saveRoom(room);
  return { success: true, pointsEarned: points, isCorrect };
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
  room.revealStartTime = undefined;
  room.countdownStartTime = undefined;

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
    const activePlayers = room.players.filter((p) => p.isOnline || p.isBot);
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

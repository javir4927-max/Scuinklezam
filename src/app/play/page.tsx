"use client";

import React, { useState, useEffect, useRef, useTransition, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { playSynthNote } from "@/lib/audio";
import { playCorrectSound, playWrongSound } from "@/lib/soundEffects";
import { audioPlayer } from "@/lib/audioPlayer";
import {
  FlaskConical,
  Globe,
  Vote,
  Dices,
  UserCheck,
  Skull,
  Tv,
  Flame,
  Trophy,
  Clock,
  FolderHeart,
  Headphones,
  Crown,
  Zap,
  Heart,
  Music2,
  Sparkles,
  Users,
  X,
  Volume2,
  Volume1,
  VolumeX,
  Link2,
  AlertTriangle,
  Gamepad2,
  Plus,
  Bot,
  RotateCcw,
  Check,
  ExternalLink,
  Copy,
  Pencil,
  Loader2,
  BarChart3,
} from "lucide-react";
import { SpotifyTrackItem, getFallbackArtwork } from "@/lib/spotifyTypes";
import type { RoomState, Player, GameMode, GuessType, RoundOption } from "@/lib/roomStore";

// Universal clipboard copy fallback
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("[Clipboard API failed, trying execCommand fallback]", err);
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error("[Clipboard execCommand fallback failed]", err);
    return false;
  }
}

function normalizeRoundOption(opt: RoundOption | string): RoundOption {
  if (typeof opt === "string") {
    const parts = opt.split(" — ");
    return {
      title: parts[0] || opt,
      artist: parts[1] || "",
      artworkUrl: getFallbackArtwork(parts[0] || opt, parts[1] || ""),
    };
  }
  return {
    title: opt?.title || "Canción",
    artist: opt?.artist || "",
    artworkUrl: opt?.artworkUrl || getFallbackArtwork(opt?.title || "Canción", opt?.artist || ""),
  };
}
import SpotifyConnectModal from "@/components/SpotifyConnectModal";
import SpotifyStatsDetailModal from "@/components/SpotifyStatsDetailModal";
import Navbar from "@/components/Navbar";
import { PRELOADED_ARTIST_PHOTOS } from "@/lib/artistPhotosCatalog";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";

function renderModeIcon(modeId: GameMode, className: string = "w-5 h-5") {
  switch (modeId) {
    case "blend":
      return <FlaskConical className={`${className} text-emerald-400`} />;
    case "top50":
      return <Globe className={`${className} text-goblinLime`} />;
    case "vote":
      return <Vote className={`${className} text-amber-400`} />;
    case "random":
      return <Dices className={`${className} text-pink-400`} />;
    case "who_listens":
      return <UserCheck className={`${className} text-purple-400`} />;
    case "survival":
      return <Skull className={`${className} text-rose-400`} />;
    case "tv_party":
      return <Tv className={`${className} text-cyan-400`} />;
    default:
      return <FlaskConical className={`${className} text-emerald-400`} />;
  }
}

const GAME_MODES: Array<{
  id: GameMode;
  name: string;
  badge: string;
  desc: string;
}> = [
  {
    id: "blend",
    name: "Mezcla de Gustos",
    badge: "Popular",
    desc: "Combina de forma equilibrada los artistas y gustos favoritos de todos los jugadores de la sala.",
  },
  {
    id: "top50",
    name: "Top 50 Mundial",
    badge: "Oficial",
    desc: "Adivina los éxitos más reproducidos actualmente en el catálogo global de Spotify.",
  },
  {
    id: "vote",
    name: "Votación Democrática",
    badge: "En Vivo",
    desc: "Todos los jugadores proponen y votan temas en el lobby. Se juega con el más votado.",
  },
  {
    id: "random",
    name: "Caos Random",
    badge: "Sorpresa",
    desc: "Mezcla impredecible de Pop, Rock, 80s, Trap, Reggaeton y placeres culpables.",
  },
  {
    id: "who_listens",
    name: "¿De quién es este temazo?",
    badge: "Doble Punto",
    desc: "Adivina la canción y a qué amigo de la sala le gusta. ¡+50 pts bonus si aciertas al amigo!",
  },
  {
    id: "survival",
    name: "Supervivencia",
    badge: "Hardcore",
    desc: "Cada jugador empieza con 3 vidas. Si fallas una pregunta, pierdes una vida.",
  },
  {
    id: "tv_party",
    name: "Modo Fiesta / TV Sofá",
    badge: "Salón",
    desc: "Interfaz gigante de alto contraste perfecta para conectar tu portátil a la TV del salón.",
  },
];

interface ArtistSuggestion {
  id: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  followers: number;
}

function PlayArenaContent() {
  const searchParams = useSearchParams();
  const initialRoomQuery = searchParams.get("room") || "";

  // Spotify Global Session Hook
  const {
    isConnected: spotifyConnected,
    user: spotifyAuthUser,
    stats: spotifyStats,
    playlists: spotifyPlaylists,
  } = useSpotifyAuth();

  // Player Identity
  const [playerId, setPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");

  // Room State
  const [roomCode, setRoomCode] = useState<string>(initialRoomQuery.toUpperCase());
  const [room, setRoom] = useState<RoomState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI Modals
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [showTasteModal, setShowTasteModal] = useState<boolean>(false);
  const [showSpotifyModal, setShowSpotifyModal] = useState<boolean>(false);
  const [showStatsDetailModal, setShowStatsDetailModal] = useState<boolean>(false);
  const [loadingSpotifyMode, setLoadingSpotifyMode] = useState<string | null>(null);
  const [spotifyModeNotice, setSpotifyModeNotice] = useState<{ type: "success" | "warning"; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [optionImageErrors, setOptionImageErrors] = useState<Record<string, boolean>>({});
  const [newArtistInput, setNewArtistInput] = useState<string>("");
  const [newThemeProposal, setNewThemeProposal] = useState<string>("");

  // Player Inline Name Edit State
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [editNameInput, setEditNameInput] = useState<string>("");
  const [isSavingName, setIsSavingName] = useState<boolean>(false);

  // Playlist Import State
  const [playlistUrlInput, setPlaylistUrlInput] = useState<string>("");
  const [isImportingPlaylist, setIsImportingPlaylist] = useState<boolean>(false);
  const [playlistImportError, setPlaylistImportError] = useState<string | null>(null);

  // Artist Autocomplete State
  const [artistSuggestions, setArtistSuggestions] = useState<ArtistSuggestion[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(-1);
  const [isSearchingArtist, setIsSearchingArtist] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);

  // Gameplay Local Interaction
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [scorePopup, setScorePopup] = useState<{
    points: number;
    isCorrect: boolean;
    optionIndex: number;
    key: number;
  } | null>(null);
  const scorePopupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [volume, setVolume] = useState<number>(0.25);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState<boolean>(false);
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState<boolean>(false);

  // Audio & Timer Refs
  const prevStatusRef = useRef<string>("");
  const prevRoundRef = useRef<number>(0);
  const [, startTransition] = useTransition();

  // Subscribe to audio player state
  useEffect(() => {
    const unsub = audioPlayer.subscribe((state) => {
      setIsAudioBlocked(state.isBlocked);
    });
    return () => unsub();
  }, []);

  // Initialize volume from localStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem("scuinklezam_volume");
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          setVolume(parsed);
          audioPlayer.setVolume(parsed);
          return;
        }
      }
      audioPlayer.setVolume(0.25);
    } catch {
      // ignore
    }
  }, []);

  // Synchronize audio volume when muted or volume changes, and persist to localStorage
  useEffect(() => {
    const effective = audioMuted ? 0 : volume;
    audioPlayer.setVolume(effective);
    try {
      localStorage.setItem("scuinklezam_volume", volume.toString());
    } catch {
      // ignore
    }
  }, [audioMuted, volume]);

  // Artist Autocomplete Debounce (250ms)
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    const query = newArtistInput.trim();
    if (query.length < 2) {
      setArtistSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIdx(-1);
      setIsSearchingArtist(false);
      return;
    }

    setIsSearchingArtist(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spotify/artists?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.artists)) {
            setArtistSuggestions(data.artists);
            setShowSuggestions(data.artists.length > 0);
            setSelectedSuggestionIdx(-1);
          }
        }
      } catch (err) {
        console.error("Error searching artists:", err);
      } finally {
        setIsSearchingArtist(false);
      }
    }, 250);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [newArtistInput]);

  // Dismiss autocomplete dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Initialize Player Identity from SessionStorage / Spotify (isolated per tab)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let localId = sessionStorage.getItem("scuinklezam_player_id");
    let localName = sessionStorage.getItem("scuinklezam_player_name") || "";

    if (!localId) {
      localId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem("scuinklezam_player_id", localId);
    }
    setPlayerId(localId);

    if (spotifyAuthUser?.displayName) {
      localName = spotifyAuthUser.displayName;
      sessionStorage.setItem("scuinklezam_player_name", localName);
    }

    setPlayerName(localName);
  }, [spotifyAuthUser]);

  // Handler for Injecting Spotify Tracks & Stats into current Room
  const handleInjectSpotifyTracks = async (
    tracks: SpotifyTrackItem[],
    label: string,
    artists?: string[]
  ) => {
    if (!roomCode || !playerId) return;
    try {
      const topArtists = (
        artists && artists.length > 0
          ? artists
          : Array.from(new Set(tracks.map((t) => t.artist.split(",")[0].trim()).filter(Boolean)))
      ).slice(0, 5);

      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "inject_spotify_tracks",
          playerId,
          tracks,
          artists: topArtists,
          label,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error injecting Spotify tracks:", err);
    }
  };

  // Handler for loading real Spotify user modes (Auto-refresh on 401, real endpoints, 0 fake tracks)
  const handleLoadSpotifyMode = async (
    mode: "recently_played" | "top_tracks" | "top_artists" | "liked_songs"
  ) => {
    if (!roomCode || !playerId) return;
    setLoadingSpotifyMode(mode);
    setSpotifyModeNotice(null);
    try {
      const res = await fetch("/api/spotify/user-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!data.success) {
        setSpotifyModeNotice({
          type: "warning",
          message: data.error || "No se pudieron obtener las canciones de Spotify.",
        });
        return;
      }

      if (!data.tracks || data.tracks.length === 0) {
        setSpotifyModeNotice({
          type: "warning",
          message:
            data.warning ||
            `0 canciones encontradas en el modo "${data.modeName}". Escucha más música en Spotify para llenar este modo.`,
        });
        return;
      }

      await handleInjectSpotifyTracks(data.tracks, data.modeName, data.artists);
      setSpotifyModeNotice({
        type: "success",
        message: `Modo "${data.modeName}" cargado con éxito (${data.count} canciones listas para jugar).`,
      });
    } catch (err) {
      console.error("Error loading spotify mode:", err);
      setSpotifyModeNotice({
        type: "warning",
        message: "Error de conexión al cargar modo de Spotify.",
      });
    } finally {
      setLoadingSpotifyMode(null);
    }
  };

  // 2. Auto-join room or Auto-create room from URL parameters
  const createQuery = searchParams.get("create");
  const artistQuery = searchParams.get("artist");

  useEffect(() => {
    if (initialRoomQuery && playerId && !room) {
      handleJoinRoom(initialRoomQuery.toUpperCase());
    } else if ((createQuery === "true" || artistQuery) && playerId && !room) {
      handleCreateRoom(artistQuery || undefined);
    }
  }, [initialRoomQuery, createQuery, artistQuery, playerId]);

  // 3. Real-time Room Polling Engine (Every 1000ms with strict anti-cache)
  useEffect(() => {
    if (!roomCode) return;

    let isMounted = true;
    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}?playerId=${playerId}&t=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });
        if (!res.ok) {
          if (res.status === 404 && isMounted) {
            setErrorMessage("La sala no existe o ha expirado.");
            setRoom(null);
          }
          return;
        }
        const data = await res.json();
        if (data.success && isMounted && data.room) {
          const currentRoom: RoomState = data.room;

          // Check if current player was kicked by host
          const wasKicked = currentRoom.kickedPlayerIds && currentRoom.kickedPlayerIds.includes(playerId);
          const stillInRoom = currentRoom.players.some((p) => p.id === playerId);

          if (wasKicked) {
            audioPlayer.stop();
            setRoom(null);
            setRoomCode("");
            setErrorMessage("Has sido expulsado de la sala por el anfitrión.");
            return;
          }

          if (!stillInRoom && currentRoom.status === "lobby") {
            // Player temporarily missing from players list (e.g. Redis replication lag).
            // Do NOT kick: automatically re-send background join PATCH to re-sync
            fetch(`/api/rooms/${roomCode}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "join",
                playerId,
                name: playerName || "Jugador",
                spotifyConnected,
              }),
            }).catch(() => {});
          }

          setRoom(currentRoom);
          setErrorMessage(null);
        }
      } catch (err) {
        // network retry
      }
    };

    fetchRoom();
    const interval = setInterval(fetchRoom, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roomCode, playerId]);

  // Smooth local ticker to update seconds on screen between polling cycles
  const [, setTicker] = useState<number>(Date.now());
  useEffect(() => {
    if (!room || (room.status !== "countdown" && room.status !== "playing" && room.status !== "voting")) return;
    const interval = setInterval(() => {
      setTicker(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [room?.status]);

  // 4. Synchronized Audio Playback and State Transitions
  useEffect(() => {
    if (!room) return;

    const currentRoundData = room.rounds[room.currentRound - 1];

    // Status changed to Countdown
    if (room.status === "countdown" && prevStatusRef.current !== "countdown") {
      playSynthNote(440, 0.2);
      setSelectedOption(null);
      setSelectedFriend(null);
      setScorePopup(null);
    }

    // Status changed to Playing or Round changed
    if (
      room.status === "playing" &&
      (prevStatusRef.current !== "playing" || prevRoundRef.current !== room.currentRound)
    ) {
      setSelectedOption(null);
      setSelectedFriend(null);
      setScorePopup(null);

      // Play audio preview via centralized audioPlayer
      if (currentRoundData?.targetTrack?.previewUrl) {
        audioPlayer.playTrack(currentRoundData.targetTrack.previewUrl);
        // Preload next round audio
        if (room.rounds[room.currentRound]) {
          audioPlayer.preloadNext(room.rounds[room.currentRound]?.targetTrack?.previewUrl);
        }
      }
    }

    // Status changed to Round Reveal
    if (room.status === "round_reveal" && prevStatusRef.current !== "round_reveal") {
      // Preload next track while revealing
      if (room.rounds[room.currentRound]) {
        audioPlayer.preloadNext(room.rounds[room.currentRound]?.targetTrack?.previewUrl);
      }

      // Reveal sound (only if answer sound was not already played in this round)
      const me = room.players.find((p) => p.id === playerId);
      if (!scorePopup) {
        if (me?.currentAnswer?.isCorrect) {
          playSynthNote(523.25, 0.25);
          setTimeout(() => playSynthNote(659.25, 0.35), 120);
        } else if (me?.currentAnswer) {
          playSynthNote(220, 0.35);
        }
      }
    }

    // Status changed to Finished
    if (room.status === "finished" && prevStatusRef.current !== "finished") {
      audioPlayer.stop();
      playSynthNote(523.25, 0.2);
      setTimeout(() => playSynthNote(659.25, 0.2), 150);
      setTimeout(() => playSynthNote(783.99, 0.4), 300);
    }

    prevStatusRef.current = room.status;
    prevRoundRef.current = room.currentRound;
  }, [room?.status, room?.currentRound, audioMuted, playerId]);

  // 5. Cleanup Audio on unmount
  useEffect(() => {
    return () => {
      audioPlayer.stop();
    };
  }, []);

  // 6. Keyboard Shortcuts for Quiz Options [1, 2, 3, 4]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (room?.status !== "playing" || selectedOption !== null) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        handleAnswer(idx);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [room?.status, selectedOption, roomCode]);

  // --- ACTIONS ---

  // Create Room (0 initial artists by default)
  const handleCreateRoom = async (initialArtist?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const tastes = initialArtist ? [initialArtist.trim()] : [];
      const hostDisplayName = playerName.trim() || (spotifyAuthUser?.displayName || "Anfitrión");

      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          hostName: hostDisplayName,
          hostId: playerId,
          roomName: `Sala de ${hostDisplayName}`,
          initialArtists: tastes,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
        setRoomCode(data.room.code);
      } else {
        setErrorMessage(data.error || "Error al crear la sala.");
      }
    } catch {
      setErrorMessage("Error de conexión al crear la sala.");
    } finally {
      setIsLoading(false);
    }
  };

  // Join Room (0 initial artists by default)
  const handleJoinRoom = async (codeToJoin: string) => {
    const cleanCode = codeToJoin.trim().toUpperCase();
    if (!cleanCode) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const guestDisplayName = playerName.trim() || (spotifyAuthUser?.displayName || "Invitado");

      const res = await fetch(`/api/rooms/${cleanCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "join",
          playerId,
          name: guestDisplayName,
          favoriteArtists: [],
          spotifyConnected: spotifyConnected,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
        setRoomCode(data.room.code);
      } else {
        setErrorMessage(data.error || "No se pudo unir a la sala.");
      }
    } catch {
      setErrorMessage("Error de conexión al unirse a la sala.");
    } finally {
      setIsLoading(false);
    }
  };

  // Add Bot Player
  const handleAddBot = async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_bot" }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error adding bot:", err);
    }
  };

  // Update Game Mode or Settings
  const handleChangeSettings = async (settings: {
    gameMode?: GameMode;
    guessType?: GuessType;
    totalRounds?: number;
  }) => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_settings",
          playerId,
          ...settings,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error updating settings:", err);
    }
  };

  // Start Ranked Match
  const handleStartGame = async () => {
    if (!roomCode) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_game",
          playerId,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      } else {
        setErrorMessage(data.error || "No se pudo iniciar la partida.");
      }
    } catch {
      setErrorMessage("Error de conexión al iniciar la partida.");
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Answer
  const handleAnswer = async (optionIdx: number) => {
    if (!room || room.status !== "playing" || selectedOption !== null) return;
    setSelectedOption(optionIdx);

    const now = Date.now();
    const timeMs = room.roundStartTime ? now - room.roundStartTime : 5000;
    const currentRound = room.rounds[room.currentRound - 1];
    const isCorrect = optionIdx === currentRound?.correctIndex;

    // Instant local points calculation
    let calculatedPoints = 0;
    if (isCorrect) {
      const timeSec = Math.min(15, Math.max(0, timeMs / 1000));
      const speedRatio = Math.max(0, (15 - timeSec) / 15);
      const speedPoints = Math.round(50 + speedRatio * 50);
      const currentMe = room.players.find((p) => p.id === playerId);
      const streakBonus = Math.min(30, (currentMe?.streak || 0) * 5);
      let friendBonus = 0;
      if (
        room.gameMode === "who_listens" &&
        selectedFriend &&
        currentRound?.contributedByPlayerId &&
        selectedFriend === currentRound.contributedByPlayerId
      ) {
        friendBonus = 50;
      }
      calculatedPoints = speedPoints + streakBonus + friendBonus;
    }

    // Set floating score popup immediately for instant 60fps arcade feel
    if (scorePopupTimerRef.current) {
      clearTimeout(scorePopupTimerRef.current);
    }
    const popupKey = Date.now();
    setScorePopup({
      points: calculatedPoints,
      isCorrect,
      optionIndex: optionIdx,
      key: popupKey,
    });
    scorePopupTimerRef.current = setTimeout(() => {
      setScorePopup(null);
    }, 1800);

    // Audio feedback with Web Audio API soundEffects
    if (isCorrect) {
      playCorrectSound();
    } else {
      playWrongSound();
    }

    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          playerId,
          optionIndex: optionIdx,
          timeMs,
          guessedFriendId: selectedFriend || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (
          typeof data.pointsEarned === "number" &&
          isCorrect &&
          data.pointsEarned !== calculatedPoints
        ) {
          setScorePopup((prev) =>
            prev && prev.key === popupKey ? { ...prev, points: data.pointsEarned } : prev
          );
        }
        if (data.room) {
          setRoom(data.room);
        }
      }
    } catch (err) {
      console.error("Error submitting answer:", err);
    }
  };

  // Vote Theme Proposal
  const handleVoteTheme = async (proposalId: string) => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vote_theme",
          playerId,
          proposalId,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error voting theme:", err);
    }
  };

  // Propose New Theme
  const handleProposeTheme = async () => {
    if (!roomCode || !newThemeProposal.trim()) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose_theme",
          playerId,
          label: newThemeProposal.trim(),
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
        setNewThemeProposal("");
      }
    } catch (err) {
      console.error("Error proposing theme:", err);
    }
  };

  // Rename Current Player
  const handleRenamePlayer = async () => {
    const clean = editNameInput.trim();
    if (!clean || clean.length < 2 || !roomCode || !playerId) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_player",
          playerId,
          name: clean,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
        setPlayerName(clean);
        sessionStorage.setItem("scuinklezam_player_name", clean);
      }
    } catch (err) {
      console.error("Error renaming player:", err);
    } finally {
      setIsSavingName(false);
      setIsEditingName(false);
    }
  };

  // Import Playlist by Spotify URL
  const handleImportPlaylist = async () => {
    const url = playlistUrlInput.trim();
    if (!url || !roomCode || !playerId) return;

    setIsImportingPlaylist(true);
    setPlaylistImportError(null);

    try {
      const res = await fetch("/api/spotify/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.tracks || data.tracks.length === 0) {
        setPlaylistImportError(data.error || "No se pudieron obtener canciones válidas de esta playlist.");
        return;
      }

      const patchRes = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_playlist",
          playerId,
          playlist: {
            id: data.id,
            name: data.name,
            imageUrl: data.imageUrl,
            trackCount: data.trackCount,
            tracks: data.tracks,
          },
        }),
      });

      const patchData = await patchRes.json();
      if (patchData.success && patchData.room) {
        setRoom(patchData.room);
        setPlaylistUrlInput("");
      } else {
        setPlaylistImportError(patchData.error || "Error al asociar la playlist a la sala.");
      }
    } catch (err: any) {
      console.error("Error importing playlist:", err);
      setPlaylistImportError("Error de conexión al importar la playlist.");
    } finally {
      setIsImportingPlaylist(false);
    }
  };

  // Remove Playlist from Room
  const handleRemovePlaylist = async (playlistId: string) => {
    if (!roomCode || !playerId) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_playlist",
          playerId,
          playlistId,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error removing playlist:", err);
    }
  };

  // Add Artist to Taste Blender
  const handleAddArtistName = async (artistName: string) => {
    if (!room || !artistName.trim()) return;
    const me = room.players.find((p) => p.id === playerId);
    const updated = [...(me?.favoriteArtists || []), artistName.trim()].slice(0, 5);

    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_taste",
          playerId,
          favoriteArtists: updated,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
        setNewArtistInput("");
        setShowSuggestions(false);
        setArtistSuggestions([]);
        setSelectedSuggestionIdx(-1);
      }
    } catch (err) {
      console.error("Error adding artist:", err);
    }
  };

  const handleAddArtist = async () => {
    if (showSuggestions && selectedSuggestionIdx >= 0 && artistSuggestions[selectedSuggestionIdx]) {
      await handleAddArtistName(artistSuggestions[selectedSuggestionIdx].name);
    } else {
      await handleAddArtistName(newArtistInput);
    }
  };

  const handleArtistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (artistSuggestions.length > 0) {
        setShowSuggestions(true);
        setSelectedSuggestionIdx((prev) => (prev + 1) % artistSuggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (artistSuggestions.length > 0) {
        setShowSuggestions(true);
        setSelectedSuggestionIdx(
          (prev) => (prev - 1 + artistSuggestions.length) % artistSuggestions.length
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showSuggestions && selectedSuggestionIdx >= 0 && artistSuggestions[selectedSuggestionIdx]) {
        handleAddArtistName(artistSuggestions[selectedSuggestionIdx].name);
      } else {
        handleAddArtist();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedSuggestionIdx(-1);
    }
  };

  // Cast vote in Democratic Voting Mode (10s live voting)
  const handleCastVote = async (themeId: string) => {
    if (!roomCode || !playerId) return;
    try {
      playSynthNote(587.33, 0.15); // Arcade acoustic feedback
      if (room && room.votingCandidates) {
        const nextCandidates = room.votingCandidates.map((c) => ({
          ...c,
          votes:
            c.id === themeId
              ? Array.from(new Set([...c.votes.filter((id) => id !== playerId), playerId]))
              : c.votes.filter((id) => id !== playerId),
        }));
        setRoom({
          ...room,
          votingCandidates: nextCandidates,
          players: room.players.map((p) =>
            p.id === playerId ? { ...p, votedTheme: themeId } : p
          ),
        });
      }

      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cast_vote",
          playerId,
          themeId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.room) setRoom(data.room);
      }
    } catch (err) {
      console.error("Error casting vote:", err);
    }
  };

  // Save Track to Spotify
  const handleSaveTrack = async (track: SpotifyTrackItem) => {
    try {
      const res = await fetch("/api/spotify/save-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedTrackIds((prev) => new Set([...Array.from(prev), track.id]));
      }
    } catch {
      // Offline fallback
      setSavedTrackIds((prev) => new Set([...Array.from(prev), track.id]));
    }
  };

  // Save All Tracks from Match
  const handleSaveAllTracks = async () => {
    if (!room?.rounds) return;
    setSavingAll(true);
    for (const r of room.rounds) {
      await handleSaveTrack(r.targetTrack);
    }
    setSavingAll(false);
  };

  // Reset Room to Lobby (Replay)
  const handleResetRoom = async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_room",
          playerId,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error resetting room:", err);
    }
  };

  // Kick Player from Room (Host only)
  const handleKickPlayer = async (targetId: string, targetName: string) => {
    if (!roomCode) return;
    if (!confirm(`¿Estás seguro de que quieres expulsar a ${targetName} de la sala?`)) return;

    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "kick_player",
          playerId,
          targetPlayerId: targetId,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      } else {
        setErrorMessage(data.error || "No se pudo expulsar al jugador.");
      }
    } catch {
      setErrorMessage("Error de conexión al expulsar al jugador.");
    }
  };

  // Transfer Host rights to another player
  const handleTransferHost = async (targetId: string, targetName: string) => {
    if (!roomCode) return;
    if (!confirm(`¿Quieres ceder el liderazgo de la sala (Anfitrión) a ${targetName}?`)) return;

    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer_host",
          playerId,
          targetPlayerId: targetId,
        }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        setRoom(data.room);
      } else {
        setErrorMessage(data.error || "No se pudo transferir el anfitrión.");
      }
    } catch {
      setErrorMessage("Error de conexión al transferir anfitrión.");
    }
  };

  // Robust Universal Clipboard Copy for Room Code
  const handleCopyRoomCode = async (codeToCopy?: string) => {
    const code = codeToCopy || room?.code || roomCode;
    if (!code) return;
    await copyToClipboard(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Robust Universal Clipboard Copy for Room Invite Link
  const handleCopyLink = async () => {
    const code = room?.code || roomCode;
    if (!code) return;
    const fullUrl = `${window.location.origin}/play?room=${code}`;
    await copyToClipboard(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Current Player & Host status
  const currentMe = room?.players.find((p) => p.id === playerId);
  const isHost = currentMe?.isHost ?? false;
  const currentRound = room?.rounds[room.currentRound - 1];

  // Synchronized Timer Remaining calculation based authoritatively on server timestamps
  const getSecondsRemaining = () => {
    if (!room) return 15;
    const now = Date.now();
    if (room.roundEndsAt) {
      return Math.max(0, Math.ceil((room.roundEndsAt - now) / 1000));
    }
    if (room.roundStartTime) {
      const elapsed = Math.floor((now - room.roundStartTime) / 1000);
      return Math.max(0, (room.roundDuration || 15) - elapsed);
    }
    return 15;
  };
  const secondsLeft = getSecondsRemaining();

  const getCountdownSeconds = () => {
    if (!room) return 3;
    const now = Date.now();
    if (room.countdownEndsAt) {
      return Math.max(1, Math.ceil((room.countdownEndsAt - now) / 1000));
    }
    if (room.countdownStartTime) {
      const elapsed = Math.floor((now - room.countdownStartTime) / 1000);
      return Math.max(1, 3 - elapsed);
    }
    return 3;
  };
  const countdownSec = getCountdownSeconds();

  const getVotingSeconds = () => {
    if (!room) return 10;
    const now = Date.now();
    if (room.votingEndsAt) {
      return Math.max(0, Math.ceil((room.votingEndsAt - now) / 1000));
    }
    if (room.votingStartTime) {
      const elapsed = Math.floor((now - room.votingStartTime) / 1000);
      return Math.max(0, 10 - elapsed);
    }
    return 10;
  };
  const votingSec = getVotingSeconds();

  // --- RENDER VIEWS ---

  return (
    <div className="min-h-screen bg-[#060D09] text-white flex flex-col font-sans selection:bg-goblinPrimary selection:text-black">
      {/* Unified Top Navbar */}
      <Navbar
        activeRoute="play"
        onOpenSpotifyModal={() => setShowSpotifyModal(true)}
        rightSlot={
          <div className="flex items-center gap-2">
            {/* Sound Volume Capsule */}
            <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1 flex items-center gap-2">
              <button
                onClick={() => setAudioMuted(!audioMuted)}
                className="text-zinc-300 hover:text-white transition flex items-center justify-center cursor-pointer"
                title={audioMuted ? "Activar audio" : "Silenciar audio"}
              >
                {audioMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-goblinLime" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audioMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  if (audioMuted) {
                    setAudioMuted(false);
                  }
                  audioPlayer.setVolume(val);
                }}
                className="accent-emerald-500 cursor-pointer w-16 sm:w-20 h-1.5 bg-zinc-700 rounded-lg appearance-none"
                title="Volumen del juego"
              />
              <span className="text-[10px] font-mono text-zinc-300 min-w-[24px] text-right select-none">
                {Math.round((audioMuted ? 0 : volume) * 100)}%
              </span>
            </div>

            {room && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-emerald-500/20">
                <span className="font-mono font-black text-goblinLime bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-500/30 text-xs tracking-wider">
                  {room.code}
                </span>
                <span className="text-xs text-zinc-400 hidden xl:inline truncate max-w-[120px]">
                  {room.name}
                </span>
              </div>
            )}
          </div>
        }
      />

      {/* Secondary Bar in Game (Room Controls & Player Badge) */}
      <div className="border-b border-emerald-500/10 bg-[#060D09]/60 px-4 sm:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {room && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-3 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-bold text-emerald-300 border border-emerald-500/30 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5 text-emerald-300" />
              <span className="hidden sm:inline">Invitar Amigos</span>
            </button>
          )}

          <button
            onClick={() => setShowSpotifyModal(true)}
            className="px-3 py-1 rounded-xl bg-[#1DB954]/20 hover:bg-[#1DB954]/30 border border-[#1DB954]/40 text-xs font-bold text-[#1DB954] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5 text-[#1DB954]" />
            <span className="hidden sm:inline">Importar Spotify</span>
          </button>
        </div>

        {/* Player Badge */}
        <div className="flex items-center gap-2 bg-[#102218] px-3 py-1.5 rounded-xl border border-emerald-500/20 text-xs relative overflow-visible">
          <span
            className="w-3 h-3 rounded-full border border-black/40"
            style={{ backgroundColor: currentMe?.avatarColor || "#10B981" }}
          />
          <span className="font-bold text-white max-w-[120px] truncate">
            {playerName || (spotifyAuthUser?.displayName || "Jugador")}
          </span>
          {currentMe && typeof currentMe.score === "number" && (
            <span className="font-mono font-bold text-goblinLime text-[11px] ml-0.5">
              {currentMe.score} pts
            </span>
          )}
          {scorePopup && (
            <div
              key={`header_popup_${scorePopup.key}`}
              className={`absolute -bottom-5 right-0 pointer-events-none z-30 px-2 py-0.5 rounded-full font-mono font-black text-[10px] tracking-wider flex items-center gap-1 whitespace-nowrap animate-score-float select-none ${
                scorePopup.isCorrect
                  ? "text-emerald-300 bg-emerald-500/20 border border-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.5)] backdrop-blur-md"
                  : "text-rose-300 bg-rose-500/20 border border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.5)] backdrop-blur-md"
              }`}
            >
              {scorePopup.isCorrect ? `+${scorePopup.points} pts` : "0 pts"}
            </div>
          )}
          {isHost && (
            <span title="Anfitrión">
              <Crown className="w-3.5 h-3.5 text-amber-400 inline" />
            </span>
          )}
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col justify-center">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white transition p-1"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. VIEW: NO ACTIVE ROOM (CREATE / JOIN LOBBY) */}
        {!room && (
          <div className="max-w-xl mx-auto w-full glass-card rounded-3xl p-6 sm:p-10 border border-emerald-500/20 shadow-2xl">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-goblinPrimary to-goblinLime text-black font-black text-2xl shadow-lg shadow-emerald-500/25">
                <Gamepad2 className="w-7 h-7 text-black" />
              </div>
              <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white">
                Multijugador Online
              </h1>
              <p className="text-zinc-400 text-xs sm:text-sm">
                Crea una sala privada gratis o únete con el código de 4 letras de tus amigos.
              </p>
            </div>

            {/* Player Name Input */}
            <div className="mt-6 space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Tu Nombre de Jugador
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  sessionStorage.setItem("scuinklezam_player_name", e.target.value);
                }}
                placeholder="Ej. Alex, Sofía, Juan..."
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl bg-black/60 border border-emerald-500/30 text-white font-bold text-sm focus:outline-none focus:border-goblinLime transition"
              />
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Create Room Button */}
              <button
                onClick={() => handleCreateRoom()}
                disabled={isLoading}
                className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 text-black font-black text-sm shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4 text-black" />
                <span>Crear Nueva Sala</span>
              </button>

              {/* Join Box */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="K7QP"
                  maxLength={4}
                  className="w-24 text-center px-2 py-3 rounded-xl bg-black/60 border border-emerald-500/30 font-mono font-extrabold text-base tracking-widest text-goblinLime uppercase focus:outline-none focus:border-goblinLime"
                />
                <button
                  onClick={() => handleJoinRoom(joinCodeInput)}
                  disabled={isLoading || !joinCodeInput.trim()}
                  className="flex-1 py-3 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-emerald-500/30 font-bold text-xs transition cursor-pointer disabled:opacity-40"
                >
                  Unirme
                </button>
              </div>
            </div>

            {/* Quick Play Features */}
            <div className="mt-8 pt-6 border-t border-emerald-500/15 grid grid-cols-3 gap-2 text-center text-zinc-400 text-xs">
              <div>
                <Zap className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <div className="font-semibold text-zinc-300">En Tiempo Real</div>
                <div>Sincronizado</div>
              </div>
              <div>
                <Headphones className="w-5 h-5 text-goblinLime mx-auto mb-1" />
                <div className="font-semibold text-zinc-300">Audio Real</div>
                <div>Spotify Oficial</div>
              </div>
              <div>
                <Bot className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <div className="font-semibold text-zinc-300">+ Bots IA</div>
                <div>Juega solo o amigos</div>
              </div>
            </div>
          </div>
        )}

        {/* 2. VIEW: LOBBY STATE (Room Setup & Players Waiting) */}
        {room && room.status === "lobby" && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-950 border border-emerald-500/30 text-emerald-300">
                    SALA PRIVADA GRATUITA
                  </span>
                  <span className="text-xs text-zinc-400">
                    • {room.players.length} / 12 jugadores
                  </span>
                </div>
                <h1 className="mt-2 font-display font-black text-2xl sm:text-4xl text-white">
                  {room.name}
                </h1>
                <p className="mt-1 text-zinc-400 text-xs sm:text-sm">
                  Comparte el código o añade bots inteligentes para probar la partida.
                </p>
              </div>

              {/* Code & Actions Box */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Room Code Badge (Entire container is clickable) */}
                <button
                  type="button"
                  onClick={() => handleCopyRoomCode(room.code)}
                  title="Haz clic para copiar el código de la sala"
                  className="flex items-center gap-2.5 bg-black/60 hover:bg-emerald-950/40 px-4 py-2.5 rounded-2xl border border-emerald-500/30 hover:border-emerald-400/60 transition cursor-pointer group"
                >
                  <span className="text-xs uppercase text-zinc-400 font-bold">Código:</span>
                  <span className="font-mono font-black text-2xl tracking-widest text-goblinLime">
                    {room.code}
                  </span>
                  <span className="ml-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold group-hover:bg-emerald-500/30 transition">
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>¡Código copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copiar código</span>
                      </>
                    )}
                  </span>
                </button>

                {/* Direct Link Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyLink}
                  title="Copiar enlace directo de invitación"
                  className="px-3.5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-emerald-500/30 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">¡Enlace copiado!</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 text-emerald-400" />
                      <span>Copiar enlace</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleAddBot}
                  className="px-3.5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-emerald-500/30 text-white font-bold text-xs transition flex items-center gap-1.5"
                >
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <span>+ Añadir Bot</span>
                </button>
              </div>
            </div>

            {/* Grid: Left Column (Settings & Taste) | Right Column (Players & Theme Voting) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (7 cols): Game Modes & Taste Blender */}
              <div className="lg:col-span-7 space-y-6">
                {/* 7 Game Modes Selector */}
                <div className="glass-card rounded-3xl p-6 border border-emerald-500/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display font-extrabold text-lg text-white">
                        Modo de Juego
                      </h2>
                      <p className="text-xs text-zinc-400">
                        {isHost ? "Elige cómo competirá tu sala" : "Modo seleccionado por el anfitrión"}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-goblinLime bg-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                      7 MODOS RANKED
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {GAME_MODES.map((mode) => {
                      const isSelected = room.gameMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => isHost && handleChangeSettings({ gameMode: mode.id })}
                          disabled={!isHost}
                          className={`p-3.5 rounded-2xl text-left transition border flex flex-col justify-between ${
                            isSelected
                              ? "bg-emerald-950/90 border-goblinLime shadow-lg shadow-emerald-500/15"
                              : "bg-[#0B1710] border-emerald-500/15 hover:border-emerald-500/30"
                          } ${!isHost ? "cursor-default" : "cursor-pointer"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            {renderModeIcon(mode.id)}
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                isSelected
                                  ? "bg-goblinLime text-black"
                                  : "bg-white/[0.06] text-zinc-400"
                              }`}
                            >
                              {mode.badge}
                            </span>
                          </div>
                          <div className="mt-2 font-bold text-sm text-white">{mode.name}</div>
                          <div className="mt-1 text-[11px] text-zinc-400 leading-snug line-clamp-2">
                            {mode.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Host Match Options: Rounds & Question Type */}
                  {isHost && (
                    <div className="mt-4 pt-4 border-t border-emerald-500/15 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 font-semibold">Rondas:</span>
                        {[5, 10, 15, 20].map((num) => (
                          <button
                            key={num}
                            onClick={() => handleChangeSettings({ totalRounds: num })}
                            className={`px-2.5 py-1 rounded-lg font-bold transition ${
                              room.totalRounds === num
                                ? "bg-goblinPrimary text-black"
                                : "bg-white/[0.05] text-zinc-400 hover:text-white"
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 font-semibold">Preguntar:</span>
                        {(["song", "artist", "both"] as GuessType[]).map((gt) => (
                          <button
                            key={gt}
                            onClick={() => handleChangeSettings({ guessType: gt })}
                            className={`px-2.5 py-1 rounded-lg font-bold transition ${
                              room.guessType === gt
                                ? "bg-goblinPrimary text-black"
                                : "bg-white/[0.05] text-zinc-400 hover:text-white"
                            }`}
                          >
                            {gt === "song" ? "Canción" : gt === "artist" ? "Artista" : "Ambos"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Taste Blender Panel (Mezclador de Gustos) */}
                <div className="glass-card rounded-3xl p-6 border border-emerald-500/20 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display font-extrabold text-lg text-white flex items-center gap-2">
                        <FlaskConical className="w-5 h-5 text-emerald-400" />
                        <span>Taste Blender (Mezcla de la Sala)</span>
                      </h2>
                      <p className="text-xs text-zinc-400">
                        Cada jugador aporta sus artistas y canciones favoritas a la baraja de preguntas.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowSpotifyModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#1DB954]/20 hover:bg-[#1DB954]/30 border border-[#1DB954]/40 text-xs font-bold text-[#1DB954] flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                      </svg>
                      <span>Spotify Hub</span>
                    </button>
                  </div>

                  {/* Contribution Visual Meter */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-emerald-400 flex justify-between">
                      <span>Proporción de Gustos Aportados</span>
                      <span>100% Repartido</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-black/50 overflow-hidden flex">
                      {room.players.map((p) => {
                        const pct = Math.round(100 / room.players.length);
                        return (
                          <div
                            key={p.id}
                            style={{
                              width: `${pct}%`,
                              backgroundColor: p.avatarColor,
                            }}
                            title={`${p.name}: ${pct}%`}
                            className="h-full border-r border-black/30 last:border-0 transition-all duration-500"
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ========================================================
                      1. ARRIBA DE TODO: CUENTA Y ESTADÍSTICAS SPOTIFY
                     ======================================================== */}
                  {!spotifyConnected ? (
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#102218] to-black/80 border-2 border-[#1DB954]/50 shadow-lg shadow-[#1DB954]/10 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/40 text-[#1DB954]">
                            RECOMENDADO · TASTE BLENDER
                          </span>
                          <h3 className="font-display font-bold text-sm text-white">
                            Inicia sesión con Spotify para Mezclar tus Estadísticas
                          </h3>
                        </div>
                        <Flame className="w-5 h-5 text-emerald-400 shrink-0" />
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Analizaremos tus canciones más escuchadas, tus artistas favoritos y tus playlists privadas para mezclarlos con los gustos de tus amigos en esta sala.
                      </p>
                      <a
                        href="/api/auth/spotify/login"
                        className="w-full py-2.5 px-3 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-black text-xs text-center flex items-center justify-center gap-2 shadow-md shadow-[#1DB954]/20 transition cursor-pointer"
                      >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        <span>Iniciar sesión con Spotify</span>
                      </a>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-[#102218] to-black/70 border border-[#1DB954]/40 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {spotifyAuthUser?.imageUrl ? (
                            <img
                              src={spotifyAuthUser.imageUrl}
                              alt={spotifyAuthUser.displayName}
                              className="w-8 h-8 rounded-full object-cover border border-[#1DB954]"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#1DB954] text-black font-black flex items-center justify-center text-xs">
                              {spotifyAuthUser?.displayName?.substring(0, 2).toUpperCase() || "SP"}
                            </div>
                          )}
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse" />
                              <span>Sesión de Spotify: {spotifyAuthUser?.displayName}</span>
                            </div>
                            {currentMe?.spotifyBadge && (
                              <div className="text-[10px] text-goblinLime font-semibold truncate max-w-[220px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] inline-block mr-1" />
                                {currentMe.spotifyBadge}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => setShowStatsDetailModal(true)}
                          className="bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 border border-white/10 rounded-lg px-3.5 py-1.5 text-xs font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <BarChart3 className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Ver stats a detalle</span>
                        </button>
                      </div>

                      {/* Top 5 Artists with Avatars */}
                      {spotifyStats && spotifyStats.topArtists && spotifyStats.topArtists.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                            Tus Artistas Más Escuchados
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {spotifyStats.topArtists.slice(0, 5).map((artist, idx) => (
                              <div
                                key={artist.id || idx}
                                className="flex flex-col items-center gap-1 shrink-0 w-14 text-center"
                              >
                                {artist.imageUrl ? (
                                  <img
                                    src={artist.imageUrl}
                                    alt={artist.name}
                                    className="w-9 h-9 rounded-full object-cover border border-emerald-500/40"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center font-bold text-[10px] text-goblinLime">
                                    {artist.name.substring(0, 2)}
                                  </div>
                                )}
                                <span className="text-[9px] font-bold text-zinc-300 truncate w-full">
                                  {artist.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status / Mode Notice Banner */}
                      {spotifyModeNotice && (
                        <div
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                            spotifyModeNotice.type === "success"
                              ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-300"
                              : "bg-amber-950/70 border-amber-500/40 text-amber-300"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {spotifyModeNotice.type === "success" ? (
                              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                            )}
                            <span className="font-medium">{spotifyModeNotice.message}</span>
                          </div>
                          <button
                            onClick={() => setSpotifyModeNotice(null)}
                            className="text-zinc-400 hover:text-white p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 4 Real Spotify Modes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {/* 1. Escuchadas recientemente */}
                        <button
                          disabled={loadingSpotifyMode !== null}
                          onClick={() => handleLoadSpotifyMode("recently_played")}
                          className="p-2.5 rounded-xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/20 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingSpotifyMode === "recently_played" ? (
                            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-bold text-[11px] text-white group-hover:text-goblinLime transition truncate">
                              Escuchadas Recientemente
                            </div>
                            <div className="text-[9px] text-zinc-400">Tus últimas 50 canciones</div>
                          </div>
                        </button>

                        {/* 2. Más escuchadas */}
                        <button
                          disabled={loadingSpotifyMode !== null}
                          onClick={() => handleLoadSpotifyMode("top_tracks")}
                          className="p-2.5 rounded-xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/20 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingSpotifyMode === "top_tracks" ? (
                            <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                          ) : (
                            <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-bold text-[11px] text-white group-hover:text-goblinLime transition truncate">
                              Más Escuchadas
                            </div>
                            <div className="text-[9px] text-zinc-400">Tus top canciones favoritas</div>
                          </div>
                        </button>

                        {/* 3. Tus artistas favoritos */}
                        <button
                          disabled={loadingSpotifyMode !== null}
                          onClick={() => handleLoadSpotifyMode("top_artists")}
                          className="p-2.5 rounded-xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/20 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingSpotifyMode === "top_artists" ? (
                            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-bold text-[11px] text-white group-hover:text-goblinLime transition truncate">
                              Tus Artistas Favoritos
                            </div>
                            <div className="text-[9px] text-zinc-400">Canciones de tus top 5 artistas</div>
                          </div>
                        </button>

                        {/* 4. Canciones que te gustan */}
                        <button
                          disabled={loadingSpotifyMode !== null}
                          onClick={() => handleLoadSpotifyMode("liked_songs")}
                          className="p-2.5 rounded-xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/20 hover:border-goblinLime/50 text-left transition flex items-center gap-2.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingSpotifyMode === "liked_songs" ? (
                            <Loader2 className="w-4 h-4 text-pink-400 animate-spin shrink-0" />
                          ) : (
                            <Heart className="w-4 h-4 text-pink-400 shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-bold text-[11px] text-white group-hover:text-goblinLime transition truncate">
                              Canciones Que Te Gustan
                            </div>
                            <div className="text-[9px] text-zinc-400">Tus canciones guardadas</div>
                          </div>
                        </button>
                      </div>

                      {/* Botón para Elegir Playlist Privada */}
                      <div className="pt-1">
                        <button
                          onClick={() => setShowSpotifyModal(true)}
                          className="w-full p-2.5 rounded-xl bg-[#0B1710] hover:bg-emerald-950/70 border border-emerald-500/20 hover:border-goblinLime/50 text-left transition flex items-center justify-between gap-2 cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FolderHeart className="w-4 h-4 text-goblinLime shrink-0" />
                            <div className="truncate">
                              <span className="font-bold text-[11px] text-white group-hover:text-goblinLime transition">
                                Elegir Playlist Privada o Pegar Enlace
                              </span>
                              <span className="text-[9px] text-zinc-400 ml-2">
                                ({spotifyPlaylists.length} playlists detectadas)
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-emerald-400 font-semibold shrink-0">Abrir Explorador →</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ========================================================
                      2. SEPARADOR VISUAL OBLIGATORIO
                     ======================================================== */}
                  <div className="relative py-1 flex items-center justify-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                    <div className="w-full border-t border-emerald-500/15 absolute" />
                    <span className="relative bg-[#060D09] px-3">
                      — O si prefieres jugar sin iniciar sesión —
                    </span>
                  </div>

                  {/* ========================================================
                      3. ABAJO: CONTENEDOR DISCRETO (PEGA PLAYLIST / ARTISTAS)
                     ======================================================== */}
                  <div className="bg-[#0B1710] p-4 rounded-2xl border border-emerald-500/15 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-300">Tus Artistas Favoritos (Manual)</span>
                      <span className="text-goblinLime">
                        {Math.min(5, currentMe?.favoriteArtists.length || 0)}/5 añadidos
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {currentMe?.favoriteArtists.slice(0, 5).map((artist, idx) => {
                        const photo =
                          PRELOADED_ARTIST_PHOTOS[artist.toLowerCase()] ||
                          `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(artist)}&backgroundColor=0B1710`;
                        return (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-xl bg-emerald-950 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-2"
                          >
                            <img
                              src={photo}
                              alt={artist}
                              className="w-4 h-4 rounded-full object-cover border border-emerald-500/40"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                              }}
                            />
                            <span>{artist}</span>
                            <button
                              onClick={() => {
                                const updated = currentMe.favoriteArtists.filter((_, i) => i !== idx);
                                fetch(`/api/rooms/${roomCode}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    action: "update_taste",
                                    playerId,
                                    favoriteArtists: updated,
                                  }),
                                });
                              }}
                              className="text-zinc-400 hover:text-red-400 ml-1 cursor-pointer flex items-center"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>

                    {(currentMe?.favoriteArtists.length || 0) < 5 && (
                      <div ref={suggestionsRef} className="relative">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={newArtistInput}
                              onChange={(e) => {
                                setNewArtistInput(e.target.value);
                                if (!showSuggestions && e.target.value.trim().length >= 2) {
                                  setShowSuggestions(true);
                                }
                              }}
                              onFocus={() => {
                                if (artistSuggestions.length > 0) setShowSuggestions(true);
                              }}
                              onKeyDown={handleArtistKeyDown}
                              placeholder="Buscar artista en Spotify (ej. Rosalía, Quevedo, Drake)..."
                              className="w-full px-3.5 py-2 rounded-xl bg-black/60 border border-emerald-500/30 text-white text-xs focus:outline-none focus:border-goblinLime placeholder:text-zinc-500"
                            />
                            {isSearchingArtist && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                          <button
                            onClick={handleAddArtist}
                            className="px-4 py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs hover:bg-emerald-400 transition cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir</span>
                          </button>
                        </div>

                        {/* Floating Autocomplete Dropdown */}
                        {showSuggestions && artistSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#0B1710] border border-emerald-500/30 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-emerald-500/10">
                            {artistSuggestions.map((artist, idx) => {
                              const isSelected = idx === selectedSuggestionIdx;
                              return (
                                <div
                                  key={artist.id || idx}
                                  onClick={() => handleAddArtistName(artist.name)}
                                  onMouseEnter={() => setSelectedSuggestionIdx(idx)}
                                  className={`p-2.5 flex items-center justify-between gap-3 cursor-pointer transition ${
                                    isSelected
                                      ? "bg-emerald-950/90 text-goblinLime"
                                      : "hover:bg-emerald-950/50 text-white"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {artist.imageUrl ? (
                                      <img
                                        src={artist.imageUrl}
                                        alt={artist.name}
                                        className="w-8 h-8 rounded-full object-cover shrink-0 border border-emerald-500/40"
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center shrink-0">
                                        <Music2 className="w-4 h-4 text-emerald-400" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold truncate">
                                        {artist.name}
                                      </div>
                                      {artist.genres && artist.genres.length > 0 && (
                                        <div className="text-[10px] text-zinc-400 truncate capitalize">
                                          {artist.genres.slice(0, 2).join(", ")}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddArtistName(artist.name);
                                    }}
                                    className="p-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 text-xs shrink-0"
                                    title="Añadir a mis gustos"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dedicated Spotify Playlist Import Section */}
                    <div className="pt-3 border-t border-emerald-500/15 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Importar Playlist por Enlace de Spotify</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowSpotifyModal(true)}
                          className="text-[11px] text-zinc-400 hover:text-goblinLime underline cursor-pointer"
                        >
                          Ver explorador
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={playlistUrlInput}
                          onChange={(e) => setPlaylistUrlInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleImportPlaylist();
                          }}
                          placeholder="Pega enlace de Playlist (ej. https://open.spotify.com/playlist/...)"
                          className="flex-1 px-3.5 py-2 rounded-xl bg-black/60 border border-emerald-500/30 text-white text-xs focus:outline-none focus:border-goblinLime placeholder:text-zinc-500"
                        />
                        <button
                          type="button"
                          disabled={isImportingPlaylist || !playlistUrlInput.trim()}
                          onClick={handleImportPlaylist}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          {isImportingPlaylist ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Importando...</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3.5 h-3.5" />
                              <span>Importar</span>
                            </>
                          )}
                        </button>
                      </div>

                      {playlistImportError && (
                        <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          <span>{playlistImportError}</span>
                        </div>
                      )}

                      {/* Green confirmation cards for imported playlists */}
                      {room.playlists && room.playlists.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Music2 className="w-3 h-3 text-emerald-400" />
                            <span>Playlists añadidas a la partida ({room.playlists.length})</span>
                          </div>
                          <div className="space-y-2">
                            {room.playlists.map((pl) => (
                              <div
                                key={pl.id}
                                className="p-3 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-between gap-3 shadow-[0_0_15px_rgba(16,185,129,0.12)]"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {pl.imageUrl ? (
                                    <img
                                      src={pl.imageUrl}
                                      alt={pl.name}
                                      className="w-10 h-10 rounded-xl object-cover border border-emerald-400/40 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-xl bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center shrink-0">
                                      <Music2 className="w-5 h-5 text-emerald-400" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs text-white truncate flex items-center gap-2">
                                      <span className="truncate">{pl.name}</span>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold shrink-0">
                                        {pl.trackCount} temas
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-zinc-400 truncate">
                                      Aportada por {pl.addedByPlayerName || (pl.addedByPlayerId === playerId ? "ti" : "un jugador")}
                                    </div>
                                  </div>
                                </div>

                                {(isHost || pl.addedByPlayerId === playerId) && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePlaylist(pl.id)}
                                    className="p-1.5 rounded-lg bg-black/40 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition cursor-pointer shrink-0"
                                    title="Eliminar playlist de la partida"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column (5 cols): Players List & Theme Proposals */}
              <div className="lg:col-span-5 space-y-6">
                {/* Players In Lobby List */}
                <div className="glass-card rounded-3xl p-6 border border-emerald-500/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display font-extrabold text-lg text-white">
                      Jugadores ({room.players.length})
                    </h2>
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      En línea
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {room.players.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-[#0B1710] border border-emerald-500/15"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-black shadow"
                            style={{ backgroundColor: player.avatarColor }}
                          >
                            {player.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            {player.id === playerId && isEditingName ? (
                              <div className="flex items-center gap-1.5 py-0.5">
                                <input
                                  type="text"
                                  value={editNameInput}
                                  onChange={(e) => setEditNameInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenamePlayer();
                                    if (e.key === "Escape") setIsEditingName(false);
                                  }}
                                  className="px-2 py-0.5 text-xs rounded-lg bg-black/70 border border-emerald-400 text-white focus:outline-none w-28"
                                  autoFocus
                                  maxLength={20}
                                />
                                <button
                                  type="button"
                                  disabled={isSavingName}
                                  onClick={handleRenamePlayer}
                                  className="p-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer transition"
                                  title="Guardar nombre"
                                >
                                  {isSavingName ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingName(false)}
                                  className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer transition"
                                  title="Cancelar"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                                <span>{player.name}</span>
                                {player.isHost && (
                                  <Crown className="w-3.5 h-3.5 text-amber-400 inline" />
                                )}
                                {player.isBot && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-normal">
                                    BOT
                                  </span>
                                )}
                                {player.id === playerId && (
                                  <>
                                    <span className="text-xs text-goblinLime">(Tú)</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditNameInput(player.name);
                                        setIsEditingName(true);
                                      }}
                                      className="p-1 rounded-md hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-300 transition cursor-pointer"
                                      title="Cambiar mi nombre"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {player.spotifyBadge ? (
                              <div
                                className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/40 text-[#1DB954] font-semibold truncate max-w-[200px]"
                                title={player.spotifyBadge}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] shrink-0" />
                                <span className="truncate">{player.spotifyBadge}</span>
                              </div>
                            ) : (
                              <div className="text-[11px] text-zinc-400 truncate max-w-[180px]">
                                {player.favoriteArtists.join(", ") || "Sin artistas"}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Listo
                          </span>

                          {isHost && player.id !== playerId && (
                            <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-emerald-500/20">
                              <button
                                onClick={() => handleTransferHost(player.id, player.name)}
                                title="Ceder Anfitrión (Hacer Host)"
                                className="p-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 text-xs transition cursor-pointer"
                              >
                                <Crown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleKickPlayer(player.id, player.name)}
                                title="Expulsar Jugador (Kick)"
                                className="p-1 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 font-bold text-xs transition cursor-pointer flex items-center justify-center"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Start Game Action Button */}
                  {isHost ? (
                    <button
                      onClick={handleStartGame}
                      disabled={isLoading}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 text-black font-black text-sm tracking-wide shadow-xl shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? "Cargando canciones..." : "¡Iniciar Partida Ranked!"}
                    </button>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-emerald-500/15 text-center text-xs text-zinc-400">
                      Esperando a que el anfitrión comience la partida…
                    </div>
                  )}
                </div>

                {/* Theme Proposal & Voting Panel */}
                <div className="glass-card rounded-3xl p-6 border border-emerald-500/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-extrabold text-base text-white">
                        Votación de Temas en Vivo
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Vota o propón qué estilo queréis jugar
                      </p>
                    </div>
                    <Vote className="w-4 h-4 text-amber-400" />
                  </div>

                  {/* Proposals List */}
                  <div className="space-y-2">
                    {room.themeProposals.map((prop) => {
                      const totalVotes = room.themeProposals.reduce(
                        (sum, p) => sum + p.votes.length,
                        0
                      );
                      const votePct =
                        totalVotes > 0 ? Math.round((prop.votes.length / totalVotes) * 100) : 0;
                      const hasVoted = prop.votes.includes(playerId);

                      return (
                        <button
                          key={prop.id}
                          onClick={() => handleVoteTheme(prop.id)}
                          className={`w-full p-3 rounded-xl border text-left transition relative overflow-hidden flex items-center justify-between ${
                            hasVoted
                              ? "border-goblinLime bg-emerald-950/70"
                              : "border-emerald-500/15 bg-[#0B1710] hover:border-emerald-500/30"
                          }`}
                        >
                          {/* Progress fill */}
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-emerald-500/15 transition-all duration-300 pointer-events-none"
                            style={{ width: `${votePct}%` }}
                          />

                          <div className="relative z-10">
                            <div className="font-bold text-xs text-white flex items-center gap-2">
                              <span>{prop.label}</span>
                              {hasVoted && (
                                <span className="text-goblinLime text-xs">✓ Votado</span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              Por {prop.proposedBy}
                            </div>
                          </div>

                          <div className="relative z-10 font-mono font-bold text-xs text-goblinLime">
                            {prop.votes.length} {prop.votes.length === 1 ? "voto" : "votos"}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Propose new theme form */}
                  <div className="flex gap-2 pt-2 border-t border-emerald-500/15">
                    <input
                      type="text"
                      value={newThemeProposal}
                      onChange={(e) => setNewThemeProposal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleProposeTheme()}
                      placeholder="Proponer un tema (ej. Bandas Sonoras, K-Pop)..."
                      className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-emerald-500/30 text-white text-xs focus:outline-none focus:border-goblinLime"
                    />
                    <button
                      onClick={handleProposeTheme}
                      className="px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs border border-emerald-500/30 transition"
                    >
                      Proponer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2.5 VIEW: DEMOCRATIC LIVE VOTING (10s) */}
        {room && room.status === "voting" && (
          <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6 flex flex-col my-auto animate-fade-in">
            {/* Header with 10s Timer */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 border border-emerald-500/30 text-center relative overflow-hidden shadow-2xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-goblinLime text-xs font-black tracking-wider uppercase mb-3">
                <Vote className="w-4 h-4 animate-spin-slow" />
                <span>Votación Democrática en Vivo</span>
              </div>

              <div className="flex items-center justify-center gap-4 my-2">
                <div className="font-display font-black text-[clamp(3.5rem,8vw,5.5rem)] leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-goblinLime to-white">
                  {votingSec}s
                </div>
              </div>

              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                Elige la temática de la partida
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 max-w-xl mx-auto mt-2">
                La opción más votada cuando el reloj llegue a 0 determinará las canciones de la partida.
              </p>

              {/* Progress bar */}
              <div className="w-full max-w-md mx-auto mt-5 h-2 bg-black/60 rounded-full overflow-hidden border border-emerald-500/20">
                <div
                  className="h-full bg-gradient-to-r from-goblinPrimary to-goblinLime transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, (votingSec / 10) * 100)}%` }}
                />
              </div>
            </div>

            {/* 4 Thematic Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(room.votingCandidates || []).map((candidate) => {
                const isSelected = currentMe?.votedTheme === candidate.id;
                const voteCount = candidate.votes.length;
                const voters = room.players.filter((p) => candidate.votes.includes(p.id));

                return (
                  <button
                    key={candidate.id}
                    onClick={() => handleCastVote(candidate.id)}
                    className={`relative p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between group overflow-hidden ${
                      isSelected
                        ? "bg-emerald-950/70 border-goblinLime ring-2 ring-goblinLime/60 shadow-lg shadow-goblinLime/10 scale-[1.02]"
                        : "bg-[#0B1710]/90 border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-950/30"
                    }`}
                  >
                    {/* Background subtle glow */}
                    <div
                      className={`absolute -right-8 -top-8 w-28 h-28 rounded-full blur-2xl pointer-events-none transition ${
                        isSelected ? "bg-goblinLime/20" : "bg-emerald-500/5 group-hover:bg-emerald-500/10"
                      }`}
                    />

                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-2 rounded-xl border ${
                              isSelected
                                ? "bg-goblinLime/20 border-goblinLime/40 text-goblinLime"
                                : "bg-white/[0.04] border-white/10 text-zinc-300 group-hover:text-white"
                            }`}
                          >
                            <Music2 className="w-4 h-4" />
                          </div>
                          <span className="font-display font-extrabold text-base sm:text-lg text-white group-hover:text-emerald-300 transition">
                            {candidate.name}
                          </span>
                        </div>

                        {/* Live Vote Count Pill */}
                        <div
                          className={`px-2.5 py-1 rounded-full text-xs font-black border flex items-center gap-1 ${
                            voteCount > 0
                              ? "bg-goblinLime/20 border-goblinLime/40 text-goblinLime"
                              : "bg-white/[0.04] border-white/10 text-zinc-400"
                          }`}
                        >
                          <Users className="w-3 h-3" />
                          <span>
                            {voteCount} {voteCount === 1 ? "voto" : "votos"}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                        {candidate.description}
                      </p>
                    </div>

                    {/* Footer: Voter avatars + Vote indicator */}
                    <div className="mt-4 pt-3 border-t border-emerald-500/10 flex items-center justify-between">
                      {/* Voters avatars/names */}
                      <div className="flex items-center -space-x-1.5 overflow-hidden">
                        {voters.slice(0, 4).map((voter) => (
                          <div
                            key={voter.id}
                            title={voter.name}
                            className="w-6 h-6 rounded-full bg-emerald-900 border border-emerald-400/50 flex items-center justify-center text-[10px] font-black text-emerald-200"
                          >
                            {voter.name.charAt(0).toUpperCase()}
                          </div>
                        ))}
                        {voters.length > 4 && (
                          <span className="text-[10px] font-bold text-zinc-400 pl-2">
                            +{voters.length - 4}
                          </span>
                        )}
                        {voters.length === 0 && (
                          <span className="text-[11px] text-zinc-400">Sin votos aún</span>
                        )}
                      </div>

                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-xl transition ${
                          isSelected
                            ? "bg-goblinLime text-black font-black"
                            : "bg-white/[0.06] text-zinc-300 group-hover:bg-emerald-500/20 group-hover:text-emerald-300"
                        }`}
                      >
                        {isSelected ? "¡Tu Voto!" : "Votar"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. VIEW: SYNCHRONIZED COUNTDOWN (3... 2... 1...) */}
        {room && room.status === "countdown" && (
          <div className="w-full max-w-2xl mx-auto px-4 py-12 text-center overflow-hidden flex flex-col items-center justify-center glass-card rounded-3xl border border-emerald-500/20 my-auto">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
              La partida empieza en
            </div>
            <div className="font-display font-black text-[clamp(3.5rem,10vw,6rem)] leading-none my-4 text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary via-goblinLime to-white animate-bounce">
              {countdownSec}
            </div>
            <div className="font-display font-extrabold text-[clamp(1.75rem,5vw,3.25rem)] leading-tight tracking-tight text-white max-w-full break-words px-2">
              ¡Preparados!
            </div>
            <div className="text-sm sm:text-base font-medium text-zinc-300 mt-3">
              Abre bien los oídos. La canción suena en breve.
            </div>
          </div>
        )}

        {/* 4. VIEW: ACTIVE GAMEPLAY (15s Round) & ROUND REVEAL */}
        {room && (room.status === "playing" || room.status === "round_reveal") && currentRound && (
          <div className="space-y-6 max-w-4xl mx-auto w-full">
            {/* Top Game Bar */}
            <div className="glass-card rounded-2xl p-4 sm:p-5 border border-emerald-500/20 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-white">
                  Ronda {room.currentRound} de {room.rounds.length}
                </span>
                <span className="ml-2.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-950 border border-emerald-500/30 text-goblinLime">
                  {room.gameMode.toUpperCase()}
                </span>
              </div>

              {/* Synchronized 15s Timer */}
              <div className="flex items-center gap-3">
                {isAudioBlocked && (
                  <button
                    onClick={() => audioPlayer.resume()}
                    className="px-2.5 py-1 rounded-xl bg-goblinLime text-black font-bold text-xs hover:bg-emerald-400 animate-bounce transition flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Activar Audio</span>
                  </button>
                )}

                {/* Audio Equalizer visualizer animation */}
                <div className="flex items-end gap-1 h-5">
                  <span className="w-1 bg-goblinLime rounded-full animate-bounce h-3" />
                  <span className="w-1 bg-goblinPrimary rounded-full animate-bounce h-5 delay-75" />
                  <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-4 delay-150" />
                  <span className="w-1 bg-goblinLime rounded-full animate-bounce h-2 delay-200" />
                </div>

                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-mono font-black text-base shadow ${
                    secondsLeft <= 4
                      ? "bg-red-950/80 border-red-500 text-red-400 animate-ping"
                      : "bg-emerald-950 border-goblinLime text-goblinLime"
                  }`}
                >
                  {secondsLeft}
                </div>
              </div>
            </div>

            {/* Song Contributor Badge (if in Blend or Who Listens mode) */}
            {currentRound.contributedByPlayerName && (
              <div className="text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#102218] border border-emerald-500/30 text-emerald-300">
                  <Headphones className="w-4 h-4 text-emerald-400" />
                  <span>Aportada por: {currentRound.contributedByPlayerName}</span>
                </span>
              </div>
            )}

            {/* In Reveal State: Show Official Spotify Album Art & Save Button */}
            {room.status === "round_reveal" && (
              <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950/90 via-[#102218] to-black border border-goblinLime/50 flex flex-wrap items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-4">
                  <img
                    src={currentRound.targetTrack.artworkUrl}
                    alt={currentRound.targetTrack.title}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = getFallbackArtwork(
                        currentRound.targetTrack.title,
                        currentRound.targetTrack.artist
                      );
                    }}
                    className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-emerald-500/30"
                  />
                  <div>
                    <div className="text-xs uppercase font-extrabold tracking-wider text-goblinLime">
                      Canción Correcta
                    </div>
                    <div className="font-display font-extrabold text-xl text-white">
                      {currentRound.targetTrack.title}
                    </div>
                    <div className="text-xs text-zinc-300">
                      {currentRound.targetTrack.artist} • {currentRound.targetTrack.album}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSaveTrack(currentRound.targetTrack)}
                    className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-emerald-500/40 text-xs font-bold text-emerald-300 flex items-center gap-1.5 transition"
                  >
                    {savedTrackIds.has(currentRound.targetTrack.id) ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>
                      {savedTrackIds.has(currentRound.targetTrack.id)
                        ? "Guardada en Spotify"
                        : "Guardar en Spotify"}
                    </span>
                  </button>

                  <a
                    href={currentRound.targetTrack.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-xs transition flex items-center gap-1"
                  >
                    <span>Abrir en Spotify</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            {/* 4 Quiz Options Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              {currentRound.options.map((opt, optIdx) => {
                const optData = normalizeRoundOption(opt);
                const isSelected = selectedOption === optIdx;
                const isCorrect = optIdx === currentRound.correctIndex;
                const isReveal = room.status === "round_reveal";
                const imgKey = `play_${room.currentRound}_${optIdx}`;
                const hasScorePopup = scorePopup && scorePopup.optionIndex === optIdx;

                let cardStyle =
                  "bg-[#102218] border-emerald-500/20 hover:border-goblinLime text-white";

                if (isSelected && !isReveal) {
                  if (hasScorePopup) {
                    if (scorePopup.isCorrect) {
                      cardStyle =
                        "bg-emerald-950/90 border-emerald-400 text-white font-bold shadow-[0_0_30px_rgba(16,185,129,0.65)] animate-correct-glow scale-[1.02]";
                    } else {
                      cardStyle =
                        "bg-rose-950/90 border-rose-500 text-rose-200 shadow-[0_0_30px_rgba(244,63,94,0.65)] animate-wrong-shake";
                    }
                  } else {
                    cardStyle =
                      "bg-emerald-950/90 border-goblinLime text-goblinLime shadow-lg shadow-emerald-500/20";
                  }
                }

                if (isReveal) {
                  if (isCorrect) {
                    cardStyle =
                      "bg-emerald-900/90 border-emerald-400 text-white font-black shadow-lg shadow-emerald-500/30 scale-[1.02]";
                  } else if (isSelected && !isCorrect) {
                    cardStyle = hasScorePopup
                      ? "bg-red-950/90 border-red-500 text-red-200 line-through opacity-90 shadow-[0_0_25px_rgba(244,63,94,0.6)] animate-wrong-shake"
                      : "bg-red-950/80 border-red-500 text-red-200 line-through opacity-80";
                  } else {
                    cardStyle = "bg-black/40 border-zinc-800 text-zinc-500 opacity-50";
                  }
                }

                return (
                  <button
                    key={`${room.currentRound}_${optData.title}_${optIdx}`}
                    onClick={() => handleAnswer(optIdx)}
                    disabled={selectedOption !== null || isReveal}
                    className={`flex items-center justify-between gap-3.5 p-2.5 sm:p-3 rounded-xl border text-left transition-all relative overflow-visible ${cardStyle} ${
                      selectedOption !== null || isReveal ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    {/* Floating Arcade Score Popup */}
                    {hasScorePopup && (
                      <div
                        key={`popup_${scorePopup.key}`}
                        className={`absolute -top-4 sm:-top-5 left-1/2 pointer-events-none z-30 px-3.5 py-1.5 rounded-full font-mono font-black text-sm sm:text-base tracking-wider flex items-center gap-1.5 whitespace-nowrap animate-score-float select-none ${
                          scorePopup.isCorrect
                            ? "text-emerald-300 bg-emerald-500/20 border-2 border-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.65)] backdrop-blur-md"
                            : "text-rose-300 bg-rose-500/20 border-2 border-rose-500/80 shadow-[0_0_30px_rgba(244,63,94,0.65)] backdrop-blur-md"
                        }`}
                      >
                        {scorePopup.isCorrect ? (
                          <>
                            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>+{scorePopup.points} pts</span>
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>0 puntos</span>
                          </>
                        )}
                      </div>
                    )}
                    {/* Left: Artwork Container + Center: Title & Artist */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-emerald-950/80 border border-white/10 relative flex items-center justify-center">
                        {optionImageErrors[imgKey] ? (
                          <Music2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <img
                            src={optData.artworkUrl}
                            alt={optData.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setOptionImageErrors((prev) => ({
                                ...prev,
                                [imgKey]: true,
                              }))
                            }
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm sm:text-base text-white line-clamp-1">
                          {optData.title}
                        </div>
                        <div className="text-xs text-zinc-400 line-clamp-1">
                          {optData.artist}
                        </div>
                      </div>
                    </div>

                    {/* Right: Shortcut badge or Check / X */}
                    <div className="shrink-0 ml-2">
                      {isReveal && isCorrect ? (
                        <Check className="w-5 h-5 text-emerald-400" />
                      ) : isReveal && isSelected && !isCorrect ? (
                        <X className="w-5 h-5 text-rose-400" />
                      ) : (
                        <span className="w-7 h-7 rounded-lg bg-black/40 flex items-center justify-center font-mono text-xs text-zinc-400 border border-white/10">
                          {optIdx + 1}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Who Listens Mode Bonus Question: Guess Friend */}
            {room.gameMode === "who_listens" && (
              <div className="p-4 rounded-2xl bg-[#0B1710] border border-emerald-500/20 space-y-2">
                <div className="text-xs font-bold text-goblinLime flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-purple-400" />
                  <span>Bonus: ¿Quién crees que añadió esta canción? (+50 pts)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {room.players.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedFriend(p.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                        selectedFriend === p.id
                          ? "bg-goblinPrimary text-black border-goblinLime"
                          : "bg-black/50 text-zinc-300 border-emerald-500/20 hover:border-emerald-500/40"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live Synchronized Leaderboard & Status of all Players */}
            <div className="glass-card rounded-2xl p-4 border border-emerald-500/20">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center justify-between">
                <span>Clasificación en Vivo</span>
                <span>{room.players.length} Jugadores</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[...room.players]
                  .sort((a, b) => b.score - a.score)
                  .map((p, idx) => {
                    const hasAnswered = p.currentAnswer !== null;
                    const isCurrentMe = p.id === playerId;
                    const showMeScorePopup = isCurrentMe && scorePopup !== null;

                    return (
                      <div
                        key={p.id}
                        className={`p-3 rounded-xl bg-black/40 border flex flex-col justify-between relative transition-all overflow-visible ${
                          showMeScorePopup
                            ? scorePopup.isCorrect
                              ? "border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                              : "border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-wrong-shake"
                            : "border-emerald-500/15"
                        }`}
                      >
                        {/* Floating Popup on Leaderboard Player Card */}
                        {showMeScorePopup && (
                          <div
                            key={`player_popup_${scorePopup.key}`}
                            className={`absolute -top-3.5 right-2 pointer-events-none z-30 px-2.5 py-0.5 rounded-full font-mono font-black text-xs tracking-wider flex items-center gap-1 whitespace-nowrap animate-score-float select-none ${
                              scorePopup.isCorrect
                                ? "text-emerald-300 bg-emerald-500/20 border border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.65)] backdrop-blur-md"
                                : "text-rose-300 bg-rose-500/20 border border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.65)] backdrop-blur-md"
                            }`}
                          >
                            {scorePopup.isCorrect ? `+${scorePopup.points} pts` : "0 pts"}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white truncate max-w-[85px]">
                            #{idx + 1} {p.name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {p.spotifyBadge && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-[#1DB954] inline-block"
                                title={p.spotifyBadge}
                              />
                            )}
                            {isHost && p.id !== playerId && (
                              <button
                                onClick={() => handleKickPlayer(p.id, p.name)}
                                title="Expulsar jugador de la partida"
                                className="text-[10px] text-red-400 hover:text-red-300 font-bold px-1 hover:bg-red-500/20 rounded cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: p.avatarColor }}
                            />
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-mono font-extrabold text-goblinLime">
                            {p.score} pts
                          </span>
                          {room.gameMode === "survival" && (
                            <span className="flex items-center gap-0.5">
                              {Array.from({ length: Math.max(0, p.lives) }).map((_, i) => (
                                <Heart key={i} className="w-2.5 h-2.5 text-rose-500 fill-current" />
                              ))}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-[10px] text-zinc-400">
                          {hasAnswered ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <span>¡Respondió!</span>
                              <Zap className="w-3 h-3 text-emerald-400 fill-current" />
                            </span>
                          ) : (
                            <span className="italic">Escuchando…</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* 5. VIEW: MATCH FINISHED & FINAL PODIUM */}
        {room && room.status === "finished" && (
          <div className="space-y-8 max-w-3xl mx-auto w-full py-6">
            {/* Podium Box */}
            <div className="glass-card rounded-3xl p-6 sm:p-10 border border-emerald-500/30 text-center space-y-6">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                Partida Completada
              </div>
              <h1 className="font-display font-black text-3xl sm:text-5xl text-white">
                Podio Final de Campeones
              </h1>

              {/* 1st, 2nd, 3rd Podium */}
              {(() => {
                const ranked = [...room.players].sort((a, b) => b.score - a.score);
                const first = ranked[0];
                const second = ranked[1];
                const third = ranked[2];

                return (
                  <div className="flex items-end justify-center gap-3 sm:gap-6 pt-8 pb-4">
                    {/* 2nd Place */}
                    {second && (
                      <div className="flex flex-col items-center flex-1 max-w-[130px]">
                        <Trophy className="w-6 h-6 text-slate-300" />
                        <div className="font-bold text-xs text-zinc-300 mt-1 truncate">
                          {second.name}
                        </div>
                        <div className="font-mono font-black text-xs text-goblinLime">
                          {second.score} pts
                        </div>
                        <div className="w-full h-24 bg-emerald-950/80 rounded-t-2xl mt-2 border-t-2 border-zinc-400 flex items-center justify-center font-black text-xl text-zinc-400">
                          2
                        </div>
                      </div>
                    )}

                    {/* 1st Place */}
                    {first && (
                      <div className="flex flex-col items-center flex-1 max-w-[150px]">
                        <Crown className="w-8 h-8 text-amber-300 animate-bounce" />
                        <div className="font-extrabold text-sm text-white mt-1 truncate">
                          {first.name}
                        </div>
                        <div className="font-mono font-black text-sm text-goblinLime">
                          {first.score} pts
                        </div>
                        <div className="w-full h-32 bg-gradient-to-t from-goblinClover to-goblinPrimary rounded-t-2xl mt-2 border-t-2 border-goblinLime flex items-center justify-center font-black text-3xl text-black shadow-lg shadow-emerald-500/30">
                          1
                        </div>
                      </div>
                    )}

                    {/* 3rd Place */}
                    {third && (
                      <div className="flex flex-col items-center flex-1 max-w-[130px]">
                        <Trophy className="w-6 h-6 text-amber-600" />
                        <div className="font-bold text-xs text-zinc-300 mt-1 truncate">
                          {third.name}
                        </div>
                        <div className="font-mono font-black text-xs text-goblinLime">
                          {third.score} pts
                        </div>
                        <div className="w-full h-18 bg-emerald-950/60 rounded-t-2xl mt-2 border-t-2 border-amber-600 flex items-center justify-center font-black text-lg text-amber-500">
                          3
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                {isHost && (
                  <button
                    onClick={handleResetRoom}
                    className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 text-black font-black text-sm shadow-xl shadow-emerald-500/25 transition cursor-pointer flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Jugar otra vez en la misma sala</span>
                  </button>
                )}

                <button
                  onClick={handleSaveAllTracks}
                  disabled={savingAll}
                  className="px-5 py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-emerald-500/30 text-white font-bold text-xs transition flex items-center gap-2"
                >
                  <Heart className="w-3.5 h-3.5 text-rose-400 fill-current" />
                  <span>{savingAll ? "Guardando..." : "Guardar Canciones en Spotify"}</span>
                </button>

                <Link
                  href="/"
                  className="px-5 py-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 font-bold text-xs transition"
                >
                  Volver al Inicio
                </Link>
              </div>
            </div>

            {/* Played Songs Tracklist */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 border border-emerald-500/20 space-y-4">
              <h2 className="font-display font-extrabold text-lg text-white">
                Canciones Jugadas en esta Partida ({room.rounds.length})
              </h2>

              <div className="divide-y divide-emerald-500/15">
                {room.rounds.map((roundItem, idx) => (
                  <div
                    key={idx}
                    className="py-3 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-zinc-500 w-5">#{idx + 1}</span>
                      <img
                        src={roundItem.targetTrack.artworkUrl}
                        alt={roundItem.targetTrack.title}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = getFallbackArtwork(
                            roundItem.targetTrack.title,
                            roundItem.targetTrack.artist
                          );
                        }}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                      <div>
                        <div className="font-bold text-white text-sm">
                          {roundItem.targetTrack.title}
                        </div>
                        <div className="text-zinc-400">{roundItem.targetTrack.artist}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSaveTrack(roundItem.targetTrack)}
                        className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-emerald-400"
                        title="Guardar en Spotify"
                      >
                        {savedTrackIds.has(roundItem.targetTrack.id) ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Heart className="w-3.5 h-3.5 text-rose-400" />
                        )}
                      </button>
                      <a
                        href={roundItem.targetTrack.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-[#1DB954]/20 hover:bg-[#1DB954]/30 text-[#1DB954] font-bold flex items-center gap-1"
                      >
                        <span>Spotify</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* SHARE / INVITE MODAL */}
      {showInviteModal && room && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B1710] border border-emerald-500/30 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-white transition p-1 cursor-pointer"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1">
              <Link2 className="w-6 h-6 text-goblinLime mx-auto" />
              <h3 className="font-display font-extrabold text-xl text-white">
                Invitar Amigos a la Sala
              </h3>
              <p className="text-xs text-zinc-400">
                Pasa este enlace o código para que entren desde su móvil o PC.
              </p>
            </div>

            {/* Clickable Room Code Box */}
            <button
              type="button"
              onClick={() => handleCopyRoomCode(room.code)}
              className="w-full bg-black/60 hover:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-500/30 hover:border-emerald-400/60 transition text-center cursor-pointer group"
              title="Haz clic para copiar el código de sala"
            >
              <div className="text-[11px] font-bold uppercase text-emerald-400 flex items-center justify-center gap-1.5">
                <span>Código de Sala</span>
                {copiedCode ? (
                  <span className="text-emerald-300 font-bold ml-1 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> ¡Código copiado!
                  </span>
                ) : (
                  <span className="text-zinc-400 text-[10px] ml-1 group-hover:text-emerald-300 transition flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Clic para copiar
                  </span>
                )}
              </div>
              <div className="font-mono font-black text-4xl tracking-widest text-goblinLime my-1">
                {room.code}
              </div>
            </button>

            {/* Direct Link Box */}
            <div className="flex gap-2">
              <input
                readOnly
                value={
                  typeof window !== "undefined"
                    ? `${window.location.origin}/play?room=${room.code}`
                    : `/play?room=${room.code}`
                }
                className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-emerald-500/20 text-xs font-mono text-zinc-300 select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-4 py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs hover:bg-emerald-400 transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-black" />
                    <span>¡Enlace copiado!</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5 text-black" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>

            {/* Multiplayer Setup Guide (LAN & Cloudflare Tunnel) */}
            <div className="bg-emerald-950/40 p-4 rounded-2xl border border-emerald-500/20 text-[11px] text-zinc-300 space-y-1.5">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>¿Jugando desde distintos dispositivos?</span>
              </div>
              <p>
                • <strong>Misma red Wi-Fi:</strong> Abre <code>http://TU_IP_LOCAL:3000/play?room={room.code}</code> desde el móvil.
              </p>
              <p>
                • <strong>Por Internet con amigos:</strong> Puedes compartir un túnel gratis ejecutando en tu terminal:
                <br />
                <code className="text-goblinLime">npx cloudflared tunnel --url http://localhost:3000</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SPOTIFY IMPORT & CONNECT MODAL */}
      <SpotifyConnectModal
        isOpen={showSpotifyModal}
        onClose={() => setShowSpotifyModal(false)}
        onInjectTracks={(tracks, label, artists) => {
          handleInjectSpotifyTracks(tracks, label, artists);
        }}
        onPlayPlaylist={(tracks, playlistName, artists) => {
          handleInjectSpotifyTracks(tracks, playlistName, artists);
        }}
      />

      {/* SPOTIFY DETAIL STATS MODAL (#1 - #50) */}
      <SpotifyStatsDetailModal
        isOpen={showStatsDetailModal}
        onClose={() => setShowStatsDetailModal(false)}
        userDisplayName={spotifyAuthUser?.displayName}
      />
    </div>
  );
}

export default function PlayArenaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060D09] text-white flex items-center justify-center font-sans">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-goblinLime border-t-transparent rounded-full animate-spin" />
            <div className="text-sm font-bold text-emerald-400">Cargando Scuinklezam...</div>
          </div>
        </div>
      }
    >
      <PlayArenaContent />
    </Suspense>
  );
}

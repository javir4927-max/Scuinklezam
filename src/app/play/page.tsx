"use client";

import React, { useState, useEffect, useRef, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { playSynthNote } from "@/lib/audio";
import { playCorrectSound, playWrongSound } from "@/lib/soundEffects";
import { audioPlayer, SILENT_WAV } from "@/lib/audioPlayer";
import { useGlobalVolume, getEffectiveVolume } from "@/lib/globalVolume";
import {
  calculateRoundPoints,
  ROUND_DURATION_SEC,
  REVEAL_DURATION_MS,
  getSurvivalRoundDuration,
  getSurvivalPhaseInfo,
} from "@/lib/scoring";
import { normalizeSongTitle, matchSongTitleStrict, deepNormalize } from "@/lib/songMatching";
import {
  FlaskConical,
  Globe,
  Vote,
  Dices,
  UserCheck,
  Skull,
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
  RotateCcw,
  Check,
  ExternalLink,
  Copy,
  Pencil,
  Loader2,
  BarChart3,
  LogOut,
  Play,
  Pause,
  Gauge,
  EyeOff,
  Timer,
} from "lucide-react";
import { SpotifyTrackItem, getFallbackArtwork } from "@/lib/spotifyTypes";
import type { RoomState, Player, GameMode, GuessType, RoundOption } from "@/lib/roomStore";
import { getRankFrameClasses } from "@/lib/rankedTypes";

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
    const title = parts[0] || opt;
    const artist = parts[1] || "";
    return {
      id: `${title}-${artist}`.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      title,
      artist,
      artworkUrl: getFallbackArtwork(title, artist),
    };
  }
  const title = opt?.title || "Canción";
  const artist = opt?.artist || "";
  return {
    id: opt?.id || `${title}-${artist}`.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    title,
    artist,
    artworkUrl: opt?.artworkUrl || getFallbackArtwork(title, artist),
    topic: opt?.topic,
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
    case "speed_chaos":
      return <Gauge className={`${className} text-amber-400`} />;
    case "buzzer":
      return <Zap className={`${className} text-cyan-400`} />;
    case "intro_flash":
      return <Timer className={`${className} text-purple-400`} />;

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
    id: "speed_chaos",
    name: "Una Vaina Loca",
    badge: "Caos",
    desc: "Cada ronda suena acelerada (1.4x) o lenta y grave (0.7x). ¿Reconoces tus propios temas?",
  },
  {
    id: "buzzer",
    name: "Modo Pulsador",
    badge: "1º Gana",
    desc: "El primero en acertar se lleva 100 pts y cierra la ronda. Si fallas, quedas bloqueado.",
  },
  {
    id: "intro_flash",
    name: "Flash",
    badge: "Reflejos",
    desc: "Solo suenan los primeros 2.5 segundos de la canción. Adivina solo por el inicio.",
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
    desc: "Rondas infinitas con 3 vidas. Falla y pierdes una vida, acierta 3 seguidas y recuperas una. ¡Aguanta hasta el final!",
  },
];

interface MatchAward {
  id: string;
  icon: string;
  title: string;
  badge: string;
  description: string;
  playerName: string;
}

function calculateMatchAwards(
  players: Player[],
  playedRounds: any[],
  answersByRound?: Record<number, Record<string, any>>
): MatchAward[] {
  const awards: MatchAward[] = [];
  if (!players || players.length === 0 || !playedRounds || playedRounds.length === 0) return awards;

  // 1. ⚡ Dedos más rápidos: jugador con menor tiempo medio entre respuestas correctas (mínimo 1 acierto)
  let fastestPlayer: { player: Player; avgMs: number } | null = null;
  for (const p of players) {
    let totalCorrectTime = 0;
    let correctCount = 0;
    for (let rIdx = 1; rIdx <= playedRounds.length; rIdx++) {
      const ans = answersByRound?.[rIdx]?.[p.id] || p.answersByRound?.[rIdx];
      if (ans && ans.isCorrect && typeof ans.timeMs === "number" && ans.timeMs > 0) {
        totalCorrectTime += ans.timeMs;
        correctCount++;
      }
    }
    if (correctCount > 0) {
      const avgMs = totalCorrectTime / correctCount;
      if (!fastestPlayer || avgMs < fastestPlayer.avgMs) {
        fastestPlayer = { player: p, avgMs };
      }
    }
  }

  if (fastestPlayer) {
    awards.push({
      id: "fastest_fingers",
      icon: "⚡",
      title: "Dedos más rápidos",
      badge: "Velocidad",
      description: `${fastestPlayer.player.name} · ${(fastestPlayer.avgMs / 1000).toFixed(2)}s de media`,
      playerName: fastestPlayer.player.name,
    });
  }

  // 2. 🎯 Francotirador: mayor precisión (mínimo 80% en >= 3 rondas, o 100% si hubo menos)
  let sniperPlayer: { player: Player; correct: number; total: number; ratio: number } | null = null;
  for (const p of players) {
    let correctCount = 0;
    let totalAnswered = 0;
    for (let rIdx = 1; rIdx <= playedRounds.length; rIdx++) {
      const ans = answersByRound?.[rIdx]?.[p.id] || p.answersByRound?.[rIdx];
      if (ans) {
        totalAnswered++;
        if (ans.isCorrect) correctCount++;
      }
    }
    if (totalAnswered > 0) {
      const ratio = correctCount / totalAnswered;
      const qualifies = totalAnswered >= 3 ? ratio >= 0.8 : ratio === 1.0;
      if (qualifies) {
        if (
          !sniperPlayer ||
          ratio > sniperPlayer.ratio ||
          (ratio === sniperPlayer.ratio && totalAnswered > sniperPlayer.total)
        ) {
          sniperPlayer = { player: p, correct: correctCount, total: totalAnswered, ratio };
        }
      }
    }
  }

  if (sniperPlayer) {
    awards.push({
      id: "sniper",
      icon: "🎯",
      title: "Francotirador",
      badge: "Precisión",
      description: `${sniperPlayer.player.name} · ${sniperPlayer.correct}/${sniperPlayer.total} aciertos`,
      playerName: sniperPlayer.player.name,
    });
  }

  // 3. 🤡 El Traidor: jugador que falló (o no respondió) una canción aportada por él mismo
  let traitorPlayer: { player: Player; count: number; failedSongTitle: string } | null = null;
  for (const p of players) {
    let failCount = 0;
    let firstFailedTitle = "";
    playedRounds.forEach((round, idx) => {
      if (round.contributedByPlayerId === p.id) {
        const rIdx = idx + 1;
        const ans = answersByRound?.[rIdx]?.[p.id] || p.answersByRound?.[rIdx];
        if (!ans || !ans.isCorrect) {
          failCount++;
          if (!firstFailedTitle) {
            firstFailedTitle = round.correctTitle || round.targetTrack?.title || "su canción";
          }
        }
      }
    });
    if (failCount > 0) {
      if (!traitorPlayer || failCount > traitorPlayer.count) {
        traitorPlayer = { player: p, count: failCount, failedSongTitle: firstFailedTitle };
      }
    }
  }

  if (traitorPlayer) {
    awards.push({
      id: "traitor",
      icon: "🤡",
      title: "El Traidor",
      badge: "Despiste",
      description: `${traitorPlayer.player.name} · Falló su propio temazo (${traitorPlayer.failedSongTitle})`,
      playerName: traitorPlayer.player.name,
    });
  }

  // 4. 🔥 Imparable: mayor maxStreak (mínimo racha de 3)
  let streakPlayer: { player: Player; maxStreak: number } | null = null;
  for (const p of players) {
    const s = Math.max(p.maxStreak || 0, p.streak || 0);
    if (s >= 3) {
      if (!streakPlayer || s > streakPlayer.maxStreak) {
        streakPlayer = { player: p, maxStreak: s };
      }
    }
  }

  if (streakPlayer) {
    awards.push({
      id: "unstoppable",
      icon: "🔥",
      title: "Imparable",
      badge: "Racha",
      description: `${streakPlayer.player.name} · Racha de ${streakPlayer.maxStreak} seguidas`,
      playerName: streakPlayer.player.name,
    });
  }

  return awards;
}

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const introCutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [introFinished, setIntroFinished] = useState<boolean>(false);
  const [showAudioUnlockButton, setShowAudioUnlockButton] = useState<boolean>(false);
  const fallbackAttemptsRef = useRef<Map<string, number>>(new Map());
  const hasUnlockedAudioRef = useRef<boolean>(false);
  const { volume: globalVolume, muted: isGlobalMutedState } = useGlobalVolume();
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState<boolean>(false);
  const [isRematching, setIsRematching] = useState<boolean>(false);
  const [playingPodioUrl, setPlayingPodioUrl] = useState<string | null>(null);

  const [userCustomization, setUserCustomization] = useState<{
    avatarUrl?: string;
    rankTier?: string;
    equippedTitle?: string;
  }>({});

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.authenticated) {
          setUserCustomization({
            avatarUrl: d.customization?.customAvatarUrl || d.user?.avatarUrl,
            rankTier: d.highestTier || "Bronce",
            equippedTitle: d.customization?.equippedTitle || undefined,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Audio & Timer Refs
  const clockOffsetRef = useRef<number>(0);
  const lastRoomVersionRef = useRef<number>(0);
  const prevStatusRef = useRef<string>("");
  const prevRoundRef = useRef<number>(0);
  const currentRoundRef = useRef<number>(1);
  const activeTimerRoundRef = useRef<number>(1);
  const hasSubmittedRef = useRef<boolean>(false);
  const hasManuallyEditedNameRef = useRef<boolean>(false);
  const hasLeftRoomRef = useRef<boolean>(false);
  const roundEnteredAtRef = useRef<number>(performance.now());
  const roomStatusRef = useRef<string>("lobby");
  const nextRoundTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLoadedTrackRef = useRef<string>("");
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isStartingGame, setIsStartingGame] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  // Keep tracking refs synchronized with latest room state
  useEffect(() => {
    if (room) {
      if (room.currentRound !== currentRoundRef.current) {
        roundEnteredAtRef.current = performance.now();
      }
      currentRoundRef.current = room.currentRound;
      roomStatusRef.current = room.status;
      if (room.status === "lobby") {
        setIsStartingGame(false);
      }
    }
  }, [room?.currentRound, room?.status]);

  // Audio unlock helper using silent WAV
  const unlockAudioElement = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!hasUnlockedAudioRef.current) {
      try {
        if (!audio.src) {
          audio.src = SILENT_WAV;
          const effVol = getEffectiveVolume();
          audio.muted = isGlobalMutedState || effVol === 0;
          audio.volume = isGlobalMutedState ? 0 : effVol;
          const p = audio.play();
          if (p !== undefined) {
            p.then(() => {
              audio.pause();
              audio.currentTime = 0;
              hasUnlockedAudioRef.current = true;
            }).catch(() => {});
          }
        } else {
          hasUnlockedAudioRef.current = true;
        }
      } catch {}
    }
  };

  // Unlock audio on first user gesture (click or tap)
  useEffect(() => {
    const onFirstGesture = () => {
      unlockAudioElement();
      audioPlayer.unlock();
    };
    window.addEventListener("click", onFirstGesture, { once: true, passive: true });
    window.addEventListener("touchstart", onFirstGesture, { once: true, passive: true });
    return () => {
      window.removeEventListener("click", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
    };
  }, []);

  // Synchronize persistent audio element with global volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isGlobalMutedState || globalVolume === 0;
      audioRef.current.volume = isGlobalMutedState ? 0 : globalVolume;
    }
  }, [globalVolume, isGlobalMutedState]);

  useEffect(() => {
    const handleVol = (e: any) => {
      if (audioRef.current && e.detail) {
        const vol = typeof e.detail.volume === "number" ? e.detail.volume : 0.5;
        audioRef.current.muted = vol === 0;
        audioRef.current.volume = vol;
      }
    };
    window.addEventListener("scuinklezam_volume_change", handleVol);
    return () => window.removeEventListener("scuinklezam_volume_change", handleVol);
  }, []);

  // Safe fallback resolver for missing or failing audio previews without desynchronizing rounds
  const handleAudioFallback = async (roundData: any) => {
    const target = roundData?.targetTrack;
    const title = target?.title || target?.name;
    const artist = target?.artist || "";
    if (!title) return;
    const rescueKey = `${title}-${artist}`;
    const attempts = fallbackAttemptsRef.current.get(rescueKey) || 0;
    if (attempts >= 2) return;
    fallbackAttemptsRef.current.set(rescueKey, attempts + 1);

    try {
      const res = await fetch(
        `/api/audio/resolve?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Resolve failed");
      const data = await res.json();
      if (data.success && data.previewUrl && audioRef.current) {
        const audio = audioRef.current;
        audio.pause();
        audio.currentTime = 0;
        audio.src = data.previewUrl;
        audio.muted = isGlobalMutedState || globalVolume === 0;
        audio.volume = isGlobalMutedState ? 0 : globalVolume;
        audio.load();
        audio.play().then(() => {
          setShowAudioUnlockButton(false);
        }).catch((err) => {
          if (err?.name === "AbortError") return;
          if (err?.name === "NotAllowedError") {
            setShowAudioUnlockButton(true);
          }
        });
        return;
      }
    } catch (err) {
      console.warn("[Audio] Fallback resolve failed:", err);
    }
  };

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

  // 1. Initialize Player Identity from Cookies / SessionStorage / LocalStorage / Spotify (isolated per tab)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let localId = sessionStorage.getItem("scuinklezam_player_id");
    if (!localId) {
      localId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem("scuinklezam_player_id", localId);
    }
    setPlayerId(localId);

    const parseCookie = (name: string): string | null => {
      try {
        const match = document.cookie.match(
          new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)")
        );
        return match ? decodeURIComponent(match[1]) : null;
      } catch {
        return null;
      }
    };

    let candidateName = "";

    // 1. Check spotify_user_name cookie
    const spotifyCookie = parseCookie("spotify_user_name");
    if (spotifyCookie && spotifyCookie.trim()) {
      candidateName = spotifyCookie.trim();
    }

    // 2. Check scuinklezam_user cookie
    if (!candidateName) {
      const userCookie = parseCookie("scuinklezam_user");
      if (userCookie) {
        try {
          const parsed = JSON.parse(userCookie);
          if (parsed?.nickname) candidateName = parsed.nickname.trim();
          else if (parsed?.displayName) candidateName = parsed.displayName.trim();
          else if (parsed?.name) candidateName = parsed.name.trim();
        } catch {
          if (userCookie.trim() && !userCookie.startsWith("{")) {
            candidateName = userCookie.trim();
          }
        }
      }
    }

    // 3. Check storage
    if (!candidateName) {
      candidateName =
        sessionStorage.getItem("scuinklezam_player_name") ||
        localStorage.getItem("scuinklezam_player_name") ||
        localStorage.getItem("scuinklezam_nickname") ||
        localStorage.getItem("squinkle_player_name") ||
        localStorage.getItem("squinkle_nickname") ||
        "";
    }

    // 4. Check spotifyAuthUser
    if (spotifyAuthUser?.displayName && !hasManuallyEditedNameRef.current) {
      candidateName = spotifyAuthUser.displayName;
    }

    // 5. Fallback to /api/auth/user/me if still empty
    if (!candidateName) {
      fetch("/api/auth/user/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !hasManuallyEditedNameRef.current) {
            const fetched =
              data.nickname ||
              data.displayName ||
              data.name ||
              data.user?.nickname ||
              data.user?.name;
            if (fetched && typeof fetched === "string") {
              const clean = fetched.trim();
              setPlayerName(clean);
              sessionStorage.setItem("scuinklezam_player_name", clean);
              localStorage.setItem("scuinklezam_player_name", clean);
            }
          }
        })
        .catch(() => {});
    }

    if (candidateName) {
      setPlayerName(candidateName);
      sessionStorage.setItem("scuinklezam_player_name", candidateName);
      localStorage.setItem("scuinklezam_player_name", candidateName);
    }
  }, [spotifyAuthUser]);

  // Protection against async Spotify session loading: sync profile to Redis if joined before session resolved
  useEffect(() => {
    if (!roomCode || !playerId || !room || hasManuallyEditedNameRef.current) return;
    const resolvedName = spotifyAuthUser?.displayName || playerName;
    if (!resolvedName) return;

    const me = room.players.find((p) => p.id === playerId);
    if (me && (me.name === "Invitado" || me.name === "Jugador" || !me.name) && me.name !== resolvedName) {
      fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_player_profile",
          playerId,
          name: resolvedName,
          avatarColor: userCustomization.avatarUrl || spotifyAuthUser?.avatarUrl || undefined,
          avatarUrl: userCustomization.avatarUrl || spotifyAuthUser?.avatarUrl || undefined,
          rankTier: userCustomization.rankTier,
          equippedTitle: userCustomization.equippedTitle,
        }),
      })
        .then(async (r) => {
          if (r.ok) {
            const d = await r.json();
            if (d.success && d.room) setRoom(d.room);
          }
        })
        .catch(() => {});
    }
  }, [spotifyAuthUser, roomCode, playerId, room, playerName]);

  // Handler for Injecting Spotify Tracks & Stats into current Room
  const handleInjectSpotifyTracks = async (
    tracks: SpotifyTrackItem[],
    label: string,
    artists?: string[],
    modeName?: string
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
          modeName: modeName || label,
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

      await handleInjectSpotifyTracks(data.tracks, data.modeName, data.artists, data.modeName);
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
        if (data.serverTime) {
          clockOffsetRef.current = data.serverTime - Date.now();
        }
        if (data.success && isMounted && data.room) {
          const currentRoom: RoomState = data.room;

          // Monotonic version check: drop stale responses
          if (currentRoom.version && currentRoom.version < lastRoomVersionRef.current) {
            return;
          }
          lastRoomVersionRef.current = currentRoom.version || 0;

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

          // Anti-stale protection: ignore polling responses that are older than our current round
          const isCurrentActive =
            roomStatusRef.current === "playing" ||
            roomStatusRef.current === "round_reveal" ||
            roomStatusRef.current === "countdown";

          if (
            isCurrentActive &&
            currentRoom.status !== "lobby" &&
            currentRoom.status !== "finished" &&
            currentRoom.currentRound < currentRoundRef.current
          ) {
            // Ignore stale response from another serverless instance
            return;
          }

          // If current is playing, but incoming is lobby (without an explicit reset), ignore
          if (isCurrentActive && currentRoom.status === "lobby") {
            return;
          }

          if (!stillInRoom && currentRoom.status === "lobby" && !hasLeftRoomRef.current) {
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
            })
              .then(async (r) => {
                if (r.ok) {
                  const d = await r.json();
                  if (d.serverTime) clockOffsetRef.current = d.serverTime - Date.now();
                  if (d.success && d.room) {
                    lastRoomVersionRef.current = d.room.version || 0;
                    setRoom(d.room);
                  }
                }
              })
              .catch(() => {});
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

  // 3.5s Reveal timer to progress to next round cleanly and idempotently
  useEffect(() => {
    if (!room || room.status !== "round_reveal" || !roomCode) {
      if (nextRoundTimerRef.current) {
        clearTimeout(nextRoundTimerRef.current);
        nextRoundTimerRef.current = null;
      }
      return;
    }

    const now = Date.now() + clockOffsetRef.current;
    const endsAt = room.revealEndsAt || (room.revealStartTime ? room.revealStartTime + REVEAL_DURATION_MS : now + REVEAL_DURATION_MS);
    const delay = Math.max(200, Math.min(REVEAL_DURATION_MS, endsAt - now));
    const roundToAdvance = room.currentRound;

    nextRoundTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify({
            action: "next_round",
            playerId,
            expectedRoundIndex: roundToAdvance,
          }),
        });
        const data = await res.json();
        if (data.serverTime) {
          clockOffsetRef.current = data.serverTime - Date.now();
        }
        if (data.success && data.room) {
          lastRoomVersionRef.current = data.room.version || 0;
          setRoom(data.room);
        }
      } catch (err) {
        console.error("Failed to advance round:", err);
      }
    }, delay);

    return () => {
      if (nextRoundTimerRef.current) {
        clearTimeout(nextRoundTimerRef.current);
        nextRoundTimerRef.current = null;
      }
    };
  }, [room?.status, room?.currentRound, room?.revealEndsAt, roomCode, playerId]);


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

    // Status changed to Lobby
    if (room.status === "lobby" && prevStatusRef.current !== "lobby") {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioPlayer.stop();
      lastLoadedTrackRef.current = "";
      fallbackAttemptsRef.current.clear();
      setOptionImageErrors({});
    }

    // Status changed to Countdown
    if (room.status === "countdown" && prevStatusRef.current !== "countdown") {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      playSynthNote(440, 0.2);
      activeTimerRoundRef.current = room.currentRound;
      hasSubmittedRef.current = false;
      setSelectedOption(null);
      setSelectedFriend(null);
      setScorePopup(null);
      lastLoadedTrackRef.current = "";
      fallbackAttemptsRef.current.clear();
      setOptionImageErrors({});
    }

    // Status changed to Playing or Round changed
    if (
      room.status === "playing" &&
      (prevStatusRef.current !== "playing" || prevRoundRef.current !== room.currentRound)
    ) {
      roundEnteredAtRef.current = performance.now();
      activeTimerRoundRef.current = room.currentRound;
      hasSubmittedRef.current = false;
      setSelectedOption(null);
      setSelectedFriend(null);
      setScorePopup(null);

      const previewUrl = currentRoundData?.targetTrack?.previewUrl;
      const trackKey = `${room.currentRound}-${previewUrl || ""}`;
      const audio = audioRef.current;

      // Guard: don't re-load the same track (prevents polling or reveal→playing from restarting audio)
      if (audio && previewUrl && lastLoadedTrackRef.current !== trackKey) {
        lastLoadedTrackRef.current = trackKey;

        // Clear any stall detection timer
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }

        // Arm stall detection BEFORE audio.play()
        stallTimerRef.current = setTimeout(() => {
          if (audioRef.current && (audioRef.current.readyState === 0 || audioRef.current.paused)) {
            handleAudioFallback(currentRoundData);
          }
        }, 3500);

        audio.pause();
        audio.currentTime = 0;
        audio.src = previewUrl;
        audio.muted = isGlobalMutedState || globalVolume === 0;
        audio.volume = isGlobalMutedState ? 0 : globalVolume;

        const rate = room.gameMode === "speed_chaos" ? (currentRoundData?.playbackRate || 1) : 1;
        audio.playbackRate = rate;
        (audio as any).preservesPitch = rate === 1;
        (audio as any).webkitPreservesPitch = rate === 1;
        (audio as any).mozPreservesPitch = rate === 1;

        if (introCutTimerRef.current) {
          clearTimeout(introCutTimerRef.current);
          introCutTimerRef.current = null;
        }
        setIntroFinished(false);

        audio.play().then(() => {
          setShowAudioUnlockButton(false);
          // Preload next track silently while current track plays
          const nextTrackPreview = room.rounds[room.currentRound]?.targetTrack?.previewUrl;
          if (nextTrackPreview) {
            audioPlayer.preloadNext(nextTrackPreview);
          }
        }).catch((err: any) => {
          if (err?.name === "AbortError") {
            const onCanPlay = () => {
              if (audioRef.current) {
                audioRef.current.play().catch(() => {});
              }
              audio.removeEventListener("canplay", onCanPlay);
            };
            audio.addEventListener("canplay", onCanPlay, { once: true });
            return;
          }
          if (err?.name === "NotAllowedError") {
            setShowAudioUnlockButton(true);
          } else {
            handleAudioFallback(currentRoundData);
          }
        });
      } else if (audio && !previewUrl && lastLoadedTrackRef.current !== trackKey) {
        lastLoadedTrackRef.current = trackKey;
        handleAudioFallback(currentRoundData);
      }
    }

    // Status changed to Round Reveal — audio continues playing during reveal (no pause)
    if (room.status === "round_reveal" && prevStatusRef.current !== "round_reveal") {
      if (audioRef.current) {
        audioRef.current.playbackRate = 1;
        (audioRef.current as any).preservesPitch = true;
        (audioRef.current as any).webkitPreservesPitch = true;
        (audioRef.current as any).mozPreservesPitch = true;
      }
      if (introCutTimerRef.current) {
        clearTimeout(introCutTimerRef.current);
        introCutTimerRef.current = null;
      }
      setIntroFinished(false);
      if (audioRef.current && room.gameMode === "intro_flash") {
        audioRef.current.play().catch(() => {});
      }

      // Preload next track during reveal as well
      const nextTrackPreview = room.rounds[room.currentRound]?.targetTrack?.previewUrl;
      if (nextTrackPreview) {
        audioPlayer.preloadNext(nextTrackPreview);
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
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioPlayer.stop();
      playSynthNote(523.25, 0.2);
      setTimeout(() => playSynthNote(659.25, 0.2), 150);
      setTimeout(() => playSynthNote(783.99, 0.4), 300);
    }

    prevStatusRef.current = room.status;
    prevRoundRef.current = room.currentRound;
  }, [room?.status, room?.currentRound, playerId, globalVolume, isGlobalMutedState]);

  // 5. Cleanup Audio on unmount
  useEffect(() => {
    return () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      audioPlayer.stop();
    };
  }, []);

  // 6. Keyboard Shortcuts for Quiz Options [1, 2, 3, 4]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }
      const me = room?.players.find((p) => p.id === playerId);
      if (room?.status !== "playing" || selectedOption !== null || hasSubmittedRef.current || me?.isEliminated) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        handleAnswer(idx);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [room?.status, selectedOption, roomCode, playerId, room?.players]);

  // Beacon for page leave / close
  useEffect(() => {
    const handleUnload = (e: PageTransitionEvent | BeforeUnloadEvent) => {
      if ("persisted" in e && (e as PageTransitionEvent).persisted) return;
      if (roomCode && playerId && !hasLeftRoomRef.current) {
        const payload = JSON.stringify({ action: "leave_room", playerId });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(`/api/rooms/${roomCode}`, blob);
        } else {
          fetch(`/api/rooms/${roomCode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [roomCode, playerId]);

  // --- ACTIONS ---

  // Leave Room Action
  const handleLeaveRoom = async () => {
    hasLeftRoomRef.current = true;
    lastRoomVersionRef.current = 0;
    const currentCode = roomCode;
    const myId = playerId;

    audioPlayer.stop();
    setPlayingPodioUrl(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setRoom(null);
    setRoomCode("");

    if (currentCode && myId) {
      try {
        await fetch(`/api/rooms/${currentCode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave_room", playerId: myId }),
        });
      } catch {
        navigator.sendBeacon?.(
          `/api/rooms/${currentCode}`,
          JSON.stringify({ action: "leave_room", playerId: myId })
        );
      }
    }
  };

  // Create Room (0 initial artists by default)
  const handleCreateRoom = async (initialArtist?: string) => {
    unlockAudioElement();
    hasLeftRoomRef.current = false;
    lastRoomVersionRef.current = 0;
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
          avatarUrl: userCustomization.avatarUrl || spotifyAuthUser?.avatarUrl || undefined,
          rankTier: userCustomization.rankTier,
          equippedTitle: userCustomization.equippedTitle,
        }),
      });
      const data = await res.json();
      if (data.serverTime) {
        clockOffsetRef.current = data.serverTime - Date.now();
      }
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
    unlockAudioElement();
    hasLeftRoomRef.current = false;
    lastRoomVersionRef.current = 0;
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
          avatarUrl: userCustomization.avatarUrl || spotifyAuthUser?.avatarUrl || undefined,
          rankTier: userCustomization.rankTier,
          equippedTitle: userCustomization.equippedTitle,
        }),
      });
      const data = await res.json();
      if (data.serverTime) {
        clockOffsetRef.current = data.serverTime - Date.now();
      }
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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


  // Update Game Mode or Settings
  const handleChangeSettings = async (settings: {
    gameMode?: GameMode;
    guessType?: GuessType;
    totalRounds?: number;
    blindMode?: boolean;
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error updating settings:", err);
    }
  };

  // Start Ranked Match
  const handleStartGame = async () => {
    unlockAudioElement();
    if (!roomCode || isStartingGame) return;
    setIsStartingGame(true);
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
        setRoom(data.room);
      } else {
        setErrorMessage(data.error || "No se pudo iniciar la partida.");
        setIsStartingGame(false);
      }
    } catch {
      setErrorMessage("Error de conexión al iniciar la partida.");
      setIsStartingGame(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Answer
  const handleAnswer = async (optionIdx: number) => {
    if (!room || room.status !== "playing" || selectedOption !== null || hasSubmittedRef.current) return;
    if (activeTimerRoundRef.current !== room.currentRound) return;
    // 450ms click shield
    if (performance.now() - roundEnteredAtRef.current < 450) return;

    hasSubmittedRef.current = true;
    setSelectedOption(optionIdx);

    const now = Date.now() + clockOffsetRef.current;
    const timeMs = room.roundStartTime ? now - room.roundStartTime : 5000;
    const currentRound = room.rounds[room.currentRound - 1];

    const rawOpt = currentRound?.options?.[optionIdx];
    const selectedTitle = typeof rawOpt === "string" ? rawOpt : rawOpt?.title;
    const optionId = (typeof rawOpt === "object" && rawOpt?.id) ? rawOpt.id : undefined;
    const correctTitle = currentRound?.correctTitle || currentRound?.targetTrack?.title || "";

    const isCorrect = (optionId && currentRound?.correctOptionId && optionId === currentRound.correctOptionId) ||
      (selectedTitle && correctTitle
        ? matchSongTitleStrict(selectedTitle, correctTitle)
        : optionIdx === currentRound?.correctIndex);

    // Instant local exponential points calculation (max 100)
    let calculatedPoints = 0;
    if (isCorrect) {
      const elapsedSec = Math.max(0, timeMs / 1000);
      const duration = room.roundDuration || (room.gameMode === "survival" ? getSurvivalRoundDuration(room.currentRound - 1) : ROUND_DURATION_SEC);
      let basePoints = calculateRoundPoints(true, elapsedSec, duration);
      if (basePoints < 10) basePoints = 10;
      let friendBonus = 0;
      if (
        room.gameMode === "who_listens" &&
        selectedFriend &&
        currentRound?.contributedByPlayerId &&
        selectedFriend === currentRound.contributedByPlayerId
      ) {
        friendBonus = 50;
      }
      calculatedPoints = basePoints + friendBonus;
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
          optionId,
          roundIndex: room.currentRound,
          selectedTitle: selectedTitle || undefined,
          timeMs,
          guessedFriendId: selectedFriend || undefined,
        }),
      });
      const data = await res.json();
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
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
          if (data.room.currentRound >= currentRoundRef.current) {
            lastRoomVersionRef.current = data.room.version || 0;
            setRoom(data.room);
          }
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
    hasManuallyEditedNameRef.current = true;
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
        setRoom(data.room);
        setPlayerName(clean);
        sessionStorage.setItem("scuinklezam_player_name", clean);
        localStorage.setItem("squinkle_player_name", clean);
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
      if (patchData.serverTime) clockOffsetRef.current = patchData.serverTime - Date.now();
      if (patchData.success && patchData.room) {
        lastRoomVersionRef.current = patchData.room.version || 0;
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
        if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
        if (data.room) {
          lastRoomVersionRef.current = data.room.version || 0;
          setRoom(data.room);
        }
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
    const played = room.rounds.slice(0, Math.min(room.currentRound, room.rounds.length));
    for (const r of played) {
      if (r?.targetTrack) {
        await handleSaveTrack(r.targetTrack);
      }
    }
    setSavingAll(false);
  };

  // Rematch / Repeat Game instantly with same settings
  const handleRematch = async () => {
    if (!roomCode || isRematching) return;
    setIsRematching(true);
    audioPlayer.stop();
    setPlayingPodioUrl(null);
    lastLoadedTrackRef.current = "";
    fallbackAttemptsRef.current.clear();
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rematch",
          playerId,
        }),
      });
      const data = await res.json();
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
        setRoom(data.room);
      }
    } catch (err) {
      console.error("Error launching rematch:", err);
    } finally {
      setIsRematching(false);
    }
  };

  // Reset Room to Lobby (Replay)
  const handleResetRoom = async () => {
    if (!roomCode) return;
    audioPlayer.stop();
    setPlayingPodioUrl(null);
    lastLoadedTrackRef.current = "";
    fallbackAttemptsRef.current.clear();
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
      if (data.serverTime) clockOffsetRef.current = data.serverTime - Date.now();
      if (data.success && data.room) {
        lastRoomVersionRef.current = data.room.version || 0;
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
  const isSurvival = room?.gameMode === "survival";
  const survivalPhase = isSurvival && room ? getSurvivalPhaseInfo(room.currentRound - 1) : null;
  const isMeEliminated = Boolean(currentMe?.isEliminated);

  // Synchronized Timer Remaining calculation based authoritatively on server timestamps
  const getSecondsRemaining = () => {
    if (!room) return ROUND_DURATION_SEC;
    const now = Date.now() + clockOffsetRef.current;
    if (room.roundEndsAt) {
      return Math.max(0, Math.ceil((room.roundEndsAt - now) / 1000));
    }
    if (room.roundStartTime) {
      const elapsed = Math.floor((now - room.roundStartTime) / 1000);
      return Math.max(0, (room.roundDuration || ROUND_DURATION_SEC) - elapsed);
    }
    return room.roundDuration || ROUND_DURATION_SEC;
  };
  const secondsLeft = getSecondsRemaining();

  const getCountdownSeconds = () => {
    if (!room) return 3;
    const now = Date.now() + clockOffsetRef.current;
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
    const now = Date.now() + clockOffsetRef.current;
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
      {/* Persistent Single Audio Element (no dynamic key, no crossOrigin) */}
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onError={() => {
          if (room?.status === "playing" && room?.rounds?.[room.currentRound - 1]) {
            handleAudioFallback(room.rounds[room.currentRound - 1]);
          }
        }}
        onPlaying={() => {
          if (stallTimerRef.current) {
            clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          setShowAudioUnlockButton(false);

          if (room?.gameMode === "intro_flash" && room?.status === "playing") {
            if (introCutTimerRef.current) clearTimeout(introCutTimerRef.current);
            introCutTimerRef.current = setTimeout(() => {
              if (audioRef.current && room?.status === "playing") {
                audioRef.current.pause();
                setIntroFinished(true);
              }
            }, 2500);
          }
        }}
        className="hidden"
      />
      {/* Unified Top Navbar */}
      <Navbar
        activeRoute="play"
        onOpenSpotifyModal={() => setShowSpotifyModal(true)}
        rightSlot={
          room ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30">
              <span className="font-mono font-black text-goblinLime text-xs tracking-wider">
                {room.code}
              </span>
              <span className="text-xs text-zinc-400 hidden xl:inline truncate max-w-[120px]">
                {room.name}
              </span>
            </div>
          ) : undefined
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

          {room && (
            <button
              onClick={handleLeaveRoom}
              title="Salir de la sala"
              className="px-3 py-1 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-xs font-bold text-red-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">Salir de la sala</span>
            </button>
          )}
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
      <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-8 flex flex-col justify-center">
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
                <Trophy className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <div className="font-semibold text-zinc-300">Clasificación</div>
                <div>Compite en directo</div>
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
                  Comparte el código con tus amigos para jugar juntos.
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
              </div>
            </div>

            {/* Grid: Left Column (Settings & Taste) | Right Column (Players & Theme Voting) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (7 cols): Game Modes & Taste Blender */}
              <div className="lg:col-span-7 space-y-6">
                {/* 6 Game Modes Selector */}
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
                      6 MODOS RANKED
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

                  {/* Lobby Match Options: Rounds & Modo Ciego */}
                  <div className="mt-4 pt-4 border-t border-emerald-500/15 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400 font-semibold">Rondas:</span>
                      {room.gameMode === "survival" ? (
                        <span className="px-3 py-1 rounded-lg font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ∞ Rondas Infinitas · 3 Vidas ❤️❤️❤️
                        </span>
                      ) : (
                        [5, 10, 15, 20].map((num) => (
                          <button
                            key={num}
                            type="button"
                            disabled={!isHost}
                            onClick={() => isHost && handleChangeSettings({ totalRounds: num })}
                            className={`px-2.5 py-1 rounded-lg font-bold transition ${
                              room.totalRounds === num
                                ? "bg-goblinPrimary text-black"
                                : "bg-white/[0.05] text-zinc-400 hover:text-white"
                            } ${!isHost ? "cursor-default opacity-80" : "cursor-pointer"}`}
                          >
                            {num}
                          </button>
                        ))
                      )}
                    </div>

                    {/* Modo Ciego Toggle */}
                    <button
                      type="button"
                      disabled={!isHost}
                      onClick={() => isHost && handleChangeSettings({ blindMode: !room.blindMode })}
                      className={`px-3 py-1.5 rounded-xl font-bold transition border flex items-center gap-1.5 ${
                        room.blindMode
                          ? "bg-purple-950/80 text-purple-200 border-purple-500/50 shadow-md shadow-purple-500/20"
                          : "bg-white/[0.05] text-zinc-400 border-white/10 hover:text-white"
                      } ${!isHost ? "cursor-default" : "cursor-pointer"}`}
                      title={isHost ? "Alternar Modo Ciego" : undefined}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>🙈 Modo Ciego: {room.blindMode ? "Activado (Sin carátulas)" : "Desactivado"}</span>
                    </button>
                  </div>
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

                      {/* Green Confirmation Badge for Loaded Mode with 3 Sample Titles */}
                      {((currentMe?.injectedTracksCount || 0) > 0 || (currentMe?.injectedTracks?.length || 0) > 0) && (
                        <div className="p-3 rounded-2xl bg-emerald-950/80 border border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.2)] text-left flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-emerald-300">
                              ✓ {currentMe?.injectedTracksCount || currentMe?.injectedTracks?.length} canciones listas de tus {currentMe?.injectedModeName || "canciones de Spotify"}
                            </div>
                            {currentMe?.injectedTracksSample && currentMe.injectedTracksSample.length > 0 && (
                              <div className="text-[10px] text-emerald-400/80 mt-0.5 truncate">
                                (ej: {currentMe.injectedTracksSample.join(", ")})
                              </div>
                            )}
                          </div>
                        </div>
                      )}
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
                          {player.avatarUrl ? (
                            <img
                              src={player.avatarUrl}
                              alt={player.name}
                              className={`w-9 h-9 rounded-full object-cover shrink-0 ${getRankFrameClasses(player.rankTier)}`}
                            />
                          ) : (
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-black shadow ${getRankFrameClasses(player.rankTier)}`}
                              style={{ backgroundColor: player.avatarColor }}
                            >
                              {player.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
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
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {player.equippedTitle && (
                                <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                                  {player.equippedTitle}
                                </span>
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
                        </div>

                        <div className="flex items-center gap-2">
                          {player.isConnected === false ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold bg-amber-950/60 px-1.5 py-0.5 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Desconectado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Listo
                            </span>
                          )}

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
                      disabled={isLoading || isStartingGame || loadingSpotifyMode !== null}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 text-black font-black text-sm tracking-wide shadow-xl shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loadingSpotifyMode !== null ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Sincronizando canciones de Spotify...</span>
                        </>
                      ) : isStartingGame || isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Preparando canciones de la sala...</span>
                        </>
                      ) : (
                        "¡Iniciar Partida Ranked!"
                      )}
                    </button>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-emerald-500/15 text-center text-xs text-zinc-400">
                      Esperando a que el anfitrión comience la partida…
                    </div>
                  )}
                </div>

                {/* Theme Proposal & Voting Panel (only shown when gameMode is 'vote') */}
                {room.gameMode === "vote" && (
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
                )}
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
            {/* Top Game Bar: Responsive Flex-Wrap on Mobile */}
            <div
              className={`glass-card rounded-2xl p-3.5 sm:p-5 border flex flex-wrap items-center justify-between gap-2.5 transition-all ${
                isSurvival && survivalPhase?.isRedZone
                  ? "border-red-500/80 shadow-[0_0_25px_rgba(239,68,68,0.25)] animate-pulse"
                  : "border-emerald-500/20"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {isSurvival ? (
                  <>
                    <span className="font-bold text-xs sm:text-sm text-white shrink-0">
                      Ronda {room.currentRound}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-950 border border-rose-500/50 text-rose-300 shrink-0 tracking-wider">
                      ∞ SUPERVIVENCIA
                    </span>
                    {survivalPhase && (
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold flex items-center gap-1 border ${
                          survivalPhase.isRedZone
                            ? "bg-red-950/90 text-red-300 border-red-500 animate-pulse"
                            : "bg-emerald-950/80 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        <span>{survivalPhase.phaseName} · {survivalPhase.duration}s</span>
                        {survivalPhase.isRedZone && <span className="text-amber-300">· x1.5</span>}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-bold text-xs sm:text-sm text-white shrink-0">
                      Ronda {room.currentRound}/{room.rounds.length}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950 border border-emerald-500/30 text-goblinLime shrink-0">
                      {GAME_MODES.find((m) => m.id === room.gameMode)?.name.toUpperCase() || room.gameMode.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </>
                )}
              </div>

              {/* In Survival Mode: Show local player lives & healing progress */}
              {isSurvival && currentMe && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-black/50 px-2.5 py-1 rounded-xl border border-rose-500/30">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Heart
                        key={i}
                        className={`w-3.5 h-3.5 transition-all ${
                          i < (currentMe.lives ?? 3)
                            ? "text-rose-500 fill-current scale-100 drop-shadow-[0_0_6px_rgba(244,63,94,0.7)]"
                            : "text-zinc-600 fill-zinc-800 scale-90"
                        }`}
                      />
                    ))}
                  </div>

                  <span className="text-[11px] font-bold text-amber-300 bg-amber-950/50 border border-amber-500/30 px-2 py-0.5 rounded-lg hidden sm:flex items-center gap-1">
                    <span>🔥</span>
                    <span>{(currentMe.streak || 0) % 3}/3</span>
                    <span className="text-zinc-400 text-[10px]">para +1 ❤️</span>
                  </span>
                </div>
              )}

              {/* Synchronized 15s Timer & Audio */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {showAudioUnlockButton && (
                  <button
                    type="button"
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.muted = false;
                        audioRef.current.play().then(() => {
                          setShowAudioUnlockButton(false);
                        }).catch(() => {});
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl bg-goblinLime text-black font-bold text-xs hover:bg-emerald-400 animate-bounce transition flex items-center gap-1.5 shadow-lg cursor-pointer shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Tocar para activar sonido</span>
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

            {/* Spectator Mode Banner for Eliminated Players */}
            {isSurvival && isMeEliminated && (
              <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-center flex flex-wrap items-center justify-center gap-2 shadow-xl animate-fadeIn">
                <Skull className="w-4 h-4 text-rose-400 animate-pulse shrink-0" />
                <span className="font-extrabold text-xs sm:text-sm text-white">
                  Eliminado en la Ronda {currentMe?.eliminatedAtRound || room.currentRound} · Modo Espectador
                </span>
                <span className="text-[11px] text-rose-200/70">
                  (Sigues escuchando la música mientras los demás luchan por sobrevivir)
                </span>
              </div>
            )}

            {/* Song Contributor / Source Mode Badge */}
            {(currentRound.contributedByPlayerName || currentRound.sourceMode) && (
              <div className="text-center">
                {room.gameMode === "who_listens" && room.status === "playing" ? (
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-purple-950/80 via-emerald-950/80 to-purple-950/80 border border-purple-500/40 text-purple-200 shadow-md shadow-purple-500/10 animate-pulse">
                    <span>🕵️ ¿De quién es este temazo? · Elige al amigo antes de responder (+50 pts)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#102218] border border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/10">
                    <Headphones className="w-4 h-4 text-emerald-400" />
                    <span>
                      {currentRound.sourceMode && currentRound.contributedByPlayerName
                        ? `De ${currentRound.sourceMode} de ${currentRound.contributedByPlayerName}`
                        : currentRound.sourceMode
                        ? `De ${currentRound.sourceMode}`
                        : `Aportada por ${currentRound.contributedByPlayerName}`}
                    </span>
                  </span>
                )}
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
                    <div className="text-xs uppercase font-extrabold tracking-wider text-goblinLime flex flex-wrap items-center gap-2">
                      <span>Canción Correcta</span>
                      {room.gameMode === "who_listens" ? (
                        <>
                          <span className="text-[11px] px-3 py-1 rounded-full bg-gradient-to-r from-purple-900/60 to-emerald-900/60 text-purple-200 normal-case font-black border border-purple-400/50 flex items-center gap-1.5 shadow-md animate-scaleUp">
                            <span>🎯 ¡Este temazo era de {currentRound.contributedByPlayerName || "un amigo"}!</span>
                            {currentRound.sourceMode && (
                              <span className="text-zinc-400 text-[10px]">({currentRound.sourceMode})</span>
                            )}
                          </span>

                          {selectedFriend && selectedFriend === currentRound.contributedByPlayerId && (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-goblinLime normal-case font-black border border-emerald-400/50 flex items-center gap-1 shadow animate-bounce">
                              <Sparkles className="w-3 h-3 text-goblinLime" />
                              <span>+50 pts Bonus de amigo</span>
                            </span>
                          )}
                        </>
                      ) : (
                        (currentRound.sourceMode || currentRound.contributedByPlayerName) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 normal-case font-bold border border-emerald-500/30">
                            {currentRound.sourceMode && currentRound.contributedByPlayerName
                              ? `De ${currentRound.sourceMode} de ${currentRound.contributedByPlayerName}`
                              : currentRound.sourceMode
                              ? `De ${currentRound.sourceMode}`
                              : `Aportada por ${currentRound.contributedByPlayerName}`}
                          </span>
                        )
                      )}
                    </div>
                    <div className="font-display font-extrabold text-xl text-white">
                      {currentRound.targetTrack.title}
                    </div>
                    <div className="text-xs text-zinc-300">
                      {currentRound.targetTrack.artist} • {currentRound.targetTrack.album}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {isSurvival && currentMe && (
                    <div className="flex items-center gap-2">
                      {currentMe.lostLifeThisRound && (
                        <div className="px-3 py-1.5 rounded-xl bg-red-950/90 border border-red-500/50 text-red-300 font-extrabold text-xs flex items-center gap-1.5 animate-bounce shadow-lg">
                          <span>💔 -1 Vida</span>
                          <span className="text-zinc-400 text-[10px]">({currentMe.lives} restantes)</span>
                        </div>
                      )}
                      {currentMe.healedThisRound && (
                        <div className="px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-goblinLime font-extrabold text-xs flex items-center gap-1.5 animate-bounce shadow-lg">
                          <span>💖 ¡Racha x3! +1 Vida recuperada</span>
                          <span className="text-zinc-400 text-[10px]">({currentMe.lives}/3)</span>
                        </div>
                      )}
                    </div>
                  )}

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

            {/* Speed Chaos / Intro Flash / Buzzer Banners */}
            {room.gameMode === "speed_chaos" && room.status === "playing" && currentRound.playbackRate && (
              <div className="flex justify-center animate-fadeIn">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black tracking-wide bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-md shadow-amber-500/10 animate-pulse">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <span>{currentRound.playbackRate > 1 ? "⚡ ACELERADA x1.4" : "🐢 LENTA x0.7"}</span>
                </span>
              </div>
            )}

            {room.gameMode === "intro_flash" && room.status === "playing" && (
              <div className="flex justify-center animate-fadeIn">
                <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black tracking-wide border shadow-md transition ${
                  introFinished
                    ? "bg-purple-950/90 text-purple-200 border-purple-400/60 animate-bounce"
                    : "bg-purple-950/40 text-purple-300 border-purple-500/30"
                }`}>
                  <Timer className="w-4 h-4 text-purple-400" />
                  <span>{introFinished ? "⏱️ Flash terminado · ¡Adivina ahora!" : "🎧 Escuchando Flash (2.5s)..."}</span>
                </span>
              </div>
            )}

            {room.gameMode === "buzzer" && room.status === "playing" && (
              <div className="flex justify-center animate-fadeIn">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black tracking-wide bg-cyan-950/80 text-cyan-200 border border-cyan-400/50 shadow-md shadow-cyan-500/10">
                  <Zap className="w-4 h-4 text-cyan-400 fill-current" />
                  <span>Modo Pulsador · ¡El primer acierto se lleva los 100 pts y cierra la ronda!</span>
                </span>
              </div>
            )}

            {room.status === "round_reveal" && room.gameMode === "buzzer" && currentRound.buzzerWinnerName && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-emerald-950/90 to-cyan-950/90 border border-cyan-400/50 text-center shadow-lg animate-scaleUp">
                <span className="font-extrabold text-sm sm:text-base text-cyan-200 flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-300 fill-current" />
                  <span>⚡ ¡{currentRound.buzzerWinnerName} pulsó primero y se llevó los 100 pts!</span>
                </span>
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
                    disabled={selectedOption !== null || isReveal || isMeEliminated}
                    className={`w-full flex items-center justify-between gap-3.5 p-3 sm:p-3.5 rounded-2xl border text-left transition-all relative overflow-visible min-h-[56px] text-base font-semibold ${cardStyle} ${
                      selectedOption !== null || isReveal || isMeEliminated
                        ? "cursor-default opacity-80"
                        : "cursor-pointer"
                    }`}
                  >
                    {/* Floating Arcade Score Popup */}
                    {hasScorePopup && (
                      <div
                        key={`popup_${scorePopup.key}`}
                        className={`absolute -top-4 sm:-top-5 left-1/2 -translate-x-1/2 pointer-events-none z-30 px-3.5 py-1.5 rounded-full font-mono font-black text-sm sm:text-base tracking-wider flex items-center gap-1.5 whitespace-nowrap animate-score-float select-none ${
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
                        {room.blindMode && room.status === "playing" ? (
                          <div className="w-full h-full bg-black/60 border border-purple-500/30 flex items-center justify-center text-purple-300">
                            <EyeOff className="w-5 h-5 opacity-70" />
                          </div>
                        ) : optionImageErrors[imgKey] ? (
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
              <div className="p-4 rounded-2xl bg-[#0B1710] border border-purple-500/30 space-y-2.5">
                <div className="text-xs font-bold text-purple-300 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-purple-400" />
                    <span>Bonus: ¿Quién crees que añadió esta canción? (+50 pts)</span>
                  </div>
                  {room.status === "round_reveal" && (
                    <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400">
                      Resultado revelado
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {room.players.map((p) => {
                    const isOwner = p.id === currentRound.contributedByPlayerId;
                    const isSelected = selectedFriend === p.id;
                    const isReveal = room.status === "round_reveal";
                    const disabled = selectedOption !== null || isReveal;

                    let btnStyle = "bg-black/50 text-zinc-300 border-emerald-500/20 hover:border-emerald-500/40";
                    if (isReveal) {
                      if (isOwner) {
                        btnStyle = "bg-gradient-to-r from-purple-600 to-emerald-500 text-black font-black border-goblinLime shadow-lg shadow-emerald-500/20 scale-105";
                      } else if (isSelected) {
                        btnStyle = "bg-rose-950/50 text-rose-300 border-rose-500/50 line-through opacity-60";
                      } else {
                        btnStyle = "bg-black/30 text-zinc-600 border-white/5 opacity-50";
                      }
                    } else if (isSelected) {
                      btnStyle = "bg-gradient-to-r from-purple-500 to-emerald-400 text-black font-black border-goblinLime shadow-md";
                    }

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedFriend(p.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5 ${btnStyle} ${
                          disabled ? "cursor-default" : "cursor-pointer"
                        }`}
                      >
                        <span>{p.name}</span>
                        {isReveal && isOwner && (
                          <span className="px-1.5 py-0.2 rounded-full bg-black/60 text-goblinLime text-[10px] font-black">
                            ✓ Era suyo
                          </span>
                        )}
                      </button>
                    );
                  })}
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
                  .sort((a, b) => {
                    if (room.gameMode === "survival") {
                      if (!a.isEliminated && b.isEliminated) return -1;
                      if (a.isEliminated && !b.isEliminated) return 1;
                      if (a.isEliminated && b.isEliminated) {
                        const aRound = a.eliminatedAtRound || 0;
                        const bRound = b.eliminatedAtRound || 0;
                        if (bRound !== aRound) return bRound - aRound;
                      }
                    }
                    return b.score - a.score;
                  })
                  .map((p, idx) => {
                    const hasAnswered = p.currentAnswer !== null;
                    const isCurrentMe = p.id === playerId;
                    const showMeScorePopup = isCurrentMe && scorePopup !== null;
                    const isPlayerEliminated = room.gameMode === "survival" && p.isEliminated;

                    return (
                      <div
                        key={p.id}
                        className={`p-3 rounded-xl border flex flex-col justify-between relative transition-all overflow-visible ${
                          isPlayerEliminated
                            ? "bg-black/60 border-rose-950/80 opacity-40 grayscale-[40%]"
                            : showMeScorePopup
                            ? scorePopup.isCorrect
                              ? "bg-black/40 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                              : "bg-black/40 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-wrong-shake"
                            : "bg-black/40 border-emerald-500/15"
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
                          <div className="flex items-center gap-1.5 min-w-0">
                            {p.avatarUrl ? (
                              <img
                                src={p.avatarUrl}
                                alt={p.name}
                                className={`w-4 h-4 rounded-full object-cover shrink-0 ${getRankFrameClasses(p.rankTier)}`}
                              />
                            ) : (
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${getRankFrameClasses(p.rankTier)}`}
                                style={{ backgroundColor: p.avatarColor }}
                              />
                            )}
                            <span className="font-bold text-xs text-white truncate max-w-[75px]">
                              #{idx + 1} {p.name}
                            </span>
                          </div>
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
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-mono font-extrabold text-goblinLime">
                            {p.score} pts
                          </span>
                          {room.gameMode === "survival" && (
                            <span className="flex items-center gap-0.5">
                              {isPlayerEliminated ? (
                                <span className="text-[9px] font-extrabold text-rose-400 bg-rose-950/80 px-1 py-0.5 rounded">
                                  ELIMINADO (R{p.eliminatedAtRound || room.currentRound})
                                </span>
                              ) : (
                                Array.from({ length: 3 }).map((_, i) => (
                                  <Heart
                                    key={i}
                                    className={`w-2.5 h-2.5 ${
                                      i < (p.lives ?? 3)
                                        ? "text-rose-500 fill-current"
                                        : "text-zinc-700 fill-zinc-800"
                                    }`}
                                  />
                                ))
                              )}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-[10px] text-zinc-400">
                          {p.isConnected === false ? (
                            <span className="text-amber-400 font-bold bg-amber-950/80 px-1 py-0.5 rounded text-[9px]">
                              Desconectado
                            </span>
                          ) : isPlayerEliminated ? (
                            <span className="text-zinc-500 italic">Espectador</span>
                          ) : hasAnswered ? (
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
                {room.gameMode === "survival"
                  ? `Fin de Supervivencia · ${room.currentRound} Rondas Disputadas`
                  : "Partida Completada"}
              </div>
              <h1 className="font-display font-black text-3xl sm:text-5xl text-white">
                {room.gameMode === "survival"
                  ? "🏆 Podio de Supervivientes"
                  : "Podio Final de Campeones"}
              </h1>

              {/* 1st, 2nd, 3rd Podium */}
              {(() => {
                const ranked = [...room.players].sort((a, b) => {
                  if (room.gameMode === "survival") {
                    if (!a.isEliminated && b.isEliminated) return -1;
                    if (a.isEliminated && !b.isEliminated) return 1;
                    if (a.isEliminated && b.isEliminated) {
                      const aRound = a.eliminatedAtRound || 0;
                      const bRound = b.eliminatedAtRound || 0;
                      if (bRound !== aRound) return bRound - aRound;
                    }
                  }
                  return b.score - a.score;
                });
                const first = ranked[0];
                const second = ranked[1];
                const third = ranked[2];

                return (
                  <div className="flex items-end justify-center gap-3 sm:gap-6 pt-8 pb-4">
                    {/* 2nd Place */}
                    {second && (
                      <div className="flex flex-col items-center flex-1 max-w-[130px]">
                        <Trophy className="w-6 h-6 text-slate-300" />
                        <div className="mt-1">
                          {second.avatarUrl ? (
                            <img
                              src={second.avatarUrl}
                              alt={second.name}
                              className={`w-9 h-9 rounded-full object-cover mx-auto ${getRankFrameClasses(second.rankTier)}`}
                            />
                          ) : (
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-black shadow mx-auto ${getRankFrameClasses(second.rankTier)}`}
                              style={{ backgroundColor: second.avatarColor }}
                            >
                              {second.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="font-bold text-xs text-zinc-300 mt-1 truncate max-w-[120px]">
                          {second.name}
                        </div>
                        {second.equippedTitle && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium truncate max-w-[110px] mt-0.5">
                            {second.equippedTitle}
                          </span>
                        )}
                        <div className="font-mono font-black text-xs text-goblinLime">
                          {second.score} pts
                        </div>
                        {room.gameMode === "survival" && (
                          <div className="text-[10px] text-amber-300 font-bold mt-0.5">
                            🔥 {second.maxStreak || second.streak || 0} racha
                          </div>
                        )}
                        <div className="w-full h-24 bg-emerald-950/80 rounded-t-2xl mt-2 border-t-2 border-zinc-400 flex items-center justify-center font-black text-xl text-zinc-400">
                          2
                        </div>
                      </div>
                    )}

                    {/* 1st Place */}
                    {first && (
                      <div className="flex flex-col items-center flex-1 max-w-[150px]">
                        <Crown className="w-8 h-8 text-amber-300 animate-bounce" />
                        <div className="mt-1">
                          {first.avatarUrl ? (
                            <img
                              src={first.avatarUrl}
                              alt={first.name}
                              className={`w-11 h-11 rounded-full object-cover mx-auto ${getRankFrameClasses(first.rankTier)}`}
                            />
                          ) : (
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs text-black shadow mx-auto ${getRankFrameClasses(first.rankTier)}`}
                              style={{ backgroundColor: first.avatarColor }}
                            >
                              {first.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="font-extrabold text-sm text-white mt-1 truncate max-w-[140px]">
                          {first.name}
                        </div>
                        {first.equippedTitle && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium truncate max-w-[130px] mt-0.5">
                            {first.equippedTitle}
                          </span>
                        )}
                        <div className="font-mono font-black text-sm text-goblinLime">
                          {first.score} pts
                        </div>
                        {room.gameMode === "survival" && (
                          <div className="text-[11px] text-amber-300 font-extrabold mt-0.5 flex items-center gap-1">
                            <span>🔥 {first.maxStreak || first.streak || 0} racha</span>
                            {first.lives > 0 && <span className="text-rose-400">· {first.lives} ❤️</span>}
                          </div>
                        )}
                        <div className="w-full h-32 bg-gradient-to-t from-goblinClover to-goblinPrimary rounded-t-2xl mt-2 border-t-2 border-goblinLime flex items-center justify-center font-black text-3xl text-black shadow-lg shadow-emerald-500/30">
                          1
                        </div>
                      </div>
                    )}

                    {/* 3rd Place */}
                    {third && (
                      <div className="flex flex-col items-center flex-1 max-w-[130px]">
                        <Trophy className="w-6 h-6 text-amber-600" />
                        <div className="mt-1">
                          {third.avatarUrl ? (
                            <img
                              src={third.avatarUrl}
                              alt={third.name}
                              className={`w-9 h-9 rounded-full object-cover mx-auto ${getRankFrameClasses(third.rankTier)}`}
                            />
                          ) : (
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-black shadow mx-auto ${getRankFrameClasses(third.rankTier)}`}
                              style={{ backgroundColor: third.avatarColor }}
                            >
                              {third.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="font-bold text-xs text-zinc-300 mt-1 truncate max-w-[120px]">
                          {third.name}
                        </div>
                        {third.equippedTitle && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium truncate max-w-[110px] mt-0.5">
                            {third.equippedTitle}
                          </span>
                        )}
                        <div className="font-mono font-black text-xs text-goblinLime">
                          {third.score} pts
                        </div>
                        {room.gameMode === "survival" && (
                          <div className="text-[10px] text-amber-300 font-bold mt-0.5">
                            🔥 {third.maxStreak || third.streak || 0} racha
                          </div>
                        )}
                        <div className="w-full h-18 bg-emerald-950/60 rounded-t-2xl mt-2 border-t-2 border-amber-600 flex items-center justify-center font-black text-lg text-amber-500">
                          3
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Match Awards Grid (Premios Graciosos) */}
              {(() => {
                const playedRounds = room.rounds.slice(0, Math.min(room.currentRound, room.rounds.length));
                const matchAwards = calculateMatchAwards(room.players, playedRounds, room.answersByRound);
                if (matchAwards.length === 0) return null;
                return (
                  <div className="pt-2 pb-1 text-left space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400">
                      <span>🏆</span>
                      <span>Premios de la Partida</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {matchAwards.map((award) => (
                        <div
                          key={award.id}
                          className="p-3.5 rounded-2xl bg-[#0B1710]/80 border border-emerald-500/20 backdrop-blur-sm flex items-center gap-3.5 hover:border-emerald-500/40 transition shadow-sm"
                        >
                          <div className="w-10 h-10 rounded-xl bg-emerald-950/90 border border-emerald-500/30 flex items-center justify-center text-xl shrink-0 shadow-inner">
                            {award.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white">{award.title}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                {award.badge}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-300 font-medium truncate mt-0.5">
                              {award.description}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                {isHost ? (
                  <>
                    <button
                      onClick={handleRematch}
                      disabled={isRematching}
                      className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 text-black font-black text-sm shadow-xl shadow-emerald-500/25 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                    >
                      <RotateCcw className={`w-4 h-4 ${isRematching ? "animate-spin" : ""}`} />
                      <span>{isRematching ? "Preparando revancha..." : "Repetir partida"}</span>
                    </button>

                    <button
                      onClick={handleResetRoom}
                      className="px-5 py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-emerald-500/30 text-white font-bold text-xs transition flex items-center gap-2 cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-emerald-400" />
                      <span>Volver a la sala</span>
                    </button>
                  </>
                ) : (
                  <div className="w-full text-center py-1">
                    <span className="text-xs text-zinc-400 font-medium">
                      Esperando al anfitrión para volver a la sala…
                    </span>
                  </div>
                )}

                <button
                  onClick={handleSaveAllTracks}
                  disabled={savingAll}
                  className="px-5 py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-emerald-500/30 text-white font-bold text-xs transition flex items-center gap-2 cursor-pointer"
                >
                  <Heart className="w-3.5 h-3.5 text-rose-400 fill-current" />
                  <span>{savingAll ? "Guardando..." : "Guardar Canciones en Spotify"}</span>
                </button>
              </div>
            </div>

            {/* Played Songs Tracklist */}
            {(() => {
              const playedRounds = room.rounds.slice(0, Math.min(room.currentRound, room.rounds.length));

              return (
                <div className="glass-card rounded-3xl p-6 sm:p-8 border border-emerald-500/20 space-y-4">
                  <h2 className="font-display font-extrabold text-lg text-white">
                    Canciones Jugadas en esta Partida ({playedRounds.length})
                  </h2>

                  <div className="divide-y divide-emerald-500/15">
                    {playedRounds.map((roundItem, idx) => {
                      const myAns =
                        room.answersByRound?.[roundItem.roundNumber]?.[playerId] ||
                        currentMe?.answersByRound?.[roundItem.roundNumber];
                      const isPlayingThis = playingPodioUrl === roundItem.targetTrack.previewUrl;

                      return (
                        <div
                          key={idx}
                          className="py-3 flex items-center justify-between gap-3 text-xs"
                        >
                          {/* Bloque izquierdo: Índice + Imagen + Textos (min-w-0 flex-1 para no desbordar) */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="font-mono text-zinc-500 w-6 text-center shrink-0 text-xs">
                              #{idx + 1}
                            </span>
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
                              className="w-11 h-11 rounded-xl object-cover shrink-0 border border-emerald-500/20 bg-emerald-950"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-white text-sm truncate flex items-center gap-2">
                                <span className="truncate">{roundItem.targetTrack.title}</span>
                                {myAns?.isCorrect ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                                    +{myAns.pointsEarned} pts
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                                    0 pts
                                  </span>
                                )}
                              </div>
                              <div className="text-zinc-400 text-xs truncate mt-0.5 flex items-center gap-1">
                                <span className="truncate">{roundItem.targetTrack.artist}</span>
                                {roundItem.contributedByPlayerName && (
                                  <span className="text-zinc-500 shrink-0 text-[11px] font-medium">
                                    · De {roundItem.contributedByPlayerName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bloque derecho: Botón Play/Pause + Botón Guardar + Botón Spotify (shrink-0) */}
                          <div className="flex items-center gap-2 shrink-0">
                            {roundItem.targetTrack.previewUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  const url = roundItem.targetTrack.previewUrl;
                                  if (!url) return;
                                  if (isPlayingThis) {
                                    audioPlayer.stop();
                                    setPlayingPodioUrl(null);
                                  } else {
                                    audioPlayer.playTrack(url);
                                    setPlayingPodioUrl(url);
                                  }
                                }}
                                className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                                  isPlayingThis
                                    ? "bg-goblinLime text-black font-bold shadow-md shadow-emerald-500/30 scale-105"
                                    : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white"
                                }`}
                                title={isPlayingThis ? "Pausar preescucha" : "Escuchar fragmento de 30s"}
                              >
                                {isPlayingThis ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                )}
                              </button>
                            )}

                            <button
                              onClick={() => handleSaveTrack(roundItem.targetTrack)}
                              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-emerald-400 transition cursor-pointer shrink-0"
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
                              className="px-3 py-1.5 rounded-xl bg-[#1DB954]/20 hover:bg-[#1DB954]/30 text-[#1DB954] font-bold flex items-center gap-1 transition shrink-0"
                            >
                              <span>Spotify</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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

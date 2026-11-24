"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Trophy,
  Flame,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Timer,
  Sparkles,
  Users,
  Search,
  Check,
  X,
  Crown,
  RotateCcw,
  ArrowLeft,
  ChevronRight,
  Shield,
  Zap,
  Disc3,
  Loader2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MiniQuizModal from "@/components/MiniQuizModal";
import UserAuthModal from "@/components/UserAuthModal";
import { playCorrectSound, playWrongSound } from "@/lib/soundEffects";
import { audioPlayer } from "@/lib/audioPlayer";
import { SpotifyTrackItem, getFallbackArtwork } from "@/lib/spotifyTypes";
import { ROUND_DURATION_SEC, REVEAL_DURATION_MS, calculateRoundPoints } from "@/lib/scoring";
import { normalizeSongTitle, normalizeText, getCoherentDistractors, isStrictArtistMatch } from "@/lib/songMatching";
import {
  RANKED_CATEGORIES,
  RANKED_TIERS,
  RankedCategory,
  RankedTier,
  LeaderboardEntry,
  calculateTier,
  toArtistSlug,
  getCanonicalArtistName,
} from "@/lib/rankedTypes";
import type { UserSession } from "@/lib/userAuth";

interface RankedQuestion {
  correctTrack: SpotifyTrackItem;
  options: { title: string; artist: string; artworkUrl: string }[];
  correctIndex: number;
}

interface AnswerHistoryItem {
  track: SpotifyTrackItem;
  isCorrect: boolean;
  points: number;
  chosenTitle: string;
}

export default function RankedArenaPage() {
  const [activeTab, setActiveTab] = useState<"artist" | "theme">("artist");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [categories, setCategories] = useState<RankedCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(true);
  const categoriesReqIdRef = useRef<number>(0);
  const minValidCategoriesReqIdRef = useRef<number>(0);
  const [user, setUser] = useState<UserSession | null>(null);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [miniQuizOpen, setMiniQuizOpen] = useState<boolean>(false);
  const [leaderboardModalCategory, setLeaderboardModalCategory] = useState<RankedCategory | null>(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);

  // Ficha de Artista Oficial State
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [artistSheetData, setArtistSheetData] = useState<{
    artistName: string;
    slug: string;
    description?: string;
    photoUrl: string;
    userStats: {
      userRank: number | null;
      totalPlayers: number;
      totalPoints: number;
      quizzesPlayed: number;
      bestScore: number;
      tier?: RankedTier;
    };
    leaderboard: Array<{
      rank: number;
      userId: string;
      nickname: string;
      avatarUrl: string;
      totalPoints: number;
      bestScore?: number;
      quizzesPlayed?: number;
      tier?: RankedTier;
      isCurrentUser: boolean;
    }>;
    relatedArtists: Array<{
      name: string;
      slug: string;
      imageUrl: string;
    }>;
  } | null>(null);
  const [loadingArtistSheet, setLoadingArtistSheet] = useState<boolean>(false);
  const [fullArtistLeaderboardOpen, setFullArtistLeaderboardOpen] = useState<boolean>(false);

  // Live real-time artist search in Ranked
  const [liveSearchResults, setLiveSearchResults] = useState<Array<{
    id: string;
    name: string;
    imageUrl: string;
    genres: string[];
    followers?: number;
  }>>([]);
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const [showLiveDropdown, setShowLiveDropdown] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  const [artistSheetError, setArtistSheetError] = useState<string | null>(null);
  const [rankedError, setRankedError] = useState<string | null>(null);

  // Handler to open Ficha de Artista Oficial (unified by canonical alias)
  const handleOpenArtistSheet = async (artistName: string) => {
    const clean = getCanonicalArtistName(artistName);
    if (!clean) return;
    setSelectedArtistName(clean);
    setLoadingArtistSheet(true);
    setArtistSheetData(null);
    setArtistSheetError(null);
    setShowLiveDropdown(false);

    try {
      const guestId = user?.id || (typeof window !== "undefined" ? localStorage.getItem("scuinklezam_ranked_uid") : "") || "";
      const res = await fetch(
        `/api/ranked/artist?name=${encodeURIComponent(clean)}&userId=${guestId}&_t=${Date.now()}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setArtistSheetData(data);
        } else {
          setArtistSheetError(data.error || "No se pudo cargar la información de este artista.");
        }
      } else {
        setArtistSheetError("Error al consultar el perfil del artista.");
      }
    } catch (err) {
      console.error("Error loading artist sheet:", err);
      setArtistSheetError("Error de conexión al cargar la ficha del artista.");
    } finally {
      setLoadingArtistSheet(false);
    }
  };

  // Active Ranked Game Runner State
  const [activeCategory, setActiveCategory] = useState<RankedCategory | null>(null);
  const [gameState, setGameState] = useState<"idle" | "loading" | "playing" | "reveal" | "summary">("idle");
  const [questions, setQuestions] = useState<RankedQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(ROUND_DURATION_SEC);
  const [answeredIdx, setAnsweredIdx] = useState<number | null>(null);
  const [answersHistory, setAnswersHistory] = useState<AnswerHistoryItem[]>([]);
  const [playingPreviewUrl, setPlayingPreviewUrl] = useState<string | null>(null);

  const [scorePopup, setScorePopup] = useState<{
    points: number;
    isCorrect: boolean;
    optionIndex: number;
    key: number;
  } | null>(null);

  const [summaryData, setSummaryData] = useState<{
    finalScore: number;
    tier: RankedTier;
    rank: number;
    bestScore?: number;
    totalPoints?: number;
    isPersonalBest: boolean;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const pendingSubmitRef = useRef<{
    categoryId: string;
    categoryName?: string;
    artistName?: string;
    score: number;
    roundScores?: number[];
    correctCount: number;
    guestUserId: string;
    guestNickname: string;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scorePopupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const answersByRoundRef = useRef<Map<number, AnswerHistoryItem>>(new Map());
  const gameStateRef = useRef<"idle" | "loading" | "playing" | "reveal" | "summary">("idle");

  const timeLeftRef = useRef<number>(ROUND_DURATION_SEC);
  const scoreRef = useRef<number>(0);
  const currentIdxRef = useRef<number>(0);
  const isHandlingAnswerRef = useRef<boolean>(false);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    currentIdxRef.current = currentIdx;
  }, [currentIdx]);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Listen for navbar "scuinklezam_reset_ranked" event to reset all game and sheet states
  useEffect(() => {
    const handleReset = () => {
      audioPlayer.stop();
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (scorePopupTimerRef.current) clearTimeout(scorePopupTimerRef.current);
      answersByRoundRef.current = new Map();
      currentIdxRef.current = 0;
      timeLeftRef.current = ROUND_DURATION_SEC;
      scoreRef.current = 0;
      isHandlingAnswerRef.current = false;
      gameStateRef.current = "idle";
      setGameState("idle");
      setSelectedArtistName(null);
      setArtistSheetData(null);
      setArtistSheetError(null);
      setActiveCategory(null);
      setRankedError(null);
      setSearchFilter("");
    };

    window.addEventListener("scuinklezam_reset_ranked", handleReset);
    return () => window.removeEventListener("scuinklezam_reset_ranked", handleReset);
  }, []);

  // Fetch real categories and current user session
  const loadInitialData = async () => {
    const reqId = ++categoriesReqIdRef.current;
    try {
      const catRes = await fetch(`/api/ranked/categories?t=${Date.now()}`, { cache: "no-store" });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (
          catData.categories &&
          Array.isArray(catData.categories) &&
          reqId >= minValidCategoriesReqIdRef.current
        ) {
          setCategories(catData.categories);
        }
      }
    } catch (err) {
      console.error("[ranked] Error fetching categories:", err);
    } finally {
      if (reqId >= minValidCategoriesReqIdRef.current) {
        setLoadingCategories(false);
      }
    }

    try {
      const userRes = await fetch("/api/auth/user/me", { cache: "no-store" });
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData && userData.authenticated && userData.user) {
          setUser(userData.user);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadInitialData();
    return () => {
      audioPlayer.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (scorePopupTimerRef.current) clearTimeout(scorePopupTimerRef.current);
    };
  }, []);

  // Close live search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowLiveDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-open artist sheet if ?artist=... or select tab/search if ?theme=..., and ensure ranked UID exists
  useEffect(() => {
    if (typeof window !== "undefined") {
      let uid = localStorage.getItem("scuinklezam_ranked_uid");
      if (!uid) {
        uid = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem("scuinklezam_ranked_uid", uid);
      }
      const params = new URLSearchParams(window.location.search);
      const artistParam = params.get("artist");
      const themeParam = params.get("theme");
      if (artistParam) {
        handleOpenArtistSheet(artistParam);
      } else if (themeParam) {
        setActiveTab("theme");
        setSearchFilter(themeParam);
      }
    }
  }, []);

  // 300ms Debounced live artist search connecting to /api/spotify/artists
  useEffect(() => {
    if (activeTab !== "artist") {
      setShowLiveDropdown(false);
      return;
    }

    const trimmed = searchFilter.trim();
    if (trimmed.length < 2) {
      setLiveSearchResults([]);
      setShowLiveDropdown(false);
      setIsSearchingLive(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setIsSearchingLive(true);
    setShowLiveDropdown(true);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spotify/artists?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.artists)) {
            setLiveSearchResults(data.artists);
          } else {
            setLiveSearchResults([]);
          }
        }
      } catch (err) {
        console.error("Live artist search error:", err);
        setLiveSearchResults([]);
      } finally {
        setIsSearchingLive(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchFilter, activeTab]);

  // Filter categories with accent-insensitive, multi-field, and canonical alias search
  const filteredCategories = categories.filter((c) => {
    const matchesTab = c.kind === activeTab;
    const cleanFilter = searchFilter.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!cleanFilter) return matchesTab;
    const nName = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nDesc = c.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nQuery = (c.query || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchesAlias = c.kind === "artist" && toArtistSlug(c.query || c.name) === toArtistSlug(cleanFilter);
    return matchesTab && (matchesAlias || nName.includes(cleanFilter) || nDesc.includes(cleanFilter) || nQuery.includes(cleanFilter));
  });

  // Check if search has exact match (including canonical alias) or if custom search card should be displayed
  const hasExactSearchMatch = filteredCategories.some((c) => {
    const cleanFilter = searchFilter.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const nName = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchesAlias = c.kind === "artist" && toArtistSlug(c.query || c.name) === toArtistSlug(cleanFilter);
    return nName === cleanFilter || matchesAlias;
  });
  const showCustomArtistCard =
    activeTab === "artist" && searchFilter.trim().length >= 2 && !hasExactSearchMatch;

  // Open Leaderboard Modal
  const handleOpenLeaderboard = async (cat: RankedCategory) => {
    setLeaderboardModalCategory(cat);
    setLoadingLeaderboard(true);
    setLeaderboardEntries([]);
    try {
      const res = await fetch(`/api/ranked/leaderboard?category=${cat.id}&userId=${user?.id || ""}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.entries)) {
        setLeaderboardEntries(data.entries);
      }
    } catch {
      setLeaderboardEntries([]);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // True Fisher-Yates shuffle algorithm
  const fisherYatesShuffle = <T,>(arr: T[]): T[] => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const normalizeTrackTitle = (t: string): string => {
    return t
      .replace(/\s*[\(\[](feat|ft|with|remix|en vivo|live).*?[\)\]]/gi, "")
      .replace(/\s*-\s*(remix|en vivo|live|single|edit).*/gi, "")
      .replace(/[^\w\s\u00C0-\u017F]/g, "")
      .trim()
      .toLowerCase();
  };

  // Launch a Ranked Run (10 Questions Exact / 1000 Pts Max)
  const handleStartRankedRun = async (cat: RankedCategory) => {
    audioPlayer.unlock();
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (scorePopupTimerRef.current) clearTimeout(scorePopupTimerRef.current);

    setActiveCategory(cat);
    gameStateRef.current = "loading";
    setGameState("loading");
    setScore(0);
    setStreak(0);
    setCurrentIdx(0);
    currentIdxRef.current = 0;
    timeLeftRef.current = ROUND_DURATION_SEC;
    scoreRef.current = 0;
    setAnsweredIdx(null);
    setScorePopup(null);
    setSummaryData(null);
    answersByRoundRef.current = new Map();
    isHandlingAnswerRef.current = false;
    setAnswersHistory([]);
    setPlayingPreviewUrl(null);

    try {
      const params = new URLSearchParams();
      params.set("category", cat.id);
      if (cat.kind === "artist") {
        params.set("artist", cat.query || cat.name);
      }

      const res = await fetch(`/api/ranked/tracks?${params.toString()}`);
      const data = await res.json();
      const tracks: SpotifyTrackItem[] = data.tracks || [];

      if (tracks.length < 4) {
        setRankedError(`No se pudieron cargar suficientes canciones con audio disponible para "${cat.name}". Intenta con otro artista o temática.`);
        gameStateRef.current = "idle";
        setGameState("idle");
        return;
      }

      // Memory of recently played tracks per artist/category to prevent repetition
      const categorySlug = (cat.kind === "artist" ? toArtistSlug(cat.query || cat.name) : cat.id).replace(/[^a-z0-9]+/g, "_");
      const storageKey = `scuinklezam_recent_artist_tracks:${categorySlug}`;

      let recentTitles: string[] = [];
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) recentTitles = JSON.parse(stored);
      } catch {}

      // Prioritize tracks that were NOT played in recent matches
      let candidates = tracks.filter((t) => !recentTitles.includes(normalizeTrackTitle(t.title)));

      // If user has already cycled through almost all available tracks, restart cycle with full pool
      if (candidates.length < 10) {
        candidates = [...tracks];
        recentTitles = [];
      }

      // True Fisher-Yates shuffle to pick the 10 questions
      const shuffledCandidates = fisherYatesShuffle(candidates);
      const roundsCount = Math.min(10, shuffledCandidates.length);
      const selectedTracks = shuffledCandidates.slice(0, roundsCount);

      // Save selected 10 tracks into localStorage history (max 30 items)
      try {
        const updatedRecent = [
          ...recentTitles,
          ...selectedTracks.map((t) => normalizeTrackTitle(t.title)),
        ].slice(-30);
        localStorage.setItem(storageKey, JSON.stringify(updatedRecent));
      } catch {}

      // Build questions with Fisher-Yates shuffle for the 4 options
      const generated: RankedQuestion[] = [];
      for (let i = 0; i < roundsCount; i++) {
        const correct = selectedTracks[i];

        let distractors: { title: string; artist: string; artworkUrl: string }[] = [];

        if (cat.kind === "artist") {
          // If artist quiz, prefer other songs by this artist with different titles
          const targetArtist = cat.query || cat.name;
          const sameArtistTracks = tracks.filter(
            (t) =>
              (isStrictArtistMatch(t.artist, targetArtist) || isStrictArtistMatch(t.artist, correct.artist)) &&
              normalizeSongTitle(t.title) !== normalizeSongTitle(correct.title)
          );
          if (sameArtistTracks.length >= 3) {
            const seen = new Set<string>([normalizeSongTitle(correct.title)]);
            const picked = fisherYatesShuffle(sameArtistTracks);
            for (const t of picked) {
              if (distractors.length >= 3) break;
              const norm = normalizeSongTitle(t.title);
              if (!seen.has(norm)) {
                seen.add(norm);
                distractors.push({
                  title: t.title,
                  artist: t.artist,
                  artworkUrl: t.artworkUrl || getFallbackArtwork(t.title, t.artist),
                });
              }
            }
          }
        }

        // Fallback or Topic Category: strictly coherent distractors of the same topic
        if (distractors.length < 3) {
          distractors = getCoherentDistractors(correct, tracks, 3);
        }

        const correctOpt = {
          title: correct.title,
          artist: correct.artist,
          artworkUrl: correct.artworkUrl || getFallbackArtwork(correct.title, correct.artist),
        };

        const options = fisherYatesShuffle([correctOpt, ...distractors]);
        const correctIndex = options.findIndex(
          (o) => normalizeSongTitle(o.title) === normalizeSongTitle(correctOpt.title)
        );

        generated.push({
          correctTrack: correct,
          options,
          correctIndex: correctIndex >= 0 ? correctIndex : 0,
        });
      }

      setQuestions(generated);
      currentIdxRef.current = 0;
      timeLeftRef.current = ROUND_DURATION_SEC;
      gameStateRef.current = "playing";
      setGameState("playing");
      setTimeLeft(ROUND_DURATION_SEC);
      isHandlingAnswerRef.current = false;

      if (generated[0]?.correctTrack?.previewUrl) {
        audioPlayer.playTrack(generated[0].correctTrack.previewUrl);
        if (generated[1]?.correctTrack?.previewUrl) {
          audioPlayer.preloadNext(generated[1].correctTrack.previewUrl);
        }
      }
    } catch (err) {
      console.error("Error starting ranked run:", err);
      gameStateRef.current = "idle";
      setGameState("idle");
    }
  };

  // Submit run helper with retry support
  const submitRankedRun = async (payload: {
    categoryId: string;
    categoryName?: string;
    artistName?: string;
    score: number;
    roundScores?: number[];
    correctCount: number;
    guestUserId: string;
    guestNickname: string;
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);
    pendingSubmitRef.current = payload;
    const finalScore = payload.score;

    try {
      const res = await fetch("/api/ranked/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al conectar con el servidor.");
      }

      // Immediately reflect the completed run in local catalog state while fetching authoritative server data
      categoriesReqIdRef.current += 1;
      minValidCategoriesReqIdRef.current = categoriesReqIdRef.current;
      setLoadingCategories(false);
      setCategories((prev) => {
        const targetArtistSlug = payload.artistName ? toArtistSlug(payload.artistName) : null;
        let updated = false;
        const nextList = prev.map((c) => {
          const matchesArtist =
            targetArtistSlug &&
            c.kind === "artist" &&
            toArtistSlug(c.query || c.name) === targetArtistSlug;
          if (c.id === payload.categoryId || matchesArtist) {
            updated = true;
            return { ...c, playerCount: (c.playerCount || 0) + 1 };
          }
          return c;
        });

        if (!updated && payload.artistName) {
          const displayName =
            activeCategory?.name || getCanonicalArtistName(payload.artistName) || payload.artistName;
          nextList.push({
            id: payload.categoryId || `artist_${(targetArtistSlug || "custom").replace(/-/g, "_")}`,
            name: displayName,
            kind: "artist",
            description:
              activeCategory?.description ||
              `Catálogo verificado · Pon a prueba tu oído con todas las eras de ${displayName}`,
            imageUrl:
              activeCategory?.imageUrl ||
              `/api/artists/photo?name=${encodeURIComponent(displayName)}`,
            query: displayName,
            playerCount: 1,
          });
        }

        const artists = nextList
          .filter((c) => c.kind === "artist" && (c.playerCount || 0) > 0)
          .sort((a, b) => (b.playerCount || 0) - (a.playerCount || 0));
        const themes = nextList
          .filter((c) => c.kind === "theme")
          .sort((a, b) => (b.playerCount || 0) - (a.playerCount || 0));

        return [...artists, ...themes];
      });

      const authoritativeScore = data.submittedScore ?? finalScore;
      const finalRank = (payload.artistName ? data.artistResult?.userRank : data.rank) || data.rank || 1;
      const bestScore = (payload.artistName ? data.artistResult?.bestScore : data.score) ?? authoritativeScore;
      const totalPoints =
        (payload.artistName ? data.artistResult?.totalPoints : data.totalScore) ?? authoritativeScore;
      const tier = (payload.artistName ? data.artistResult?.tier : data.tier) || calculateTier(totalPoints);
      setSummaryData({
        finalScore: authoritativeScore,
        tier,
        rank: finalRank,
        bestScore,
        totalPoints,
        isPersonalBest: data.isPersonalBest ?? true,
      });
      pendingSubmitRef.current = null;
      await loadInitialData();

      if (payload.artistName) {
        fetch(
          `/api/ranked/artist?name=${encodeURIComponent(payload.artistName)}&userId=${payload.guestUserId}&_t=${Date.now()}`,
          { cache: "no-store" }
        )
          .then((r) => r.json())
          .then((sheetData) => {
            if (sheetData.success) {
              setArtistSheetData(sheetData);
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      console.error("[submitRankedRun] Error submitting ranked run:", err);
      setSubmitError(err?.message || "No se pudo guardar la puntuación. Comprueba tu conexión.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetrySubmit = () => {
    if (pendingSubmitRef.current) {
      submitRankedRun(pendingSubmitRef.current);
    }
  };

  // Handle Answer in Ranked Run (Max 100 pts per question)
  const handleAnswer = useCallback(
    async (idx: number) => {
      const qIdx = currentIdxRef.current;
      const currentQ = questions[qIdx];
      if (gameStateRef.current !== "playing" || !currentQ || !activeCategory) return;
      if (isHandlingAnswerRef.current || answersByRoundRef.current.has(qIdx)) return;

      isHandlingAnswerRef.current = true;
      gameStateRef.current = "reveal";
      if (timerRef.current) clearInterval(timerRef.current);
      setGameState("reveal");
      setAnsweredIdx(idx);

      const chosenOption = idx >= 0 ? currentQ.options[idx] : null;
      const isCorrect = chosenOption
        ? normalizeSongTitle(chosenOption.title) === normalizeSongTitle(currentQ.correctTrack.title)
        : idx === currentQ.correctIndex;

      // Exponential formula points (max 100 per question, max 1000 in 10 questions)
      const currentSec = timeLeftRef.current;
      const elapsedSec = Math.max(0, ROUND_DURATION_SEC - currentSec);
      const roundPoints = calculateRoundPoints(isCorrect, elapsedSec);

      if (isCorrect) {
        setStreak((prev) => prev + 1);
        playCorrectSound();
      } else {
        setStreak(0);
        playWrongSound();
      }

      // Record in answers map indexed by question index
      const chosenTitle = idx >= 0 && currentQ.options[idx] ? currentQ.options[idx].title : "Tiempo agotado";
      answersByRoundRef.current.set(qIdx, {
        track: currentQ.correctTrack,
        isCorrect,
        points: roundPoints,
        chosenTitle,
      });

      const orderedHistory = Array.from(answersByRoundRef.current.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, item]) => item);
      const exactScore = Math.min(1000, orderedHistory.reduce((acc, item) => acc + item.points, 0));
      scoreRef.current = exactScore;
      setAnswersHistory(orderedHistory);
      setScore(exactScore);

      // Floating arcade score animation
      if (scorePopupTimerRef.current) clearTimeout(scorePopupTimerRef.current);
      setScorePopup({
        points: roundPoints,
        isCorrect,
        optionIndex: idx,
        key: Date.now(),
      });
      scorePopupTimerRef.current = setTimeout(() => {
        setScorePopup(null);
      }, 1800);

      // Preload next audio while revealing
      if (qIdx + 1 < questions.length) {
        audioPlayer.preloadNext(questions[qIdx + 1]?.correctTrack?.previewUrl);
      }

      // Advance after 2.5 seconds for snappy game pace
      advanceTimerRef.current = setTimeout(async () => {
        setScorePopup(null);
        if (qIdx + 1 < questions.length) {
          const nextIdx = qIdx + 1;
          currentIdxRef.current = nextIdx;
          timeLeftRef.current = ROUND_DURATION_SEC;
          gameStateRef.current = "playing";
          setCurrentIdx(nextIdx);
          setAnsweredIdx(null);
          setTimeLeft(ROUND_DURATION_SEC);
          setGameState("playing");
          isHandlingAnswerRef.current = false;

          const nextTrack = questions[nextIdx].correctTrack;
          if (nextTrack?.previewUrl) {
            audioPlayer.playTrack(nextTrack.previewUrl);
          }
          if (nextIdx + 1 < questions.length) {
            audioPlayer.preloadNext(questions[nextIdx + 1]?.correctTrack?.previewUrl);
          }
        } else {
          // Finished Questions Ranked Run!
          audioPlayer.stop();
          gameStateRef.current = "summary";
          setGameState("summary");
          isHandlingAnswerRef.current = false;

          const finalHistory = Array.from(answersByRoundRef.current.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, item]) => item);
          const finalScore = Math.min(
            1000,
            finalHistory.reduce((acc, item) => acc + (Number(item.points) || 0), 0)
          );
          const roundScores = finalHistory.map((item) => item.points);
          scoreRef.current = finalScore;
          setScore(finalScore);

          const guestId = user?.id || (typeof window !== "undefined" ? localStorage.getItem("scuinklezam_ranked_uid") : "") || `guest_${Date.now()}`;
          if (typeof window !== "undefined") {
            localStorage.setItem("scuinklezam_ranked_uid", guestId);
          }

          submitRankedRun({
            categoryId: activeCategory.id,
            categoryName: activeCategory.name,
            artistName: activeCategory.kind === "artist" ? (activeCategory.query || activeCategory.name) : undefined,
            score: finalScore,
            roundScores,
            correctCount: finalHistory.filter((a) => a.isCorrect).length,
            guestUserId: guestId,
            guestNickname: user?.nickname || (typeof window !== "undefined" ? localStorage.getItem("scuinklezam_player_name") : "") || "Jugador Ranked",
          });
        }
      }, 2500);
    },
    [questions, activeCategory, user]
  );

  // 15s Timer decoupled from answer handler
  useEffect(() => {
    if (gameState !== "playing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, currentIdx]);

  // Timeout trigger when timeLeft reaches 0
  useEffect(() => {
    if (gameState === "playing" && timeLeft === 0 && !isHandlingAnswerRef.current) {
      handleAnswer(-1);
    }
  }, [gameState, timeLeft, handleAnswer]);

  // Keyboard shortcuts [1, 2, 3, 4] for answering during gameState === "playing"
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (gameState !== "playing") return;

      if (e.key === "1") {
        e.preventDefault();
        handleAnswer(0);
      } else if (e.key === "2") {
        e.preventDefault();
        handleAnswer(1);
      } else if (e.key === "3") {
        e.preventDefault();
        handleAnswer(2);
      } else if (e.key === "4") {
        e.preventDefault();
        handleAnswer(3);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, handleAnswer]);

  return (
    <div className="min-h-screen bg-[#060D09] text-white flex flex-col font-sans selection:bg-goblinPrimary selection:text-black w-full max-w-full overflow-x-hidden">
      {/* 1. TOP NAVBAR (SIEMPRE ARRIBA DEL TODO TOP-0) */}
      <Navbar
        activeRoute="ranked"
        onOpenMiniQuiz={() => setMiniQuizOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-8 max-w-full overflow-x-hidden">
        {/* ========================================================
            MODO JUEGO ACTIVO (RUNNER RANKED 10 PREGUNTAS)
           ======================================================== */}
        {gameState !== "idle" ? (
          <div className="w-full space-y-6">
            {/* Header con botón salir */}
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15 w-full max-w-xl mx-auto">
              <button
                onClick={() => {
                  audioPlayer.stop();
                  if (timerRef.current) clearInterval(timerRef.current);
                  if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
                  if (scorePopupTimerRef.current) clearTimeout(scorePopupTimerRef.current);
                  answersByRoundRef.current = new Map();
                  currentIdxRef.current = 0;
                  timeLeftRef.current = ROUND_DURATION_SEC;
                  scoreRef.current = 0;
                  isHandlingAnswerRef.current = false;
                  gameStateRef.current = "idle";
                  setGameState("idle");
                  setActiveCategory(null);
                  loadInitialData();
                }}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Salir de la partida</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400">{activeCategory?.name}</span>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/30 text-goblinLime">
                  Ranked
                </span>
              </div>
            </div>

            {/* LOADING STATE */}
            {gameState === "loading" && (
              <div className="py-24 text-center space-y-4 w-full max-w-xl mx-auto">
                <div className="w-12 h-12 border-4 border-goblinLime border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="font-display font-bold text-lg text-white">
                  Cargando quiz...
                </div>
                <div className="text-xs text-zinc-400">
                  Verificando audios de 30 segundos y carátulas originales
                </div>
              </div>
            )}

            {/* PLAYING & REVEAL STATE */}
            {(gameState === "playing" || gameState === "reveal") && questions[currentIdx] && (
              <div className="w-full max-w-xl mx-auto space-y-4 animate-fade-in">
                {/* 20s Fluid Animated Progress Bar */}
                <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden border border-emerald-500/20 shadow-inner">
                  <div
                    className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                      timeLeft <= 5
                        ? "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.9)] animate-pulse"
                        : "bg-gradient-to-r from-goblinPrimary to-goblinLime shadow-[0_0_12px_rgba(34,197,94,0.6)]"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, (timeLeft / ROUND_DURATION_SEC) * 100))}%` }}
                  />
                </div>

                {/* Status Bar: Clean 2-Row / Flex-Wrap Header on Mobile */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-2">
                  {/* Fila 1 Izquierda: Canción X/10 + Nombre categoría */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-white shrink-0">
                      Canción {currentIdx + 1}/{questions.length || 10}
                    </span>
                    {activeCategory?.name && (
                      <span className="text-xs text-zinc-400 truncate max-w-[42vw] sm:max-w-[200px]" title={activeCategory.name}>
                        · {activeCategory.name}
                      </span>
                    )}
                    {streak > 1 && (
                      <div className="text-[11px] font-extrabold text-amber-400 flex items-center gap-0.5 animate-pulse shrink-0">
                        <Flame className="w-3 h-3 fill-current" />
                        <span>x{streak}</span>
                      </div>
                    )}
                  </div>

                  {/* Fila 1 Derecha: Puntos totales + Reloj circular */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-500/40 text-goblinLime font-mono font-black text-xs sm:text-sm shrink-0">
                        {score} pts
                      </span>
                    </div>

                    <div
                      className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border flex items-center gap-1 shrink-0 ${
                        timeLeft <= 5
                          ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                          : "bg-black/50 text-emerald-300 border-emerald-500/30"
                      }`}
                    >
                      <Timer className="w-3 h-3" />
                      <span>{timeLeft}s</span>
                    </div>
                  </div>

                  {/* Fila 2: Feedback flotante cuando se responde */}
                  {scorePopup && (
                    <div className="w-full flex justify-center py-0.5 animate-fade-in">
                      <div
                        key={`score_pop_${scorePopup.key}`}
                        className={`px-3 py-1 rounded-full font-mono font-black text-xs tracking-wider flex items-center gap-1.5 shadow-lg select-none ${
                          scorePopup.isCorrect
                            ? "text-emerald-300 bg-emerald-950/90 border border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                            : "text-rose-300 bg-rose-950/90 border border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.5)] animate-wrong-shake"
                        }`}
                      >
                        <span>{scorePopup.isCorrect ? `+${scorePopup.points} pts · ¡Correcto!` : "0 pts · Incorrecto"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audio Playing Capsule */}
                <div className="p-3.5 rounded-2xl bg-[#0B1710] border border-emerald-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => audioPlayer.playTrack(questions[currentIdx].correctTrack.previewUrl)}
                      className="w-10 h-10 rounded-full bg-goblinPrimary flex items-center justify-center text-black font-bold shadow-md hover:scale-105 active:scale-95 transition cursor-pointer"
                      title="Volver a escuchar"
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-white">¿Qué canción está sonando?</div>
                      <div className="text-[10px] sm:text-xs text-zinc-400">Escucha con atención y pulsa una opción</div>
                    </div>
                  </div>

                  <div className="flex items-end gap-1 h-4">
                    <span className="w-1 bg-goblinLime rounded-full eq-bar-1" />
                    <span className="w-1 bg-goblinPrimary rounded-full eq-bar-2" />
                    <span className="w-1 bg-emerald-400 rounded-full eq-bar-3" />
                  </div>
                </div>

                {/* 4 Interactive Options */}
                <div className="space-y-2.5">
                  {questions[currentIdx].options.map((opt, idx) => {
                    const isCorrect = idx === questions[currentIdx].correctIndex;
                    const isSelected = idx === answeredIdx;

                    let btnClass =
                      "w-full flex items-center justify-between min-h-[56px] px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-emerald-950/60 border border-emerald-500/20 hover:border-goblinLime text-white transition text-left cursor-pointer relative overflow-visible text-base font-semibold";

                    if (gameState === "reveal") {
                      if (isCorrect) {
                        btnClass =
                          "w-full flex items-center justify-between min-h-[56px] px-4 py-3 rounded-2xl bg-[#22C55E]/20 border-2 border-[#22C55E] text-white shadow-lg shadow-emerald-500/20 relative overflow-visible scale-[1.02] text-base font-semibold";
                      } else if (isSelected) {
                        btnClass =
                          "w-full flex items-center justify-between min-h-[56px] px-4 py-3 rounded-2xl bg-[#EF4444]/20 border-2 border-[#EF4444] text-white animate-wrong-shake relative overflow-visible text-base font-semibold";
                      } else {
                        btnClass =
                          "w-full flex items-center justify-between min-h-[56px] px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/5 opacity-50 text-zinc-400 text-base font-semibold";
                      }
                    }

                    return (
                      <button
                        key={`${currentIdx}_${idx}`}
                        disabled={gameState === "reveal"}
                        onClick={() => handleAnswer(idx)}
                        className={btnClass}
                      >
                        {/* Floating arcade animation */}
                        {scorePopup && scorePopup.optionIndex === idx && (
                          <div
                            key={`opt_pop_${scorePopup.key}`}
                            className={`absolute -top-4 left-1/2 -translate-x-1/2 pointer-events-none z-30 px-3.5 py-1 rounded-full font-mono font-black text-xs sm:text-sm tracking-wider flex items-center gap-1.5 whitespace-nowrap animate-score-float select-none ${
                              scorePopup.isCorrect
                                ? "text-emerald-300 bg-emerald-500/20 border-2 border-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.65)] backdrop-blur-md"
                                : "text-rose-300 bg-rose-500/20 border-2 border-rose-500/80 shadow-[0_0_30px_rgba(244,63,94,0.65)] backdrop-blur-md animate-wrong-shake"
                            }`}
                          >
                            {scorePopup.isCorrect ? `+${scorePopup.points} pts` : "0 pts"}
                          </div>
                        )}

                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-md bg-white/10 text-zinc-300 text-[10px] font-mono font-bold items-center justify-center shrink-0 hidden sm:flex">
                            {idx + 1}
                          </span>
                          <img
                            src={opt.artworkUrl}
                            alt={opt.title}
                            className="w-11 h-11 rounded-xl object-cover border border-emerald-500/20 shrink-0 bg-emerald-950"
                          />
                          <div className="truncate">
                            <div className="font-bold text-xs sm:text-sm text-white truncate">{opt.title}</div>
                            <div className="text-[11px] text-zinc-400 truncate">{opt.artist}</div>
                          </div>
                        </div>

                        {gameState === "reveal" && (
                          <div className="shrink-0 ml-2">
                            {isCorrect ? (
                              <Check className="w-5 h-5 text-emerald-400" />
                            ) : isSelected ? (
                              <X className="w-5 h-5 text-rose-400" />
                            ) : null}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ========================================================
                PANTALLA DE RESULTADOS OFICIAL (2 COLUMNAS)
               ======================================================== */}
            {/* Loading / Saving spinner when summary is computing */}
            {gameState === "summary" && !summaryData && !submitError && (
              <div className="max-w-md mx-auto py-24 text-center space-y-4 animate-fadeIn">
                <div className="w-12 h-12 border-4 border-goblinLime border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-white font-extrabold text-base">Guardando tu récord...</div>
                <div className="text-xs text-zinc-400">Sincronizando puntuación con el ranking oficial</div>
              </div>
            )}

            {/* Error box with retry button */}
            {gameState === "summary" && !summaryData && submitError && (
              <div className="max-w-md mx-auto p-6 rounded-3xl bg-rose-950/80 border border-rose-500/40 text-center space-y-4 shadow-2xl animate-scaleUp">
                <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
                <h3 className="font-display font-black text-white text-lg">Error al registrar tu récord</h3>
                <p className="text-xs text-rose-200">{submitError}</p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => handleRetrySubmit()}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow hover:opacity-95 transition cursor-pointer"
                  >
                    {isSubmitting ? "Reintentando..." : "Reintentar guardar"}
                  </button>
                  <button
                    onClick={() => {
                      gameStateRef.current = "idle";
                      setGameState("idle");
                      setActiveCategory(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-black/60 text-zinc-400 hover:text-white font-bold text-xs border border-white/10 transition cursor-pointer"
                  >
                    Volver al menú
                  </button>
                </div>
              </div>
            )}

            {gameState === "summary" && summaryData && (
              <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 animate-fade-in">
                {/* Columna Izquierda: Tarjeta Grande Vertical + Botones */}
                <div className="md:col-span-5 space-y-4 flex flex-col">
                  {/* Tarjeta Visual de Artista/Temática con puntuación abajo a la izquierda */}
                  <div className="relative rounded-3xl overflow-hidden border border-emerald-500/30 shadow-2xl h-80 sm:h-96 flex flex-col justify-end p-6 bg-cover bg-center group"
                    style={{
                      backgroundImage: `url(${activeCategory?.imageUrl})`,
                    }}
                  >
                    {/* Dark gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                    <div className="relative z-10 space-y-2">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md bg-black/60 border-white/20">
                        <span>{summaryData.tier.icon}</span>
                        <span className={summaryData.tier.badgeColor}>{summaryData.tier.name}</span>
                        <span className="text-zinc-400">·</span>
                        <span className="text-zinc-300">#{summaryData.rank} ranking</span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="font-display font-black text-4xl sm:text-6xl text-white tracking-tight leading-none px-1 py-1">
                          +{summaryData.finalScore} <span className="text-xl sm:text-2xl text-zinc-400 font-normal">/ 1000</span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-emerald-300 flex items-center gap-1.5 flex-wrap">
                          <span>Total acumulado: {(summaryData.totalPoints ?? summaryData.finalScore).toLocaleString()} pts</span>
                          <span className="text-zinc-400">·</span>
                          <span className={summaryData.tier.badgeColor}>Rango {summaryData.tier.name}</span>
                        </div>
                        {summaryData.isPersonalBest ? (
                          <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                            ✨ ¡Nuevo récord personal en una partida!
                          </div>
                        ) : summaryData.bestScore && summaryData.bestScore > summaryData.finalScore ? (
                          <div className="text-[11px] font-medium text-zinc-400">
                            Tu mejor partida en este quiz se mantiene en{" "}
                            <span className="font-bold text-emerald-400">{summaryData.bestScore} / 1000</span>
                          </div>
                        ) : null}
                        <h2 className="font-display font-extrabold text-base sm:text-xl text-zinc-100 truncate pt-0.5">
                          {activeCategory?.name}
                        </h2>
                      </div>
                    </div>
                  </div>

                  {/* Botones de Acción */}
                  <div className="space-y-2.5">
                    <button
                      onClick={() => handleStartRankedRun(activeCategory!)}
                      className="w-full h-12 rounded-2xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Volver a jugar</span>
                    </button>

                    {activeCategory?.kind === "artist" ? (
                      <button
                        onClick={() => {
                          audioPlayer.stop();
                          gameStateRef.current = "idle";
                          setGameState("idle");
                          handleOpenArtistSheet(activeCategory.name);
                          loadInitialData();
                        }}
                        className="w-full py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-goblinLime font-bold text-xs border border-emerald-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Volver a la ficha de {activeCategory.name}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenLeaderboard(activeCategory!)}
                        className="w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs border border-emerald-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span>Ver Ranking de {activeCategory?.name}</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        audioPlayer.stop();
                        gameStateRef.current = "idle";
                        setGameState("idle");
                        setActiveCategory(null);
                        setSelectedArtistName(null);
                        setArtistSheetData(null);
                        loadInitialData();
                      }}
                      className="w-full py-2 text-xs text-zinc-400 hover:text-white transition cursor-pointer text-center"
                    >
                      ← Elegir otro quiz o artista
                    </button>
                  </div>
                </div>

                {/* Columna Derecha: Lista de las 10 Canciones (CANCIONES) */}
                <div className="md:col-span-7 space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                      Canciones de la partida ({answersHistory.length})
                    </span>
                    <span className="text-xs text-zinc-400">
                      {answersHistory.filter((a) => a.isCorrect).length} de {answersHistory.length} acertadas
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {answersHistory.map((item, idx) => {
                      const isCurrentPlaying = playingPreviewUrl === item.track.previewUrl;

                      return (
                        <div
                          key={idx}
                          className="glass-card rounded-2xl border border-emerald-500/15 overflow-hidden flex items-center justify-between gap-3 p-3 hover:border-emerald-500/30 transition group"
                        >
                          {/* Barra vertical fina a la izquierda */}
                          <div
                            className={`w-1.5 self-stretch -my-3 -ml-3 rounded-l-2xl shrink-0 ${
                              item.isCorrect ? "bg-emerald-400" : "bg-rose-500"
                            }`}
                          />

                          {/* Miniatura cuadrada + Título + Artista */}
                          <div className="flex items-center gap-3 min-w-0 flex-1 pl-1">
                            <img
                              src={item.track.artworkUrl}
                              alt={item.track.title}
                              className="w-11 h-11 rounded-xl object-cover shrink-0 border border-emerald-500/30 bg-emerald-950"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-xs sm:text-sm text-white truncate group-hover:text-goblinLime transition">
                                {item.track.title}
                              </div>
                              <div className="text-[11px] text-zinc-400 truncate">
                                {item.track.artist}
                              </div>
                            </div>
                          </div>

                          {/* Points & Play/Pause Button */}
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                                item.isCorrect
                                  ? "text-emerald-300 bg-emerald-950/80 border border-emerald-500/40"
                                  : "text-rose-400 bg-rose-950/80 border border-rose-500/40"
                              }`}
                            >
                              {item.isCorrect ? `+${item.points} pts` : "0 pts"}
                            </span>

                            {item.track.previewUrl ? (
                              <button
                                onClick={() => {
                                  if (isCurrentPlaying) {
                                    audioPlayer.stop();
                                    setPlayingPreviewUrl(null);
                                  } else {
                                    audioPlayer.playTrack(item.track.previewUrl);
                                    setPlayingPreviewUrl(item.track.previewUrl);
                                  }
                                }}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer ${
                                  isCurrentPlaying
                                    ? "bg-goblinLime text-black"
                                    : "bg-white/[0.08] hover:bg-white/[0.16] text-white"
                                }`}
                                title={isCurrentPlaying ? "Pausar" : "Escuchar fragmento de 30s"}
                              >
                                {isCurrentPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : selectedArtistName ? (
          /* ========================================================
              FICHA DE ARTISTA OFICIAL (CON RANKING & 12 ARTISTAS)
             ======================================================== */
          loadingArtistSheet && !artistSheetData ? (
            <div className="space-y-8 animate-pulse max-w-4xl mx-auto w-full">
              <div className="rounded-3xl bg-[#0B1710] border border-emerald-500/20 p-6 sm:p-10 flex flex-col md:flex-row items-center gap-6">
                <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-full bg-emerald-950/60 border border-emerald-500/20 shrink-0" />
                <div className="flex-1 space-y-4 w-full">
                  <div className="w-28 h-5 rounded-full bg-emerald-950" />
                  <div className="w-56 h-8 rounded-xl bg-emerald-950" />
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    <div className="h-16 rounded-2xl bg-black/40 border border-white/5" />
                    <div className="h-16 rounded-2xl bg-black/40 border border-white/5" />
                    <div className="h-16 rounded-2xl bg-black/40 border border-white/5" />
                    <div className="h-16 rounded-2xl bg-black/40 border border-white/5" />
                  </div>
                  <div className="w-36 h-12 rounded-full bg-emerald-950 mt-2" />
                </div>
              </div>
              <div className="rounded-3xl bg-[#0B1710] border border-emerald-500/20 p-6 space-y-4">
                <div className="w-36 h-6 rounded-lg bg-emerald-950" />
                <div className="flex items-end justify-center gap-4 pt-10 pb-4">
                  <div className="w-24 h-24 rounded-t-2xl bg-slate-900/60" />
                  <div className="w-28 h-32 rounded-t-2xl bg-amber-950/60" />
                  <div className="w-24 h-20 rounded-t-2xl bg-amber-950/40" />
                </div>
              </div>
            </div>
          ) : artistSheetError ? (
            <div className="py-24 text-center space-y-4 max-w-md mx-auto animate-fade-in p-6 rounded-3xl bg-black/60 border border-rose-500/30">
              <div className="w-12 h-12 rounded-full bg-rose-950 border border-rose-500/50 flex items-center justify-center text-rose-400 mx-auto">
                <X className="w-6 h-6" />
              </div>
              <div className="font-display font-bold text-lg text-white">
                No pudimos cargar a {selectedArtistName}
              </div>
              <p className="text-xs text-zinc-400">
                {artistSheetError}
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenArtistSheet(selectedArtistName!)}
                  className="px-4 py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs hover:opacity-95 transition cursor-pointer"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtistName(null);
                    setArtistSheetError(null);
                    loadInitialData();
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                >
                  Volver al catálogo
                </button>
              </div>
            </div>
          ) : artistSheetData ? (
            <div className="space-y-8 animate-fade-in">
              {/* A. CABECERA FICHA ARTISTA OFICIAL (ESMERALDA Y OSCURO SCUINKLEZAM) */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-emerald-950/40 via-[#0B1710] to-[#060D09] border border-emerald-500/25 p-4 sm:p-10 backdrop-blur-xl shadow-2xl w-full max-w-full">
                {/* Ambient Blurred Background Glow */}
                <div
                  className="absolute inset-0 bg-cover bg-center blur-3xl opacity-25 scale-125 pointer-events-none"
                  style={{ backgroundImage: `url(${artistSheetData.photoUrl})` }}
                />
                {/* Subtle background glow */}
                <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 left-1/4 w-96 h-96 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Back Button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtistName(null);
                    setArtistSheetData(null);
                    loadInitialData();
                  }}
                  className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition mb-6 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 w-fit cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver al catálogo</span>
                </button>

                <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 relative z-10 w-full">
                  {/* Large Circular Artist Photo */}
                  <div className="relative group shrink-0 mx-auto md:mx-0">
                    <img
                      src={artistSheetData.photoUrl}
                      alt={artistSheetData.artistName}
                      className="w-32 h-32 sm:w-44 sm:h-44 rounded-full border-2 border-emerald-400/40 shadow-2xl object-cover ring-4 ring-emerald-500/20 bg-emerald-950"
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-400/40 text-[10px] font-black uppercase text-goblinLime tracking-wider whitespace-nowrap shadow-md">
                      Verificado
                    </div>
                  </div>

                  {/* Info & Stats */}
                  <div className="flex-1 text-center md:text-left space-y-4 min-w-0 w-full">
                    <div>
                      <span className="text-[10px] uppercase font-black px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-400/30 text-goblinLime tracking-wider">
                        ARTISTA RANKED
                      </span>
                      <h1 className="font-display font-black text-2xl sm:text-5xl text-white tracking-tight mt-2 truncate">
                        {artistSheetData.artistName}
                      </h1>
                      {artistSheetData.description && (
                        <p className="text-xs sm:text-sm text-zinc-300/90 mt-1 max-w-xl mx-auto md:mx-0">
                          {artistSheetData.description}
                        </p>
                      )}
                    </div>

                    {/* 4 Stats in a compact 4-column row */}
                    {(() => {
                      const userArtistTier =
                        artistSheetData.userStats.tier || calculateTier(artistSheetData.userStats.totalPoints);
                      return (
                        <div className="grid grid-cols-4 gap-1.5 sm:gap-3 w-full max-w-2xl">
                          <div className="p-1.5 sm:p-3 rounded-2xl bg-zinc-900/80 border border-emerald-500/20 text-center min-w-0">
                            <span className="text-[8px] sm:text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5 truncate">
                              PUESTO
                            </span>
                            <div className="text-[11px] sm:text-xl font-black text-white truncate">
                              {artistSheetData.userStats.userRank ? `#${artistSheetData.userStats.userRank}` : "-"}
                              <span className="text-[9px] sm:text-xs text-zinc-400 font-normal"> / {artistSheetData.userStats.totalPlayers}</span>
                            </div>
                          </div>

                          <div className="p-1.5 sm:p-3 rounded-2xl bg-zinc-900/80 border border-emerald-500/20 text-center min-w-0">
                            <span className="text-[8px] sm:text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5 truncate">
                              PUNTOS
                            </span>
                            <div className="text-[11px] sm:text-xl font-black text-goblinLime truncate">
                              {artistSheetData.userStats.totalPoints.toLocaleString()} <span className="text-[9px] sm:text-xs text-zinc-400 font-normal">pts</span>
                            </div>
                            <div className={`text-[9px] sm:text-[10px] font-bold truncate ${userArtistTier.badgeColor}`}>
                              {userArtistTier.icon} {userArtistTier.name}
                            </div>
                          </div>

                          <div className="p-1.5 sm:p-3 rounded-2xl bg-zinc-900/80 border border-emerald-500/20 text-center min-w-0">
                            <span className="text-[8px] sm:text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5 truncate">
                              PARTIDAS
                            </span>
                            <div className="text-[11px] sm:text-xl font-black text-emerald-400 truncate">
                              {artistSheetData.userStats.quizzesPlayed}
                            </div>
                          </div>

                          <div className="p-1.5 sm:p-3 rounded-2xl bg-zinc-900/80 border border-emerald-500/20 text-center min-w-0">
                            <span className="text-[8px] sm:text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5 truncate">
                              MEJOR
                            </span>
                            <div className="text-[11px] sm:text-xl font-black text-emerald-400 truncate">
                              {artistSheetData.userStats.bestScore} <span className="text-[9px] sm:text-xs text-zinc-400 font-normal">/ 1k</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Action Button: Jugar */}
                    <div className="pt-2 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          const canonical = (categories.length > 0 ? categories : RANKED_CATEGORIES).find(
                            (c) => c.kind === "artist" && toArtistSlug(c.query || c.name) === artistSheetData.slug
                          );
                          const chosenId = canonical ? canonical.id : `artist_${artistSheetData.slug.replace(/-/g, "_")}`;
                          handleStartRankedRun({
                            id: chosenId,
                            name: canonical ? canonical.name : artistSheetData.artistName,
                            kind: "artist",
                            description: artistSheetData.description || (canonical ? canonical.description : `Quiz de ${artistSheetData.artistName}`),
                            imageUrl: artistSheetData.photoUrl || (canonical ? canonical.imageUrl : ""),
                            query: canonical ? canonical.query : artistSheetData.artistName,
                            playerCount: canonical ? canonical.playerCount : artistSheetData.userStats.totalPlayers,
                          });
                        }}
                        className="w-full h-12 md:w-auto px-8 rounded-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-lime-400 hover:opacity-95 text-black font-black text-base shadow-lg shadow-emerald-900/40 transition hover:scale-105 active:scale-95 flex items-center justify-center gap-2.5 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Jugar</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* B. RANKING Y ARTISTAS SIMILARES */}
              <div
                className={
                  artistSheetData.relatedArtists && artistSheetData.relatedArtists.length > 0
                    ? "grid grid-cols-1 lg:grid-cols-12 gap-8"
                    : "max-w-3xl mx-auto w-full"
                }
              >
                {/* Columna Izquierda (o centrada): Ranking con Podium Top 3 */}
                <div
                  className={`bg-[#0B1710] border border-emerald-500/20 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl backdrop-blur-md flex flex-col justify-between ${
                    artistSheetData.relatedArtists && artistSheetData.relatedArtists.length > 0
                      ? "lg:col-span-7"
                      : "w-full"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div className="flex items-center gap-2.5">
                        <Trophy className="w-5 h-5 text-amber-400" />
                        <h3 className="font-display font-black text-xl text-white">Ranking</h3>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {artistSheetData.leaderboard.length} clasificados
                      </span>
                    </div>

                    {/* Podium Visual Top 3 */}
                    {(() => {
                      const top1 = artistSheetData.leaderboard.find((e) => e.rank === 1);
                      const top2 = artistSheetData.leaderboard.find((e) => e.rank === 2);
                      const top3 = artistSheetData.leaderboard.find((e) => e.rank === 3);

                      return (
                        <div className="flex items-end justify-center gap-1.5 sm:gap-4 pt-10 pb-4 px-1 sm:px-2 w-full max-w-full overflow-hidden">
                          {/* #2 Plata (Izquierda) */}
                          <div className="flex flex-col items-center flex-1 min-w-0 max-w-[100px] sm:max-w-[120px]">
                            <div className="relative mb-2">
                              <img
                                src={top2?.avatarUrl || "https://api.dicebear.com/7.x/identicon/svg?seed=p2&backgroundColor=0B1710"}
                                alt={top2?.nickname || "Plata"}
                                className="w-10 h-10 sm:w-14 sm:h-14 rounded-full border-2 border-zinc-300 object-cover shadow-lg bg-zinc-800"
                              />
                              <span className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-zinc-400 text-black font-black text-[9px] sm:text-[10px] flex items-center justify-center shadow">
                                2
                              </span>
                            </div>
                            <div className="w-full text-center mb-2 px-0.5">
                              <div className="text-[11px] sm:text-xs font-bold text-white truncate">{top2?.nickname || "Vacante"}</div>
                              <div className="text-[9px] sm:text-[10px] font-mono text-zinc-300 font-bold">
                                {top2 ? `${top2.totalPoints.toLocaleString()} pts` : "-"}
                              </div>
                            </div>
                            <div className="w-full h-20 sm:h-28 bg-gradient-to-t from-slate-900/90 via-slate-700/80 to-slate-400/70 border-t-2 border-slate-300 rounded-t-2xl flex items-center justify-center shadow-[0_0_20px_rgba(148,163,184,0.25)] ring-1 ring-slate-400/30">
                              <span className="text-slate-300 font-black text-xs sm:text-sm tracking-wider">#2</span>
                            </div>
                          </div>

                          {/* #1 Oro (Centro - El más alto) */}
                          <div className="flex flex-col items-center flex-1 min-w-0 max-w-[110px] sm:max-w-[140px]">
                            <div className="relative mb-2">
                              <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 mx-auto -mb-1 animate-bounce" />
                              <img
                                src={top1?.avatarUrl || "https://api.dicebear.com/7.x/identicon/svg?seed=p1&backgroundColor=0B1710"}
                                alt={top1?.nickname || "Oro"}
                                className="w-14 h-14 sm:w-18 sm:h-18 rounded-full border-2 border-amber-300 object-cover shadow-2xl ring-4 ring-amber-400/30 bg-zinc-800"
                              />
                              <span className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-400 text-black font-black text-[10px] sm:text-xs flex items-center justify-center shadow-lg">
                                1
                              </span>
                            </div>
                            <div className="w-full text-center mb-2 px-0.5">
                              <div className="text-xs sm:text-sm font-black text-amber-200 truncate">{top1?.nickname || "Vacante"}</div>
                              <div className="text-[10px] sm:text-xs font-mono text-amber-300 font-extrabold">
                                {top1 ? `${top1.totalPoints.toLocaleString()} pts` : "-"}
                              </div>
                            </div>
                            <div className="w-full h-28 sm:h-36 bg-gradient-to-t from-amber-950/90 via-amber-700/80 to-amber-500/70 border-t-2 border-amber-300 rounded-t-2xl flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.35)] ring-1 ring-amber-400/40">
                              <span className="text-amber-200 font-black text-sm sm:text-base tracking-wider">#1</span>
                            </div>
                          </div>

                          {/* #3 Bronce (Derecha) */}
                          <div className="flex flex-col items-center flex-1 min-w-0 max-w-[100px] sm:max-w-[120px]">
                            <div className="relative mb-2">
                              <img
                                src={top3?.avatarUrl || "https://api.dicebear.com/7.x/identicon/svg?seed=p3&backgroundColor=0B1710"}
                                alt={top3?.nickname || "Bronce"}
                                className="w-10 h-10 sm:w-14 sm:h-14 rounded-full border-2 border-amber-600 object-cover shadow-md bg-zinc-800"
                              />
                              <span className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-600 text-white font-black text-[9px] sm:text-[10px] flex items-center justify-center shadow">
                                3
                              </span>
                            </div>
                            <div className="w-full text-center mb-2 px-0.5">
                              <div className="text-[11px] sm:text-xs font-bold text-white truncate">{top3?.nickname || "Vacante"}</div>
                              <div className="text-[9px] sm:text-[10px] font-mono text-amber-400/80 font-bold">
                                {top3 ? `${top3.totalPoints.toLocaleString()} pts` : "-"}
                              </div>
                            </div>
                            <div className="w-full h-16 sm:h-24 bg-gradient-to-t from-amber-950/90 via-amber-900/70 to-amber-700/60 border-t-2 border-amber-600 rounded-t-2xl flex items-center justify-center shadow-[0_0_20px_rgba(180,83,9,0.25)] ring-1 ring-amber-600/30">
                              <span className="text-amber-500 font-black text-xs sm:text-sm tracking-wider">#3</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Rows #4 and #5 */}
                    <div className="space-y-2 mt-4">
                      {artistSheetData.leaderboard
                        .filter((e) => e.rank === 4 || e.rank === 5)
                        .map((entry) => {
                          const entryTier = entry.tier || calculateTier(entry.totalPoints);
                          return (
                            <div
                              key={entry.userId}
                              className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="font-mono font-bold text-xs text-zinc-400 w-6 shrink-0">#{entry.rank}</span>
                                <img
                                  src={entry.avatarUrl}
                                  alt={entry.nickname}
                                  className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0"
                                />
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-[200px] block">
                                    {entry.nickname}
                                  </span>
                                  <span className={`text-[10px] font-semibold ${entryTier.badgeColor}`}>
                                    {entryTier.icon} {entryTier.name}
                                  </span>
                                </div>
                              </div>
                              <span className="font-mono text-xs text-zinc-200 font-bold shrink-0">
                                {entry.totalPoints.toLocaleString()} pts
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-emerald-500/15">
                    {/* Fila Destacada del Usuario (Yo) */}
                    <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-between shadow-lg shadow-emerald-500/5">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-xs text-goblinLime w-7">
                          {artistSheetData.userStats.userRank ? `#${artistSheetData.userStats.userRank}` : "-"}
                        </span>
                        <img
                          src={user?.avatarUrl || "https://api.dicebear.com/7.x/identicon/svg?seed=me&backgroundColor=0B1710"}
                          alt="Yo"
                          className="w-8 h-8 rounded-full border border-emerald-400 object-cover"
                        />
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>Yo</span>
                            {user?.nickname && <span className="text-zinc-400 font-normal">({user.nickname})</span>}
                          </div>
                          <div className="text-[10px] text-emerald-300">
                            {artistSheetData.userStats.quizzesPlayed > 0
                              ? `${artistSheetData.userStats.quizzesPlayed} ${artistSheetData.userStats.quizzesPlayed === 1 ? "partida" : "partidas"}`
                              : "Aún no has jugado"}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-sm font-black text-goblinLime">
                        {artistSheetData.userStats.totalPoints.toLocaleString()} pts
                      </span>
                    </div>

                    {/* Botón Ver el ranking completo > */}
                    <button
                      type="button"
                      onClick={() => setFullArtistLeaderboardOpen(true)}
                      className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-goblinLime font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border border-emerald-500/20 hover:border-emerald-400/40"
                    >
                      <span>Ver el ranking completo</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Columna Derecha (5 cols): Artistas similares */}
                {artistSheetData.relatedArtists && artistSheetData.relatedArtists.length > 0 && (
                  <div className="lg:col-span-5 bg-[#0B1710] border border-emerald-500/20 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xl backdrop-blur-md">
                    <div className="border-b border-emerald-500/15 pb-4 flex items-center justify-between">
                      <h3 className="font-display font-black text-lg text-white">Artistas similares</h3>
                      <span className="text-[10px] uppercase font-bold text-goblinLime tracking-wider">DEEZER MUSIC</span>
                    </div>

                    {/* Grid 4 cols */}
                    <div className="grid grid-cols-4 gap-2 sm:gap-4 pt-1 w-full max-w-full">
                      {artistSheetData.relatedArtists.map((rel) => (
                        <button
                          key={rel.slug}
                          type="button"
                          onClick={() => handleOpenArtistSheet(rel.name)}
                          className="flex flex-col items-center group text-center cursor-pointer transition focus:outline-none min-w-0"
                          title={`Abrir ficha de ${rel.name}`}
                        >
                          <div className="relative">
                            <img
                              src={rel.imageUrl}
                              alt={rel.name}
                              className="w-14 h-14 sm:w-18 sm:h-18 rounded-full object-cover border-2 border-emerald-500/30 group-hover:border-goblinLime group-hover:scale-105 shadow-md transition duration-300 bg-emerald-950"
                              loading="lazy"
                            />
                          </div>
                          <span className="text-[10px] sm:text-[11px] font-semibold text-zinc-300 group-hover:text-goblinLime transition truncate max-w-[60px] sm:max-w-[80px] mt-1.5 block">
                            {rel.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null
        ) : (
          /* ========================================================
              CATÁLOGO RANKED OFICIAL (ARTISTAS & TEMAS)
             ======================================================== */
          <div className="space-y-8 animate-fade-in">
            {/* Friendly error banner if song pool had < 4 tracks */}
            {rankedError && (
              <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-3 animate-fade-in shadow-xl">
                <div className="flex items-center gap-2">
                  <X className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{rankedError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRankedError(null)}
                  className="px-3 py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-white font-bold transition text-xs cursor-pointer shrink-0"
                >
                  Entendido
                </button>
              </div>
            )}

            {/* Hero Banner with Season 1 Division Ladder */}
            <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-r from-[#0C1D13] via-[#0E2619] to-black border border-emerald-500/25 shadow-2xl relative overflow-hidden flex flex-col gap-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-3 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-300">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Temporada 1 · Modo Ranked Oficial</span>
                  </div>
                  <h1 className="font-display font-black text-3xl sm:text-5xl text-white tracking-tight">
                    Demuestra tu nivel musical
                  </h1>
                  <p className="text-zinc-300 text-sm sm:text-base max-w-xl">
                    Cada partida suma hasta <strong>1.000 pts</strong> a tu puntuación acumulativa para subir de rango desde <strong>Bronce</strong> hasta <strong>Maestro (50.000 pts)</strong>.
                  </p>
                </div>

                {/* User Status Card */}
                <div className="p-4 rounded-2xl bg-black/60 border border-emerald-500/30 shrink-0 w-full md:w-64 space-y-2.5 text-center">
                  {user ? (
                    <>
                      <div className="flex items-center justify-center gap-2.5">
                        <img
                          src={user.avatarUrl}
                          alt={user.nickname}
                          className="w-8 h-8 rounded-full border border-emerald-400 object-cover"
                        />
                        <div className="text-left">
                          <div className="text-xs font-bold text-white truncate max-w-[130px]">{user.nickname}</div>
                          <div className="text-[10px] text-emerald-400">
                            {user.provider === "spotify" ? "Spotify activo" : "Cuenta activa"}
                          </div>
                        </div>
                      </div>
                      <Link
                        href="/perfil"
                        className="block text-xs text-goblinLime hover:underline font-semibold"
                      >
                        Ver mis estadísticas y récords →
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-bold text-zinc-300">¿Jugando como invitado?</div>
                      <div className="text-[10px] text-zinc-400">Guarda tus récords y aparece en el ranking</div>
                      <button
                        onClick={() => setAuthModalOpen(true)}
                        className="w-full py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs hover:opacity-95 transition cursor-pointer"
                      >
                        Iniciar Sesión / Registro
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Division Ladder Tiers Bar */}
              <div className="pt-4 border-t border-emerald-500/15">
                <div className="text-[10px] uppercase font-black text-zinc-400 tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Escalafón de Rangos Oficial</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {RANKED_TIERS.map((tier) => (
                    <div
                      key={tier.name}
                      className={`p-2.5 rounded-2xl border ${tier.badgeBg} flex items-center gap-2.5 transition hover:scale-[1.02] shadow-sm`}
                    >
                      <span className="text-xl shrink-0">{tier.icon}</span>
                      <div className="min-w-0">
                        <div className={`text-xs font-black truncate ${tier.badgeColor}`}>
                          {tier.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {tier.minScore > 0 ? `${tier.minScore / 1000}k+ pts` : "0 - 2.499 pts"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Filter and Tab Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex rounded-2xl bg-black/50 p-1 border border-emerald-500/20 w-full sm:w-auto">
                <button
                  onClick={() => {
                    setActiveTab("artist");
                    setShowLiveDropdown(false);
                  }}
                  className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                    activeTab === "artist"
                      ? "bg-goblinPrimary text-black shadow-md"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Por Artista</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("theme");
                    setShowLiveDropdown(false);
                  }}
                  className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                    activeTab === "theme"
                      ? "bg-goblinPrimary text-black shadow-md"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Flame className="w-4 h-4" />
                  <span>Por Temática</span>
                </button>
              </div>

              {/* Real-time Debounced Search Bar with Dropdown */}
              <div ref={searchContainerRef} className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder={
                    activeTab === "artist"
                      ? "Buscar o escribir cualquier artista..."
                      : "Buscar temática (ej. España, Reggaetón)..."
                  }
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  onFocus={() => {
                    if (activeTab === "artist" && searchFilter.trim().length >= 2) {
                      setShowLiveDropdown(true);
                    }
                  }}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/20 text-white text-xs focus:outline-none focus:border-goblinLime placeholder:text-zinc-400"
                />

                {/* Live Dropdown for Artist Search */}
                {showLiveDropdown && activeTab === "artist" && searchFilter.trim().length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-white/5 max-h-80 overflow-y-auto">
                    {isSearchingLive ? (
                      <div className="p-4 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-goblinLime" />
                        <span>Buscando artistas en directo...</span>
                      </div>
                    ) : liveSearchResults.length > 0 ? (
                      liveSearchResults.map((artist) => (
                        <button
                          key={artist.id}
                          type="button"
                          onClick={() => {
                            setShowLiveDropdown(false);
                            setSearchFilter("");
                            handleOpenArtistSheet(artist.name);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-emerald-950/40 transition flex items-center gap-3 group cursor-pointer"
                        >
                          <img
                            src={artist.imageUrl || `/api/artists/photo?name=${encodeURIComponent(artist.name)}`}
                            alt={artist.name}
                            className="w-10 h-10 rounded-full object-cover border border-white/15 group-hover:border-goblinLime transition shrink-0 bg-emerald-950"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm text-white group-hover:text-goblinLime transition truncate">
                              {artist.name}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              {artist.genres?.length ? artist.genres.join(", ") : "Artista musical"}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-goblinLime group-hover:translate-x-0.5 transition shrink-0" />
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-zinc-400">
                        No se encontraron coincidencias.{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setShowLiveDropdown(false);
                            handleOpenArtistSheet(searchFilter.trim());
                          }}
                          className="text-goblinLime underline font-bold ml-1 hover:text-emerald-300"
                        >
                          Abrir ficha de &quot;{searchFilter.trim()}&quot;
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tarjeta destacada para buscar CUALQUIER artista dinámicamente */}
            {showCustomArtistCard && (
              <div className="glass-card rounded-3xl p-5 border-2 border-goblinLime/70 bg-gradient-to-r from-emerald-950/60 to-black flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in shadow-xl shadow-emerald-500/10">
                <div className="flex items-center gap-4 text-center sm:text-left">
                  <img
                    src={`/api/artists/photo?name=${encodeURIComponent(searchFilter.trim())}`}
                    alt={searchFilter}
                    className="w-16 h-16 rounded-2xl object-cover border border-goblinLime shrink-0 bg-emerald-950 shadow-md"
                  />
                  <div>
                    <div className="text-[10px] uppercase font-black tracking-wider text-goblinLime">
                      Búsqueda en directo
                    </div>
                    <h3 className="font-display font-black text-lg text-white">
                      Jugar Ranked de &ldquo;{searchFilter.trim()}&rdquo;
                    </h3>
                    <p className="text-xs text-zinc-300">
                      Quiz en directo con audio verificado de {searchFilter.trim()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenArtistSheet(searchFilter.trim())}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition hover:scale-105 flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Jugar</span>
                </button>
              </div>
            )}

            {/* Loading skeleton while dynamic catalog loads */}
            {loadingCategories && categories.length === 0 && (
              <div className="space-y-4">
                <div className="md:hidden space-y-2.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-emerald-500/15 animate-pulse"
                    >
                      <div className="w-14 h-14 rounded-xl bg-emerald-950/70 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 bg-white/10 rounded" />
                        <div className="h-3 w-48 bg-white/5 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-2xl bg-zinc-900/60 border border-emerald-500/15 animate-pulse p-5 flex flex-col justify-between"
                    >
                      <div className="w-16 h-16 rounded-xl bg-emerald-950/70" />
                      <div className="space-y-2">
                        <div className="h-5 w-36 bg-white/10 rounded" />
                        <div className="h-3 w-full bg-white/5 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clean Empty State when no artists have been played yet */}
            {!loadingCategories &&
              activeTab === "artist" &&
              filteredCategories.length === 0 &&
              !searchFilter.trim() && (
                <div className="rounded-3xl bg-gradient-to-b from-emerald-950/35 via-[#0B1710] to-[#060D09] border border-emerald-500/20 p-8 sm:p-12 text-center space-y-5 shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-950/80 border border-emerald-400/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-900/30">
                    <Sparkles className="w-7 h-7 text-goblinLime" />
                  </div>
                  <div className="space-y-2 max-w-lg mx-auto">
                    <h3 className="font-display font-black text-xl sm:text-2xl text-white">
                      ¡Estrena el ranking de artistas!
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                      Aquí aparecerán ordenados los artistas más jugados por todos. Busca tu artista favorito arriba y juega la primera partida para posicionarlo en el #1.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 max-w-xl mx-auto">
                    {["Quevedo", "Bad Bunny", "Feid", "MVRK", "Alleh", "Olivia Rodrigo"].map((artistName) => (
                      <button
                        key={artistName}
                        type="button"
                        onClick={() => handleOpenArtistSheet(artistName)}
                        className="px-4 py-2 rounded-full bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/25 hover:border-goblinLime/60 text-xs font-bold text-emerald-200 hover:text-goblinLime transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Disc3 className="w-3.5 h-3.5 text-goblinLime" />
                        <span>{artistName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/* Theme search empty fallback */}
            {!loadingCategories && activeTab === "theme" && filteredCategories.length === 0 && (
              <div className="rounded-2xl bg-zinc-900/50 border border-white/10 p-6 text-center text-xs text-zinc-400">
                No se encontraron temáticas para &ldquo;{searchFilter.trim()}&rdquo;.
              </div>
            )}

            {/* Discreet subtitle in "Por Artista" tab explaining dynamic popularity sorting */}
            {!loadingCategories && activeTab === "artist" && filteredCategories.length > 0 && (
              <div className="text-xs text-zinc-400 px-1">
                Ordenado por los artistas más jugados · Busca cualquier artista para añadirlo al ranking
              </div>
            )}

            {/* Categories List - Mobile Spotify-style rows (< md) */}
            <div
              hidden={loadingCategories || filteredCategories.length === 0}
              className={!loadingCategories && filteredCategories.length > 0 ? "md:hidden space-y-2.5" : "hidden"}
            >
              {filteredCategories.map((cat) => (
                <div
                  key={`mob_${cat.id}`}
                  onClick={() => {
                    if (cat.kind === "artist") {
                      handleOpenArtistSheet(cat.query || cat.name);
                    } else {
                      handleStartRankedRun(cat);
                    }
                  }}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/90 border border-white/10 gap-3 hover:border-emerald-500/40 transition cursor-pointer shadow-md"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="w-14 h-14 rounded-full object-cover border border-emerald-500/30 shrink-0 bg-emerald-950 shadow"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-base text-white truncate">
                        {cat.name}
                      </h3>
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {cat.description}
                      </div>
                      <div className="text-[10px] text-emerald-400/90 font-semibold mt-0.5 truncate">
                        {cat.playerCount} {cat.playerCount === 1 ? "partida" : "partidas"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (cat.kind === "artist") {
                        handleOpenArtistSheet(cat.query || cat.name);
                      } else {
                        handleStartRankedRun(cat);
                      }
                    }}
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-goblinPrimary to-goblinLime text-zinc-950 font-black text-xs shrink-0 flex items-center gap-1.5 transition cursor-pointer shadow-md active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Jugar</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Categories Grid - Desktop View (md:grid) - 1:1 Square Cards */}
            <div
              hidden={loadingCategories || filteredCategories.length === 0}
              className={
                !loadingCategories && filteredCategories.length > 0
                  ? "hidden md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5"
                  : "hidden"
              }
            >
              {filteredCategories.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => {
                    if (cat.kind === "artist") {
                      handleOpenArtistSheet(cat.query || cat.name);
                    } else {
                      handleStartRankedRun(cat);
                    }
                  }}
                  className="group relative rounded-2xl overflow-hidden border border-emerald-500/20 hover:border-goblinLime/70 transition-all duration-300 shadow-md hover:shadow-xl hover:shadow-emerald-500/10 cursor-pointer aspect-square w-full flex flex-col justify-between p-3.5 sm:p-4 bg-[#08120B]"
                >
                  {/* Square Image Covering Full Card with Smooth Zoom on Hover */}
                  <img
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Gradient Overlay for Editorial Depth & Face Visibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050B07]/95 via-[#050B07]/45 to-transparent pointer-events-none" />

                  {/* Top Badges */}
                  <div className="relative z-10 flex items-center justify-between gap-1.5">
                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold backdrop-blur-md bg-black/60 border border-white/10 text-emerald-300 flex items-center gap-1 shadow"
                      title={`${cat.playerCount} ${cat.playerCount === 1 ? "partida" : "partidas"}`}
                    >
                      <Users className="w-3 h-3 text-goblinLime shrink-0" />
                      <span>{cat.playerCount} {cat.playerCount === 1 ? "partida" : "partidas"}</span>
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (cat.kind === "artist") {
                          handleOpenArtistSheet(cat.query || cat.name);
                        } else {
                          handleOpenLeaderboard(cat);
                        }
                      }}
                      className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/20 text-amber-400 flex items-center justify-center transition hover:scale-110 active:scale-95 shadow-md cursor-pointer shrink-0"
                      title={cat.kind === "artist" ? "Ver ranking del artista" : "Ver clasificación"}
                    >
                      <Trophy className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Bottom Information Content */}
                  <div className="relative z-10 space-y-1">
                    <h3 className="font-display font-extrabold text-base sm:text-lg leading-tight text-white group-hover:text-goblinLime transition drop-shadow-md truncate">
                      {cat.name}
                    </h3>
                    <p className="text-[11px] text-zinc-300/90 line-clamp-1 leading-tight drop-shadow">
                      {cat.description}
                    </p>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (cat.kind === "artist") {
                          handleOpenArtistSheet(cat.query || cat.name);
                        } else {
                          handleStartRankedRun(cat);
                        }
                      }}
                      className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime hover:brightness-110 text-black font-extrabold text-xs shadow-md transition hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{cat.kind === "artist" ? "Ver Ficha" : "Jugar"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Leaderboard Modal (CERO MOCKS: Mensaje honesto si aún no hay jugadores) */}
      {leaderboardModalCategory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl max-w-md w-full p-6 border border-emerald-500/30 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
              <div className="flex items-center gap-3">
                <img
                  src={leaderboardModalCategory.imageUrl}
                  alt={leaderboardModalCategory.name}
                  className="w-10 h-10 rounded-xl object-cover border border-emerald-500/30"
                />
                <div>
                  <h3 className="font-display font-black text-lg text-white">
                    {leaderboardModalCategory.name}
                  </h3>
                  <div className="text-xs text-zinc-400">Tabla de Clasificación Oficial</div>
                </div>
              </div>
              <button
                onClick={() => setLeaderboardModalCategory(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingLeaderboard ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl border border-white/5 bg-white/5 animate-pulse flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-4 bg-white/10 rounded" />
                      <div className="w-7 h-7 rounded-full bg-white/10" />
                      <div className="space-y-1">
                        <div className="w-24 h-3 bg-white/10 rounded" />
                        <div className="w-16 h-2 bg-white/10 rounded" />
                      </div>
                    </div>
                    <div className="w-12 h-4 bg-white/10 rounded" />
                  </div>
                ))}
              </div>
            ) : leaderboardEntries.length === 0 ? (
              <div className="py-12 text-center space-y-3 px-4">
                <Trophy className="w-10 h-10 text-zinc-500 mx-auto" />
                <div className="text-sm font-bold text-white">Aún no hay puntuaciones registradas</div>
                <p className="text-xs text-zinc-400">
                  ¡Sé el primero en estrenar el ranking y coronarte como el número 1 en {leaderboardModalCategory.name}!
                </p>
                <button
                  onClick={() => {
                    const cat = leaderboardModalCategory;
                    setLeaderboardModalCategory(null);
                    handleStartRankedRun(cat);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs shadow hover:opacity-95 transition"
                >
                  Jugar Ahora y Estrenar Ranking
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {leaderboardEntries.map((entry, idx) => {
                  const isTop1 = idx === 0;
                  const isTop2 = idx === 1;
                  const isTop3 = idx === 2;

                  return (
                    <div
                      key={entry.userId}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                        isTop1
                          ? "bg-amber-950/40 border-amber-500/50"
                          : isTop2
                          ? "bg-slate-900/60 border-slate-400/40"
                          : isTop3
                          ? "bg-amber-950/20 border-amber-800/40"
                          : "bg-black/40 border-emerald-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-xs w-6 text-center text-zinc-400">
                          {isTop1 ? "👑" : isTop2 ? "🥈" : isTop3 ? "🥉" : `#${entry.rank}`}
                        </span>
                        <img
                          src={entry.avatarUrl}
                          alt={entry.nickname}
                          className="w-7 h-7 rounded-full object-cover border border-emerald-500/30"
                        />
                        <div className="truncate max-w-[150px]">
                          <div className="text-xs font-bold text-white truncate">{entry.nickname}</div>
                          <div className={`text-[10px] font-semibold ${entry.tier.badgeColor}`}>
                            {entry.tier.icon} {entry.tier.name}
                          </div>
                        </div>
                      </div>

                      <div className="font-mono font-black text-xs text-goblinLime">
                        {entry.score.toLocaleString()} <span className="text-[10px] text-zinc-400 font-normal">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Top 50 del Artista (Ficha Oficial) */}
      {fullArtistLeaderboardOpen && artistSheetData && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl max-w-lg w-full p-6 border border-white/15 space-y-5 animate-scaleUp bg-[#0C120E] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <img
                  src={artistSheetData.photoUrl}
                  alt={artistSheetData.artistName}
                  className="w-10 h-10 rounded-full object-cover border border-emerald-400 shadow-md bg-emerald-950"
                />
                <div>
                  <h3 className="font-display font-black text-base text-white">
                    Ranking Top 50 · {artistSheetData.artistName}
                  </h3>
                  <div className="text-xs text-zinc-400">
                    {artistSheetData.leaderboard.length} jugadores clasificados
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFullArtistLeaderboardOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {artistSheetData.leaderboard.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
                  <Trophy className="w-8 h-8 text-zinc-600 mx-auto" />
                  <div>Aún no hay puntuaciones registradas para este artista.</div>
                  <div className="text-goblinLime font-semibold">¡Sé el primero en jugar y coronarte!</div>
                </div>
              ) : (
                artistSheetData.leaderboard.map((entry) => {
                  const entryTier = entry.tier || calculateTier(entry.totalPoints);
                  return (
                    <div
                      key={entry.userId}
                      className={`p-3 rounded-2xl flex items-center justify-between border transition ${
                        entry.isCurrentUser
                          ? "bg-emerald-950/80 border-emerald-400/40 shadow-md shadow-emerald-500/5"
                          : "bg-black/40 border-white/5 hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`font-mono font-bold text-xs w-6 text-center shrink-0 ${
                            entry.rank === 1
                              ? "text-amber-300 font-black"
                              : entry.rank === 2
                              ? "text-zinc-300 font-black"
                              : entry.rank === 3
                              ? "text-amber-500 font-black"
                              : "text-zinc-400"
                          }`}
                        >
                          {entry.rank === 1 ? "👑" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                        </span>
                        <img
                          src={entry.avatarUrl}
                          alt={entry.nickname}
                          className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0 bg-zinc-800"
                        />
                        <div className="truncate max-w-[160px] sm:max-w-[220px]">
                          <span className="text-xs font-bold text-white truncate block">
                            {entry.nickname}
                            {entry.isCurrentUser && (
                              <span className="text-goblinLime ml-1.5 font-normal">(Tú)</span>
                            )}
                          </span>
                          <span className={`text-[10px] font-semibold ${entryTier.badgeColor}`}>
                            {entryTier.icon} {entryTier.name}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-extrabold text-goblinLime shrink-0">
                        {entry.totalPoints.toLocaleString()} pts
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setFullArtistLeaderboardOpen(false)}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer onOpenMiniQuiz={() => setMiniQuizOpen(true)} />

      <MiniQuizModal isOpen={miniQuizOpen} onClose={() => setMiniQuizOpen(false)} />
      <UserAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => loadInitialData()}
      />
    </div>
  );
}

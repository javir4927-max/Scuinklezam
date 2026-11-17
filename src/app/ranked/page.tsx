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
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MiniQuizModal from "@/components/MiniQuizModal";
import UserAuthModal from "@/components/UserAuthModal";
import { playCorrectSound, playWrongSound } from "@/lib/soundEffects";
import { audioPlayer } from "@/lib/audioPlayer";
import { SpotifyTrackItem, getFallbackArtwork } from "@/lib/spotifyTypes";
import {
  RANKED_CATEGORIES,
  RANKED_TIERS,
  RankedCategory,
  RankedTier,
  LeaderboardEntry,
  calculateTier,
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
  const [categories, setCategories] = useState<RankedCategory[]>(RANKED_CATEGORIES);
  const [user, setUser] = useState<UserSession | null>(null);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [miniQuizOpen, setMiniQuizOpen] = useState<boolean>(false);
  const [leaderboardModalCategory, setLeaderboardModalCategory] = useState<RankedCategory | null>(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);

  // Active Ranked Game Runner State
  const [activeCategory, setActiveCategory] = useState<RankedCategory | null>(null);
  const [gameState, setGameState] = useState<"idle" | "loading" | "playing" | "reveal" | "summary">("idle");
  const [questions, setQuestions] = useState<RankedQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(15);
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
    isPersonalBest: boolean;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scorePopupTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch real categories and current user session
  const loadInitialData = async () => {
    try {
      const catRes = await fetch("/api/ranked/categories", { cache: "no-store" });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData.categories && Array.isArray(catData.categories)) {
          setCategories(catData.categories);
        }
      }
    } catch {}

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
  }, []);

  // Filter categories
  const filteredCategories = categories.filter((c) => {
    const matchesTab = c.kind === activeTab;
    const matchesSearch = c.name.toLowerCase().includes(searchFilter.toLowerCase().trim());
    return matchesTab && matchesSearch;
  });

  // Check if search has exact match or if custom search card should be displayed
  const hasExactSearchMatch = filteredCategories.some(
    (c) => c.name.toLowerCase() === searchFilter.toLowerCase().trim()
  );
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

  // Launch a Ranked Run (10 Questions Exact / 1000 Pts Max)
  const handleStartRankedRun = async (cat: RankedCategory) => {
    setActiveCategory(cat);
    setGameState("loading");
    setScore(0);
    setStreak(0);
    setCurrentIdx(0);
    setAnsweredIdx(null);
    setScorePopup(null);
    setSummaryData(null);
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
        alert("No se pudieron cargar suficientes canciones para este modo.");
        setGameState("idle");
        return;
      }

      // Build 10 questions exact (shuffled)
      const shuffled = [...tracks].sort(() => 0.5 - Math.random());
      const roundsCount = Math.min(10, shuffled.length);
      const generated: RankedQuestion[] = [];

      for (let i = 0; i < roundsCount; i++) {
        const correct = shuffled[i];
        const others = shuffled.filter((t) => t.id !== correct.id);
        const distractors = others
          .sort(() => 0.5 - Math.random())
          .slice(0, 3)
          .map((t) => ({
            title: t.title,
            artist: t.artist,
            artworkUrl: t.artworkUrl || getFallbackArtwork(t.title, t.artist),
          }));

        const correctOpt = {
          title: correct.title,
          artist: correct.artist,
          artworkUrl: correct.artworkUrl || getFallbackArtwork(correct.title, correct.artist),
        };

        const options = [correctOpt, ...distractors].sort(() => 0.5 - Math.random());
        const correctIndex = options.findIndex(
          (o) => o.title === correctOpt.title && o.artist === correctOpt.artist
        );

        generated.push({
          correctTrack: correct,
          options,
          correctIndex: correctIndex >= 0 ? correctIndex : 0,
        });
      }

      setQuestions(generated);
      setGameState("playing");
      setTimeLeft(15);

      if (generated[0]?.correctTrack?.previewUrl) {
        audioPlayer.playTrack(generated[0].correctTrack.previewUrl);
        if (generated[1]?.correctTrack?.previewUrl) {
          audioPlayer.preloadNext(generated[1].correctTrack.previewUrl);
        }
      }
    } catch (err) {
      console.error("Error starting ranked run:", err);
      setGameState("idle");
    }
  };

  // Handle Answer in Ranked Run (Max 100 pts per question)
  const handleAnswer = useCallback(
    async (idx: number) => {
      if (gameState !== "playing" || !questions[currentIdx] || !activeCategory) return;

      const currentQ = questions[currentIdx];
      setGameState("reveal");
      setAnsweredIdx(idx);

      const isCorrect = idx === currentQ.correctIndex;
      // Formula: maximum 100 points, scaling with speed down to 30 points minimum on correct
      const roundPoints = isCorrect ? Math.max(30, Math.round(100 * (timeLeft / 15))) : 0;

      if (isCorrect) {
        setStreak((prev) => prev + 1);
        setScore((prev) => prev + roundPoints);
        playCorrectSound();
      } else {
        setStreak(0);
        playWrongSound();
      }

      // Record in answers history for the Tappz summary screen
      const chosenTitle = idx >= 0 && currentQ.options[idx] ? currentQ.options[idx].title : "Tiempo agotado";
      setAnswersHistory((prev) => [
        ...prev,
        {
          track: currentQ.correctTrack,
          isCorrect,
          points: roundPoints,
          chosenTitle,
        },
      ]);

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
      if (currentIdx + 1 < questions.length) {
        audioPlayer.preloadNext(questions[currentIdx + 1]?.correctTrack?.previewUrl);
      }

      // Advance after 1.8 seconds
      advanceTimerRef.current = setTimeout(async () => {
        setScorePopup(null);
        if (currentIdx + 1 < questions.length) {
          const nextIdx = currentIdx + 1;
          setCurrentIdx(nextIdx);
          setAnsweredIdx(null);
          setGameState("playing");
          setTimeLeft(15);

          const nextTrack = questions[nextIdx].correctTrack;
          if (nextTrack?.previewUrl) {
            audioPlayer.playTrack(nextTrack.previewUrl);
          }
          if (nextIdx + 1 < questions.length) {
            audioPlayer.preloadNext(questions[nextIdx + 1]?.correctTrack?.previewUrl);
          }
        } else {
          // Finished 10 Questions Ranked Run!
          audioPlayer.stop();
          setGameState("summary");

          const finalScore = score + roundPoints;
          const tier = calculateTier(finalScore);

          try {
            const guestId = user?.id || localStorage.getItem("scuinklezam_ranked_uid") || `guest_${Date.now()}`;
            localStorage.setItem("scuinklezam_ranked_uid", guestId);

            const res = await fetch("/api/ranked/submit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                categoryId: activeCategory.id,
                categoryName: activeCategory.name,
                score: finalScore,
                correctCount: isCorrect ? streak + 1 : streak,
                guestUserId: guestId,
                guestNickname: user?.nickname || localStorage.getItem("scuinklezam_player_name") || "Jugador Ranked",
              }),
            });
            const data = await res.json();
            setSummaryData({
              finalScore,
              tier,
              rank: data.rank || 1,
              isPersonalBest: data.isPersonalBest ?? true,
            });
            // Refresh category play counts
            loadInitialData();
          } catch {
            setSummaryData({
              finalScore,
              tier,
              rank: 1,
              isPersonalBest: true,
            });
          }
        }
      }, 1800);
    },
    [gameState, questions, currentIdx, activeCategory, streak, timeLeft, score, user]
  );

  // 15s Timer
  useEffect(() => {
    if (gameState !== "playing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleAnswer(-1); // Timeout as incorrect
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, currentIdx, handleAnswer]);

  return (
    <div className="min-h-screen bg-[#060D09] text-white flex flex-col font-sans selection:bg-goblinPrimary selection:text-black">
      {/* 1. TOP NAVBAR (SIEMPRE ARRIBA DEL TODO TOP-0) */}
      <Navbar
        activeRoute="ranked"
        onOpenMiniQuiz={() => setMiniQuizOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* ========================================================
            MODO JUEGO ACTIVO (RUNNER RANKED 10 PREGUNTAS)
           ======================================================== */}
        {gameState !== "idle" ? (
          <div className="w-full space-y-6">
            {/* Header con botón salir */}
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15 max-w-xl mx-auto">
              <button
                onClick={() => {
                  audioPlayer.stop();
                  setGameState("idle");
                  setActiveCategory(null);
                  if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
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
              <div className="py-24 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-12 h-12 border-4 border-goblinLime border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="font-display font-bold text-lg text-white">
                  Cargando quiz de 10 canciones...
                </div>
                <div className="text-xs text-zinc-400">
                  Verificando audios de 30 segundos y carátulas originales
                </div>
              </div>
            )}

            {/* PLAYING & REVEAL STATE */}
            {(gameState === "playing" || gameState === "reveal") && questions[currentIdx] && (
              <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
                {/* Status Bar: Round (X/10), Streak & Score */}
                <div className="flex items-center justify-between px-2">
                  <div className="space-y-0.5">
                    <span className="text-xs text-zinc-400 font-semibold">
                      Pregunta {currentIdx + 1} de {questions.length}
                    </span>
                    {streak > 1 && (
                      <div className="text-xs font-extrabold text-amber-400 flex items-center gap-1 animate-pulse">
                        <Flame className="w-3.5 h-3.5 fill-current" />
                        <span>Racha x{streak}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 ${
                        timeLeft <= 5
                          ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                          : "bg-black/50 text-emerald-300 border-emerald-500/30"
                      }`}
                    >
                      <Timer className="w-3.5 h-3.5" />
                      <span>{timeLeft}s</span>
                    </div>

                    <div className="relative">
                      <span className="px-3.5 py-1 rounded-full bg-emerald-950 border border-emerald-500/40 text-goblinLime font-mono font-black text-xs sm:text-sm">
                        {score} / 1000
                      </span>
                      {scorePopup && (
                        <div
                          key={`score_pop_${scorePopup.key}`}
                          className={`absolute -top-4 right-0 pointer-events-none z-30 px-2 py-0.5 rounded-full font-mono font-black text-xs tracking-wider whitespace-nowrap animate-score-float ${
                            scorePopup.isCorrect
                              ? "text-emerald-300 bg-emerald-500/20 border border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.65)]"
                              : "text-rose-300 bg-rose-500/20 border border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.65)] animate-wrong-shake"
                          }`}
                        >
                          {scorePopup.isCorrect ? `+${scorePopup.points} pts` : "0 pts"}
                        </div>
                      )}
                    </div>
                  </div>
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
                      "w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] hover:bg-emerald-950/60 border border-emerald-500/20 hover:border-goblinLime text-white transition text-left cursor-pointer relative overflow-visible";

                    if (gameState === "reveal") {
                      if (isCorrect) {
                        btnClass =
                          "w-full flex items-center justify-between p-3 rounded-2xl bg-[#22C55E]/20 border-2 border-[#22C55E] text-white shadow-lg shadow-emerald-500/20 relative overflow-visible scale-[1.02]";
                      } else if (isSelected) {
                        btnClass =
                          "w-full flex items-center justify-between p-3 rounded-2xl bg-[#EF4444]/20 border-2 border-[#EF4444] text-white animate-wrong-shake relative overflow-visible";
                      } else {
                        btnClass =
                          "w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5 opacity-50 text-zinc-400";
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
                PANTALLA DE RESULTADOS ESTILO TAPPZ (2 COLUMNAS)
               ======================================================== */}
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

                      <div className="space-y-0.5">
                        <div className="font-display font-black text-4xl sm:text-5xl text-white tracking-tight">
                          {summaryData.finalScore} <span className="text-xl sm:text-2xl text-zinc-400 font-normal">/ 1000</span>
                        </div>
                        <h2 className="font-display font-extrabold text-lg sm:text-xl text-zinc-100 truncate">
                          {activeCategory?.name}
                        </h2>
                      </div>
                    </div>
                  </div>

                  {/* Botones de Acción */}
                  <div className="space-y-2.5">
                    <button
                      onClick={() => handleStartRankedRun(activeCategory!)}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Volver a jugar</span>
                    </button>

                    <button
                      onClick={() => handleOpenLeaderboard(activeCategory!)}
                      className="w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs border border-emerald-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>Ver Ranking de {activeCategory?.name}</span>
                    </button>

                    <button
                      onClick={() => {
                        audioPlayer.stop();
                        setGameState("idle");
                        setActiveCategory(null);
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
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
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
        ) : (
          /* ========================================================
              CATÁLOGO RANKED ESTILO TAPPZ (ARTISTAS & TEMAS)
             ======================================================== */
          <div className="space-y-8 animate-fade-in">
            {/* Hero Banner */}
            <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-r from-[#0C1D13] via-[#0E2619] to-black border border-emerald-500/25 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-3 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-300">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Temporada 1 · Sistema Ranked estilo Tappz</span>
                </div>
                <h1 className="font-display font-black text-3xl sm:text-5xl text-white tracking-tight">
                  Demuestra tu nivel musical
                </h1>
                <p className="text-zinc-300 text-sm sm:text-base max-w-xl">
                  Quizzes de <strong>10 canciones</strong> sobre <strong>1000 puntos</strong>. Compite por artistas o temáticas y sube de rango desde <strong>Bronce</strong> hasta <strong>Maestro</strong>.
                </p>
              </div>

              {/* User Status Card (Oculta banner de invitado si ya hay usuario o Spotify conectado) */}
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

            {/* Filter and Tab Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex rounded-2xl bg-black/50 p-1 border border-emerald-500/20 w-full sm:w-auto">
                <button
                  onClick={() => setActiveTab("artist")}
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
                  onClick={() => setActiveTab("theme")}
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

              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
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
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/20 text-white text-xs focus:outline-none focus:border-goblinLime placeholder:text-zinc-400"
                />
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
                      Quiz de 10 canciones en directo con audio verificado de {searchFilter.trim()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleStartRankedRun({
                      id: `custom_${encodeURIComponent(searchFilter.trim().toLowerCase())}`,
                      name: searchFilter.trim(),
                      kind: "artist",
                      description: `Quiz de 10 canciones de ${searchFilter.trim()}`,
                      imageUrl: `/api/artists/photo?name=${encodeURIComponent(searchFilter.trim())}`,
                      query: searchFilter.trim(),
                      playerCount: 0,
                    })
                  }
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition hover:scale-105 flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Jugar Quiz (10 Preguntas)</span>
                </button>
              </div>
            )}

            {/* Categories Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="glass-card rounded-3xl p-5 border border-emerald-500/20 hover:border-goblinLime/60 transition group flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start gap-3.5">
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="w-14 h-14 rounded-2xl object-cover border border-emerald-500/40 shadow-lg shrink-0 bg-emerald-950"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-bold text-base text-white group-hover:text-goblinLime transition truncate">
                          {cat.name}
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2 mt-1 leading-snug">
                        {cat.description}
                      </p>
                      <div className="text-[10px] text-emerald-400 font-semibold mt-1">
                        {cat.playerCount} {cat.playerCount === 1 ? "partida jugada" : "partidas jugadas"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-emerald-500/10">
                    <button
                      onClick={() => handleStartRankedRun(cat)}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition hover:scale-[1.02] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Jugar Ranked (10 Q)</span>
                    </button>

                    <button
                      onClick={() => handleOpenLeaderboard(cat)}
                      className="p-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-emerald-500/20 text-zinc-300 hover:text-white transition cursor-pointer"
                      title="Ver tabla de clasificación"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" />
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
              <div className="py-12 text-center text-xs text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-goblinLime mx-auto mb-2" />
                Consultando ranking oficial...
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
                        {entry.score} <span className="text-[10px] text-zinc-400 font-normal">/ 1000</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

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
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MiniQuizModal from "@/components/MiniQuizModal";
import UserAuthModal from "@/components/UserAuthModal";
import { playSynthNote } from "@/lib/audio";
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

  // Check current session
  useEffect(() => {
    fetch("/api/auth/user/me")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  // Filter categories
  const filteredCategories = categories.filter((c) => {
    const matchesTab = c.kind === activeTab;
    const matchesSearch = c.name.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Open Leaderboard Modal
  const handleOpenLeaderboard = async (cat: RankedCategory) => {
    setLeaderboardModalCategory(cat);
    setLoadingLeaderboard(true);
    try {
      const res = await fetch(`/api/ranked/leaderboard?category=${cat.id}&userId=${user?.id || ""}`);
      const data = await res.json();
      if (data.success && data.entries) {
        setLeaderboardEntries(data.entries);
      }
    } catch {
      // fallback
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // Launch a Ranked Run
  const handleStartRankedRun = async (cat: RankedCategory) => {
    setActiveCategory(cat);
    setGameState("loading");
    setScore(0);
    setStreak(0);
    setCurrentIdx(0);
    setAnsweredIdx(null);
    setScorePopup(null);
    setSummaryData(null);

    try {
      const res = await fetch(`/api/ranked/tracks?category=${cat.id}`);
      const data = await res.json();
      const tracks: SpotifyTrackItem[] = data.tracks || [];

      if (tracks.length < 4) {
        alert("No se pudieron cargar suficientes canciones para este modo.");
        setGameState("idle");
        return;
      }

      // Build 5 ranked rounds
      const shuffled = [...tracks].sort(() => 0.5 - Math.random());
      const roundsCount = Math.min(5, shuffled.length);
      const generated: RankedQuestion[] = [];

      for (let i = 0; i < roundsCount; i++) {
        const correct = shuffled[i];
        const others = shuffled.filter((t) => t.id !== correct.id);
        const distractors = others.sort(() => 0.5 - Math.random()).slice(0, 3).map((t) => ({
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
        const correctIndex = options.findIndex((o) => o.title === correctOpt.title && o.artist === correctOpt.artist);

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

  // Handle Answer in Ranked Run
  const handleAnswer = useCallback(
    async (idx: number) => {
      if (gameState !== "playing" || !questions[currentIdx] || !activeCategory) return;

      const currentQ = questions[currentIdx];
      setGameState("reveal");
      setAnsweredIdx(idx);

      const isCorrect = idx === currentQ.correctIndex;
      let roundPoints = 0;

      if (isCorrect) {
        // Multiplier based on streak: 1x, 1.25x, 1.5x, 1.75x, 2x
        const currentStreak = streak + 1;
        setStreak(currentStreak);
        const streakMultiplier = 1 + Math.min(4, currentStreak - 1) * 0.25;
        const timeBonus = Math.round((timeLeft / 15) * 500);
        roundPoints = Math.round((500 + timeBonus) * streakMultiplier);

        setScore((prev) => prev + roundPoints);
        playSynthNote(659.25, 0.35);
      } else {
        setStreak(0);
        playSynthNote(196.0, 0.35);
      }

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
          // Finished Ranked Run!
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
                score: finalScore,
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
      {/* 1. TOP NAVBAR (IDÉNTICO EN TODA LA WEB) */}
      <Navbar
        activeRoute="ranked"
        onOpenMiniQuiz={() => setMiniQuizOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8">
        {/* ========================================================
            MODO JUEGO ACTIVO (RUNNER RANKED)
           ======================================================== */}
        {gameState !== "idle" ? (
          <div className="max-w-xl mx-auto space-y-6">
            {/* Header con botón salir */}
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
              <button
                onClick={() => {
                  audioPlayer.stop();
                  if (timerRef.current) clearInterval(timerRef.current);
                  if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
                  setGameState("idle");
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Salir de la partida</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400">{activeCategory?.name}</span>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  RANKED
                </span>
              </div>
            </div>

            {/* LOADING STATE */}
            {gameState === "loading" && (
              <div className="p-12 text-center space-y-3 glass-card rounded-3xl border border-emerald-500/30">
                <div className="w-12 h-12 border-4 border-goblinLime border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-sm font-bold text-white">Preparando pistas ranked con audio verificado...</div>
                <div className="text-xs text-zinc-400">Calculando multiplicadores de racha y velocidad</div>
              </div>
            )}

            {/* PLAYING / REVEAL ARENA */}
            {(gameState === "playing" || gameState === "reveal") && questions[currentIdx] && (
              <div className="glass-card rounded-3xl p-6 sm:p-8 border border-emerald-500/30 shadow-2xl relative space-y-5">
                {/* Status Bar: Round, Timer, Score, Streak */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs text-zinc-400 font-semibold">
                      Canción {currentIdx + 1} de {questions.length}
                    </span>
                    {streak > 1 && (
                      <div className="text-xs font-extrabold text-amber-400 flex items-center gap-1 animate-pulse">
                        <Flame className="w-3.5 h-3.5 fill-current" />
                        <span>Racha x{streak} ({1 + Math.min(4, streak - 1) * 0.25}x pts)</span>
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
                        {score} pts
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
                <div className="p-3 rounded-2xl bg-[#0B1710] border border-emerald-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => audioPlayer.playTrack(questions[currentIdx].correctTrack.previewUrl)}
                      className="w-9 h-9 rounded-full bg-goblinPrimary flex items-center justify-center text-black font-bold shadow-md hover:scale-105 active:scale-95 transition"
                      title="Volver a escuchar"
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                    <div>
                      <div className="text-xs font-bold text-white">¿Qué canción está sonando?</div>
                      <div className="text-[10px] text-zinc-400">Escucha con atención y pulsa una opción</div>
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
                          "w-full flex items-center justify-between p-3 rounded-2xl bg-[#22C55E]/20 border-2 border-[#22C55E] text-white shadow-lg shadow-emerald-500/20 relative overflow-visible";
                      } else if (isSelected) {
                        btnClass =
                          "w-full flex items-center justify-between p-3 rounded-2xl bg-[#EF4444]/20 border-2 border-[#EF4444] text-white relative overflow-visible";
                      } else {
                        btnClass =
                          "w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5 opacity-50 relative overflow-visible";
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
                            {scorePopup.isCorrect ? (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>+{scorePopup.points} pts</span>
                              </>
                            ) : (
                              <>
                                <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span>0 puntos</span>
                              </>
                            )}
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

            {/* SUMMARY SCREEN */}
            {gameState === "summary" && summaryData && (
              <div className="glass-card rounded-3xl p-8 border border-emerald-500/30 text-center space-y-6 shadow-2xl animate-fadeIn">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-400 via-emerald-400 to-goblinLime flex items-center justify-center text-black font-black text-2xl mx-auto shadow-xl shadow-emerald-500/30">
                  <Trophy className="w-8 h-8 fill-current" />
                </div>

                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-xs font-bold text-emerald-300">
                    <span>Partida Ranked Completada</span>
                  </div>
                  <h2 className="font-display font-black text-3xl sm:text-4xl text-white">
                    {summaryData.finalScore.toLocaleString()} pts
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Puntuación final en <strong>{activeCategory?.name}</strong>
                  </p>
                </div>

                {/* Tier Division Card */}
                <div className={`p-5 rounded-2xl border ${summaryData.tier.badgeBg} max-w-sm mx-auto space-y-2`}>
                  <div className="text-xs uppercase font-extrabold tracking-wider text-zinc-400">
                    División Obtenida
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl">{summaryData.tier.icon}</span>
                    <span className={`font-display font-black text-2xl ${summaryData.tier.badgeColor}`}>
                      Rango {summaryData.tier.name}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-300 font-semibold">
                    Posición en la tabla: <strong>#{summaryData.rank} mundial</strong>
                  </div>
                </div>

                {/* Prompt to register if guest */}
                {!user && (
                  <div className="p-4 rounded-2xl bg-black/50 border border-emerald-500/20 text-xs text-zinc-300 space-y-2">
                    <div>¿Quieres guardar tu rango y aparecer con tu nombre en el ranking?</div>
                    <button
                      onClick={() => setAuthModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs hover:opacity-95 transition"
                    >
                      Crear Cuenta Gratis
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => handleStartRankedRun(activeCategory!)}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Jugar Otra Vez</span>
                  </button>

                  <button
                    onClick={() => handleOpenLeaderboard(activeCategory!)}
                    className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-emerald-500/30 text-white font-bold text-xs transition flex items-center justify-center gap-2"
                  >
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>Ver Tabla de Clasificación</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========================================================
              CATÁLOGO RANKED ESTILO TAPPZ (ARTISTAS & TEMAS)
             ======================================================== */
          <div className="space-y-8">
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
                  Compite por artistas o temáticas, encadena rachas perfectas y sube de rango desde <strong>Bronce</strong> hasta <strong>Maestro</strong> en la tabla de clasificación.
                </p>
              </div>

              {/* User Status Card */}
              <div className="p-4 rounded-2xl bg-black/60 border border-emerald-500/30 shrink-0 w-full md:w-64 space-y-2.5 text-center">
                {user ? (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <img
                        src={user.avatarUrl}
                        alt={user.nickname}
                        className="w-8 h-8 rounded-full border border-emerald-400"
                      />
                      <div className="text-left">
                        <div className="text-xs font-bold text-white truncate max-w-[140px]">{user.nickname}</div>
                        <div className="text-[10px] text-emerald-400">Cuenta activa</div>
                      </div>
                    </div>
                    <div className="text-xs text-zinc-300">Puntuaciones sincronizadas</div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-bold text-zinc-300">¿Jugando como invitado?</div>
                    <p className="text-[11px] text-zinc-400">Guarda tu rango y compite por los puestos #1 del mundo.</p>
                    <button
                      onClick={() => setAuthModalOpen(true)}
                      className="w-full py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs hover:opacity-95 transition"
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
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder={activeTab === "artist" ? "Buscar artista (ej. Bad Bunny, Feid)..." : "Buscar temática..."}
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/20 text-white text-xs focus:outline-none focus:border-goblinLime"
                />
              </div>
            </div>

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
                        {cat.playerCount.toLocaleString()} partidas jugadas
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-emerald-500/10">
                    <button
                      onClick={() => handleStartRankedRun(cat)}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition hover:scale-[1.02] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Jugar Ranked</span>
                    </button>

                    <button
                      onClick={() => handleOpenLeaderboard(cat)}
                      className="p-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-emerald-500/20 transition cursor-pointer"
                      title="Ver Clasificación"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL DE CLASIFICACIÓN / LEADERBOARD EN VIVO (TAPPZ)
           ======================================================== */}
        {leaderboardModalCategory && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#0B1710] border border-emerald-500/30 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setLeaderboardModalCategory(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3">
                <img
                  src={leaderboardModalCategory.imageUrl}
                  alt={leaderboardModalCategory.name}
                  className="w-12 h-12 rounded-2xl object-cover border border-emerald-500/40"
                />
                <div>
                  <h3 className="font-display font-black text-xl text-white">
                    Ranking: {leaderboardModalCategory.name}
                  </h3>
                  <p className="text-xs text-zinc-400">Top jugadores mundiales en esta categoría</p>
                </div>
              </div>

              {loadingLeaderboard ? (
                <div className="py-8 text-center text-xs text-zinc-400 animate-pulse">
                  Cargando posiciones oficiales...
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboardEntries.map((entry) => {
                    const isTop1 = entry.rank === 1;
                    const isTop2 = entry.rank === 2;
                    const isTop3 = entry.rank === 3;

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
                            className="w-8 h-8 rounded-full border border-emerald-500/40 object-cover"
                          />
                          <div>
                            <div className="font-bold text-xs text-white truncate max-w-[140px]">
                              {entry.nickname}
                            </div>
                            <span className={`text-[10px] font-bold ${entry.tier.badgeColor}`}>
                              {entry.tier.name}
                            </span>
                          </div>
                        </div>

                        <span className="font-mono font-bold text-xs text-goblinLime">
                          {entry.score.toLocaleString()} pts
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => {
                  const cat = leaderboardModalCategory;
                  setLeaderboardModalCategory(null);
                  handleStartRankedRun(cat);
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition"
              >
                Jugar esta Categoría Ahora
              </button>
            </div>
          </div>
        )}

        {/* MODAL AUTH EMAIL/PASSWORD */}
        <UserAuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={(u) => setUser(u)}
        />

        {/* MINIQUIZ MODAL */}
        <MiniQuizModal
          isOpen={miniQuizOpen}
          onClose={() => setMiniQuizOpen(false)}
        />
      </main>

      {/* FOOTER UNIFICADO */}
      <Footer onOpenMiniQuiz={() => setMiniQuizOpen(true)} />
    </div>
  );
}

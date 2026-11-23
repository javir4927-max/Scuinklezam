"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Flame,
  CalendarCheck,
  Play,
  Pause,
  Share2,
  Check,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Trophy,
  ArrowRight,
  Music2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { audioPlayer } from "@/lib/audioPlayer";
import { calculateRoundPoints, ROUND_DURATION_SEC } from "@/lib/scoring";
import type { DailyRound, DailyRoundOption } from "@/app/api/daily/route";

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
    }
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface CompletedDailyState {
  dateKey: string;
  dayNumber: number;
  score: number;
  results: boolean[];
  answers: Array<{
    title: string;
    artist: string;
    artworkUrl: string;
    previewUrl: string;
    isCorrect: boolean;
    points: number;
  }>;
  streak: number;
}

export default function DiarioPage() {
  const [loading, setLoading] = useState(true);
  const [dateKey, setDateKey] = useState<string>("");
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [rounds, setRounds] = useState<DailyRound[]>([]);
  const [userStreak, setUserStreak] = useState<number>(0);

  // Match flow
  const [gameState, setGameState] = useState<"ready" | "playing" | "reveal" | "summary">("ready");
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(ROUND_DURATION_SEC);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [score, setScore] = useState<number>(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [recordedAnswers, setRecordedAnswers] = useState<CompletedDailyState["answers"]>([]);

  // Preview player in summary
  const [activePreviewTrack, setActivePreviewTrack] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [secondsUntilMidnight, setSecondsUntilMidnight] = useState<number>(3600);

  // References
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const roundStartTimeRef = useRef<number>(0);
  const isAnsweredRef = useRef<boolean>(false);

  // 1. Initial Load: Fetch /api/daily
  useEffect(() => {
    async function loadDaily() {
      try {
        const res = await fetch("/api/daily");
        const data = await res.json();
        if (data.success) {
          setDateKey(data.dateKey);
          setDayNumber(data.dayNumber);
          setRounds(data.rounds || []);

          const streak = data.userDailyState?.currentStreak || 0;
          setUserStreak(streak);

          // Check if already completed today via server
          if (data.userDailyState?.completedToday && data.userDailyState?.todayResult) {
            const tr = data.userDailyState.todayResult;
            setScore(tr.score || 0);
            setResults(tr.results || []);
            setRecordedAnswers(tr.answers || []);
            setGameState("summary");
            setLoading(false);
            return;
          }

          // Check localStorage for guests
          const localSaved = localStorage.getItem(`scuinklezam_daily_${data.dateKey}`);
          if (localSaved) {
            try {
              const parsed: CompletedDailyState = JSON.parse(localSaved);
              setScore(parsed.score);
              setResults(parsed.results);
              setRecordedAnswers(parsed.answers);
              setUserStreak(parsed.streak || streak || 1);
              setGameState("summary");
              setLoading(false);
              return;
            } catch {
              // Ignore corrupt storage
            }
          }
        }
      } catch (err) {
        console.error("Error loading daily challenge:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDaily();

    return () => {
      audioPlayer.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // 2. Midnight countdown
  useEffect(() => {
    function updateMidnight() {
      const now = new Date();
      const madridStr = now.toLocaleString("en-US", { timeZone: "Europe/Madrid" });
      const madridDate = new Date(madridStr);
      const midnight = new Date(madridDate);
      midnight.setHours(24, 0, 0, 0);
      const diffSec = Math.max(0, Math.floor((midnight.getTime() - madridDate.getTime()) / 1000));
      setSecondsUntilMidnight(diffSec);
    }

    updateMidnight();
    const interval = setInterval(updateMidnight, 1000);
    return () => clearInterval(interval);
  }, []);

  // 3. Start a round
  const startRound = (roundIdx: number) => {
    if (roundIdx >= rounds.length) {
      finishGame();
      return;
    }

    const round = rounds[roundIdx];
    setCurrentRoundIdx(roundIdx);
    setSelectedOptionId(null);
    setGameState("playing");
    setTimeLeft(ROUND_DURATION_SEC);
    isAnsweredRef.current = false;
    roundStartTimeRef.current = Date.now();

    // Start audio
    if (round.previewUrl) {
      audioPlayer.playTrack(round.previewUrl);
    }

    // Start 20s countdown
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeExpired(roundIdx);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleTimeExpired = (roundIdx: number) => {
    if (isAnsweredRef.current) return;
    isAnsweredRef.current = true;

    const round = rounds[roundIdx];
    setSelectedOptionId("__timeout__");
    setGameState("reveal");
    setResults((prev) => [...prev, false]);

    setRecordedAnswers((prev) => [
      ...prev,
      {
        title: round.correctTitle,
        artist: round.correctArtist,
        artworkUrl: round.artworkUrl,
        previewUrl: round.previewUrl,
        isCorrect: false,
        points: 0,
      },
    ]);

    advanceTimerRef.current = setTimeout(() => {
      startRound(roundIdx + 1);
    }, 2800);
  };

  const handleSelectOption = (opt: DailyRoundOption) => {
    if (gameState !== "playing" || isAnsweredRef.current) return;
    isAnsweredRef.current = true;

    if (timerRef.current) clearInterval(timerRef.current);
    setSelectedOptionId(opt.id);
    setGameState("reveal");

    const elapsed = Math.max(0.1, (Date.now() - roundStartTimeRef.current) / 1000);
    const roundPoints = calculateRoundPoints(opt.isCorrect, elapsed, ROUND_DURATION_SEC);

    const round = rounds[currentRoundIdx];

    if (opt.isCorrect) {
      setScore((prev) => prev + roundPoints);
    }

    setResults((prev) => [...prev, opt.isCorrect]);
    setRecordedAnswers((prev) => [
      ...prev,
      {
        title: round.correctTitle,
        artist: round.correctArtist,
        artworkUrl: round.artworkUrl,
        previewUrl: round.previewUrl,
        isCorrect: opt.isCorrect,
        points: roundPoints,
      },
    ]);

    advanceTimerRef.current = setTimeout(() => {
      startRound(currentRoundIdx + 1);
    }, 2800);
  };

  // Keyboard shortcuts 1-4
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (gameState !== "playing" || isAnsweredRef.current) return;
      const key = e.key;
      if (["1", "2", "3", "4"].includes(key)) {
        const idx = parseInt(key, 10) - 1;
        const currentRound = rounds[currentRoundIdx];
        if (currentRound && currentRound.options[idx]) {
          handleSelectOption(currentRound.options[idx]);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, currentRoundIdx, rounds]);

  // Finish game & post score
  const finishGame = async () => {
    audioPlayer.stop();
    setGameState("summary");

    const finalResults = results;
    const finalAnswers = recordedAnswers;
    const finalScore = score;

    try {
      const res = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateKey,
          score: finalScore,
          results: finalResults,
          answers: finalAnswers,
        }),
      });
      const data = await res.json();
      const updatedStreak = data.currentStreak || userStreak + 1;
      setUserStreak(updatedStreak);

      const localPayload: CompletedDailyState = {
        dateKey,
        dayNumber,
        score: finalScore,
        results: finalResults,
        answers: finalAnswers,
        streak: updatedStreak,
      };
      localStorage.setItem(`scuinklezam_daily_${dateKey}`, JSON.stringify(localPayload));
    } catch (err) {
      console.error("Error submitting daily score:", err);
      // Fallback local persistence
      const localPayload: CompletedDailyState = {
        dateKey,
        dayNumber,
        score: finalScore,
        results: finalResults,
        answers: finalAnswers,
        streak: Math.max(1, userStreak + 1),
      };
      localStorage.setItem(`scuinklezam_daily_${dateKey}`, JSON.stringify(localPayload));
    }
  };

  // Play preview in summary
  const togglePreview = (previewUrl: string) => {
    if (activePreviewTrack === previewUrl) {
      audioPlayer.stop();
      setActivePreviewTrack(null);
    } else {
      audioPlayer.playTrack(previewUrl);
      setActivePreviewTrack(previewUrl);
    }
  };

  // Share to clipboard for WhatsApp
  const handleShare = async () => {
    const emojis = results.map((r) => (r ? "🟩" : "🟥")).join("");
    const streakStr = `${userStreak} ${userStreak === 1 ? "día" : "días"}`;
    const text = `🎵 Scuinklezam Diario #${dayNumber}
${emojis} · ${score}/500 pts
🔥 Racha: ${streakStr}
https://scuinklezam.vercel.app/diario`;

    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center animate-spin">
          <CalendarCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="mt-4 text-sm font-bold text-zinc-400">Cargando Reto Diario...</p>
      </div>
    );
  }

  const currentRound = rounds[currentRoundIdx];

  return (
    <div className="min-h-screen bg-[#050B07] text-white pt-6 pb-20 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigation Bar Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href="/ranked"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10"
          >
            ← Volver a Ranked
          </Link>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <Flame className="w-3.5 h-3.5 text-amber-400 fill-current" />
              <span>{userStreak} {userStreak === 1 ? "día" : "días"}</span>
            </span>
          </div>
        </div>

        {/* 1. STATE: READY SCREEN (Start Playing) */}
        {gameState === "ready" && (
          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-[#0B1710] to-[#060D08] border border-emerald-500/20 shadow-2xl text-center space-y-6 animate-fadeIn">
            <div className="inline-flex p-3 rounded-2xl bg-emerald-500/20 text-goblinLime border border-emerald-400/30 shadow-lg shadow-emerald-500/10">
              <CalendarCheck className="w-8 h-8" />
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-widest text-emerald-400">
                Edición #{dayNumber} · {dateKey}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Scuinklezam Diario
              </h1>
              <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
                5 canciones del día para todo el mundo. 20 segundos cada una. Adivina el temazo lo antes posible y mantén viva tu racha.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto text-center">
              <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/10">
                <div className="text-lg font-black text-white">5</div>
                <div className="text-[11px] text-zinc-400">Canciones</div>
              </div>
              <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/10">
                <div className="text-lg font-black text-goblinLime">500</div>
                <div className="text-[11px] text-zinc-400">Pts Máx</div>
              </div>
              <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/10">
                <div className="text-lg font-black text-amber-400">1 Intento</div>
                <div className="text-[11px] text-zinc-400">Por día</div>
              </div>
            </div>

            <button
              onClick={() => startRound(0)}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 text-black font-black text-base shadow-xl shadow-emerald-500/25 transition cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Empezar Reto de Hoy</span>
            </button>
          </div>
        )}

        {/* 2. STATE: PLAYING & REVEAL (The 5 Daily Rounds) */}
        {(gameState === "playing" || gameState === "reveal") && currentRound && (
          <div className="space-y-5 animate-fadeIn">
            {/* Header: Round indicator & Timer */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0B1710] border border-emerald-500/20">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                  Ronda {currentRoundIdx + 1} de {rounds.length}
                </span>
                <span className="text-xs text-zinc-500">·</span>
                <span className="font-mono font-bold text-xs text-goblinLime">
                  {score} pts
                </span>
              </div>

              {/* Progress circles for the 5 songs */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: rounds.length }).map((_, i) => {
                  const answered = i < results.length;
                  const wasCorrect = results[i];
                  const isCurrent = i === currentRoundIdx;
                  return (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full transition-all flex items-center justify-center text-[8px] font-bold ${
                        isCurrent
                          ? "ring-2 ring-emerald-400 bg-emerald-500/40"
                          : answered
                          ? wasCorrect
                            ? "bg-emerald-500 text-black"
                            : "bg-rose-500 text-white"
                          : "bg-white/10"
                      }`}
                    >
                      {answered ? (wasCorrect ? "✓" : "✕") : ""}
                    </div>
                  );
                })}
              </div>

              {/* Time Remaining */}
              <div className="flex items-center gap-1.5 font-mono font-extrabold text-sm">
                <Clock className={`w-4 h-4 ${timeLeft <= 5 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`} />
                <span className={timeLeft <= 5 ? "text-rose-400" : "text-white"}>
                  {timeLeft}s
                </span>
              </div>
            </div>

            {/* Time progress bar */}
            <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden border border-emerald-500/10">
              <div
                className={`h-full transition-all duration-1000 ${
                  timeLeft <= 5 ? "bg-rose-500" : "bg-gradient-to-r from-goblinPrimary to-goblinLime"
                }`}
                style={{ width: `${(timeLeft / ROUND_DURATION_SEC) * 100}%` }}
              />
            </div>

            {/* Artwork / Mystery Box */}
            <div className="p-6 rounded-3xl bg-gradient-to-b from-[#0B1710] to-[#060D08] border border-emerald-500/20 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl relative border-2 border-emerald-500/30 flex items-center justify-center bg-black/60">
                {gameState === "reveal" ? (
                  <img
                    src={currentRound.artworkUrl}
                    alt={currentRound.correctTitle}
                    className="w-full h-full object-cover animate-scaleUp"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-emerald-400/80 animate-pulse">
                    <Music2 className="w-12 h-12" />
                    <span className="text-xs font-bold mt-2">Escuchando...</span>
                  </div>
                )}
              </div>

              {gameState === "reveal" && (
                <div className="animate-scaleUp space-y-1">
                  <div className="text-lg font-black text-white">{currentRound.correctTitle}</div>
                  <div className="text-sm text-emerald-300 font-semibold">{currentRound.correctArtist}</div>
                </div>
              )}
            </div>

            {/* 4 Options Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
              {currentRound.options.map((opt, optIdx) => {
                const isSelected = selectedOptionId === opt.id;
                const isReveal = gameState === "reveal";
                const isCorrect = opt.isCorrect;

                let cardStyle =
                  "bg-[#0B1710]/90 border-emerald-500/20 hover:border-emerald-500/50 hover:bg-[#0D1C13]";

                if (isReveal) {
                  if (isCorrect) {
                    cardStyle = "bg-emerald-950/90 border-goblinLime text-white shadow-lg shadow-emerald-500/20";
                  } else if (isSelected && !isCorrect) {
                    cardStyle = "bg-rose-950/90 border-rose-500 text-rose-200";
                  } else {
                    cardStyle = "bg-black/40 border-white/5 opacity-40";
                  }
                }

                return (
                  <button
                    key={opt.id}
                    disabled={isReveal}
                    onClick={() => handleSelectOption(opt)}
                    className={`p-3.5 sm:p-4 rounded-2xl border text-left flex items-center justify-between transition-all select-none ${cardStyle} ${
                      isReveal ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-emerald-950/60 border border-white/10 flex items-center justify-center">
                        {isReveal ? (
                          <img
                            src={opt.artworkUrl}
                            alt={opt.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-mono font-bold text-xs text-zinc-400">
                            {optIdx + 1}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm sm:text-base text-white truncate">
                          {opt.title}
                        </div>
                        <div className="text-xs text-zinc-400 truncate">
                          {opt.artist}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {isReveal && isCorrect ? (
                        <Check className="w-5 h-5 text-goblinLime" />
                      ) : isReveal && isSelected && !isCorrect ? (
                        <X className="w-5 h-5 text-rose-400" />
                      ) : (
                        <span className="w-6 h-6 rounded-lg bg-black/40 flex items-center justify-center font-mono text-xs text-zinc-400 border border-white/10">
                          {optIdx + 1}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. STATE: SUMMARY SCREEN (Completed for today) */}
        {gameState === "summary" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Podium / Score Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#0B1710] to-[#060D08] border border-emerald-500/25 shadow-2xl text-center space-y-6">
              <div className="inline-flex p-3 rounded-2xl bg-emerald-500/20 text-goblinLime border border-emerald-400/30">
                <Trophy className="w-8 h-8" />
              </div>

              <div>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">
                  Reto Diario #{dayNumber} Completado
                </div>
                <div className="text-4xl sm:text-5xl font-black text-white mt-1">
                  {score} <span className="text-xl text-zinc-400 font-bold">/ 500 pts</span>
                </div>
              </div>

              {/* 5 Blocks Emoji Grid */}
              <div className="flex items-center justify-center gap-2.5">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-lg font-black shadow-md transition-all ${
                      r
                        ? "bg-emerald-500/20 border-2 border-goblinLime text-goblinLime shadow-emerald-500/20"
                        : "bg-rose-500/20 border-2 border-rose-500 text-rose-400 shadow-rose-500/20"
                    }`}
                  >
                    {r ? "✓" : "✕"}
                  </div>
                ))}
              </div>

              {/* Streak and Next Challenge Countdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                <div className="p-3.5 rounded-2xl bg-black/40 border border-emerald-500/15 flex items-center justify-center gap-2.5">
                  <Flame className="w-5 h-5 text-amber-400 fill-current" />
                  <div className="text-left">
                    <div className="text-xs text-zinc-400">Racha actual</div>
                    <div className="text-sm font-black text-amber-300">
                      {userStreak} {userStreak === 1 ? "día" : "días seguidos"}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-black/40 border border-emerald-500/15 flex items-center justify-center gap-2.5">
                  <Clock className="w-5 h-5 text-emerald-400" />
                  <div className="text-left">
                    <div className="text-xs text-zinc-400">Próximo reto en</div>
                    <div className="font-mono text-sm font-black text-white">
                      {formatCountdown(secondsUntilMidnight)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Share Button */}
              <div className="pt-2">
                <button
                  onClick={handleShare}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime hover:opacity-95 text-black font-black text-base shadow-xl shadow-emerald-500/25 transition cursor-pointer inline-flex items-center justify-center gap-2.5"
                >
                  <Share2 className="w-5 h-5" />
                  <span>{copyFeedback ? "¡Copiado para WhatsApp! 🎉" : "Compartir resultado"}</span>
                </button>
              </div>
            </div>

            {/* List of the 5 Songs with Audio Previews */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0B1710]/80 border border-emerald-500/20 space-y-4">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center justify-between">
                <span>Canciones de hoy ({recordedAnswers.length || rounds.length})</span>
                <span className="text-[11px] text-zinc-400">Escucha los previews</span>
              </div>

              <div className="space-y-2.5">
                {(recordedAnswers.length > 0
                  ? recordedAnswers
                  : rounds.map((r, i) => ({
                      title: r.correctTitle,
                      artist: r.correctArtist,
                      artworkUrl: r.artworkUrl,
                      previewUrl: r.previewUrl,
                      isCorrect: results[i] ?? false,
                      points: results[i] ? 100 : 0,
                    }))
                ).map((track, idx) => {
                  const isPlaying = activePreviewTrack === track.previewUrl;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-black/40 border border-emerald-500/10 flex items-center justify-between gap-3 hover:border-emerald-500/30 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-emerald-950 border border-white/10 relative">
                          <img
                            src={track.artworkUrl}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm text-white truncate">
                            {track.title}
                          </div>
                          <div className="text-xs text-zinc-400 truncate">
                            {track.artist}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded-full ${
                            track.isCorrect
                              ? "bg-emerald-500/15 text-goblinLime border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                          }`}
                        >
                          {track.isCorrect ? `+${track.points} pts` : "0 pts"}
                        </span>

                        {track.previewUrl && (
                          <button
                            type="button"
                            onClick={() => togglePreview(track.previewUrl)}
                            className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white flex items-center justify-center transition cursor-pointer"
                            title={isPlaying ? "Pausar" : "Escuchar"}
                          >
                            {isPlaying ? (
                              <Pause className="w-4 h-4 text-goblinLime fill-current" />
                            ) : (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

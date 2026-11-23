"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Crown,
  Globe,
  Sparkles,
  X,
  Play,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import {
  RANKED_TIERS,
  calculateTier,
  RankedTier,
  LeaderboardEntry,
} from "@/lib/rankedTypes";

interface GlobalLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GlobalLeaderboardModal({
  isOpen,
  onClose,
}: GlobalLeaderboardModalProps) {
  const { user } = useSpotifyAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null);
  const [profileStats, setProfileStats] = useState<any>(null);
  const [effectiveCurrentUserId, setEffectiveCurrentUserId] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    const fetchData = async () => {
      try {
        const rawUserId = user?.id || "";
        const fallbackPrefixed = rawUserId ? (rawUserId.startsWith("spotify_") ? rawUserId : `spotify_${rawUserId}`) : "";

        const profileRes = await fetch("/api/user/profile")
          .then((r) => r.json())
          .catch(() => ({ stats: null, user: null }));

        const effectiveUserId = profileRes?.user?.id || fallbackPrefixed;

        const leaderboardRes = await fetch(
          `/api/ranked/leaderboard?category=global${
            effectiveUserId ? `&userId=${encodeURIComponent(effectiveUserId)}` : ""
          }`
        )
          .then((r) => r.json())
          .catch(() => ({ entries: [] }));

        if (isMounted) {
          setEffectiveCurrentUserId(effectiveUserId);
          if (leaderboardRes?.success && Array.isArray(leaderboardRes.entries)) {
            setEntries(leaderboardRes.entries);
            setUserEntry(leaderboardRes.userEntry || null);
          } else {
            setEntries([]);
            setUserEntry(null);
          }

          if (profileRes?.success && profileRes?.stats) {
            setProfileStats(profileRes.stats);
          }
        }
      } catch (err) {
        console.warn("[GlobalLeaderboardModal] Error loading data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  // Calculate current score & tier progress using real best score
  const effectiveScore = Math.max(
    userEntry?.score || 0,
    profileStats?.bestScore || 0,
    profileStats?.personalBests?.global || 0
  );

  const currentTier: RankedTier = calculateTier(effectiveScore);

  // Ascending order: Bronce (0), Plata (400), Oro (550), Platino (700), Diamante (800), Maestro (900)
  const tierOrderAsc = [...RANKED_TIERS].reverse();
  const currentTierIndex = tierOrderAsc.findIndex((t) => t.name === currentTier.name);
  const nextTier: RankedTier | null =
    currentTierIndex < tierOrderAsc.length - 1 ? tierOrderAsc[currentTierIndex + 1] : null;

  let progressPercent = 100;
  let pointsToNext = 0;
  if (nextTier) {
    const currentMin = currentTier.minScore;
    const nextMin = nextTier.minScore;
    pointsToNext = Math.max(0, nextMin - effectiveScore);
    progressPercent = Math.min(
      100,
      Math.max(
        0,
        Math.round(((effectiveScore - currentMin) / (nextMin - currentMin)) * 100)
      )
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-card rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col border border-emerald-500/30 overflow-hidden shadow-2xl animate-scaleUp">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-emerald-500/15 flex items-center justify-between gap-3 shrink-0 bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/30 to-amber-400/10 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-md">
              <Globe className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-display font-extrabold text-lg text-white flex items-center gap-2">
                <span>Clasificación Global</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  TOP 20
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Puntuaciones competitivas oficiales de Scuinklezam
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
          {/* 1. Bloque: Tu División y Progreso */}
          <div className="rounded-2xl p-4 bg-gradient-to-r from-emerald-950/60 via-[#102218] to-black border border-emerald-500/30 space-y-3.5 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{currentTier.icon}</span>
                <div>
                  <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    Tu División Actual
                  </div>
                  <div className={`text-base font-black ${currentTier.badgeColor}`}>
                    División {currentTier.name}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                  Tu Marca Global
                </div>
                <div className="text-base font-mono font-black text-goblinLime">
                  {effectiveScore} <span className="text-xs text-zinc-400 font-normal">/ 1000 pts</span>
                </div>
              </div>
            </div>

            {/* Progress bar to next tier */}
            <div className="space-y-1.5 pt-1 border-t border-emerald-500/15">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium flex items-center gap-1.5 text-[11px]">
                  <TrendingUp className="w-3.5 h-3.5 text-goblinLime" />
                  {nextTier ? (
                    <>
                      Faltan <strong className="text-white">{pointsToNext} pts</strong> para{" "}
                      <span className={nextTier.badgeColor}>{nextTier.name}</span>
                    </>
                  ) : (
                    <span className="text-purple-300 font-bold">¡Rango Máximo Maestro alcanzado! 👑</span>
                  )}
                </span>
                <span className="font-mono font-bold text-goblinLime text-[11px]">
                  {progressPercent}%
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden border border-emerald-500/20">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-lime-400 rounded-full transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* 2. Bloque: Top 20 Global */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-extrabold text-sm text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Salón de la Fama Mundial</span>
              </h3>
              <span className="text-xs text-zinc-400">
                {entries.length} {entries.length === 1 ? "jugador" : "jugadores"}
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-goblinLime" />
                <span className="text-xs">Cargando clasificación mundial...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="py-10 px-4 rounded-2xl bg-black/40 border border-emerald-500/20 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center mx-auto text-amber-400">
                  <Crown className="w-6 h-6 text-amber-400" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-sm text-white">Aún no hay récords globales</p>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Sé el primero en entrar a la tabla mundial jugando una partida en el modo Ranked.
                  </p>
                </div>
                <Link
                  href="/ranked"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition hover:scale-105"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Jugar Ranked Ahora</span>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-emerald-500/10 border border-emerald-500/20 rounded-2xl overflow-hidden bg-black/40">
                {entries.map((entry, idx) => {
                  const isMe = Boolean(
                    (effectiveCurrentUserId && entry.userId === effectiveCurrentUserId) ||
                    (user?.id && (entry.userId === user.id || entry.userId === `spotify_${user.id}`))
                  );

                  return (
                    <div
                      key={entry.userId || idx}
                      className={`py-2.5 px-3.5 flex items-center justify-between gap-3 text-xs transition ${
                        isMe
                          ? "bg-emerald-950/50 border-l-4 border-l-goblinLime"
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      {/* Left: Rank + Avatar + Name + Tier */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 text-center shrink-0 font-mono font-black text-xs">
                          {entry.rank === 1 ? (
                            <span className="text-amber-400 flex items-center justify-center">
                              <Crown className="w-4 h-4 fill-amber-400" />
                            </span>
                          ) : entry.rank === 2 ? (
                            <span className="text-slate-300">🥈</span>
                          ) : entry.rank === 3 ? (
                            <span className="text-amber-600">🥉</span>
                          ) : (
                            <span className="text-zinc-500">#{entry.rank}</span>
                          )}
                        </span>

                        <img
                          src={entry.avatarUrl}
                          alt={entry.nickname}
                          className="w-7 h-7 rounded-full object-cover border border-emerald-500/30 shrink-0 bg-emerald-950"
                        />

                        <div className="min-w-0">
                          <div className="font-bold text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{entry.nickname}</span>
                            {isMe && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-goblinLime border border-emerald-500/40 shrink-0">
                                Tú
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                            <span>{entry.tier?.icon}</span>
                            <span className={entry.tier?.badgeColor}>
                              {entry.tier?.name}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Score */}
                      <div className="text-right shrink-0">
                        <div className="font-mono font-black text-goblinLime text-xs">
                          {entry.score} pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-emerald-500/15 flex items-center justify-between gap-3 shrink-0 bg-[#060D09]">
          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-goblinLime" />
            <span>Actualizado en vivo</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

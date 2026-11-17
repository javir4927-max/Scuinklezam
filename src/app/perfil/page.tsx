"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  Trophy,
  Flame,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  User,
  LogIn,
  CheckCircle2,
  Calendar,
  Disc3,
  Loader2,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { RANKED_CATEGORIES, RankedCategory, calculateTier, RankedTier } from "@/lib/rankedTypes";
import UserAuthModal from "@/components/UserAuthModal";
import SpotifyConnectModal from "@/components/SpotifyConnectModal";
import SpotifyStatsDetailModal from "@/components/SpotifyStatsDetailModal";

interface ProfileStats {
  totalPlays: number;
  averageScore: number;
  currentTier: RankedTier;
  bestCategoryId: string;
  bestCategoryName: string;
  bestScore: number;
  personalBests: Record<string, number>;
  recentMatches: Array<{
    categoryId: string;
    categoryName: string;
    score: number;
    correctCount: number;
    timestamp: number;
  }>;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [showStatsDetailModal, setShowStatsDetailModal] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/profile", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setAuthenticated(true);
          setUser(data.user);
          setStats(data.stats);
        } else {
          setAuthenticated(false);
          setUser(null);
          setStats(null);
        }
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <div className="min-h-screen bg-[#060D09] text-white flex flex-col font-sans selection:bg-goblinPrimary selection:text-black">
      {/* 1. TOP NAVBAR */}
      <Navbar
        activeRoute="perfil"
        onOpenSpotifyModal={() => setSpotifyModalOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-goblinLime animate-spin mx-auto" />
            <div className="text-sm text-zinc-400">Cargando tu perfil y estadísticas...</div>
          </div>
        ) : !authenticated ? (
          /* ========================================================
             ESTADO NO AUTENTICADO: INVITACIÓN A LOGUEARSE
             ======================================================== */
          <div className="max-w-xl mx-auto py-12 text-center space-y-6 glass-card rounded-3xl p-8 border border-emerald-500/25">
            <div className="w-16 h-16 rounded-2xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center mx-auto text-goblinLime">
              <User className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display font-black text-2xl sm:text-3xl text-white">
                Guarda tu progreso y récords
              </h1>
              <p className="text-zinc-300 text-sm max-w-md mx-auto leading-relaxed">
                Inicia sesión con tu cuenta de Spotify o tu correo para registrar tus puntuaciones en Ranked, subir de división y consultar tus estadísticas reales.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={() => setSpotifyModalOpen(true)}
                className="px-6 py-3 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                <span>Conectar con Spotify</span>
              </button>
              <button
                onClick={() => setAuthModalOpen(true)}
                className="px-6 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-sm border border-emerald-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Correo / Contraseña</span>
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================
             ESTADO AUTENTICADO: PERFIL REAL CON DATOS DE REDIS
             ======================================================== */
          <div className="space-y-8 animate-fade-in">
            {/* Header de Usuario */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#0C1D13] via-[#0E2619] to-black border border-emerald-500/25 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5 text-center sm:text-left">
                <img
                  src={user.avatarUrl}
                  alt={user.nickname}
                  className="w-20 h-20 rounded-full border-2 border-goblinLime shadow-xl object-cover shrink-0"
                />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 justify-center sm:justify-start">
                    <h1 className="font-display font-black text-2xl sm:text-3xl text-white">
                      {user.nickname}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950 border border-emerald-500/40 text-goblinLime">
                      {stats?.currentTier?.name || "Bronce"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-300 justify-center sm:justify-start">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {user.provider === "spotify" ? "Conectado con Spotify" : "Cuenta Scuinklezam"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {user.provider === "spotify" && (
                  <button
                    type="button"
                    onClick={() => setShowStatsDetailModal(true)}
                    className="bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span>Ver stats a detalle</span>
                  </button>
                )}

                <Link
                  href="/ranked"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-goblinPrimary to-goblinLime text-black font-extrabold text-xs shadow-md transition hover:scale-105 flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Jugar Ranked</span>
                </Link>
              </div>
            </div>

            {/* 4 Métricas Clave */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-5 border border-emerald-500/20 text-center space-y-1">
                <div className="text-zinc-400 text-xs font-semibold">Partidas Jugadas</div>
                <div className="font-display font-black text-2xl sm:text-3xl text-white">
                  {stats?.totalPlays || 0}
                </div>
                <div className="text-[10px] text-zinc-400">Total acumulado</div>
              </div>

              <div className="glass-card rounded-2xl p-5 border border-emerald-500/20 text-center space-y-1">
                <div className="text-zinc-400 text-xs font-semibold">Puntuación Media</div>
                <div className="font-display font-black text-2xl sm:text-3xl text-goblinLime">
                  {stats?.averageScore || 0} <span className="text-xs text-zinc-400 font-normal">/ 1000</span>
                </div>
                <div className="text-[10px] text-zinc-400">Media por quiz de 10</div>
              </div>

              <div className="glass-card rounded-2xl p-5 border border-emerald-500/20 text-center space-y-1">
                <div className="text-zinc-400 text-xs font-semibold">Rango Actual</div>
                <div className={`font-display font-black text-2xl sm:text-3xl flex items-center justify-center gap-1.5 ${stats?.currentTier?.badgeColor || "text-amber-700"}`}>
                  <span>{stats?.currentTier?.icon || "🥉"}</span>
                  <span>{stats?.currentTier?.name || "Bronce"}</span>
                </div>
                <div className="text-[10px] text-zinc-400">Basado en tu nivel</div>
              </div>

              <div className="glass-card rounded-2xl p-5 border border-emerald-500/20 text-center space-y-1">
                <div className="text-zinc-400 text-xs font-semibold">Mejor Quiz</div>
                <div className="font-display font-black text-lg sm:text-xl text-white truncate px-1" title={stats?.bestCategoryName}>
                  {stats?.bestCategoryName || "Ninguno aún"}
                </div>
                <div className="text-[10px] text-emerald-400 font-bold">
                  {stats?.bestScore ? `${stats.bestScore} / 1000 pts` : "Sin récords"}
                </div>
              </div>
            </div>

            {/* Mis Récords por Artista y Temática */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h2 className="font-display font-black text-xl text-white">
                    Mis Récords por Artista y Temática
                  </h2>
                </div>
                <Link href="/ranked" className="text-xs text-goblinLime hover:underline flex items-center gap-1">
                  <span>Ver catálogo completo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {Object.keys(stats?.personalBests || {}).length === 0 ? (
                <div className="p-8 rounded-2xl bg-black/40 border border-emerald-500/15 text-center space-y-3">
                  <Disc3 className="w-8 h-8 text-zinc-400 mx-auto animate-spin-slow" />
                  <p className="text-zinc-300 text-xs max-w-sm mx-auto">
                    Aún no has registrado récords en ningún artista o temática. ¡Juega tu primera partida de 10 preguntas en Ranked!
                  </p>
                  <Link
                    href="/ranked"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-goblinPrimary text-black font-extrabold text-xs shadow hover:opacity-95 transition"
                  >
                    <span>Explorar Quizzes Ranked</span>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(stats?.personalBests || {}).map(([catId, personalScore]) => {
                    const cat = RANKED_CATEGORIES.find((c) => c.id === catId);
                    const name = cat?.name || catId.replace(/^(artist_|theme_)/, "").replace(/_/g, " ");
                    const img = cat?.imageUrl || `/api/artists/photo?name=${encodeURIComponent(name)}`;
                    const tier = calculateTier(personalScore);

                    return (
                      <div
                        key={catId}
                        className="glass-card rounded-2xl p-4 border border-emerald-500/20 flex items-center justify-between gap-3 hover:border-emerald-500/40 transition group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={img}
                            alt={name}
                            className="w-12 h-12 rounded-xl object-cover border border-emerald-500/40 shrink-0 bg-emerald-950"
                          />
                          <div className="min-w-0">
                            <div className="font-display font-bold text-sm text-white truncate group-hover:text-goblinLime transition">
                              {name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono font-black text-xs text-goblinLime">
                                {personalScore} <span className="text-[10px] text-zinc-400 font-normal">/ 1000</span>
                              </span>
                              <span className={`text-[10px] font-bold ${tier.badgeColor}`}>
                                {tier.icon} {tier.name}
                              </span>
                            </div>
                          </div>
                        </div>

                        <Link
                          href={`/ranked`}
                          className="p-2 rounded-xl bg-white/[0.05] hover:bg-emerald-500/20 text-zinc-300 hover:text-white transition shrink-0"
                          title="Volver a jugar"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Historial de Partidas Recientes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                <h2 className="font-display font-black text-xl text-white">
                  Historial de Partidas Recientes
                </h2>
              </div>

              {!stats?.recentMatches || stats.recentMatches.length === 0 ? (
                <div className="p-6 rounded-2xl bg-black/40 border border-emerald-500/15 text-center text-xs text-zinc-400">
                  No hay partidas registradas en tu historial reciente.
                </div>
              ) : (
                <div className="glass-card rounded-2xl border border-emerald-500/20 overflow-hidden divide-y divide-emerald-500/10">
                  {stats.recentMatches.map((m, idx) => {
                    const tier = calculateTier(m.score);
                    const dateStr = new Date(m.timestamp).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={idx}
                        className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-goblinLime shrink-0 font-mono font-bold text-xs">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-white truncate">
                              {m.categoryName}
                            </div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                              <Calendar className="w-3 h-3 text-zinc-400" />
                              <span>{dateStr}</span>
                              <span>·</span>
                              <span>{m.correctCount} / 10 aciertos</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${tier.badgeBg} ${tier.badgeColor}`}>
                            {tier.icon} {tier.name}
                          </span>
                          <span className="font-mono font-black text-base text-goblinLime">
                            {m.score} <span className="text-xs text-zinc-400 font-normal">/ 1000</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <UserAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setAuthModalOpen(false);
          fetchProfile();
        }}
      />

      <SpotifyConnectModal
        isOpen={spotifyModalOpen}
        onClose={() => setSpotifyModalOpen(false)}
      />

      <SpotifyStatsDetailModal
        isOpen={showStatsDetailModal}
        onClose={() => setShowStatsDetailModal(false)}
        userDisplayName={user?.nickname}
      />
    </div>
  );
}

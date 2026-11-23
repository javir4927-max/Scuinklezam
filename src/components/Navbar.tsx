"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Trophy,
  Play,
  ChevronDown,
  BarChart2,
  LogOut,
  User,
  Home,
  Zap,
} from "lucide-react";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import GlobalVolumeControl from "@/components/GlobalVolumeControl";
import SpotifyStatsDetailModal from "@/components/SpotifyStatsDetailModal";
import SpotifyConnectModal from "@/components/SpotifyConnectModal";
import SpotifyStatsWrappedModal from "@/components/SpotifyStatsWrappedModal";
import GlobalLeaderboardModal from "@/components/GlobalLeaderboardModal";

interface NavbarProps {
  onOpenMiniQuiz?: (topic?: string) => void;
  onOpenSpotifyModal?: () => void;
  onOpenAuthModal?: () => void;
  rightSlot?: React.ReactNode;
  activeRoute?: "home" | "play" | "ranked" | "perfil" | "miniquiz";
}

export default function Navbar({
  onOpenMiniQuiz,
  onOpenSpotifyModal,
  onOpenAuthModal,
  rightSlot,
  activeRoute,
}: NavbarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showStatsDetailModal, setShowStatsDetailModal] = useState(false);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [spotifyWrappedModalOpen, setSpotifyWrappedModalOpen] = useState(false);
  const [globalLeaderboardOpen, setGlobalLeaderboardOpen] = useState(false);
  const [isDevUser, setIsDevUser] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { isConnected: realConnected, user: realUser, logout } = useSpotifyAuth();

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("dev_user=1")) {
      setIsDevUser(true);
    }
  }, []);

  const isConnected = realConnected || isDevUser;
  const user = realUser || (isDevUser ? ({ id: "test_dev", displayName: "Javier Tester", images: [] } as any) : null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleQuizClick = () => {
    if (onOpenMiniQuiz) {
      onOpenMiniQuiz("Éxitos Pop");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#060D09]/90 backdrop-blur-xl border-b border-emerald-500/15">
        <div className="max-w-[1200px] mx-auto h-14 md:h-[72px] px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Bloque Izquierdo (Marca — Scuinklezam) */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-tr from-goblinPrimary via-goblinClover to-goblinLime flex items-center justify-center shadow-lg shadow-emerald-500/25 group-hover:scale-105 transition">
                <svg
                  className="w-4 h-4 md:w-5 md:h-5 text-black"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18V5l12-2v13"></path>
                  <circle cx="6" cy="18" r="3"></circle>
                  <circle cx="18" cy="16" r="3"></circle>
                </svg>
              </div>
              <span className="whitespace-nowrap font-display font-extrabold text-lg md:text-xl tracking-tight text-white">
                Scuinkle<span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">zam</span>
              </span>
            </Link>

            {/* Inline custom slot on desktop (e.g. room code on play page) */}
            {rightSlot && <div className="hidden md:flex items-center">{rightSlot}</div>}
          </div>

          {/* Bloque Central (Navegación Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-300">
            <Link
              href="/"
              className={`whitespace-nowrap transition ${
                activeRoute === "home" ? "text-goblinLime font-bold" : "hover:text-white"
              }`}
            >
              Inicio
            </Link>

            <Link
              href="/play"
              className={`px-3 py-1.5 rounded-full transition flex items-center gap-2 font-semibold whitespace-nowrap ${
                activeRoute === "play"
                  ? "bg-emerald-500/25 border border-emerald-400 text-goblinLime shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                  : "bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-400/60"
              }`}
            >
              <Users className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Multijugador</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            </Link>

            <Link
              href="/ranked"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new Event("scuinklezam_reset_ranked"));
                }
              }}
              className={`px-3 py-1.5 rounded-full transition flex items-center gap-2 font-semibold whitespace-nowrap ${
                activeRoute === "ranked"
                  ? "bg-amber-500/25 border border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                  : "bg-amber-500/10 border border-amber-400/30 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/60"
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Ranked</span>
            </Link>

            {onOpenMiniQuiz ? (
              <button
                onClick={handleQuizClick}
                className="whitespace-nowrap hover:text-goblinLime transition cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Miniquiz</span>
              </button>
            ) : (
              <Link
                href="/?miniquiz=1"
                className="whitespace-nowrap hover:text-goblinLime transition flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Miniquiz</span>
              </Link>
            )}
          </nav>

          {/* Bloque Derecho Desktop */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {/* User Session Bar (Spotify or Email) */}
            {isConnected && user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#102218] hover:bg-[#163022] border border-emerald-500/40 hover:border-goblinLime flex items-center gap-2 cursor-pointer transition shadow-md"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="w-5 h-5 rounded-full object-cover border border-emerald-400 shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-emerald-800 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse shrink-0"></span>
                  <span className="max-w-[130px] truncate text-white text-xs font-bold">
                    {user.displayName}
                  </span>
                  <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#0B1710] border border-emerald-500/30 p-2 shadow-2xl z-50 backdrop-blur-xl space-y-1">
                    <div className="px-3 py-2 border-b border-emerald-500/15">
                      <div className="text-xs font-bold text-white truncate">{user.displayName}</div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {user.email || "Cuenta de Spotify conectada"}
                      </div>
                    </div>

                    <Link
                      href="/perfil"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-goblinLime hover:bg-emerald-950/60 flex items-center gap-2.5 transition block"
                    >
                      <User className="w-4 h-4 text-goblinLime shrink-0" />
                      <span>Mi Perfil y Récords</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setSpotifyWrappedModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white hover:bg-emerald-950/60 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <BarChart2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Ver mis Stats de Spotify</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setGlobalLeaderboardOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 hover:bg-amber-950/40 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Clasificación Global</span>
                    </button>

                    <div className="pt-1 border-t border-emerald-500/15">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/40 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Cerrar sesión</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {onOpenAuthModal && (
                  <button
                    onClick={onOpenAuthModal}
                    className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 hover:text-white transition cursor-pointer"
                  >
                    Cuenta
                  </button>
                )}

                <a
                  href="/api/auth/spotify/login"
                  className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#102218] hover:bg-[#163022] border border-[#1DB954]/50 flex items-center gap-1.5 cursor-pointer transition text-[#1DB954]"
                >
                  <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  <span>Spotify</span>
                </a>
              </div>
            )}

            {/* Quick CTA */}
            <Link
              href="/play"
              className="whitespace-nowrap px-4 py-2 rounded-full text-xs font-black bg-gradient-to-r from-emerald-500 to-lime-500 text-zinc-950 shadow-md shadow-emerald-500/20 hover:scale-[1.03] transition"
            >
              Jugar Ahora
            </Link>

            {/* Global Premium Volume Control */}
            <GlobalVolumeControl />
          </div>

          {/* Cabecera Móvil Derecha (< md): Quick Sound/Mute Toggle + Avatar */}
          <div className="flex md:hidden items-center gap-2.5">
            <GlobalVolumeControl compact />

            {isConnected && user ? (
              <Link
                href="/perfil"
                className="flex items-center gap-1.5 p-0.5 rounded-full bg-[#102218] border border-emerald-500/40 hover:border-goblinLime transition"
                title={user.displayName}
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-7 h-7 rounded-full object-cover border border-emerald-400"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-800 text-white font-bold text-xs flex items-center justify-center">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>
            ) : (
              <a
                href="/api/auth/spotify/login"
                className="p-1.5 rounded-full bg-[#102218] border border-[#1DB954]/50 text-[#1DB954] hover:scale-105 transition flex items-center justify-center"
                title="Conectar Spotify"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* BARRA INFERIOR FIJA ESTILO APP NATIVA (md:hidden) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 h-16 bg-zinc-950/95 backdrop-blur-lg border-t border-white/10 grid grid-cols-5 items-center px-1 md:hidden select-none">
        {/* 1. Inicio */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeRoute === "home"
              ? "text-emerald-400 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 font-medium"
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Inicio</span>
        </Link>

        {/* 2. Multijugador */}
        <Link
          href="/play"
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeRoute === "play"
              ? "text-emerald-400 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 font-medium"
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Multijugador</span>
        </Link>

        {/* 3. Ranked */}
        <Link
          href="/ranked"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("scuinklezam_reset_ranked"));
            }
          }}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeRoute === "ranked"
              ? "text-emerald-400 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 font-medium"
          }`}
        >
          <Trophy className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Ranked</span>
        </Link>

        {/* 4. Miniquiz */}
        {onOpenMiniQuiz ? (
          <button
            type="button"
            onClick={handleQuizClick}
            className={`flex flex-col items-center justify-center py-1 transition cursor-pointer ${
              activeRoute === "miniquiz"
                ? "text-emerald-400 font-semibold"
                : "text-zinc-400 hover:text-zinc-200 font-medium"
            }`}
          >
            <Zap className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] leading-tight">Miniquiz</span>
          </button>
        ) : (
          <Link
            href="/?miniquiz=1"
            className="flex flex-col items-center justify-center py-1 transition text-zinc-400 hover:text-zinc-200 font-medium"
          >
            <Zap className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] leading-tight">Miniquiz</span>
          </Link>
        )}

        {/* 5. Mi Perfil */}
        <Link
          href="/perfil"
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeRoute === "perfil"
              ? "text-emerald-400 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 font-medium"
          }`}
        >
          <User className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Mi Perfil</span>
        </Link>
      </nav>

      {/* MODAL WRAPPED STATS DE SPOTIFY */}
      <SpotifyStatsWrappedModal
        isOpen={spotifyWrappedModalOpen}
        onClose={() => setSpotifyWrappedModalOpen(false)}
      />

      {/* MODAL DETALLE DE STATS DE SPOTIFY (#1 - #50) */}
      <SpotifyStatsDetailModal
        isOpen={showStatsDetailModal}
        onClose={() => setShowStatsDetailModal(false)}
        userDisplayName={user?.displayName}
      />

      {/* MODAL CONEXIÓN Y STATS SPOTIFY */}
      <SpotifyConnectModal
        isOpen={spotifyModalOpen}
        onClose={() => setSpotifyModalOpen(false)}
      />

      {/* MODAL CLASIFICACIÓN GLOBAL */}
      <GlobalLeaderboardModal
        isOpen={globalLeaderboardOpen}
        onClose={() => setGlobalLeaderboardOpen(false)}
      />
    </>
  );
}

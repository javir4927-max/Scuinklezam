"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Users, Trophy, Play, ChevronDown, BarChart2, Flame, LogOut, Menu, X, Music2, User, BarChart3 } from "lucide-react";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";
import GlobalVolumeControl from "@/components/GlobalVolumeControl";
import SpotifyStatsDetailModal from "@/components/SpotifyStatsDetailModal";
import SpotifyConnectModal from "@/components/SpotifyConnectModal";
import SpotifyStatsWrappedModal from "@/components/SpotifyStatsWrappedModal";

interface NavbarProps {
  onOpenMiniQuiz?: (topic?: string) => void;
  onOpenSpotifyModal?: () => void;
  onOpenAuthModal?: () => void;
  rightSlot?: React.ReactNode;
  activeRoute?: "home" | "play" | "ranked" | "perfil";
}

export default function Navbar({
  onOpenMiniQuiz,
  onOpenSpotifyModal,
  onOpenAuthModal,
  rightSlot,
  activeRoute,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showStatsDetailModal, setShowStatsDetailModal] = useState(false);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [spotifyWrappedModalOpen, setSpotifyWrappedModalOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { isConnected, user, logout } = useSpotifyAuth();

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
    setMobileMenuOpen(false);
    if (onOpenMiniQuiz) {
      onOpenMiniQuiz("Éxitos Pop");
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[#060D09]/85 backdrop-blur-xl border-b border-emerald-500/15">
      <div className="max-w-[1200px] mx-auto h-[64px] lg:h-[72px] px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Bloque Izquierdo (Marca — Scuinklezam sin espacios) */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-goblinPrimary via-goblinClover to-goblinLime flex items-center justify-center shadow-lg shadow-emerald-500/25 group-hover:scale-105 transition">
              <svg
                className="w-5 h-5 text-black"
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
            <span className="whitespace-nowrap font-display font-extrabold text-xl tracking-tight text-white">
              Scuinkle<span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">zam</span>
            </span>
          </Link>

          {/* Optional inline custom right slot (e.g. volume on play page) */}
          {rightSlot && <div className="hidden sm:flex items-center">{rightSlot}</div>}
        </div>

        {/* Bloque Central (Navegación Desktop) */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-zinc-300">
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
            className={`px-3 py-1.5 rounded-full transition flex items-center gap-2 font-semibold whitespace-nowrap ${
              activeRoute === "ranked"
                ? "bg-amber-500/25 border border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                : "bg-amber-500/10 border border-amber-400/30 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/60"
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Ranked</span>
          </Link>

          <Link
            href="/perfil"
            className={`whitespace-nowrap transition flex items-center gap-1.5 ${
              activeRoute === "perfil" ? "text-goblinLime font-bold" : "hover:text-white"
            }`}
          >
            <User className="w-3.5 h-3.5 text-goblinLime" />
            <span>Mi Perfil</span>
          </Link>

          {onOpenMiniQuiz && (
            <button
              onClick={handleQuizClick}
              className="whitespace-nowrap hover:text-goblinLime transition cursor-pointer flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Miniquiz</span>
            </button>
          )}
        </nav>

        {/* Bloque Derecho (Botones de Acción Desktop) */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
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

                  <Link
                    href="/ranked"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 hover:bg-amber-950/40 flex items-center gap-2.5 transition block"
                  >
                    <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Ver mis Rangos y Clasificación</span>
                  </Link>

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

        {/* Controles Móvil Derecho (< lg) */}
        <div className="flex items-center gap-2 lg:hidden">
          {/* Quick Sound/Mute Toggle */}
          <GlobalVolumeControl compact />

          {/* Avatar del usuario (JaviTZ) o botón Spotify */}
          {isConnected && user ? (
            <Link
              href="/perfil"
              className="flex items-center gap-1.5 p-1 rounded-full bg-[#102218] border border-emerald-500/40 hover:border-goblinLime transition"
              title={user.displayName}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-6 h-6 rounded-full object-cover border border-emerald-400"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-800 text-white font-bold text-[10px] flex items-center justify-center">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
          ) : (
            <a
              href="/api/auth/spotify/login"
              className="p-1.5 rounded-full bg-[#102218] border border-[#1DB954]/50 text-[#1DB954] hover:scale-105 transition"
              title="Conectar Spotify"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </a>
          )}

          {/* Menú Desplegable Hamburguesa */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-zinc-300 hover:text-white bg-white/[0.04] border border-emerald-500/20"
            aria-label="Abrir menú"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Segunda barra horizontal limpia para móvil (< lg) */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-4 py-2 border-t border-white/5 lg:hidden bg-[#060D09]/95 text-xs">
        <Link
          href="/"
          className={`whitespace-nowrap px-3 py-1 rounded-full transition shrink-0 ${
            activeRoute === "home"
              ? "bg-emerald-500/20 border border-emerald-400 text-goblinLime font-bold"
              : "text-zinc-300 hover:text-white"
          }`}
        >
          Inicio
        </Link>
        <Link
          href="/play"
          className={`whitespace-nowrap px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeRoute === "play"
              ? "bg-emerald-500/25 border border-emerald-400 text-goblinLime shadow-sm"
              : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
          }`}
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Multijugador</span>
        </Link>
        <Link
          href="/ranked"
          className={`whitespace-nowrap px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeRoute === "ranked"
              ? "bg-amber-500/25 border border-amber-400 text-amber-300 shadow-sm"
              : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
          }`}
        >
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>Ranked</span>
        </Link>
        <Link
          href="/perfil"
          className={`whitespace-nowrap px-3 py-1 rounded-full transition flex items-center gap-1.5 shrink-0 ${
            activeRoute === "perfil"
              ? "bg-emerald-500/20 border border-emerald-400 text-goblinLime font-bold"
              : "text-zinc-300 hover:text-white"
          }`}
        >
          <User className="w-3.5 h-3.5 text-goblinLime" />
          <span>Mi Perfil</span>
        </Link>
        {onOpenMiniQuiz && (
          <button
            onClick={handleQuizClick}
            className="whitespace-nowrap px-3 py-1 rounded-full text-zinc-300 hover:text-goblinLime transition flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Miniquiz</span>
          </button>
        )}
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#060D09]/95 backdrop-blur-2xl border-b border-emerald-500/20 px-4 py-4 space-y-3 animate-fadeIn">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-xl text-sm font-semibold text-white hover:bg-emerald-950/60"
          >
            Inicio
          </Link>
          <Link
            href="/play"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-500/20"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Multijugador</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </Link>
          <Link
            href="/ranked"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold text-amber-300 bg-amber-950/40 border border-amber-500/20"
          >
            <span className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Modo Ranked (Tappz)</span>
            </span>
            <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
              TOP
            </span>
          </Link>
          <Link
            href="/perfil"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-zinc-300 hover:text-white hover:bg-emerald-950/60"
          >
            <User className="w-4 h-4 text-goblinLime" />
            <span>Mi Perfil y Récords</span>
          </Link>
          {onOpenMiniQuiz && (
            <button
              onClick={handleQuizClick}
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-emerald-950/60 flex items-center gap-2"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span>Miniquiz Rápido</span>
            </button>
          )}

          <div className="pt-2 border-t border-emerald-500/15 flex flex-col gap-2.5">
            {isConnected && user ? (
              <>
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs text-white font-bold truncate max-w-[200px]">
                    {user.displayName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="text-xs text-rose-400 font-semibold"
                  >
                    Cerrar sesión
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSpotifyWrappedModalOpen(true);
                  }}
                  className="w-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <BarChart2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Ver mis Stats de Spotify</span>
                </button>
              </>
            ) : (
              <a
                href="/api/auth/spotify/login"
                className="w-full py-2.5 rounded-xl bg-[#1DB954] text-black font-black text-xs text-center flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                <span>Conectar con Spotify</span>
              </a>
            )}
          </div>
        </div>
      )}

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
    </header>
  );
}

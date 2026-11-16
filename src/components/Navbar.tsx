"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Users, ChevronDown, BarChart2, Flame, LogOut } from "lucide-react";
import { useSpotifyAuth } from "@/context/SpotifyAuthContext";

interface NavbarProps {
  onOpenMiniQuiz: (topic?: string) => void;
  onOpenSpotifyModal?: () => void;
}

export default function Navbar({ onOpenMiniQuiz, onOpenSpotifyModal }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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

  const toggleMobile = () => setMobileMenuOpen((prev) => !prev);
  const handleQuizClick = () => {
    setMobileMenuOpen(false);
    onOpenMiniQuiz("Éxitos Pop");
  };

  return (
    <header className="sticky top-0 z-50 h-[72px] bg-[#060D09]/85 backdrop-blur-xl border-b border-emerald-500/15">
      <div className="max-w-[1200px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Bloque Izquierdo (Marca — shrink-0) */}
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
          <span className="whitespace-nowrap font-display font-extrabold text-xl tracking-tight text-white flex items-center gap-1">
            Scuinkle<span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">zam</span>
          </span>
        </Link>

        {/* Bloque Central (Navegación Desktop — hidden lg:flex items-center gap-7 text-sm font-medium text-zinc-300) */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-zinc-300">
          <Link href="/#" className="whitespace-nowrap hover:text-goblinLime transition">
            Inicio
          </Link>
          <Link
            href="/play"
            className="px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400/70 shadow-[0_0_15px_rgba(16,185,129,0.18)] transition-all flex items-center gap-2 font-semibold whitespace-nowrap"
          >
            <Users className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Multijugador</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          </Link>
          <a href="/#pricing" className="whitespace-nowrap hover:text-goblinLime transition">
            Precios
          </a>
          <a href="/#faq" className="whitespace-nowrap hover:text-goblinLime transition">
            FAQ
          </a>
        </nav>

        {/* Bloque Derecho (Botones de Acción — hidden lg:flex items-center gap-3 shrink-0) */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {/* Botón 1 (Spotify / Sesión Iniciada) */}
          {isConnected && user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold bg-[#102218] hover:bg-[#163022] border border-emerald-500/40 hover:border-goblinLime flex items-center gap-2.5 cursor-pointer transition shadow-md"
              >
                {/* Real profile image or avatar */}
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
                <span className="max-w-[160px] truncate text-white text-xs font-bold">
                  Sesión iniciada · {user.displayName}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#0B1710] border border-emerald-500/30 p-2 shadow-2xl z-50 backdrop-blur-xl space-y-1">
                  <div className="px-3 py-2 border-b border-emerald-500/15">
                    <div className="text-xs font-bold text-white truncate">{user.displayName}</div>
                    <div className="text-[10px] text-zinc-400 truncate">{user.email || "Cuenta de Spotify conectada"}</div>
                  </div>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onOpenSpotifyModal && onOpenSpotifyModal();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white hover:bg-emerald-950/60 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <BarChart2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Ver mis Stats de Spotify</span>
                  </button>

                  <Link
                    href="/play?spotify_stats=true"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-goblinLime hover:bg-emerald-950/60 flex items-center gap-2.5 transition block"
                  >
                    <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Jugar con mis Más Escuchadas</span>
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
            <button
              onClick={onOpenSpotifyModal}
              className="whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center gap-2 cursor-pointer transition text-zinc-200 hover:text-white"
            >
              <svg className="w-3.5 h-3.5 text-[#1DB954] fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              <span>Conectar Spotify</span>
            </button>
          )}

          {/* Botón 2 (CTA Principal) */}
          <button
            onClick={handleQuizClick}
            className="whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold bg-gradient-to-r from-emerald-500 to-lime-500 text-zinc-950 shadow-lg shadow-emerald-500/20 hover:scale-[1.03] transition cursor-pointer"
          >
            Jugar Ahora
          </button>
        </div>

        {/* Menú Móvil / Tablet Button (lg:hidden) */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            onClick={handleQuizClick}
            className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-500 to-lime-500 text-zinc-950 shadow-md transition"
          >
            Jugar Ahora
          </button>

          <button
            id="mobileMenuBtn"
            onClick={toggleMobile}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white"
            aria-label="Abrir Menú"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Menú Móvil / Tablet Drawer (lg:hidden) */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0A160F]/95 backdrop-blur-2xl border-b border-emerald-500/20 px-6 py-5 space-y-3">
          <Link
            href="/#"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-300 hover:text-white"
          >
            Inicio
          </Link>
          <Link
            href="/play"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-bold"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Multijugador</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </Link>
          <a
            href="/#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-300 hover:text-white"
          >
            Precios
          </a>
          <a
            href="/#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-300 hover:text-white"
          >
            FAQ
          </a>

          <div className="pt-3 border-t border-emerald-500/20 flex flex-col gap-2.5">
            {isConnected && user ? (
              <div className="p-3 rounded-2xl bg-[#102218] border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-emerald-800 text-white font-bold text-xs flex items-center justify-center">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse"></span>
                  <span className="text-xs font-bold text-white truncate">Sesión iniciada · {user.displayName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-semibold">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenSpotifyModal && onOpenSpotifyModal();
                    }}
                    className="py-1.5 px-2 rounded-xl bg-white/[0.08] flex items-center justify-center gap-1.5 text-white"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Mis Stats</span>
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="py-1.5 px-2 rounded-xl bg-red-500/20 text-red-300 flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>Salir</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSpotifyModal && onOpenSpotifyModal();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center gap-2 text-sm font-semibold text-white"
              >
                <svg className="w-4 h-4 text-[#1DB954] fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                <span>Conectar Spotify</span>
              </button>
            )}

            <button
              onClick={handleQuizClick}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-lime-500 text-zinc-950 text-center shadow-lg shadow-emerald-500/20"
            >
              Jugar Ahora
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Users, Trophy, Play, Music2 } from "lucide-react";

interface FooterProps {
  onOpenMiniQuiz?: (topic?: string) => void;
}

const LANGUAGES = [
  "Español",
  "English",
  "Français",
  "Português",
  "Deutsch",
  "Italiano",
];

export default function Footer({ onOpenMiniQuiz }: FooterProps) {
  const [currentLang, setCurrentLang] = useState("Español");

  return (
    <footer className="bg-[#040906] border-t border-emerald-500/15 pt-14 pb-10 text-sm text-zinc-400">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-emerald-500/10">
        {/* Brand & Overview */}
        <div className="md:col-span-6 space-y-3.5">
          <Link href="/" className="flex items-center gap-2.5 group w-fit">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-goblinPrimary via-goblinClover to-goblinLime flex items-center justify-center text-black font-bold shadow-md shadow-emerald-500/20 group-hover:scale-105 transition">
              <Music2 className="w-4 h-4 text-black" />
            </div>
            <span className="font-display font-extrabold text-xl text-white">
              Scuinkle<span className="text-goblinLime">zam</span>
            </span>
          </Link>
          <p className="text-zinc-400 max-w-md text-xs sm:text-sm leading-relaxed">
            La plataforma definitiva de quiz musical ranked y multijugador con Spotify. Compite con amigos en salas en vivo, adivina temas en segundos y sube en las divisiones Ranked por artista y género.
          </p>
          <div className="pt-1 flex items-center gap-3">
            <label className="text-xs text-zinc-400 font-semibold" htmlFor="footerLang">
              Idioma:
            </label>
            <select
              id="footerLang"
              value={currentLang}
              onChange={(e) => setCurrentLang(e.target.value)}
              className="bg-[#08120B] text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-emerald-500/20 focus:outline-none focus:border-goblinLime cursor-pointer"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Nav Links */}
        <div className="md:col-span-3">
          <div className="font-bold text-white mb-3 text-emerald-400 text-xs uppercase tracking-wider">
            Modos de Juego
          </div>
          <ul className="space-y-2 text-xs sm:text-sm">
            <li>
              <Link href="/play" className="hover:text-goblinLime transition flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>Salas Multijugador</span>
              </Link>
            </li>
            <li>
              <Link href="/ranked" className="hover:text-goblinLime transition flex items-center gap-1.5 font-semibold text-white">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Ranked por Artista y Género</span>
              </Link>
            </li>
            <li>
              <button
                onClick={() => onOpenMiniQuiz && onOpenMiniQuiz("Éxitos Pop")}
                className="hover:text-goblinLime transition cursor-pointer text-left flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>Miniquiz Rápido</span>
              </button>
            </li>
          </ul>
        </div>

        {/* Community & Connection */}
        <div className="md:col-span-3">
          <div className="font-bold text-white mb-3 text-emerald-400 text-xs uppercase tracking-wider">
            Integraciones
          </div>
          <ul className="space-y-2 text-xs sm:text-sm">
            <li>
              <a
                href="/api/auth/spotify/login"
                className="hover:text-[#1DB954] transition flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 fill-current text-[#1DB954]" viewBox="0 0 24 24">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                <span>Conectar Cuenta de Spotify</span>
              </a>
            </li>
            <li>
              <Link href="/ranked" className="hover:text-goblinLime transition">
                Tabla de Clasificación Mundial
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
        <span>© 2026 Scuinklezam · Todos los derechos reservados · Desarrollado con Spotify Web API.</span>
        <span className="text-emerald-500 font-semibold font-mono">scuinklezam.vercel.app</span>
      </div>
    </footer>
  );
}

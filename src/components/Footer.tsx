"use client";

import React, { useState } from "react";

interface FooterProps {
  onOpenMiniQuiz: (topic?: string) => void;
}

const LANGUAGES = [
  "Español",
  "English",
  "Français",
  "Português",
  "Deutsch",
  "Italiano",
  "Polski",
  "日本語",
  "Čeština",
];

export default function Footer({ onOpenMiniQuiz }: FooterProps) {
  const [currentLang, setCurrentLang] = useState("Español");

  return (
    <footer className="bg-[#040906] border-t border-emerald-500/15 pt-16 pb-12 text-sm text-zinc-400">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-emerald-500/10">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-goblinPrimary via-goblinClover to-goblinLime flex items-center justify-center text-black font-bold">
              ♪
            </div>
            <span className="font-display font-extrabold text-xl text-white">
              Scuinkle<span className="text-goblinLime">zam</span>
            </span>
          </div>
          <p className="text-zinc-400 max-w-xs text-xs sm:text-sm">
            La plataforma líder de quiz musical ranked con Spotify. Juega en solitario, compite con amigos, guarda canciones en tu biblioteca y escala en las clasificaciones mundiales. 100% gratis.
          </p>
          {/* Selector de idioma con Español prioritario */}
          <div className="pt-1">
            <label className="sr-only" htmlFor="langSelect">
              Idioma
            </label>
            <select
              id="langSelect"
              value={currentLang}
              onChange={(e) => setCurrentLang(e.target.value)}
              className="bg-[#08120B] text-emerald-300 text-xs font-semibold px-3.5 py-2 rounded-xl border border-emerald-500/20 focus:outline-none focus:border-goblinLime cursor-pointer"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="font-bold text-white mb-3 text-emerald-400">Plataforma</div>
          <ul className="space-y-2 text-xs sm:text-sm">
            <li>
              <a href="/play" className="hover:text-goblinLime transition font-semibold">Jugar Arena Ranked</a>
            </li>
            <li>
              <a href="#features" className="hover:text-white transition">Características</a>
            </li>
            <li>
              <a href="#leaderboard" className="hover:text-white transition">Clasificación Global</a>
            </li>
            <li>
              <button
                onClick={() => onOpenMiniQuiz("Éxitos Pop")}
                className="hover:text-goblinLime transition cursor-pointer text-left"
              >
                Mini-Quiz Rápido
              </button>
            </li>
          </ul>
        </div>

        <div>
          <div className="font-bold text-white mb-3 text-emerald-400">Soporte</div>
          <ul className="space-y-2 text-xs sm:text-sm">
            <li>
              <a href="#faq" className="hover:text-white transition">Preguntas Frecuentes</a>
            </li>
            <li>
              <a href="#contact" className="hover:text-white transition">Contacto</a>
            </li>
            <li>
              <a href="mailto:support@scuinklezam.com" className="hover:text-white transition">
                support@scuinklezam.com
              </a>
            </li>
          </ul>
        </div>

        <div>
          <div className="font-bold text-white mb-3 text-emerald-400">Legal</div>
          <ul className="space-y-2 text-xs sm:text-sm">
            <li>
              <a href="#" className="hover:text-white transition">Política de Privacidad</a>
            </li>
            <li>
              <a href="#" className="hover:text-white transition">Términos de Servicio</a>
            </li>
            <li>
              <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#1DB954] transition">
                Términos de Spotify
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 flex flex-wrap items-center justify-between text-xs text-zinc-500">
        <span>© 2026 Scuinklezam. Todos los derechos reservados. Desarrollado con la Spotify Web API.</span>
        <span className="text-emerald-500/80">scuinklezam.com</span>
      </div>
    </footer>
  );
}

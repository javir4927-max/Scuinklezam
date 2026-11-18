"use client";

import React from "react";
import Link from "next/link";
import { Gamepad2, Sparkles } from "lucide-react";

interface GameNightSectionProps {
  onOpenMiniQuiz?: (topic?: string) => void;
}

export default function GameNightSection({ onOpenMiniQuiz }: GameNightSectionProps) {
  const handleShoutClick = (artist: string) => {
    if (onOpenMiniQuiz) {
      onOpenMiniQuiz(artist);
    }
  };

  return (
    <section className="py-20 max-w-[1200px] mx-auto px-4 sm:px-6">
      <div className="glass-card rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden border border-emerald-500/20">
        <h2 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight">
          Haz que sea una <span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">Noche de Juegos</span>
        </h2>
        <p className="mt-4 text-zinc-300 text-base sm:text-lg max-w-2xl mx-auto">
          Transmite Scuinklezam a la tele, convierte tu móvil en un pulsador y deja que todos en el salón griten las respuestas. Con audio oficial de Spotify, sin anuncios molestos y 100% gratis.
        </p>

        <div className="mt-12 relative max-w-3xl mx-auto py-6">
          {/* Floating Shout Bubbles - Now Interactive! */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => handleShoutClick("The Weeknd")}
              className="float-slow px-5 py-2.5 rounded-2xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 hover:border-emerald-400 text-emerald-300 font-bold text-sm shadow-lg hover:scale-110 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
              title="Jugar quiz de The Weeknd"
            >
              <span>¿The Weeknd?</span>
              <Sparkles className="w-3.5 h-3.5 text-goblinLime" />
            </button>
            <button
              onClick={() => handleShoutClick("Bruno Mars")}
              className="float-delayed px-5 py-2.5 rounded-2xl bg-goblinLime/20 hover:bg-goblinLime/30 border border-goblinLime/50 hover:border-goblinLime text-goblinLime font-bold text-sm shadow-lg hover:scale-110 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
              title="Jugar quiz de Bruno Mars"
            >
              <span>¡Bruno Mars!</span>
              <Sparkles className="w-3.5 h-3.5 text-goblinLime" />
            </button>
            <button
              onClick={() => handleShoutClick("Bad Bunny")}
              className="float-fast px-5 py-2.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 hover:border-emerald-400 text-emerald-200 font-bold text-sm shadow-lg hover:scale-110 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
              title="Jugar quiz de Bad Bunny"
            >
              <span>¡Bad Bunny!</span>
              <Sparkles className="w-3.5 h-3.5 text-goblinLime" />
            </button>
            <button
              onClick={() => handleShoutClick("ROSÉ")}
              className="float-slow px-5 py-2.5 rounded-2xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 hover:border-amber-300 text-amber-300 font-bold text-sm shadow-lg hover:scale-110 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
              title="Jugar quiz de ROSÉ"
            >
              <span>¡ROSÉ!</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>

          {/* Host Controller Pill - Links to Create Multiplayer Room */}
          <Link
            href="/play?create=true"
            className="mt-8 mx-auto max-w-xs bg-[#0B1710] hover:bg-[#102218] rounded-2xl p-4 border border-emerald-500/30 hover:border-goblinLime shadow-xl flex items-center justify-between transition hover:scale-105 group block"
            title="Crear sala multijugador para jugar en la tele"
          >
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-lg bg-goblinPrimary text-black text-xs font-extrabold uppercase flex items-center gap-1">
                <Gamepad2 className="w-3.5 h-3.5 text-black" />
                <span>Anfitrión</span>
              </span>
              <span className="text-sm font-semibold text-zinc-200 group-hover:text-white">Controlador de Sala</span>
            </div>
            <span className="text-xs text-goblinLime font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-goblinLime animate-pulse"></span>
              Crear Sala →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

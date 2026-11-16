"use client";

import React, { useState } from "react";
import { Users, Crown, Play } from "lucide-react";
import { playSynthNote } from "@/lib/audio";

interface HeroProps {
  onOpenMiniQuiz: (topic?: string) => void;
}

const HERO_SONGS = ["Blinding Lights", "APT.", "good 4 u", "7 rings"];

export default function Hero({ onOpenMiniQuiz }: HeroProps) {
  const [selectedSong, setSelectedSong] = useState<number>(1);

  const handleSelectSong = (idx: number) => {
    setSelectedSong(idx);
    if (idx === 0) {
      playSynthNote(587.33);
    } else {
      playSynthNote(220);
    }
  };

  const isCorrect = selectedSong === 0;

  return (
    <section className="relative pt-14 pb-20 md:pt-20 md:pb-28 hero-glow overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
        {/* Ranked Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-xs font-bold text-emerald-300 mb-6 shadow-lg shadow-emerald-950/50">
          <span className="w-2 h-2 rounded-full bg-goblinLime animate-ping"></span>
          <span>Temporada 1 Ranked · 100% Gratis e Ilimitado con Spotify</span>
        </div>

        {/* Headline en Español */}
        <h1 className="font-display font-extrabold text-4xl sm:text-6xl lg:text-[68px] leading-[1.06] tracking-tight max-w-4xl mx-auto">
          El juego definitivo para{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary via-emerald-400 to-goblinLime">
            adivinar canciones
          </span>{" "}
          en Spotify
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-zinc-300 max-w-2xl mx-auto font-normal">
          Escucha unos segundos, acierta la canción antes que nadie, guarda tus temazos directamente en tu biblioteca y domina la clasificación mundial. Sin pagar nada.
        </p>

        {/* CTA Group */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <a
            href="/play"
            className="w-full sm:w-auto bg-emerald-950/60 border border-emerald-500/50 hover:border-emerald-400 hover:bg-emerald-900/50 text-white px-6 py-3.5 rounded-2xl shadow-[0_0_24px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2.5 font-bold transition hover:scale-105"
          >
            <Users className="w-5 h-5 text-emerald-400" />
            <span>Salas Multijugador</span>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              SALAS EN VIVO
            </span>
          </a>

          <a
            href="/play"
            className="w-full sm:w-auto bg-gradient-to-r from-goblinPrimary via-goblinClover to-goblinLime text-black font-extrabold text-base px-7 py-3.5 rounded-2xl shadow-xl shadow-emerald-500/25 hover:scale-105 transition flex items-center justify-center gap-2.5"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Jugar Ranked Gratis</span>
          </a>

          <a
            href="/api/auth/spotify/login"
            className="w-full sm:w-auto glass-elevated hover:border-[#1DB954] px-5 py-3 rounded-2xl flex items-center justify-center gap-3 transition hover:scale-[1.02]"
          >
            <svg className="w-5 h-5 text-[#1DB954] fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            <div className="text-left leading-tight">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">Sincronizar Listas</div>
              <div className="text-sm font-bold text-white">Conectar Spotify</div>
            </div>
          </a>

          <button
            onClick={() => onOpenMiniQuiz("Éxitos Pop")}
            className="w-full sm:w-auto glass-elevated hover:border-emerald-500/50 px-5 py-3 rounded-2xl font-bold text-sm text-zinc-200 transition hover:scale-[1.02] cursor-pointer"
          >
            Mini-Quiz Rápido
          </button>
        </div>

        {/* DUAL DEVICE MOCKUP SHOWCASE */}
        <div className="mt-14 lg:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center text-left">
          {/* Mockup 1: Web / Desktop View (8 cols) */}
          <div className="lg:col-span-8 glass-card rounded-3xl p-5 sm:p-7 shadow-2xl border border-emerald-500/20 relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-emerald-500/10">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-goblinPrimary"></span>
                <span className="text-sm font-semibold text-emerald-200">Canción 6 de 10 · Éxitos Mundiales</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center font-display font-bold text-sm text-goblinLime">
                  13
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  +89 pts
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                    isCorrect
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-red-500/20 text-red-400 border-red-500/40"
                  }`}
                >
                  {isCorrect ? "Respuesta correcta +94" : "Respuesta incorrecta"}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* 4 Song Options with Keyboard Shortcuts */}
              <div className="md:col-span-7 space-y-3">
                {HERO_SONGS.map((song, i) => {
                  let btnStyle = "w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-white/[0.04] hover:bg-emerald-950/40 border border-emerald-500/15 text-zinc-200 font-semibold text-sm transition cursor-pointer";
                  let kbdStyle = "px-2 py-0.5 text-xs rounded bg-white/10 text-zinc-400 font-mono";

                  if (i === 0) {
                    btnStyle = "w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-semibold text-sm transition cursor-pointer";
                    kbdStyle = "px-2 py-0.5 text-xs rounded bg-emerald-500/30 border border-emerald-400/40 font-mono text-emerald-300";
                  } else if (i === selectedSong) {
                    btnStyle = "w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-red-500/20 border border-red-500/60 text-red-300 font-semibold text-sm transition cursor-pointer";
                    kbdStyle = "px-2 py-0.5 text-xs rounded bg-red-500/30 border border-red-400/40 font-mono text-red-300";
                  }

                  return (
                    <button
                      key={song}
                      onClick={() => handleSelectSong(i)}
                      className={btnStyle}
                    >
                      <span>{song}</span>
                      <kbd className={kbdStyle}>{i + 1}</kbd>
                    </button>
                  );
                })}
              </div>

              {/* Ranking Column */}
              <div className="md:col-span-5 bg-[#0B1710] rounded-2xl p-4 border border-emerald-500/15">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center justify-between">
                  <span>Clasificación en Vivo</span>
                  <span className="text-[10px] text-zinc-400">Rango: Esmeralda</span>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center">
                        <Crown className="w-3 h-3 text-amber-300" />
                      </span>
                      <div>
                        <div className="font-bold text-white">Lucas</div>
                        <div className="text-[11px] text-emerald-400">Respuesta correcta +94</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-zinc-200">518pts</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/70 border border-emerald-500/40">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center">2</span>
                      <div>
                        <div className="font-bold text-white">Maya (Tú)</div>
                        <div className="text-[11px] text-emerald-400">Respuesta correcta +89</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-goblinLime">503pts</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-700/30 text-zinc-400 font-bold flex items-center justify-center">3</span>
                      <div>
                        <div className="font-bold text-zinc-300">Leo</div>
                        <div className="text-[11px] text-red-400">Respuesta incorrecta</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-zinc-400">447pts</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/5 text-zinc-400 font-bold flex items-center justify-center">#4</span>
                      <div>
                        <div className="font-bold text-zinc-400">Zoé</div>
                        <div className="text-[11px] text-zinc-500">Escuchando…</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-zinc-400">412pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mockup 2: Mobile Phone View (4 cols) */}
          <div className="lg:col-span-4 mx-auto w-full max-w-[340px] bg-[#0A160F] rounded-[36px] p-4 border-[3px] border-emerald-500/30 shadow-2xl relative">
            <div className="w-20 h-1.5 bg-emerald-500/20 rounded-full mx-auto mb-3"></div>
            <div className="flex items-center justify-between text-xs pb-3 border-b border-emerald-500/15">
              <div>
                <div className="font-bold text-white">Éxitos Pop</div>
                <div className="text-[11px] text-emerald-400/80">Canción 6 de 10</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center font-bold text-goblinLime">
                  10
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                  +94
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-xs font-semibold">
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/60 text-emerald-300">
                Blinding Lights
              </div>
              <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-emerald-500/15 text-zinc-200">
                APT.
              </div>
              <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-emerald-500/15 text-zinc-200">
                good 4 u
              </div>
              <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-emerald-500/15 text-zinc-200">
                7 rings
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-500/15">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                Ranked en Vivo
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between py-1 px-2 rounded bg-emerald-950/70 border border-emerald-500/40">
                  <span>
                    <strong>1 Lucas (Tú)</strong> · <span className="text-emerald-400">Acierto +94</span>
                  </span>
                  <span className="font-mono font-bold text-goblinLime">518pts</span>
                </div>
                <div className="flex items-center justify-between py-1 px-2 rounded bg-white/[0.02]">
                  <span>
                    <strong>2 Maya</strong> · <span className="text-emerald-400">Acierto +89</span>
                  </span>
                  <span className="font-mono">503pts</span>
                </div>
                <div className="flex items-center justify-between py-1 px-2 rounded bg-white/[0.02]">
                  <span>
                    <strong>3 Leo</strong> · <span className="text-red-400">Error</span>
                  </span>
                  <span className="font-mono">447pts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import React from "react";

export default function GameNightSection() {
  return (
    <section className="py-20 max-w-[1200px] mx-auto px-4 sm:px-6">
      <div className="glass-card rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden border border-emerald-500/20">
        <h2 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight">
          Haz que sea una <span className="text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">Noche de Juegos</span>
        </h2>
        <p className="mt-4 text-zinc-300 text-base sm:text-lg max-w-2xl mx-auto">
          Transmite Scuinklezam a la tele, convierte tu móvil en un pulsador y deja que todos en el salón griten las respuestas. Con audio oficial de Spotify, sin anuncios molestos y 100% gratis.
        </p>

        <div className="mt-12 relative max-w-3xl mx-auto py-10">
          {/* Floating Sofa Shout Bubbles */}
          <div className="float-slow inline-block m-2 px-5 py-2.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold text-sm shadow-lg">
            ¿The Weeknd?
          </div>
          <div className="float-delayed inline-block m-2 px-5 py-2.5 rounded-2xl bg-goblinLime/20 border border-goblinLime/50 text-goblinLime font-bold text-sm shadow-lg">
            ¡Bruno Mars!
          </div>
          <div className="float-fast inline-block m-2 px-5 py-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 font-bold text-sm shadow-lg">
            ¡Bad Bunny!
          </div>
          <div className="float-slow inline-block m-2 px-5 py-2.5 rounded-2xl bg-amber-400/20 border border-amber-400/50 text-amber-300 font-bold text-sm shadow-lg">
            ¡ROSÉ!
          </div>

          {/* Host Controller Pill */}
          <div className="mt-8 mx-auto max-w-xs bg-[#0B1710] rounded-2xl p-4 border border-emerald-500/30 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-lg bg-goblinPrimary text-black text-xs font-extrabold uppercase">
                Anfitrión
              </span>
              <span className="text-sm font-semibold text-zinc-200">Controlador de Sala</span>
            </div>
            <span className="text-xs text-goblinLime font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-goblinLime animate-pulse"></span>
              Transmitiendo a TV
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

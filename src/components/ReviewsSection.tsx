"use client";

import React from "react";

const REVIEWS = [
  {
    stars: "★★★★★",
    title: "¡EL MEJOR QUIZ DE SPOTIFY!",
    body: "Conectar mi Spotify y jugar partidas ranked con mis canciones favoritas es súper adictivo. La interfaz verde duende es preciosa y el audio suena al instante.",
    author: "smella27",
    store: "App Store",
  },
  {
    stars: "★★★★★",
    title: "Indispensable para fiestas con amigos",
    body: "Pusimos Scuinklezam en la tele el sábado pasado con 8 amigos. La sincronización con Spotify funcionó perfecta y poder guardar las canciones que descubres es lo mejor.",
    author: "nyyyyy13",
    store: "App Store",
  },
  {
    stars: "★★★★★",
    title: "",
    body: "Un juego divertidísimo para poner a prueba tu cultura musical y descubrir temazos de artistas que no conocías en Spotify.",
    author: "Gabriel M.",
    store: "Google Play",
  },
  {
    stars: "★★★★★",
    title: "El modo ranked es legendario",
    body: "¡Por fin un quiz musical con MMR y clasificaciones de verdad! Subir puestos en las tablas de Bad Bunny y Drake se ha vuelto mi rutina de las noches.",
    author: "Armeninho",
    store: "App Store",
  },
  {
    stars: "★★★★★",
    title: "Sincronización impecable y gratis",
    body: "Me encanta que sea 100% gratuito, cargue mis playlists privadas y me permita guardar canciones directamente en mis Me Gusta en un toque.",
    author: "_ChairZ_",
    store: "App Store",
  },
  {
    stars: "★★★★★",
    title: "",
    body: "Súper rápido, excelente calidad de audio y cero publicidad intrusiva. Sin duda la mejor plataforma musical web.",
    author: "Wendo M.",
    store: "Google Play",
  },
];

export default function ReviewsSection() {
  return (
    <section className="py-20 max-w-[1200px] mx-auto px-4 sm:px-6">
      {/* 3 Big Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center pb-20 border-b border-emerald-500/15">
        <div>
          <div className="font-display font-black text-5xl sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-white to-emerald-200">
            500K+
          </div>
          <div className="mt-2 text-emerald-400 font-semibold uppercase tracking-wider text-xs">
            Jugadores Ranked
          </div>
        </div>
        <div>
          <div className="font-display font-black text-5xl sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-goblinPrimary to-goblinLime">
            3M+
          </div>
          <div className="mt-2 text-emerald-400 font-semibold uppercase tracking-wider text-xs">
            Partidas Jugadas
          </div>
        </div>
        <div>
          <div className="font-display font-black text-5xl sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-white to-emerald-200">
            100M+
          </div>
          <div className="mt-2 text-emerald-400 font-semibold uppercase tracking-wider text-xs">
            Canciones en Spotify Disponibles
          </div>
        </div>
      </div>

      {/* Loved by players */}
      <div className="pt-20 text-center">
        <h2 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight">
          Amado por los Fans de la Música
        </h2>
        <p className="mt-3 text-zinc-300 text-base sm:text-lg">
          Opiniones reales de nuestra comunidad en App Store y Google Play.
        </p>

        {/* Rating Badges */}
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <div className="px-5 py-2.5 rounded-full glass-elevated flex items-center gap-2.5 text-sm font-bold border border-emerald-500/30" aria-label="App Store: 4.8 de 5 estrellas">
            <span className="text-amber-400">★★★★★</span>
            <span>4.8</span>
            <span className="text-zinc-400 font-medium">App Store</span>
          </div>
          <div className="px-5 py-2.5 rounded-full glass-elevated flex items-center gap-2.5 text-sm font-bold border border-emerald-500/30" aria-label="Google Play: 4.5 de 5 estrellas">
            <span className="text-amber-400">★★★★★</span>
            <span>4.5</span>
            <span className="text-zinc-400 font-medium">Google Play</span>
          </div>
        </div>

        {/* 6 Word-for-Word Reviews Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          {REVIEWS.map((r, i) => (
            <div key={i} className="glass-card rounded-3xl p-6 flex flex-col justify-between border border-emerald-500/15">
              <div>
                <div className="text-amber-400 text-sm mb-2">{r.stars}</div>
                {r.title && <h4 className="font-bold text-white text-base mb-1.5">{r.title}</h4>}
                <p className="text-zinc-300 text-sm leading-relaxed">{r.body}</p>
              </div>
              <div className="mt-5 pt-3 border-t border-emerald-500/15 flex items-center justify-between text-xs text-zinc-400">
                <span className="font-semibold text-emerald-200">{r.author}</span>
                <span className="text-emerald-400/80">{r.store}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
